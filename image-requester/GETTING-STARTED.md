# Getting Started

**Quick start guide for implementing Chainguard Image Requester wrappers**

## Choose Your Integration Pattern

Select the integration pattern that best fits your team's workflow:

| Pattern | Best For | Setup Time | Complexity |
|---------|----------|------------|------------|
| **[Slack Bot](examples/slack-bot/)** | Teams using Slack | 2-4 hours | Medium |
| **[GitHub Actions](examples/github-actions/)** | GitOps workflows | 1-2 hours | Low |
| **[CLI Wrapper](examples/cli-wrapper/)** | Terminal users | 4-8 hours | Medium |
| **[Webhook Service](examples/webhook-service/)** | Custom portals | 8-16 hours | High |

## Prerequisites

All patterns require:

1. **Chainguard Organization**: Active subscription with catalog access
2. **Service Account**: With `repo.create` and `repo.list` capabilities
3. **Authentication**: API token for service account

### 1. Create Service Account

```bash
# Set your organization ID
export ORG_ID="your-chainguard-org-id"

# Create service account
chainctl iam service-accounts create image-requester \
  --parent=${ORG_ID} \
  --description="Service account for developer image requests"

# Save the service account ID
export SERVICE_ACCOUNT_ID="<output-from-previous-command>"

# Create custom role with minimal permissions
chainctl iam roles create image-requester-role \
  --parent=${ORG_ID} \
  --capabilities=repo.create,repo.list,registry.entitlements.list

# Bind role to service account
chainctl iam role-bindings create \
  --parent=${ORG_ID} \
  --identity=${SERVICE_ACCOUNT_ID} \
  --role=image-requester-role

# Get authentication token
chainctl auth token --identity=${SERVICE_ACCOUNT_ID} > /tmp/chainguard-token

# Store securely (use your secret manager)
# Examples:
# - AWS: aws secretsmanager create-secret --name cgr-token --secret-string "$(cat /tmp/chainguard-token)"
# - GitHub: gh secret set CHAINGUARD_TOKEN < /tmp/chainguard-token
# - Kubernetes: kubectl create secret generic cgr-token --from-file=token=/tmp/chainguard-token
```

### 2. Verify Access

```bash
# Test API access
export CHAINGUARD_TOKEN=$(cat /tmp/chainguard-token)

curl -H "Authorization: Bearer ${CHAINGUARD_TOKEN}" \
  https://console-api.enforce.dev/registry/entitlements | jq '.items[0:3]'
```

Expected output:
```json
[
  {
    "name": "python:latest",
    "description": "Python runtime",
    ...
  },
  {
    "name": "postgres:latest",
    "description": "PostgreSQL database",
    ...
  },
  ...
]
```

If you see image data, authentication is working!

### 3. Check Organization Limits

```bash
# Check current repository count
curl -H "Authorization: Bearer ${CHAINGUARD_TOKEN}" \
  "https://console-api.enforce.dev/repos?parent=${ORG_ID}" | jq '.items | length'

# Note: Maximum 2500 repositories per organization
```

## Quick Start: GitHub Actions (Fastest)

**Time**: 30 minutes | **Complexity**: Low

### 1. Copy Files to Your Repo

```bash
cd your-infrastructure-repo

# Copy example files
cp -r /path/to/image-requester/examples/github-actions/.github .
cp /path/to/image-requester/examples/github-actions/requested-images.yaml .
```

### 2. Add GitHub Secrets

```bash
# Add Chainguard credentials
gh secret set CHAINGUARD_TOKEN < /tmp/chainguard-token
gh secret set CHAINGUARD_ORG_ID --body "${ORG_ID}"
```

### 3. Test the Workflow

```bash
# Create a test branch
git checkout -b test-image-request

# Add a test image request
cat >> requested-images.yaml <<EOF
  - name: python:latest-dev
    justification: "Testing image request workflow"
    requestedBy: $(git config user.email)
    team: platform
    environment: dev
EOF

# Commit and push
git add requested-images.yaml
git commit -m "Test: Request python:latest-dev"
git push origin test-image-request

# Open PR
gh pr create --title "Test: Image Request Workflow" --body "Testing automated image provisioning"
```

GitHub Actions will:
1. Validate the request
2. Comment on the PR with validation results
3. After you merge, provision the image
4. Comment with the pull string

### 4. Production Use

Once tested, developers can request images by:
1. Creating a branch
2. Adding entry to `requested-images.yaml`
3. Opening a PR
4. After admin approval (PR merge), image is provisioned automatically

## Quick Start: Slack Bot (Most Popular)

**Time**: 2-4 hours | **Complexity**: Medium

### 1. Create Slack App

1. Go to https://api.slack.com/apps
2. Click **Create New App** → **From scratch**
3. Name: "Chainguard Image Requester"
4. Select your workspace

### 2. Configure Bot Permissions

**OAuth & Permissions** → Add scopes:
- `chat:write`
- `commands`
- `im:write`
- `users:read`

**Install App** → Copy **Bot User OAuth Token** (starts with `xoxb-`)

### 3. Add Slash Command

**Slash Commands** → Create new:
- **Command**: `/request-image`
- **Request URL**: `https://your-server.com/slack/command` (we'll set this up)
- **Description**: "Request a Chainguard image"
- **Usage hint**: `python:latest-dev --justification "reason"`

### 4. Enable Interactivity

**Interactivity & Shortcuts** → Turn on:
- **Request URL**: `https://your-server.com/slack/interaction`

### 5. Deploy Bot Server

```bash
cd examples/slack-bot

# Install dependencies
npm install

# Set environment variables
export SLACK_BOT_TOKEN="xoxb-your-token"
export SLACK_SIGNING_SECRET="your-signing-secret"
export CHAINGUARD_TOKEN=$(cat /tmp/chainguard-token)
export CHAINGUARD_ORG_ID="${ORG_ID}"
export APPROVAL_CHANNEL_ID="C1234567890"  # Get from Slack channel details

# Start server
npm start
```

**For production**: Deploy to Heroku, AWS Lambda, or Kubernetes. See [Slack Bot README](examples/slack-bot/README.md) for detailed deployment instructions.

### 6. Create Approval Channel

```
/create #image-approvals
/invite @Chainguard-Image-Requester
```

Get channel ID:
- Right-click channel → **View channel details**
- Copy the channel ID (at bottom)
- Update `APPROVAL_CHANNEL_ID` environment variable

### 7. Test the Bot

```
/request-image python:latest-dev --justification "Testing the bot"
```

Bot should:
1. Validate image exists
2. Post approval request to #image-approvals
3. Wait for admin to click ✅ Approve
4. Provision image via API
5. Send you a DM with the pull string

## Quick Start: CLI Wrapper (Terminal Users)

**Time**: 4-8 hours | **Complexity**: Medium

### 1. Choose Implementation

- **Go**: Best performance, single binary
- **Node.js**: Faster development, easier to modify

### 2. Build CLI (Go Example)

```bash
cd examples/cli-wrapper

# Build
go build -o cgr-request main.go

# Install
sudo mv cgr-request /usr/local/bin/

# Verify
cgr-request --version
```

### 3. Configure CLI

Create `~/.cgr/config.yaml`:

```yaml
chainguard:
  orgId: "${ORG_ID}"
  token: "${CHAINGUARD_TOKEN}"

queue:
  type: "filesystem"  # or "s3" or "database"
  filesystem:
    path: "/shared/cgr-requests"  # Must be accessible to all users + admins

user:
  email: "you@example.com"
  team: "your-team"
```

Or use environment variables:
```bash
export CHAINGUARD_ORG_ID="${ORG_ID}"
export CHAINGUARD_TOKEN=$(cat /tmp/chainguard-token)
export CGR_USER_EMAIL="$(git config user.email)"
export CGR_USER_TEAM="platform"
```

### 4. Set Up Request Queue

**Option A: Shared Filesystem**
```bash
# Create shared directory (NFS, EFS, etc.)
sudo mkdir -p /shared/cgr-requests
sudo chmod 777 /shared/cgr-requests
```

**Option B: S3 Bucket**
```bash
# Create S3 bucket
aws s3 mb s3://your-org-cgr-requests

# Set permissions (allow team access)
# Configure CLI:
export CGR_QUEUE_TYPE="s3"
export CGR_QUEUE_S3_BUCKET="your-org-cgr-requests"
```

**Option C: Database** (PostgreSQL)
```sql
CREATE TABLE cgr_requests (
    id VARCHAR(20) PRIMARY KEY,
    image VARCHAR(255) NOT NULL,
    custom_name VARCHAR(255),
    justification TEXT NOT NULL,
    requested_by VARCHAR(255) NOT NULL,
    team VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    pull_string VARCHAR(512)
);
```

### 5. Test CLI

**Developer test**:
```bash
cgr-request add python:latest-dev --justification "Testing CLI wrapper"
```

**Admin test** (approve):
```bash
# List pending
cgr-request admin pending

# Approve
cgr-request admin approve <request-id>
```

### 6. Distribute to Team

**Option A**: Install to shared location
```bash
sudo cp cgr-request /usr/local/bin/
```

**Option B**: Package as container
```dockerfile
FROM cgr.dev/chainguard/static:latest
COPY cgr-request /usr/bin/cgr-request
ENTRYPOINT ["/usr/bin/cgr-request"]
```

**Option C**: Publish as NPM package
```bash
npm publish @your-org/cgr-request
```

## Common Configuration

### Approval Workflows

**Auto-approve dev environments**:
```yaml
# For Slack bot
AUTO_APPROVE_TEAMS=dev,staging,test

# For GitHub Actions
# In .github/scripts/provision.js:
if (request.environment === 'dev') {
  // Auto-provision without approval
}

# For CLI
# In config.yaml:
autoApprove:
  teams: [dev, staging, test]
  environments: [dev]
```

**Require security review for production**:
```yaml
approvalTiers:
  - tier: auto
    environments: [dev, staging]

  - tier: manager
    environments: [production]
    conditions:
      - team not in [security, platform]

  - tier: security
    environments: [production]
    conditions:
      - image starts with "wolfi-base"
      - team in [external-contractor]
```

### Audit Logging

**Send to Datadog**:
```javascript
async function logRequest(request, action) {
  await fetch('https://api.datadoghq.com/api/v1/logs', {
    method: 'POST',
    headers: {
      'DD-API-KEY': process.env.DATADOG_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      service: 'cgr-image-requester',
      message: `Image request ${action}`,
      level: 'info',
      request: request
    })
  });
}
```

**Send to Splunk**:
```javascript
await fetch('https://splunk.example.com:8088/services/collector', {
  method: 'POST',
  headers: {
    'Authorization': `Splunk ${process.env.SPLUNK_TOKEN}`
  },
  body: JSON.stringify({
    event: {
      action: 'image_request',
      ...request
    }
  })
});
```

### Notifications

**Email notifications**:
```javascript
const nodemailer = require('nodemailer');

async function notifyUser(request, status) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: 'cgr-requests@example.com',
    to: request.requestedBy,
    subject: `Image request ${status}: ${request.image}`,
    text: `Your request for ${request.image} has been ${status}.`
  });
}
```

**PagerDuty for urgent requests**:
```javascript
if (request.environment === 'production' && request.urgent) {
  await fetch('https://events.pagerduty.com/v2/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      routing_key: process.env.PAGERDUTY_KEY,
      event_action: 'trigger',
      payload: {
        summary: `Urgent image request: ${request.image}`,
        severity: 'warning',
        source: 'cgr-image-requester'
      }
    })
  });
}
```

## Monitoring

### Health Checks

Add to all implementations:

```javascript
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      chainguardApi: await checkChainguardAPI(),
      database: await checkDatabase(),
      queue: await checkQueue()
    },
    metrics: {
      pendingRequests: await countPending(),
      requestsToday: await countToday(),
      avgApprovalTime: await getAvgApprovalTime()
    }
  };

  res.json(health);
});
```

### Metrics

**Prometheus metrics**:
```javascript
const prometheus = require('prom-client');

const requestCounter = new prometheus.Counter({
  name: 'cgr_requests_total',
  help: 'Total image requests',
  labelNames: ['status', 'team']
});

const approvalDuration = new prometheus.Histogram({
  name: 'cgr_approval_duration_seconds',
  help: 'Time to approve requests',
  buckets: [60, 300, 900, 3600, 86400]
});

// Expose metrics
app.get('/metrics', (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  res.end(prometheus.register.metrics());
});
```

### Alerts

**Example alert rules** (Prometheus):
```yaml
groups:
  - name: cgr-image-requester
    rules:
      - alert: HighPendingRequests
        expr: cgr_pending_requests > 10
        for: 1h
        annotations:
          summary: "High number of pending image requests"

      - alert: SlowApprovalTime
        expr: cgr_approval_duration_seconds > 14400  # 4 hours
        for: 30m
        annotations:
          summary: "Image requests taking too long to approve"

      - alert: APIAuthFailure
        expr: rate(cgr_api_errors_total{type="auth"}[5m]) > 0.1
        for: 5m
        annotations:
          summary: "Chainguard API authentication failing"
```

## Troubleshooting

### Common Issues

#### "Token expired" or "401 Unauthorized"

**Solution**: Rotate token
```bash
chainctl auth token --identity=${SERVICE_ACCOUNT_ID} > /tmp/chainguard-token

# Update in your secret manager
gh secret set CHAINGUARD_TOKEN < /tmp/chainguard-token
# or
aws secretsmanager update-secret --secret-id cgr-token --secret-string "$(cat /tmp/chainguard-token)"
```

#### "Image not found in catalog"

**Check**: Image name is correct
```bash
curl https://images.chainguard.dev/api/search?q=python | jq
```

Verify exact image name (e.g., `python:latest-dev` not `python:dev`)

#### "Organization limit reached (2500/2500)"

**Solution**: Clean up unused images
```bash
# List all repos
chainctl images repos list --parent=${ORG_ID}

# Delete unused repo
chainctl images repo delete <REPO_ID>
```

#### Slack bot not responding

**Checks**:
1. Bot is running: `curl http://localhost:3000/health`
2. Request URL is publicly accessible
3. Signing secret matches
4. Bot has correct permissions

#### GitHub Action failing

**Checks**:
1. Secrets are set: `gh secret list`
2. Workflow file is in `.github/workflows/` (not `.github/workflow`)
3. Token has correct permissions
4. Check workflow logs: `gh run list` → `gh run view <run-id>`

## Next Steps

### Week 1: MVP Deployment

- [ ] Choose integration pattern
- [ ] Create service account
- [ ] Deploy basic wrapper
- [ ] Test with dev environment
- [ ] Document for team

### Week 2: Production Rollout

- [ ] Add approval workflows
- [ ] Set up audit logging
- [ ] Configure monitoring
- [ ] Train team on usage
- [ ] Deploy to production

### Week 3: Optimization

- [ ] Collect user feedback
- [ ] Add metrics dashboards
- [ ] Optimize approval times
- [ ] Document common patterns

### Month 2: Expansion

- [ ] Add additional integration patterns
- [ ] Integrate with CI/CD
- [ ] Add event-driven automation
- [ ] Measure ROI and report

## Support

### Documentation

- [README.md](README.md) - Project overview
- [BUSINESS-VALUE.md](BUSINESS-VALUE.md) - ROI analysis
- [docs/architecture.md](docs/architecture.md) - Integration patterns deep-dive
- Example READMEs in `examples/` directories

### Chainguard Resources

- [Chainguard Console](https://console.chainguard.dev)
- [API Documentation](https://console.chainguard.dev/chainguard/administration/api/)
- [Support Portal](https://support.chainguard.dev)
- [Community Slack](https://go.chainguard.dev/slack)

### Getting Help

**If you encounter issues**:
1. Check example READMEs for your integration pattern
2. Verify prerequisites (service account, token, permissions)
3. Check troubleshooting section above
4. Contact Chainguard support

## Sources

**Based on Chainguard Documentation**:
- [Self-Serve Catalog](https://edu.chainguard.dev/chainguard/chainguard-images/images-features/entitlements/) - chainguard-ai-docs.md:24415-24514
- [API Reference](https://console.chainguard.dev/chainguard/administration/api/) - chainguard-ai-docs.md:26125-26128
- [Service Accounts](https://edu.chainguard.dev/chainguard/administration/iam-organizations/service-accounts/) - chainguard-ai-docs.md:31276-31285
- [Custom Assembly Demo](https://github.com/chainguard-dev/edu-images-demos/tree/main/custom-assembly-go) - chainguard-ai-docs.md:25979-26131
