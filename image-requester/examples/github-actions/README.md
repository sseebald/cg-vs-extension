# GitHub Actions Integration

**GitOps-driven Chainguard image requests via Pull Request workflow**

## Overview

This integration allows developers to request Chainguard images by opening a Pull Request that adds entries to a manifest file. Admins review and approve via standard PR review, then the merge triggers automated provisioning.

## Features

- Declarative YAML manifest for image requests
- PR-based approval workflow (standard GitHub review)
- Automated validation on PR open
- Automated provisioning on PR merge
- Git-based audit trail
- Integration with existing PR processes

## Architecture

```
Developer → Opens PR (add to manifest) → GitHub Actions validates
                                                ↓
                                         PR review/comments
                                                ↓
                                    Admin approves & merges PR
                                                ↓
                                      Merge triggers workflow
                                                ↓
                                       Chainguard API call
                                                ↓
                                      Image provisioned
                                                ↓
                                  Workflow comments on PR with result
```

## Prerequisites

1. **GitHub Repository**: Where you manage infrastructure config
2. **Chainguard Organization**: Active subscription
3. **Service Account**: With `repo.create` and `repo.list` capabilities
4. **GitHub Secrets**: Store Chainguard credentials

## Quick Start

### 1. Create Manifest File

Add `requested-images.yaml` to your repo:

```yaml
# requested-images.yaml
# Chainguard Image Requests
# Add entries here and open a PR for approval

version: "1.0"

images:
  # Example entry (delete this):
  # - name: python:latest-dev
  #   customName: python-ml-pipeline  # optional
  #   justification: "Required for ML training pipeline"
  #   requestedBy: alice@example.com
  #   team: data-engineering
  #   environment: production
```

### 2. Set Up GitHub Secrets

Go to **Settings > Secrets and variables > Actions**:

```bash
# Create Chainguard service account token
chainctl auth token --identity=<SERVICE_ACCOUNT_ID> > /tmp/token

# Add as GitHub secret
gh secret set CHAINGUARD_TOKEN < /tmp/token
gh secret set CHAINGUARD_ORG_ID --body "your-org-id"
```

### 3. Add GitHub Actions Workflows

Copy these workflow files to `.github/workflows/`:

**`.github/workflows/validate-image-request.yml`** (runs on PR)
**`.github/workflows/provision-images.yml`** (runs on merge)

### 4. Developer Workflow

**Request a new image**:

1. Create a new branch:
   ```bash
   git checkout -b request-python-image
   ```

2. Edit `requested-images.yaml`:
   ```yaml
   images:
     - name: python:latest-dev
       justification: "Need for ML training pipeline"
       requestedBy: alice@example.com
       team: data-engineering
       environment: production
   ```

3. Commit and push:
   ```bash
   git add requested-images.yaml
   git commit -m "Request python:latest-dev image for ML pipeline"
   git push origin request-python-image
   ```

4. Open Pull Request on GitHub

5. GitHub Actions validates the request:
   - ✅ Image exists in Chainguard catalog
   - ✅ Required fields present
   - ✅ Image not already provisioned
   - ✅ Justification provided

6. Admin reviews PR, adds comments, requests changes if needed

7. Admin approves and merges PR

8. Merge triggers provisioning workflow:
   - Provisions image via Chainguard API
   - Comments on PR with pull string
   - Updates manifest with provisioned date

## Manifest Format

### Basic Entry

```yaml
images:
  - name: python:latest-dev
    justification: "ML training pipeline"
    requestedBy: alice@example.com
    team: data-engineering
```

### Full Entry (All Options)

```yaml
images:
  - name: postgres:latest
    customName: postgres-analytics  # Custom registry name
    justification: "Database for customer analytics"
    requestedBy: bob@example.com
    team: backend
    environment: production  # production, staging, dev
    autoApprove: false  # Override auto-approve logic
    metadata:
      jira: PROJ-123
      costCenter: "7000"
```

### Multiple Images

```yaml
images:
  - name: python:latest-dev
    justification: "ML training"
    requestedBy: alice@example.com
    team: data-engineering

  - name: postgres:latest
    justification: "Analytics database"
    requestedBy: bob@example.com
    team: backend

  - name: redis:latest
    justification: "Caching layer"
    requestedBy: charlie@example.com
    team: platform
```

## Workflows

### Validation Workflow (PR)

**File**: `.github/workflows/validate-image-request.yml`

**Triggers**: On pull request to `main`

**Steps**:
1. Check out code
2. Parse `requested-images.yaml`
3. Validate each new entry:
   - Image exists in Chainguard catalog
   - Required fields present (name, justification, requestedBy)
   - Justification is meaningful (> 10 chars)
   - Image not already in org
4. Post validation results as PR comment
5. Set PR status (✅ pass or ❌ fail)

**Example PR Comment**:
```markdown
## 🔍 Image Request Validation

### ✅ Validation Passed

**New Requests (2)**:
- ✅ `python:latest-dev` - Valid
- ✅ `postgres:latest` - Valid

**Summary**:
- Total new requests: 2
- All validations passed
- Ready for review

**Next Steps**:
1. Review justifications
2. Approve PR if acceptable
3. Merge to provision images
```

### Provisioning Workflow (Merge)

**File**: `.github/workflows/provision-images.yml`

**Triggers**: On push to `main` (after merge)

**Steps**:
1. Check out code
2. Parse `requested-images.yaml`
3. Identify new/changed entries
4. For each new entry:
   - Call Chainguard API to provision
   - Update manifest with provision details
   - Log result
5. Commit updated manifest (if changed)
6. Comment on merged PR with results

**Example PR Comment** (after merge):
```markdown
## ✅ Images Provisioned

**Successfully Provisioned (2)**:
- ✅ `python:latest-dev`
  - Pull string: `cgr.dev/your-org/python:latest-dev`
  - Repo ID: `repo-abc123`

- ✅ `postgres:latest`
  - Pull string: `cgr.dev/your-org/postgres:latest`
  - Repo ID: `repo-def456`

**Updated**: `requested-images.yaml` with provision details

You can now pull these images in your applications!
```

## Workflow Files

### validate-image-request.yml

```yaml
name: Validate Image Request

on:
  pull_request:
    paths:
      - 'requested-images.yaml'
    branches:
      - main

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          npm install js-yaml axios

      - name: Validate requests
        id: validate
        env:
          CHAINGUARD_TOKEN: ${{ secrets.CHAINGUARD_TOKEN }}
          CHAINGUARD_ORG_ID: ${{ secrets.CHAINGUARD_ORG_ID }}
        run: |
          node .github/scripts/validate.js

      - name: Comment on PR
        uses: actions/github-script@v7
        if: always()
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('validation-results.json', 'utf8'));

            let body = '## 🔍 Image Request Validation\n\n';

            if (results.valid) {
              body += '### ✅ Validation Passed\n\n';
            } else {
              body += '### ❌ Validation Failed\n\n';
            }

            body += '**New Requests**:\n';
            results.requests.forEach(req => {
              const icon = req.valid ? '✅' : '❌';
              body += `- ${icon} \`${req.name}\` - ${req.message}\n`;
            });

            body += `\n**Summary**:\n`;
            body += `- Total new requests: ${results.requests.length}\n`;
            body += `- Valid: ${results.requests.filter(r => r.valid).length}\n`;
            body += `- Invalid: ${results.requests.filter(r => !r.valid).length}\n`;

            if (results.valid) {
              body += '\n✅ Ready for review and approval!\n';
            } else {
              body += '\n❌ Please fix validation errors before merging.\n';
            }

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });

      - name: Set PR status
        if: failure()
        run: exit 1
```

### provision-images.yml

```yaml
name: Provision Images

on:
  push:
    paths:
      - 'requested-images.yaml'
    branches:
      - main

jobs:
  provision:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Get full history for diff

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          npm install js-yaml axios

      - name: Provision new images
        id: provision
        env:
          CHAINGUARD_TOKEN: ${{ secrets.CHAINGUARD_TOKEN }}
          CHAINGUARD_ORG_ID: ${{ secrets.CHAINGUARD_ORG_ID }}
        run: |
          node .github/scripts/provision.js

      - name: Commit updated manifest
        if: success()
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add requested-images.yaml
          if git diff --staged --quiet; then
            echo "No changes to commit"
          else
            git commit -m "Update manifest with provision details [skip ci]"
            git push
          fi

      - name: Comment on PR
        uses: actions/github-script@v7
        if: always()
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('provision-results.json', 'utf8'));

            let body = '## ✅ Images Provisioned\n\n';

            if (results.success) {
              body += '**Successfully Provisioned**:\n';
              results.provisioned.forEach(img => {
                body += `- ✅ \`${img.name}\`\n`;
                body += `  - Pull string: \`${img.pullString}\`\n`;
                body += `  - Repo ID: \`${img.repoId}\`\n\n`;
              });
            } else {
              body += '### ❌ Provisioning Failed\n\n';
              body += `Error: ${results.error}\n`;
            }

            body += '**Next Steps**:\n';
            body += '- Update your Dockerfiles to use these images\n';
            body += '- Run `docker pull <pull-string>` to test\n';

            // Find the PR number from commit message
            const commit = context.payload.commits[0];
            const prMatch = commit.message.match(/#(\d+)/);

            if (prMatch) {
              const prNumber = parseInt(prMatch[1]);
              github.rest.issues.createComment({
                issue_number: prNumber,
                owner: context.repo.owner,
                repo: context.repo.repo,
                body: body
              });
            }
```

## Validation Script

**File**: `.github/scripts/validate.js`

```javascript
const fs = require('fs');
const yaml = require('js-yaml');
const axios = require('axios');

const CHAINGUARD_API = 'https://console-api.enforce.dev';
const token = process.env.CHAINGUARD_TOKEN;
const orgId = process.env.CHAINGUARD_ORG_ID;

async function validateImageRequests() {
  // Load manifest
  const manifest = yaml.load(fs.readFileSync('requested-images.yaml', 'utf8'));

  // Get available images from Chainguard
  const entitlements = await axios.get(`${CHAINGUARD_API}/registry/entitlements`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const availableImages = entitlements.data.items.map(i => i.name);

  // Get already provisioned images
  const repos = await axios.get(`${CHAINGUARD_API}/repos?parent=${orgId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const provisionedImages = repos.data.items.map(i => i.name);

  // Validate each request
  const results = {
    valid: true,
    requests: []
  };

  for (const req of manifest.images) {
    const validation = {
      name: req.name,
      valid: true,
      message: 'Valid'
    };

    // Check required fields
    if (!req.name) {
      validation.valid = false;
      validation.message = 'Missing image name';
    } else if (!req.justification || req.justification.length < 10) {
      validation.valid = false;
      validation.message = 'Justification required (min 10 characters)';
    } else if (!req.requestedBy) {
      validation.valid = false;
      validation.message = 'Missing requestedBy field';
    }

    // Check if image exists in catalog
    else if (!availableImages.includes(req.name)) {
      validation.valid = false;
      validation.message = 'Image not found in Chainguard catalog';
    }

    // Check if already provisioned
    else if (provisionedImages.includes(req.name) || provisionedImages.includes(req.customName)) {
      validation.valid = false;
      validation.message = 'Image already provisioned';
    }

    if (!validation.valid) {
      results.valid = false;
    }

    results.requests.push(validation);
  }

  // Write results
  fs.writeFileSync('validation-results.json', JSON.stringify(results, null, 2));

  if (!results.valid) {
    process.exit(1);
  }
}

validateImageRequests().catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});
```

## Provisioning Script

**File**: `.github/scripts/provision.js`

```javascript
const fs = require('fs');
const yaml = require('js-yaml');
const axios = require('axios');

const CHAINGUARD_API = 'https://console-api.enforce.dev';
const token = process.env.CHAINGUARD_TOKEN;
const orgId = process.env.CHAINGUARD_ORG_ID;

async function provisionImages() {
  // Load manifest
  const manifest = yaml.load(fs.readFileSync('requested-images.yaml', 'utf8'));

  const results = {
    success: true,
    provisioned: []
  };

  // Provision each image
  for (const req of manifest.images) {
    // Skip if already provisioned
    if (req.provisionedAt) {
      continue;
    }

    try {
      const response = await axios.post(`${CHAINGUARD_API}/repos`, {
        parent: orgId,
        imageName: req.name,
        customName: req.customName || null
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const repo = response.data;

      // Update manifest with provision details
      req.provisionedAt = new Date().toISOString();
      req.chainguardRepoId = repo.id;
      req.pullString = repo.pullString || `cgr.dev/${orgId}/${req.name}`;

      results.provisioned.push({
        name: req.name,
        pullString: req.pullString,
        repoId: repo.id
      });
    } catch (error) {
      console.error(`Error provisioning ${req.name}:`, error.message);
      results.success = false;
      results.error = error.message;
      break;
    }
  }

  // Write updated manifest
  if (results.provisioned.length > 0) {
    fs.writeFileSync('requested-images.yaml', yaml.dump(manifest));
  }

  // Write results for GitHub Action
  fs.writeFileSync('provision-results.json', JSON.stringify(results, null, 2));

  if (!results.success) {
    process.exit(1);
  }
}

provisionImages().catch(err => {
  console.error('Provisioning error:', err);
  process.exit(1);
});
```

## Advanced Configuration

### Auto-Approve for Dev Environment

Add logic to `provision.js`:

```javascript
function shouldAutoApprove(request) {
  return request.environment === 'dev' ||
         request.environment === 'staging' ||
         request.autoApprove === true;
}

// In provisioning loop:
if (shouldAutoApprove(req)) {
  // Provision immediately without approval
} else {
  // Require PR review/approval
}
```

### Multi-Approval for Production

Use GitHub's branch protection + CODEOWNERS:

**`.github/CODEOWNERS`**:
```
# Require security team approval for production images
requested-images.yaml @your-org/security-team
```

**Branch protection**:
- Require 2 approvals for PRs touching `requested-images.yaml`
- Require security team approval

### Integration with CI/CD

Update your CI pipeline when images provisioned:

```javascript
// In provision.js, after successful provision:
async function updateCIPipeline(image, pullString) {
  // Update CircleCI config
  await axios.post('https://circleci.com/api/v2/pipeline', {
    parameters: {
      new_image: pullString
    }
  });

  // Or trigger GitHub workflow
  await axios.post(
    `https://api.github.com/repos/${owner}/${repo}/dispatches`,
    {
      event_type: 'image_provisioned',
      client_payload: { image, pullString }
    },
    {
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`
      }
    }
  );
}
```

## Business Value

### GitOps Workflow Benefits

**Audit Trail**:
- Every request is a commit (immutable log)
- PR reviews capture approval reasoning
- Git history shows who, what, when, why

**Integration with Existing Process**:
- Developers already familiar with PRs
- Reuse existing approval workflows
- No new tools to learn

**Declarative Configuration**:
- Single source of truth (`requested-images.yaml`)
- Easy to review all images at once
- Supports infrastructure as code principles

### Time Savings

**Before** (Manual Console access):
- Developer creates ticket: 5 min
- Admin processes ticket: 10 min
- Admin provisions via Console: 2 min
- Admin notifies developer: 2 min
- **Total: 19 minutes**

**After** (GitHub Actions):
- Developer opens PR: 3 min
- Admin reviews PR: 2 min
- Auto-provisioning: 1 min
- **Total: 6 minutes**

**Savings**: 68% time reduction

### Cost Savings

**Assumptions**:
- 15 image requests/month
- Engineering cost: $150/hour
- Before: 19 min × 15 = 285 min = 4.75 hours
- After: 6 min × 15 = 90 min = 1.5 hours

**Monthly savings**: $487.50
**Annual savings**: $5,850

### Security Benefits

**Code Review Process**:
- Every image request reviewed like code
- Multiple approval tiers (CODEOWNERS)
- Automated validation (can't merge invalid requests)

**Audit Trail**:
- Git log shows complete history
- PR comments capture reasoning
- Meets SOC2/ISO27001 requirements

## Chainguard Competitive Advantage

### vs. Docker Hub

**Docker Hub**: No API, no automation possible
- Must manually pull, scan, patch, push
- No declarative workflow
- No automated audit trail

**Chainguard**: Full API enables GitOps
- Automated provisioning
- Declarative manifest
- Git-based audit trail

### vs. Red Hat UBI

**Red Hat UBI**: Limited portal API
- Requires per-developer portal access ($)
- No GitOps integration
- Manual provisioning

**Chainguard**: Service account + GitHub Actions
- No per-developer cost
- Full GitOps integration
- Automated workflow

### vs. Internal Registry Mirrors

**Internal Registry**: Requires building automation from scratch
- Must build custom API
- Must handle image pulls/pushes
- Must scan for CVEs
- Must patch vulnerabilities
- Ongoing maintenance cost

**Chainguard**: Pre-built API + zero-CVE images
- Use Chainguard API directly
- No image scanning needed (zero CVEs)
- No patching needed (daily rebuilds)
- Zero maintenance for image security

**Cost Comparison**:
- Internal registry: $50K/year (infrastructure + labor)
- Chainguard: Included in subscription
- **Savings: $50K/year**

## Troubleshooting

### Validation Fails: "Image not found"

**Check**: Is image name correct?
```bash
# Search Chainguard catalog
curl https://images.chainguard.dev/api/search?q=python
```

### Provisioning Fails: "Token expired"

**Solution**: Rotate GitHub secret
```bash
chainctl auth token --identity=<SERVICE_ACCOUNT_ID> > /tmp/token
gh secret set CHAINGUARD_TOKEN < /tmp/token
```

### Workflow Not Triggering

**Check**:
1. Workflow file in `.github/workflows/` (not `.github/workflow`)
2. Branch protection not blocking
3. GitHub Actions enabled in repo settings

## Sources

**Chainguard Documentation**:
- [API Reference](https://console.chainguard.dev/chainguard/administration/api/) - chainguard-ai-docs.md:26125-26128
- [Self-Serve Catalog](https://edu.chainguard.dev/chainguard/chainguard-images/images-features/entitlements/) - chainguard-ai-docs.md:24415-24514

**GitHub Documentation**:
- [GitHub Actions](https://docs.github.com/en/actions)
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
