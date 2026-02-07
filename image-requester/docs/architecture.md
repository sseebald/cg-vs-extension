# Architecture Guide

## Overview

This document describes integration patterns for wrapping the Chainguard image request API to enable developer self-service without requiring Console access.

## Core Components

### 1. Chainguard API Layer

**Endpoint**: `https://console-api.enforce.dev`

**Key Operations**:
- `ListRepos` - Get current organization repositories
- `CreateRepo` - Provision new image (adds to catalog)
- `UpdateRepo` - Modify repository configuration
- `ListEntitlements` - Query available catalog images

**Authentication**: Bearer token from `chainctl auth token` or service account credentials.

**SDK**: Official Go SDK at `github.com/chainguard-dev/sdk`

**Sources**:
- API Reference: chainguard-ai-docs.md:26125-26128
- Demo Application: chainguard-ai-docs.md:25979-26131

### 2. Wrapper Layer (Your Implementation)

**Purpose**:
- Receive requests from developers
- Validate and sanitize input
- Implement approval workflows
- Call Chainguard API
- Notify requesters of status

**Required Capabilities**:
- Authentication management (service account tokens)
- Request validation (image exists in catalog)
- Approval workflow orchestration
- Error handling and retries
- Audit logging

### 3. Developer Interface

**Options**:
- Slack slash commands
- GitHub PR workflows
- Web forms / portals
- CLI tools
- Infrastructure as Code (Terraform)
- ServiceNow / Jira integrations

## Integration Patterns

### Pattern 1: Slack Bot (Chat-Driven Requests)

**Architecture**:
```
Developer → Slack /request-image → Bot Server → Approval Channel → Chainguard API
                                        ↓
                                   Audit Log
```

**Components**:
1. **Slack App**: Receives slash commands
2. **Bot Server**: Node.js/Python/Go service
3. **Approval Flow**: Interactive Slack messages
4. **API Client**: Calls Chainguard API on approval

**Data Flow**:
1. Dev: `/request-image python:latest-dev --justification "ML pipeline"`
2. Bot validates image exists in Chainguard catalog
3. Bot posts approval request to #image-approvals
4. Admin clicks ✅ Approve or ❌ Deny
5. Bot calls Chainguard API to provision
6. Bot notifies developer in DM

**Pros**:
- Familiar interface (Slack)
- Built-in approval workflow
- Audit trail in Slack
- Real-time notifications

**Cons**:
- Requires Slack infrastructure
- Not suitable for non-Slack orgs
- Approval delays possible

**Best For**: Teams already using Slack for operations

**Sources**: See `examples/slack-bot/` for implementation

---

### Pattern 2: GitHub Actions (GitOps Workflow)

**Architecture**:
```
Developer → PR (requested-images.yaml) → GitHub Actions → Admin Merge → Chainguard API
                                              ↓
                                         Validation
```

**Components**:
1. **Image Manifest**: YAML file in repo (`requested-images.yaml`)
2. **PR Validation**: GitHub Action validates requests
3. **Admin Review**: Standard PR approval
4. **Provisioning Workflow**: Triggered on merge

**Data Flow**:
1. Dev opens PR adding image to manifest file
2. GitHub Action validates:
   - Image exists in catalog
   - Justification provided
   - Naming convention followed
3. Admin reviews PR (comments, requests changes)
4. Admin merges PR
5. Merge triggers workflow that calls Chainguard API
6. Workflow comments on PR when complete

**Manifest Format**:
```yaml
# requested-images.yaml
images:
  - name: python:latest-dev
    customName: python-ml-pipeline
    justification: "Required for data science ML training pipeline"
    requestedBy: alice@example.com
    team: data-engineering

  - name: postgres:latest
    justification: "Database for customer analytics"
    requestedBy: bob@example.com
    team: backend
```

**Pros**:
- Git-based audit trail
- Declarative configuration
- Integration with existing PR process
- No new tools to learn

**Cons**:
- Requires Git/GitHub knowledge
- Async approval (not instant)
- Requires GitHub Actions setup

**Best For**: Teams using GitOps for infrastructure management

**Sources**: See `examples/github-actions/` for implementation

---

### Pattern 3: Webhook Service (API Wrapper)

**Architecture**:
```
Developer → Web Form / CLI → Webhook API → Approval Queue → Chainguard API
                                  ↓                ↓
                             Validation       Admin Portal
```

**Components**:
1. **REST API**: Receives image requests
2. **Request Queue**: Stores pending approvals
3. **Admin Portal**: Web UI for approval/rejection
4. **Worker Process**: Provisions approved requests

**Data Flow**:
1. Dev submits POST request:
   ```bash
   curl -X POST https://image-api.example.com/request \
     -H "Authorization: Bearer <dev-token>" \
     -d '{
       "image": "python:latest-dev",
       "justification": "ML pipeline",
       "team": "data-engineering"
     }'
   ```
2. API validates and queues request
3. Returns request ID: `{"requestId": "req-12345", "status": "pending"}`
4. Admin sees request in portal
5. Admin approves/rejects with comments
6. Worker process provisions approved images
7. Notification sent to requester

**API Endpoints**:
```
POST   /request                  # Submit image request
GET    /request/{id}             # Check request status
GET    /requests?status=pending  # List pending requests
PATCH  /request/{id}/approve     # Approve request (admin)
PATCH  /request/{id}/reject      # Reject request (admin)
GET    /catalog                  # List available images
```

**Pros**:
- Flexible integration (any client can call)
- Centralized approval management
- Custom business logic
- Metrics and analytics

**Cons**:
- Requires hosting infrastructure
- More complex implementation
- Security considerations (auth, rate limiting)

**Best For**: Organizations with existing internal portals or custom tooling

**Sources**: See `examples/webhook-service/` for implementation

---

### Pattern 4: CLI Wrapper (Terminal Tool)

**Architecture**:
```
Developer → CLI Tool → Chainguard API + Approval Queue → Admin CLI
```

**Components**:
1. **CLI Binary**: Go/Python tool (e.g., `cgr-request`)
2. **Local Config**: Stores user credentials
3. **Request Queue**: Simple file or database
4. **Admin Tool**: Separate CLI for approval

**Data Flow**:
1. Dev runs: `cgr-request add python:latest-dev --justification "ML pipeline"`
2. CLI validates image exists
3. CLI creates request in shared queue (S3, database, etc.)
4. Admin runs: `cgr-request approve req-12345`
5. CLI calls Chainguard API to provision
6. Dev polls: `cgr-request status req-12345`

**Example Commands**:
```bash
# Developer commands
cgr-request add python:latest-dev --justification "reason" --team "data-eng"
cgr-request list --status pending
cgr-request status req-12345

# Admin commands
cgr-request approve req-12345 --comment "Approved for ML project"
cgr-request reject req-12345 --reason "Use existing python:latest instead"
cgr-request pending --team data-eng
```

**Pros**:
- Simple to use
- No web infrastructure needed
- Works offline (queue-based)
- Easy to script

**Cons**:
- Requires CLI distribution
- Limited UI (text-only)
- Polling for status

**Best For**: Terminal-centric teams, automation scripts

**Sources**: See `examples/cli-wrapper/` for implementation

---

### Pattern 5: Terraform Provider (IaC Integration)

**Architecture**:
```
Developer → Terraform Plan → Admin Review → Terraform Apply → Chainguard API
```

**Components**:
1. **Custom Provider**: Terraform provider for Chainguard
2. **Resource Definition**: HCL configuration
3. **State Management**: Terraform state

**Data Flow**:
1. Dev defines resource in Terraform:
   ```hcl
   resource "chainguard_image" "python_ml" {
     image_name  = "python:latest-dev"
     custom_name = "python-ml-pipeline"

     metadata = {
       team          = "data-engineering"
       justification = "ML training pipeline"
     }
   }
   ```
2. Dev runs `terraform plan`
3. Admin reviews plan
4. Dev runs `terraform apply`
5. Provider calls Chainguard API
6. Image appears in state file

**Pros**:
- Declarative infrastructure
- Version controlled
- Integration with existing IaC
- Drift detection

**Cons**:
- Requires Terraform knowledge
- Provider development effort
- State management complexity

**Best For**: Teams using Terraform for infrastructure

**Sources**: See `examples/terraform/` for implementation

---

## Security Architecture

### Authentication Flow

**Service Account Setup**:
```
Admin → chainctl → Create Service Account → Get Token → Store in Secret Manager
                                                              ↓
Wrapper Service → Fetch Token → Authenticate to Chainguard API
```

**Token Management**:
1. **Creation**: Use `chainctl auth token` or service account credentials
2. **Storage**: AWS Secrets Manager, HashiCorp Vault, K8s Secret
3. **Rotation**: Automate token refresh every 30 days
4. **Scope**: Minimal capabilities (`repo.create`, `repo.list`)

**Sources**: chainguard-ai-docs.md:31276-31285 (Service Account Creation)

### Authorization Levels

**Tier 1: Auto-Approve** (Dev/Staging)
- No approval required
- Audit logging only
- Rate limiting enforced

**Tier 2: Manager Approval** (Production)
- Team lead approval required
- Justification mandatory
- SLA: 24 hours

**Tier 3: Security Review** (High-Risk)
- Security team approval
- Justification + risk assessment
- SLA: 48 hours

**Criteria for Tier Assignment**:
```python
def get_approval_tier(environment, image_name, team):
    if environment in ["dev", "staging"]:
        return "auto-approve"

    if image_name.startswith("base-image/"):
        return "security-review"

    if team in ["platform-engineering", "security"]:
        return "manager-approval"

    return "manager-approval"  # default
```

### Audit Logging

**Required Fields**:
- Timestamp (ISO 8601)
- Requester ID (email, username)
- Image name
- Justification
- Approval decision (approved/rejected)
- Approver ID
- Provisioning result (success/failure)

**Storage**:
- Centralized logging (Splunk, Datadog, CloudWatch)
- Retention: 2 years minimum
- Immutable (append-only)

**Example Log Entry**:
```json
{
  "timestamp": "2026-02-06T14:30:00Z",
  "eventType": "image.request.approved",
  "requester": "alice@example.com",
  "approver": "security-team@example.com",
  "image": "python:latest-dev",
  "customName": "python-ml-pipeline",
  "justification": "Required for ML training pipeline",
  "team": "data-engineering",
  "environment": "production",
  "approvalTier": "security-review",
  "provisioningResult": "success",
  "chainguardRepoId": "repo-abc123"
}
```

---

## Error Handling

### Common Failure Scenarios

**1. Image Not in Catalog**
```
Request: python:3.9-alpine
Error: Image not found in Chainguard catalog
Action: Suggest alternative (python:latest) or contact support
```

**2. Organization Limit Reached**
```
Request: nginx:latest
Error: Organization has 2500/2500 repositories
Action: Request cleanup of unused images
```

**3. Authentication Failure**
```
Request: postgres:latest
Error: Token expired or invalid
Action: Refresh service account token
```

**4. Duplicate Image**
```
Request: redis:latest
Error: Image already exists in organization
Action: Use existing image or request custom name
```

### Retry Strategy

**Transient Errors** (5xx, network timeout):
- Retry up to 3 times
- Exponential backoff: 1s, 2s, 4s
- Log each retry attempt

**Permanent Errors** (4xx, validation):
- No retry
- Return error to requester
- Log for troubleshooting

---

## Monitoring and Metrics

### Key Metrics

**Request Volume**:
- Requests per day/week/month
- Breakdown by team/environment
- Approval rate (approved vs. rejected)

**Performance**:
- Average approval time
- API response time (p50, p95, p99)
- Provisioning success rate

**Resource Usage**:
- Current repository count vs. limit (2500 max)
- Image churn rate (added vs. removed)

**Security**:
- Failed authentication attempts
- Rejected requests by reason
- Privilege escalation attempts

### Alerting

**Critical**:
- API authentication failures > 5 in 10 minutes
- Provisioning failures > 10% in 1 hour
- Organization limit reached (2400+ repos)

**Warning**:
- Approval time > 48 hours
- Request queue > 50 pending
- Token expiring within 7 days

---

## Deployment Patterns

### Pattern A: Serverless (AWS Lambda)

**Architecture**:
```
API Gateway → Lambda → DynamoDB (requests) → EventBridge → Worker Lambda → Chainguard API
```

**Pros**: Auto-scaling, pay-per-use, minimal ops
**Cons**: Cold start latency, vendor lock-in

### Pattern B: Container Service (K8s)

**Architecture**:
```
Ingress → Service Pod → PostgreSQL → Worker Pods → Chainguard API
```

**Pros**: Portable, full control, flexible
**Cons**: Ops overhead, resource management

### Pattern C: Managed Platform (Heroku, Render)

**Architecture**:
```
Platform Router → Web Dyno → Postgres → Worker Dyno → Chainguard API
```

**Pros**: Easy deployment, managed infra
**Cons**: Cost, less control

---

## Chainguard-Specific Advantages

### API-Driven Architecture

**Chainguard**: Full REST API with SDK support
**Docker Hub**: No provisioning API (manual only)
**Red Hat UBI**: Limited portal API
**Ubuntu/Debian**: No API (manual)

**Business Impact**: Enables all these integration patterns. Competitors require manual intervention for every image request.

### Zero-CVE Guarantee

**Implication for Approval Workflow**:
- No need for security scanning gate
- No patch remediation required
- Auto-approve safe for most images

**Competitive Comparison**:
- Docker Hub images: Require CVE scan + patching (adds days)
- Red Hat UBI: Monthly patch cycle (approval delayed)
- Chainguard: Provision and use immediately (daily rebuilds)

**Time Savings**: Request to production in minutes vs. days

### Event-Driven Integration

**CloudEvents** for image operations:
```
dev.chainguard.api.platform.registry.repo.created.v1
dev.chainguard.api.platform.registry.tag.created.v1
```

**Use Case**: Trigger downstream automation when images provisioned
- Auto-update CI/CD pipelines
- Notify security scanning tools
- Update documentation

**Competitive Advantage**: Docker Hub/UBI have no event system (polling required)

**Sources**: chainguard-ai-docs.md:39024+ (CloudEvents)

---

## Implementation Checklist

### Phase 1: Setup (Week 1)
- [ ] Create Chainguard service account
- [ ] Configure minimal IAM role
- [ ] Set up token storage (Secrets Manager)
- [ ] Document organization policies

### Phase 2: MVP (Week 2-3)
- [ ] Choose integration pattern
- [ ] Implement basic request/approval flow
- [ ] Add audit logging
- [ ] Test with dev environment

### Phase 3: Production (Week 4)
- [ ] Add approval workflows
- [ ] Implement error handling
- [ ] Set up monitoring/alerting
- [ ] Deploy to production

### Phase 4: Optimization (Ongoing)
- [ ] Collect user feedback
- [ ] Add metrics dashboards
- [ ] Optimize approval times
- [ ] Expand to other teams

---

## Sources

**Chainguard Documentation**:
- [Self-Serve Catalog](https://edu.chainguard.dev/chainguard/chainguard-images/images-features/entitlements/) - chainguard-ai-docs.md:24415-24514
- [Custom Assembly API Demo](https://github.com/chainguard-dev/edu-images-demos/tree/main/custom-assembly-go) - chainguard-ai-docs.md:25979-26131
- [Chainguard API Reference](https://console.chainguard.dev/chainguard/administration/api/) - chainguard-ai-docs.md:26125-26128
- [Service Accounts](https://edu.chainguard.dev/chainguard/administration/iam-organizations/service-accounts/) - chainguard-ai-docs.md:31276-31285
- [CloudEvents](https://edu.chainguard.dev/chainguard/administration/cloudevents/chainguard-events/) - chainguard-ai-docs.md:39024+
