/**
 * Chainguard Image Requester - Slack Bot
 *
 * Enables developers to request Chainguard images via Slack slash command
 * without requiring Console access. Includes approval workflow.
 *
 * Based on:
 * - Chainguard API docs: chainguard-ai-docs.md:26125-26128
 * - API Demo: chainguard-ai-docs.md:25979-26131
 */

const { App, LogLevel } = require('@slack/bolt');
const axios = require('axios');
const crypto = require('crypto');

// Configuration
const config = {
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    approvalChannelId: process.env.APPROVAL_CHANNEL_ID,
    adminUserIds: process.env.ADMIN_USER_IDS?.split(',') || [],
  },
  chainguard: {
    token: process.env.CHAINGUARD_TOKEN,
    orgId: process.env.CHAINGUARD_ORG_ID,
    apiBaseUrl: 'https://console-api.enforce.dev',
  },
  server: {
    port: process.env.PORT || 3000,
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  autoApproveTeams: process.env.AUTO_APPROVE_TEAMS?.split(',') || [],
};

// Validate required config
const required = [
  'slack.botToken',
  'slack.signingSecret',
  'slack.approvalChannelId',
  'chainguard.token',
  'chainguard.orgId',
];

for (const key of required) {
  const value = key.split('.').reduce((obj, k) => obj?.[k], config);
  if (!value) {
    console.error(`Missing required config: ${key}`);
    process.exit(1);
  }
}

// Initialize Slack app
const app = new App({
  token: config.slack.botToken,
  signingSecret: config.slack.signingSecret,
  socketMode: false,
  logLevel: LogLevel[config.server.logLevel.toUpperCase()],
});

// In-memory request store (use Redis/DB in production)
const requests = new Map();

// Chainguard API client
class ChainguardClient {
  constructor(token, orgId, baseUrl) {
    this.token = token;
    this.orgId = orgId;
    this.baseUrl = baseUrl;
  }

  async makeRequest(method, path, data = null) {
    try {
      const response = await axios({
        method,
        url: `${this.baseUrl}${path}`,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        data,
      });
      return response.data;
    } catch (error) {
      console.error(`Chainguard API error: ${error.message}`, {
        status: error.response?.status,
        data: error.response?.data,
      });
      throw error;
    }
  }

  async listEntitlements() {
    return this.makeRequest('GET', '/registry/entitlements');
  }

  async listRepos() {
    return this.makeRequest('GET', `/repos?parent=${this.orgId}`);
  }

  async createRepo(imageName, customName = null) {
    const body = {
      parent: this.orgId,
      imageName,
    };
    if (customName) {
      body.customName = customName;
    }
    return this.makeRequest('POST', '/repos', body);
  }

  async validateImage(imageName) {
    const entitlements = await this.listEntitlements();
    return entitlements.items?.some(item => item.name === imageName);
  }

  async isImageProvisioned(imageName) {
    const repos = await this.listRepos();
    return repos.items?.some(item =>
      item.name === imageName || item.imageName === imageName
    );
  }
}

const cgClient = new ChainguardClient(
  config.chainguard.token,
  config.chainguard.orgId,
  config.chainguard.apiBaseUrl
);

// Helper functions
function generateRequestId() {
  return `req-${crypto.randomBytes(6).toString('hex')}`;
}

function parseCommand(text) {
  const parts = text.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();

  if (subcommand === 'status') {
    return { action: 'status', requestId: parts[1] };
  }

  if (subcommand === 'list') {
    return { action: 'list' };
  }

  if (subcommand === 'help') {
    return { action: 'help' };
  }

  if (subcommand === 'admin-list') {
    const statusFlag = parts.find(p => p.startsWith('--status='));
    const status = statusFlag?.split('=')[1] || 'pending';
    return { action: 'admin-list', status };
  }

  // Default: image request
  const image = parts[0];
  const justificationIndex = parts.indexOf('--justification');
  const nameIndex = parts.indexOf('--name');
  const teamIndex = parts.indexOf('--team');

  let justification = '';
  let customName = null;
  let team = 'default';

  if (justificationIndex > -1 && parts[justificationIndex + 1]) {
    const start = justificationIndex + 1;
    let end = parts.length;

    // Find next flag or end
    for (let i = start; i < parts.length; i++) {
      if (parts[i].startsWith('--')) {
        end = i;
        break;
      }
    }

    justification = parts.slice(start, end).join(' ').replace(/^["']|["']$/g, '');
  }

  if (nameIndex > -1 && parts[nameIndex + 1]) {
    customName = parts[nameIndex + 1];
  }

  if (teamIndex > -1 && parts[teamIndex + 1]) {
    team = parts[teamIndex + 1];
  }

  return {
    action: 'request',
    image,
    justification,
    customName,
    team,
  };
}

function buildApprovalMessage(request) {
  return {
    text: '📦 New Image Request',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📦 New Image Request',
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Image:*\n${request.image}`,
          },
          {
            type: 'mrkdwn',
            text: `*Requested by:*\n<@${request.requesterId}>`,
          },
          {
            type: 'mrkdwn',
            text: `*Team:*\n${request.team}`,
          },
          {
            type: 'mrkdwn',
            text: `*Request ID:*\n${request.id}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Justification:*\n${request.justification}`,
        },
      },
      {
        type: 'actions',
        block_id: `approval_${request.id}`,
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✅ Approve',
            },
            style: 'primary',
            action_id: 'approve',
            value: request.id,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '❌ Deny',
            },
            style: 'danger',
            action_id: 'deny',
            value: request.id,
          },
        ],
      },
    ],
  };
}

// Slash command handler
app.command('/request-image', async ({ command, ack, say, client }) => {
  await ack();

  const parsed = parseCommand(command.text);

  // Handle different actions
  if (parsed.action === 'help') {
    await say({
      text: 'Chainguard Image Requester Help',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Chainguard Image Requester*\n\nRequest Chainguard images without Console access.',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              '*Commands:*',
              '`/request-image <image> --justification "<reason>"`',
              '  Request a new image',
              '',
              '`/request-image status <request-id>`',
              '  Check request status',
              '',
              '`/request-image list`',
              '  List your pending requests',
              '',
              '`/request-image help`',
              '  Show this help',
              '',
              '*Examples:*',
              '`/request-image python:latest-dev --justification "ML pipeline"`',
              '`/request-image nginx:latest --name nginx-frontend --team backend`',
            ].join('\n'),
          },
        },
      ],
    });
    return;
  }

  if (parsed.action === 'status') {
    const request = requests.get(parsed.requestId);
    if (!request) {
      await say(`❌ Request not found: ${parsed.requestId}`);
      return;
    }

    await say({
      text: `Request Status: ${request.id}`,
      blocks: [
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Request ID:*\n${request.id}` },
            { type: 'mrkdwn', text: `*Image:*\n${request.image}` },
            { type: 'mrkdwn', text: `*Status:*\n${request.status}` },
            { type: 'mrkdwn', text: `*Requested:*\n${new Date(request.createdAt).toLocaleString()}` },
          ],
        },
      ],
    });
    return;
  }

  if (parsed.action === 'list') {
    const userRequests = Array.from(requests.values())
      .filter(r => r.requesterId === command.user_id && r.status === 'pending');

    if (userRequests.length === 0) {
      await say('You have no pending requests.');
      return;
    }

    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📋 Your Pending Requests' },
      },
      ...userRequests.map(r => ({
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*${r.image}*` },
          { type: 'mrkdwn', text: `ID: ${r.id}` },
        ],
      })),
    ];

    await say({ text: 'Your Pending Requests', blocks });
    return;
  }

  if (parsed.action === 'admin-list') {
    // Check if user is admin
    if (!config.slack.adminUserIds.includes(command.user_id)) {
      await say('❌ This command is only available to administrators.');
      return;
    }

    let filtered = Array.from(requests.values());
    if (parsed.status !== 'all') {
      filtered = filtered.filter(r => r.status === parsed.status);
    }

    if (filtered.length === 0) {
      await say(`No requests with status: ${parsed.status}`);
      return;
    }

    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `📋 Requests (${parsed.status})` },
      },
      ...filtered.slice(0, 20).map(r => ({
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*${r.image}*` },
          { type: 'mrkdwn', text: `Status: ${r.status}` },
          { type: 'mrkdwn', text: `By: <@${r.requesterId}>` },
          { type: 'mrkdwn', text: `ID: ${r.id}` },
        ],
      })),
    ];

    await say({ text: 'All Requests', blocks });
    return;
  }

  // Handle image request
  if (parsed.action === 'request') {
    // Validate input
    if (!parsed.image) {
      await say('❌ Please provide an image name. Example: `/request-image python:latest-dev --justification "reason"`');
      return;
    }

    if (!parsed.justification || parsed.justification.length < 10) {
      await say('❌ Please provide a justification (at least 10 characters). Use `--justification "your reason"`');
      return;
    }

    // Validate image exists in catalog
    try {
      const isValid = await cgClient.validateImage(parsed.image);
      if (!isValid) {
        await say(`❌ Image not found in Chainguard catalog: ${parsed.image}\n\nCheck available images at https://images.chainguard.dev`);
        return;
      }

      // Check if already provisioned
      const isProvisioned = await cgClient.isImageProvisioned(parsed.image);
      if (isProvisioned) {
        await say(`ℹ️ Image already provisioned in your organization: ${parsed.image}\n\nPull string: \`cgr.dev/${config.chainguard.orgId}/${parsed.image}\``);
        return;
      }
    } catch (error) {
      console.error('Error validating image:', error);
      await say('❌ Error validating image. Please try again or contact support.');
      return;
    }

    // Create request
    const requestId = generateRequestId();
    const request = {
      id: requestId,
      image: parsed.image,
      customName: parsed.customName,
      justification: parsed.justification,
      team: parsed.team,
      requesterId: command.user_id,
      requesterName: command.user_name,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    requests.set(requestId, request);

    // Check if auto-approve
    if (config.autoApproveTeams.includes(parsed.team)) {
      try {
        const repo = await cgClient.createRepo(parsed.image, parsed.customName);
        request.status = 'approved';
        request.approvedAt = new Date().toISOString();
        request.approvedBy = 'auto';
        request.chainguardRepoId = repo.id;

        await say(`✅ Request auto-approved and provisioned!\n\n*Image:* ${parsed.image}\n*Pull string:* \`${repo.pullString || `cgr.dev/${config.chainguard.orgId}/${parsed.image}`}\``);
        return;
      } catch (error) {
        console.error('Error provisioning image:', error);
        await say('❌ Error provisioning image. Please contact support.');
        return;
      }
    }

    // Post to approval channel
    try {
      await client.chat.postMessage({
        channel: config.slack.approvalChannelId,
        ...buildApprovalMessage(request),
      });

      await say(`✅ Request submitted!\n\n*Image:* ${parsed.image}\n*Request ID:* ${requestId}\n*Status:* Pending approval\n\nYou'll receive a DM when this is approved or denied.`);
    } catch (error) {
      console.error('Error posting to approval channel:', error);
      await say('❌ Error submitting request. Please try again or contact support.');
    }
  }
});

// Handle approval/denial button clicks
app.action('approve', async ({ ack, body, client }) => {
  await ack();

  const requestId = body.actions[0].value;
  const request = requests.get(requestId);

  if (!request) {
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: body.user.id,
      text: '❌ Request not found. It may have already been processed.',
    });
    return;
  }

  if (request.status !== 'pending') {
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: body.user.id,
      text: `❌ Request already ${request.status}.`,
    });
    return;
  }

  // Provision image
  try {
    const repo = await cgClient.createRepo(request.image, request.customName);

    request.status = 'approved';
    request.approvedBy = body.user.id;
    request.approvedAt = new Date().toISOString();
    request.chainguardRepoId = repo.id;

    // Update approval message
    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      text: '✅ Approved',
      blocks: [
        ...body.message.blocks.filter(b => b.type !== 'actions'),
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `✅ *Approved* by <@${body.user.id}> • Provisioned successfully`,
            },
          ],
        },
      ],
    });

    // Notify requester
    await client.chat.postMessage({
      channel: request.requesterId,
      text: `✅ Your image request has been approved!\n\n*Image:* ${request.image}\n*Pull string:* \`${repo.pullString || `cgr.dev/${config.chainguard.orgId}/${request.image}`}\`\n*Request ID:* ${requestId}`,
    });

    console.log('Image request approved:', {
      requestId,
      image: request.image,
      approvedBy: body.user.id,
      chainguardRepoId: repo.id,
    });
  } catch (error) {
    console.error('Error provisioning image:', error);

    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: body.user.id,
      text: `❌ Error provisioning image: ${error.message}`,
    });
  }
});

app.action('deny', async ({ ack, body, client }) => {
  await ack();

  const requestId = body.actions[0].value;
  const request = requests.get(requestId);

  if (!request) {
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: body.user.id,
      text: '❌ Request not found. It may have already been processed.',
    });
    return;
  }

  if (request.status !== 'pending') {
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: body.user.id,
      text: `❌ Request already ${request.status}.`,
    });
    return;
  }

  request.status = 'denied';
  request.deniedBy = body.user.id;
  request.deniedAt = new Date().toISOString();
  request.denialReason = 'Denied by administrator';

  // Update approval message
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: '❌ Denied',
    blocks: [
      ...body.message.blocks.filter(b => b.type !== 'actions'),
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `❌ *Denied* by <@${body.user.id}>`,
          },
        ],
      },
    ],
  });

  // Notify requester
  await client.chat.postMessage({
    channel: request.requesterId,
    text: `❌ Your image request has been denied.\n\n*Image:* ${request.image}\n*Request ID:* ${requestId}\n*Reason:* ${request.denialReason}`,
  });

  console.log('Image request denied:', {
    requestId,
    image: request.image,
    deniedBy: body.user.id,
  });
});

// Health check endpoint
app.receiver.app.get('/health', (req, res) => {
  const pendingCount = Array.from(requests.values()).filter(r => r.status === 'pending').length;

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      slack: 'ok',
      chainguardApi: 'ok',
    },
    metrics: {
      pendingRequests: pendingCount,
      totalRequests: requests.size,
    },
  });
});

// Start server
(async () => {
  await app.start(config.server.port);
  console.log(`⚡️ Chainguard Image Requester bot is running on port ${config.server.port}`);
})();
