/**
 * Chainguard Image Request Validator
 *
 * Validates image requests in requested-images.yaml against Chainguard catalog
 * Used by GitHub Actions to validate PRs
 *
 * Based on: chainguard-ai-docs.md:26125-26128 (API docs)
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

async function validateImageRequests() {
  try {
    // Load manifest
    const manifestContent = fs.readFileSync('requested-images.yaml', 'utf8');
    const manifest = yaml.load(manifestContent);

    if (!manifest || !manifest.images || !Array.isArray(manifest.images)) {
      throw new Error('Invalid manifest format: missing images array');
    }

    console.log(`Validating ${manifest.images.length} image requests...`);

    // Get available images from Chainguard catalog
    console.log('Fetching Chainguard catalog...');
    const entitlements = await axios.get(`${CHAINGUARD_API}/registry/entitlements`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const availableImages = entitlements.data.items.map(i => i.name);
    console.log(`Catalog contains ${availableImages.length} images`);

    // Get already provisioned images
    console.log('Fetching provisioned images...');
    const repos = await axios.get(`${CHAINGUARD_API}/repos?parent=${orgId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const provisionedImages = new Set(
      repos.data.items.map(i => i.name)
    );
    console.log(`Organization has ${provisionedImages.size} provisioned images`);

    // Validate each request
    const results = {
      valid: true,
      requests: []
    };

    for (const req of manifest.images) {
      const validation = {
        name: req.name || 'unknown',
        valid: true,
        message: 'Valid'
      };

      // Check required fields
      if (!req.name) {
        validation.valid = false;
        validation.message = 'Missing image name';
      } else if (!req.justification) {
        validation.valid = false;
        validation.message = 'Missing justification field';
      } else if (req.justification.length < 10) {
        validation.valid = false;
        validation.message = 'Justification too short (minimum 10 characters)';
      } else if (!req.requestedBy) {
        validation.valid = false;
        validation.message = 'Missing requestedBy field (email)';
      } else if (!req.team) {
        validation.valid = false;
        validation.message = 'Missing team field';
      }

      // Check if image exists in catalog
      else if (!availableImages.includes(req.name)) {
        validation.valid = false;
        validation.message = 'Image not found in Chainguard catalog. Check https://images.chainguard.dev';
      }

      // Check if already provisioned (skip if already has provisionedAt)
      else if (!req.provisionedAt && provisionedImages.has(req.name)) {
        validation.valid = false;
        validation.message = 'Image already provisioned in organization';
      }

      // Custom name validation
      else if (req.customName) {
        if (!/^[a-z0-9-]+$/.test(req.customName)) {
          validation.valid = false;
          validation.message = 'Custom name must be lowercase alphanumeric with hyphens';
        } else if (provisionedImages.has(req.customName)) {
          validation.valid = false;
          validation.message = `Custom name "${req.customName}" already exists`;
        }
      }

      if (!validation.valid) {
        results.valid = false;
        console.error(`❌ ${validation.name}: ${validation.message}`);
      } else {
        console.log(`✅ ${validation.name}: Valid`);
      }

      results.requests.push(validation);
    }

    // Write results for GitHub Action
    fs.writeFileSync('validation-results.json', JSON.stringify(results, null, 2));

    console.log(`\nValidation ${results.valid ? 'PASSED' : 'FAILED'}`);
    console.log(`Total: ${results.requests.length}, Valid: ${results.requests.filter(r => r.valid).length}, Invalid: ${results.requests.filter(r => !r.valid).length}`);

    if (!results.valid) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Validation error:', error.message);
    if (error.response) {
      console.error('API response:', error.response.status, error.response.data);
    }
    process.exit(1);
  }
}

validateImageRequests();
