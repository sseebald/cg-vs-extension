/**
 * Chainguard Image Provisioner
 *
 * Provisions new images from requested-images.yaml via Chainguard API
 * Used by GitHub Actions after PR merge
 *
 * Based on: chainguard-ai-docs.md:25979-26131 (API demo)
 */

const fs = require('fs');
const yaml = require('js-yaml');
const axios = require('axios');

const CHAINGUARD_API = 'https://console-api.enforce.dev';
const token = process.env.CHAINGUARD_TOKEN;
const orgId = process.env.CHAINGUARD_ORG_ID;

if (!token || !orgId) {
  console.error('Missing CHAINGUARD_TOKEN or CHAINGUARD_ORG_ID');
  process.exit(1);
}

async function provisionImages() {
  try {
    // Load manifest
    const manifestContent = fs.readFileSync('requested-images.yaml', 'utf8');
    const manifest = yaml.load(manifestContent);

    if (!manifest || !manifest.images || !Array.isArray(manifest.images)) {
      throw new Error('Invalid manifest format: missing images array');
    }

    console.log(`Processing ${manifest.images.length} image entries...`);

    const results = {
      success: true,
      provisioned: [],
      skipped: [],
      error: null
    };

    // Provision each image that hasn't been provisioned yet
    for (const req of manifest.images) {
      // Skip if already provisioned
      if (req.provisionedAt) {
        console.log(`⏭️  Skipping ${req.name} (already provisioned at ${req.provisionedAt})`);
        results.skipped.push({
          name: req.name,
          reason: 'Already provisioned'
        });
        continue;
      }

      try {
        console.log(`📦 Provisioning ${req.name}...`);

        const requestBody = {
          parent: orgId,
          imageName: req.name
        };

        if (req.customName) {
          requestBody.customName = req.customName;
        }

        const response = await axios.post(
          `${CHAINGUARD_API}/repos`,
          requestBody,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const repo = response.data;
        const pullString = repo.pullString || `cgr.dev/${orgId}/${req.customName || req.name}`;

        // Update manifest with provision details
        req.provisionedAt = new Date().toISOString();
        req.chainguardRepoId = repo.id;
        req.pullString = pullString;

        console.log(`✅ Successfully provisioned ${req.name}`);
        console.log(`   Pull string: ${pullString}`);
        console.log(`   Repo ID: ${repo.id}`);

        results.provisioned.push({
          name: req.name,
          customName: req.customName,
          pullString: pullString,
          repoId: repo.id
        });

      } catch (error) {
        console.error(`❌ Error provisioning ${req.name}:`, error.message);

        if (error.response) {
          console.error(`   Status: ${error.response.status}`);
          console.error(`   Error: ${JSON.stringify(error.response.data)}`);
        }

        // Check if it's a "already exists" error (not fatal)
        if (error.response?.status === 409 || error.response?.data?.message?.includes('already exists')) {
          console.log(`   Image may already exist, marking as provisioned`);
          req.provisionedAt = new Date().toISOString();
          req.provisionedBy = 'pre-existing';
          req.pullString = `cgr.dev/${orgId}/${req.customName || req.name}`;

          results.skipped.push({
            name: req.name,
            reason: 'Already exists in organization'
          });
        } else {
          // Fatal error
          results.success = false;
          results.error = `Failed to provision ${req.name}: ${error.message}`;
          break;
        }
      }
    }

    // Write updated manifest back to file
    if (results.provisioned.length > 0 || results.skipped.length > 0) {
      console.log('\n📝 Updating manifest file...');
      fs.writeFileSync('requested-images.yaml', yaml.dump(manifest, {
        lineWidth: -1,  // Don't wrap lines
        quotingType: '"',
        forceQuotes: false
      }));
      console.log('✅ Manifest updated');
    }

    // Write results for GitHub Action
    fs.writeFileSync('provision-results.json', JSON.stringify(results, null, 2));

    console.log(`\n📊 Provisioning Summary:`);
    console.log(`   Provisioned: ${results.provisioned.length}`);
    console.log(`   Skipped: ${results.skipped.length}`);
    console.log(`   Status: ${results.success ? 'SUCCESS' : 'FAILED'}`);

    if (!results.success) {
      console.error(`\n❌ ${results.error}`);
      process.exit(1);
    }

  } catch (error) {
    console.error('Provisioning error:', error.message);
    if (error.response) {
      console.error('API response:', error.response.status, error.response.data);
    }

    const results = {
      success: false,
      provisioned: [],
      error: error.message
    };
    fs.writeFileSync('provision-results.json', JSON.stringify(results, null, 2));

    process.exit(1);
  }
}

provisionImages();
