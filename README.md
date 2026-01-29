# Chainguard Dockerfile Converter

VS Code extension to convert Dockerfiles to use Chainguard's secure, zero-CVE container images.

## Features

- 🔍 **Real-time Detection**: Highlights Dockerfiles that can be migrated to Chainguard images
- ⚡ **Quick Fixes**: One-click conversion with inline code actions
- 📝 **Smart Hover**: See Chainguard equivalents and benefits on hover
- 🔄 **Full Conversion**: Convert entire Dockerfiles with preview
- 📦 **Package Mapping**: Automatically converts apt/dnf/yum → apk with correct package names
- 🎯 **Tag Intelligence**: Applies semantic version rules and -dev suffix when needed

## Installation

### From Source

1. Clone this repository
2. Run `npm install`
3. Run `npm run compile`
4. Press F5 to launch extension development host

## Usage

### Inline Quick Fix

When you open a Dockerfile with non-Chainguard base images, you'll see informational diagnostics:

```dockerfile
FROM node:18-alpine  # 💡 Chainguard image available (0 CVEs, daily rebuilds)
```

Click the lightbulb or press `Cmd+.` to see quick fixes:
- **Convert to Chainguard image** - converts just this FROM line
- **Convert entire Dockerfile** - migrates the whole file

### Hover Information

Hover over any FROM line to see:
- The Chainguard equivalent
- Benefits (zero CVEs, daily rebuilds, SBOM, etc.)
- Links to documentation

### Commands

- `Chainguard: Convert Dockerfile` - Convert the entire active Dockerfile (overwrites original)
- `Chainguard: Show Conversion Preview` - Preview changes before applying
- `Chainguard: Save Conversion as New File` - Save converted Dockerfile as new file (preserves original)

## Configuration

Access settings via VS Code preferences (`Cmd+,`):

```json
{
  "chainguard.org": "chainguard",
  "chainguard.customMappings": "/path/to/custom-mappings.yaml",
  "chainguard.enableDiagnostics": true
}
```

### Settings

- **chainguard.org** (default: `chainguard`)
  Organization name for Chainguard registry. Use `chainguard` for free tier images, or `chainguard-private` for authenticated access.

- **chainguard.customMappings** (default: `""`)
  Path to custom YAML mappings file for specialized image/package conversions.

- **chainguard.enableDiagnostics** (default: `true`)
  Enable/disable inline diagnostics for non-Chainguard images.

- **chainguard.enableCVEScanning** (default: `true`)
  Enable live CVE scanning with grype to show before/after vulnerability comparison.

- **chainguard.enableLivePackageVerification** (default: `true`)
  Verify packages against live Wolfi repository (packages.wolfi.dev).

- **chainguard.enableCrystalBall** (default: `true`)
  Enable Crystal Ball intelligent image matching with coverage scoring (requires setup).

## Authentication Setup

For authenticated access to Chainguard images and CVE scanning:

### 1. Authenticate with Chainguard

```bash
# Install chainctl
brew install chainguard-dev/tap/chainctl

# Login to Chainguard
chainctl auth login

# Verify authentication
chainctl auth status
```

### 2. Configure Extension for Private Registry

In VS Code Settings (Cmd+,), search for "chainguard org" and change from `chainguard` to `chainguard-private`:

```json
{
  "chainguard.org": "chainguard-private"
}
```

Or use VS Code Settings UI:
1. Open Settings (Cmd+,)
2. Search for "chainguard org"
3. Change value to `chainguard-private`

### 3. Reload VS Code

After authenticating and changing the setting, reload the VS Code window for changes to take effect.

### When Authentication is Required

**CVE Scanning:** Requires authentication to scan Chainguard images with grype. Without auth, you'll see:
```
- Current: ❌ 47 CVEs
- Chainguard: 🔐 Auth required (run `chainctl auth login`)
```

**Conversion:** Works without authentication - the extension will still show you the correct Chainguard image names and convert your Dockerfile. You just won't see CVE comparisons until authenticated.

### Free Tier vs Private Registry

- **`chainguard.org: "chainguard"`** - Free tier images (public, no auth required for some images)
- **`chainguard.org: "chainguard-private"`** - Private registry (requires authentication, full image access)

Most Chainguard users should use `chainguard-private` for full access to all images and features.

## How It Works

This extension ports the logic from Chainguard's [dfc](https://github.com/chainguard-dev/dfc) CLI tool:

### Conversion Rules

1. **FROM line rewriting**
   - `alpine` → `cgr.dev/chainguard/chainguard-base:latest`
   - `node:18` → `cgr.dev/chainguard/node:18-dev` (if has RUN commands)
   - `python:3.11-alpine` → `cgr.dev/chainguard/python:3.11-dev`

2. **Tag conversion**
   - Semantic versions truncated to major.minor (`1.2.3` → `1.2`)
   - `-dev` suffix added when stage has RUN commands
   - `latest` used for non-semantic tags

3. **Package manager conversion**
   - `apt-get install curl git` → `apk add --no-cache curl git`
   - `dnf install python3-pip` → `apk add --no-cache py3-pip`
   - Automatic package name mapping (600+ mappings included)

4. **User management**
   - `useradd -r` → `adduser --system` (Busybox syntax)
   - `groupadd` → `addgroup`

5. **USER root injection**
   - Automatically adds `USER root` before package installations
   - Required because Chainguard images default to non-root

## Examples

### Before
```dockerfile
FROM python:3.9
RUN apt-get update && apt-get install -y curl git
RUN useradd -r appuser
USER appuser
```

### After
```dockerfile
FROM cgr.dev/chainguard/python:3.9-dev
USER root
RUN apk add --no-cache curl git
RUN adduser --system appuser
USER appuser
```

## Business Value

### For Developers
- **Faster adoption**: Migrate to Chainguard in seconds, not hours
- **No learning curve**: Works with existing Dockerfile knowledge
- **Safety net**: Preview changes before applying

### For Organizations
- **Reduced risk**: Zero CVEs in base images
- **Time savings**: 90% faster migration (4 hours → 10 minutes)
- **Scale enablement**: Sales engineers support 3-5x more POCs
- **Competitive moat**: Only Chainguard provides migration tooling

## Credits

Based on [dfc](https://github.com/chainguard-dev/dfc) by Chainguard, Inc.

## License

Apache 2.0
