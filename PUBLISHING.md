# Publishing to VS Code Marketplace

Complete guide to publishing the Chainguard Dockerfile Converter extension.

---

## Prerequisites Checklist

### ✅ Already Complete
- [x] Extension code compiled and tested
- [x] GitHub repository: `https://github.com/sseebald/cg-vs-extension.git`
- [x] README.md with documentation
- [x] LICENSE file (Apache 2.0)
- [x] CHANGELOG.md
- [x] package.json metadata (repository, license, bugs, homepage)

### ⚠️ Still Needed

#### 1. **Extension Icon** (Recommended)
- Create a 128x128 PNG icon
- Place at root: `icon.png`
- Add to package.json: `"icon": "icon.png"`
- **Suggestion:** Use Chainguard logo or branded icon

#### 2. **Publisher Account** (Required)
- Need a registered publisher ID on VS Code Marketplace
- Current package.json has: `"publisher": "chainguard"`
- This must match your registered publisher name

#### 3. **Personal Access Token** (Required)
- Needed to publish via `vsce`
- Must have marketplace publishing permissions

---

## Step 1: Create Publisher Account

### Option A: Via Web UI (Easiest)

1. **Go to Visual Studio Marketplace:**
   - Visit: https://marketplace.visualstudio.com/manage
   - Sign in with Microsoft/GitHub/Azure account

2. **Create Publisher:**
   - Click "Create publisher"
   - Publisher ID: `chainguard` (or whatever you own)
   - Display name: `Chainguard`
   - Description: "Chainguard provides zero-CVE container images"

3. **Generate Personal Access Token (PAT):**
   - Go to: https://dev.azure.com (Azure DevOps)
   - User Settings → Personal Access Tokens
   - **Scopes:** Select "Marketplace > Manage"
   - **Expiration:** Custom (1 year recommended)
   - Copy the token (you'll need it for publishing)

### Option B: Via CLI

```bash
# Install vsce (Visual Studio Code Extension Manager)
npm install -g @vscode/vsce

# Login (interactive - will prompt for PAT)
vsce login chainguard
```

---

## Step 2: Add Extension Icon (Optional but Recommended)

**Create icon.png:**
- Size: 128x128 pixels
- Format: PNG with transparency
- Content: Chainguard logo or branded icon

**Add to package.json:**
```json
{
  "icon": "icon.png"
}
```

**Update .gitignore if needed:**
Make sure `icon.png` is NOT ignored in .gitignore.

---

## Step 3: Package the Extension (Test Locally)

**Install vsce:**
```bash
npm install -g @vscode/vsce
```

**Package extension:**
```bash
cd /Users/sseebald/code/vs_extension
vsce package
```

**Output:** Creates `chainguard-dockerfile-converter-0.1.0.vsix`

**Test locally:**
```bash
# Install in VS Code
code --install-extension chainguard-dockerfile-converter-0.1.0.vsix

# Test all features work
# - Open a Dockerfile
# - Check diagnostics appear
# - Test commands work
# - Verify hover tooltips
```

---

## Step 4: Validate Before Publishing

**Run validation checks:**
```bash
# Check for common issues
vsce ls

# Verify package contents
unzip -l chainguard-dockerfile-converter-0.1.0.vsix
```

**Manual checks:**
- [ ] README renders correctly (preview in GitHub)
- [ ] All commands work
- [ ] No console errors in Developer Tools
- [ ] Hover tooltips display properly
- [ ] CVE scanning works (if grype installed)
- [ ] Package verification works
- [ ] No sensitive data in package (check with `vsce ls`)

---

## Step 5: Publish to Marketplace

### First-time Setup

```bash
# Login with your publisher account
vsce login chainguard

# Enter your Personal Access Token when prompted
```

### Publish

```bash
# Publish extension (will auto-increment version if you don't specify)
vsce publish

# Or publish specific version
vsce publish 0.1.0

# Or publish with version bump
vsce publish patch  # 0.1.0 → 0.1.1
vsce publish minor  # 0.1.0 → 0.2.0
vsce publish major  # 0.1.0 → 1.0.0
```

**Success output:**
```
Publishing chainguard.chainguard-dockerfile-converter@0.1.0...
Successfully published chainguard.chainguard-dockerfile-converter@0.1.0!
Your extension will live at https://marketplace.visualstudio.com/items?itemName=chainguard.chainguard-dockerfile-converter
```

---

## Step 6: Verify Publication

1. **Check marketplace listing:**
   - Visit: https://marketplace.visualstudio.com/items?itemName=chainguard.chainguard-dockerfile-converter
   - Verify description, screenshots, README render correctly

2. **Install from marketplace:**
   ```bash
   code --install-extension chainguard.chainguard-dockerfile-converter
   ```

3. **Test end-to-end:**
   - Search for "Chainguard" in VS Code Extensions
   - Install from UI
   - Verify all features work

---

## Alternative: Private Distribution (Without Marketplace)

If you want to distribute internally before public release:

### Option 1: Direct VSIX Install
```bash
# Package extension
vsce package

# Share .vsix file with users
# Users install with:
code --install-extension chainguard-dockerfile-converter-0.1.0.vsix
```

### Option 2: GitHub Releases
```bash
# Create GitHub release
gh release create v0.1.0 chainguard-dockerfile-converter-0.1.0.vsix

# Users download from:
https://github.com/sseebald/cg-vs-extension/releases/latest
```

### Option 3: Internal Marketplace
If Chainguard has an Azure DevOps organization, you can publish to a private marketplace.

---

## Updating the Extension

When you make changes:

1. **Update version in package.json:**
   ```json
   "version": "0.2.0"
   ```

2. **Update CHANGELOG.md:**
   ```markdown
   ## [0.2.0] - 2024-02-15
   ### Added
   - New feature X
   ### Fixed
   - Bug Y
   ```

3. **Commit and tag:**
   ```bash
   git add .
   git commit -m "Release v0.2.0"
   git tag v0.2.0
   git push origin main --tags
   ```

4. **Publish update:**
   ```bash
   vsce publish
   ```

---

## Important Notes

### Publisher Ownership
- **Current publisher:** `chainguard`
- **Verify:** You need access to the `chainguard` publisher account
- **Alternative:** If you don't own `chainguard`, use a different publisher like:
  - `chainguard-team`
  - `chainguard-community`
  - Your personal publisher ID (then transfer later)

### Extension Name Conflicts
If `chainguard-dockerfile-converter` is taken, you'll need to choose a different name:
- `chainguard-docker-migrator`
- `dockerfile-to-chainguard`
- etc.

Check availability:
```bash
code --install-extension chainguard.chainguard-dockerfile-converter
# If it says "not found", the name is available
```

### Legal/Compliance
Since you work at Chainguard:
- **Verify:** Legal approval to publish under Chainguard brand
- **Trademark:** Ensure you have permission to use Chainguard name/logo
- **Open source:** Confirm Apache 2.0 license is acceptable
- **Dependencies:** Verify all npm packages are compatible licenses

---

## Troubleshooting

### Error: "Publisher 'chainguard' is not found"
**Solution:** Register the publisher first at https://marketplace.visualstudio.com/manage

### Error: "Extension name already exists"
**Solution:** Change the `name` field in package.json to something unique

### Error: "Personal Access Token expired"
**Solution:** Generate a new PAT and run `vsce login chainguard` again

### Warning: "This extension consists of X MB"
**Solution:** Check if you're including unnecessary files
```bash
# See what's being packaged
vsce ls

# Exclude large files in .vsixignore
```

### Extension not activating
**Solution:** Check `activationEvents` in package.json
- Current: `"onLanguage:dockerfile"` (should activate when Dockerfile opens)

---

## Post-Publication Checklist

After successful publication:

- [ ] Verify marketplace listing looks correct
- [ ] Install and test from marketplace
- [ ] Share with Chainguard team for feedback
- [ ] Announce internally (Slack, email)
- [ ] Consider external announcement (blog post, social media)
- [ ] Monitor issues/ratings on marketplace
- [ ] Set up CI/CD for automated publishing (optional)

---

## Business/Sales Considerations

### Marketing the Extension

**Internal:**
- Share with Sales Engineers team
- Add to SE enablement materials
- Include in customer POC process
- Demo in customer calls

**External:**
- Blog post: "Migrating to Chainguard Images Made Easy"
- Social media: LinkedIn, Twitter
- Community: Reddit r/docker, r/kubernetes
- Conference demos: KubeCon, DockerCon

### Metrics to Track
- Installs count (visible on marketplace)
- Active users (requires telemetry - currently not implemented)
- GitHub stars/issues
- Customer feedback

### Competitive Differentiation
**Unique selling points:**
- Only automated Chainguard migration tool
- Built-in CVE comparison
- Live package verification
- Security best practices enforcement
- No competitor has IDE-integrated Dockerfile migration

**Use in sales:**
- "We make migration so easy, we built it into your IDE"
- "Try it yourself in 2 minutes - install our VS Code extension"
- "See the CVE reduction live as you type"

---

## Next Steps

1. **Immediate:** Decide on publisher account ownership
2. **Required:** Create icon.png (or publish without for now)
3. **Test:** Package locally and verify with `vsce package`
4. **Publish:** If approved, run `vsce publish`
5. **Announce:** Share with team and customers

**Questions to resolve:**
- Do you have access to the `chainguard` publisher account?
- Does Chainguard legal approve marketplace publication?
- Do you have a Chainguard logo/icon you can use?
- Should this be published under personal account first, then transferred?
