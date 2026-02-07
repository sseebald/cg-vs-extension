# Enabling Self-Serve Catalog Experience

## Current State: Manual Fulfillment

When you click "Request image" in the Console, you see:
```
"Requests will not be fulfilled automatically.
Your account representatives will be notified on submitting this request,
and they will be in touch."
```

This means your org (`sseebald.dev`) is using **manual fulfillment** instead of **self-serve catalog**.

## What is Self-Serve Catalog Experience?

**Self-Serve Catalog** allows instant provisioning of catalog images to your org without manual approval:
- Click "Add image" → Image appears in minutes
- No waiting for account reps
- Full API access for automation
- This is what enables the wrappers (Slack bot, GitHub Actions, CLI)

## Requirements to Enable Self-Serve

According to Chainguard documentation (chainguard-ai-docs.md:24431):

### 1. Subscription Requirement

**You need**: "Catalog Pricing" subscription

**What is Catalog Pricing?**
- Single subscription for unlimited access to full Chainguard catalog (~2500 images)
- Self-serve provisioning (instant)
- Max 2500 repositories per organization
- API-driven automation enabled

**To check your current subscription**:
```bash
# This might show subscription details
chainctl iam organizations describe ae2a22d98354389440591848465119d347e1baa5 -o json
```

### 2. IAM Permission Requirements

**Your user needs** a role with these capabilities:
- `repo.create` - Create new repositories (add images)
- `repo.list` - List repositories
- `repo.update` - Update repository settings
- `registry.entitlements.list` - List available catalog images

**Built-in role with all these**: `owner` role

**Or create custom role**:
```bash
chainctl iam roles create image-provisioner \
  --parent=ae2a22d98354389440591848465119d347e1baa5 \
  --capabilities=repo.create,repo.list,repo.update,registry.entitlements.list
```

## How to Enable Self-Serve

### Step 1: Contact Chainguard Sales/Account Team

**You need to**: Upgrade to "Catalog Pricing" subscription

**Contact**:
- Your account representative
- Email: support@chainguard.dev
- Request: "Enable Catalog Pricing and Self-Serve Catalog Experience for sseebald.dev org"

**What they'll do**:
1. Review your subscription
2. Enable Catalog Pricing if not already active
3. Enable Self-Serve Catalog Experience feature flag
4. Confirm activation

### Step 2: Verify IAM Permissions

**Check your current capabilities**:
```bash
# See your current role
chainctl auth status

# Check if you have owner role on sseebald.dev
chainctl iam role-bindings list --parent=ae2a22d98354389440591848465119d347e1baa5 \
  | grep "spencer.seebald@chainguard.dev"
```

**If you don't have owner role**, ask your org admin to grant it:
```bash
chainctl iam role-bindings create \
  --parent=ae2a22d98354389440591848465119d347e1baa5 \
  --identity=<your-user-id> \
  --role=owner
```

### Step 3: Test Self-Serve Provisioning

**After enablement**, the Console should show "Add image" button with instant provisioning:

1. Go to: https://console.chainguard.dev/images/organization
2. Click **"Add image"** button
3. Search for image (e.g., `busybox`)
4. Click **Add image**
5. Image should appear in your org within minutes (no manual approval)

**Verify via CLI**:
```bash
# List images (should see new image)
chainctl images repos list --parent=ae2a22d98354389440591848465119d347e1baa5 | grep busybox
```

## After Self-Serve is Enabled

### Test the API Workflow

Once self-serve is enabled, test the programmatic flow:

```bash
# Get token
TOKEN=$(chainctl auth token)

# Test listing entitlements (available images)
curl -H "Authorization: Bearer $TOKEN" \
  https://console-api.enforce.dev/iam/groups/ae2a22d98354389440591848465119d347e1baa5/repos

# Test provisioning an image (if API endpoint is accessible)
# Note: Exact API endpoint may vary - chainctl abstracts this
chainctl images repos create \
  --parent=ae2a22d98354389440591848465119d347e1baa5 \
  --sync-image=<catalog-image-id>
```

### Deploy the Wrappers

Once self-serve is working, the image requester wrappers will work:

1. **Slack Bot**: Instant approval + provisioning (< 2 min)
2. **GitHub Actions**: PR merge triggers instant provisioning
3. **CLI**: Admin approval triggers instant provisioning

**Without self-serve**, the wrappers would need to:
- Submit requests to Chainguard on behalf of developers
- Track request status
- Notify when manually fulfilled (hours/days later)

## Internal/Special Accounts

**Note**: `sseebald.dev` appears to be an internal Chainguard employee org. Internal accounts may have different workflows:

**Possibility 1**: Internal orgs use manual fulfillment by design
- Controlled provisioning process
- May not get self-serve enabled

**Possibility 2**: Feature flag not enabled yet
- Self-serve available but needs activation
- Account team can enable

**Recommendation**: Ask your internal Chainguard team:
- "Is sseebald.dev eligible for self-serve catalog?"
- "If yes, how do I enable it?"
- "If no, what's the alternative for testing automation?"

## Alternative: Test with Customer Org

If `sseebald.dev` can't enable self-serve, consider:

**Option A**: Use a demo customer org
- Customer orgs with Catalog Pricing have self-serve enabled
- Test wrappers in customer-like environment

**Option B**: Document both workflows
- **Self-serve flow**: For customers with Catalog Pricing
- **Manual fulfillment flow**: For customers with different subscriptions

## Workflow Comparison

### With Self-Serve (What We Want)

```
Developer → Wrapper → Chainguard API → Image provisioned (< 2 min)
```

**Benefits**:
- Instant provisioning
- Full automation possible
- Scalable (1000s of requests)

### Without Self-Serve (Current State)

```
Developer → Wrapper → Submit request → Account rep reviews → Manual fulfillment (hours/days)
```

**Limitations**:
- Not instant
- Limited automation
- Doesn't scale well

## Next Steps

1. **Contact Chainguard team** to enable Catalog Pricing + Self-Serve for `sseebald.dev`
2. **Verify enablement** by testing instant provisioning in Console
3. **Test API workflow** with `chainctl` or direct API calls
4. **Deploy wrappers** once self-serve is confirmed working

## Questions to Ask Chainguard Team

- Is `sseebald.dev` eligible for Catalog Pricing?
- Can we enable Self-Serve Catalog Experience?
- If not, what's the recommended way to test automation/wrappers?
- Is there a demo org with self-serve enabled we can use?
- What API endpoints are available for programmatic provisioning?

## Resources

- [Blog: Self-Serve Catalog Experience](https://chainguard.dev/unchained/introducing-the-self-serve-catalog-experience)
- [Blog: Catalog Pricing](https://chainguard.dev/unchained/unlock-the-full-chainguard-containers-catalog-now-with-a-catalog-pricing-option)
- [Pricing Page](https://chainguard.dev/pricing)
- Chainguard docs: chainguard-ai-docs.md:24429-24514 (Self-Serve section)
