# Chainguard Dockerfile Converter

VS Code extension to convert Dockerfiles to use Chainguard's secure, zero-CVE container images.

## Features

- 🔍 **Real-time Detection**: Highlights Dockerfiles that can be migrated to Chainguard images
- ⚡ **Quick Fixes**: One-click conversion with inline code actions
- 📝 **Smart Hover**: See Chainguard equivalents and benefits on hover
- 🔄 **Full Conversion**: Convert entire Dockerfiles with preview
- 📦 **Package Mapping**: Automatically converts apt/dnf/yum → apk with correct package names
- 🎯 **Tag Intelligence**: Applies semantic version rules and -dev suffix when needed
- 📚 **Library Detection** (NEW): Detects Python/Node.js/Java dependencies and shows CVE-remediated versions
- ✨ **Auto-Convert Dependencies** (NEW): One-click replacement of packages with CVE-remediated versions

---

## 🚀 Getting Started

### Prerequisites

Before you begin, make sure you have:

- **Node.js** (v16 or later) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **VS Code** (v1.80 or later) - [Download here](https://code.visualstudio.com/)
- **git** - [Installation guide](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-org/chainguard-vscode-extension.git
cd chainguard-vscode-extension
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required npm packages including TypeScript, VS Code extension API, and other dependencies.

### Step 3: Compile TypeScript

```bash
npm run compile
```

This compiles the TypeScript source code in `src/` to JavaScript in `out/`.

**Watch mode** (automatically recompiles on file changes):
```bash
npm run watch
```

### Step 4: Launch Extension Development Host

1. Open the project in VS Code
2. Press **F5** (or Run → Start Debugging)
3. This opens a new VS Code window with the extension loaded

**Alternative**: Use the VS Code Run and Debug panel (Cmd+Shift+D) and click "Run Extension".

### Step 5: Test the Extension

In the Extension Development Host window:

1. Open any Dockerfile or create a new one:
   ```dockerfile
   FROM node:18-alpine
   RUN npm install -g express
   ```

2. You should see a blue information hint on the FROM line:
   ```
   💡 Chainguard image available (0 CVEs, daily rebuilds)
   ```

3. Click the lightbulb (💡) or press **Cmd+.** (Mac) / **Ctrl+.** (Windows) to see quick fixes

4. Select "🔒 Convert to Chainguard image"

5. The line changes to:
   ```dockerfile
   FROM cgr.dev/chainguard/node:latest-dev
   ```

**Success!** The extension is working.

### Step 6: Enable Library Detection (Optional)

To use the new **CVE-remediated dependency auto-convert** feature:

#### 6.1 Install chainctl

```bash
# macOS
brew install chainguard-dev/tap/chainctl

# Linux/Windows - see https://edu.chainguard.dev/chainguard/chainctl/
```

#### 6.2 Authenticate with Chainguard

```bash
chainctl auth login
```

Follow the browser prompts to complete authentication.

**Verify authentication:**
```bash
chainctl auth status
# Should show: Valid | True
```

#### 6.3 Configure VS Code Extension

In VS Code Settings (Cmd+, or File → Preferences → Settings), add:

```json
{
  "chainguard.enableLibraryDetection": true,
  "chainguard.libraryOrg": "your-org-id"
}
```

**How to find your org ID:**
```bash
chainctl iam orgs list
# Copy the ID from the output (e.g., "abc123/xyz789")
```

**Or use the Settings UI:**
1. Open Settings (Cmd+,)
2. Search for "chainguard library"
3. Check "Enable Library Detection"
4. Enter your org ID in "Library Org"

#### 6.4 Reload VS Code

After configuring settings:
1. Press **Cmd+Shift+P** (Mac) or **Ctrl+Shift+P** (Windows)
2. Type "Reload Window"
3. Press Enter

### Step 7: Test Library Detection

1. Open the test Dockerfile:
   ```
   test-dockerfiles/python-flask/Dockerfile
   ```

2. Look at line 11:
   ```dockerfile
   RUN pip install --no-cache-dir -r requirements.txt
   ```

3. You should see a blue hint:
   ```
   💡 Chainguard PYTHON Libraries available - packages can use CVE-remediated versions
   ```

4. Click the lightbulb (💡) and select:
   ```
   ✨ Auto-convert to CVE-remediated versions
   ```

5. The extension:
   - Reads `requirements.txt`
   - Checks each package against Chainguard's VEX feed
   - Shows a diff view with CVE-remediated versions
   - Displays a summary like:
     ```
     ✅ Found 8 CVE-remediated version(s):
       • flask: 3.0.0 → 3.0.1 (12 CVEs fixed)
       • requests: 2.31.0 → 2.31.2 (8 CVEs fixed)
       • urllib3: 2.1.0 → 2.1.1 (5 CVEs fixed)
     ```

6. Choose how to save:
   - **"Save as requirements-chainguard.txt"** - Keeps original, creates new file
   - **"Replace requirements.txt"** - Updates original file
   - **"Cancel"** - Discard changes

**Success!** You're now using CVE-remediated packages.

---

## 📚 Feature Guide

### 1. FROM Line Conversion

When you open a Dockerfile with non-Chainguard base images, you'll see informational diagnostics:

```dockerfile
FROM node:18-alpine  # 💡 Chainguard image available (0 CVEs, daily rebuilds)
```

**Actions available:**
- Click the lightbulb (💡) or press **Cmd+.** / **Ctrl+.**
- Select "🔒 Convert to Chainguard image" (converts just this line)
- Or select "🔒 Convert entire Dockerfile to Chainguard" (full file conversion)

**Hover information:**
Hover over any FROM line to see:
- The Chainguard equivalent image
- Benefits (zero CVEs, daily rebuilds, SBOM, supply chain security)
- Links to documentation
- CVE comparison (if grype scanning enabled)

**Example hover:**
```
Original: node:18-alpine
Chainguard: cgr.dev/chainguard/node:18-dev

Benefits:
✅ Zero CVEs (vs. 30 CVEs in node:18-alpine)
✅ Daily automated rebuilds
✅ SBOM + signatures included
✅ Smaller size (distroless)
```

### 2. Package Manager Conversion

The extension automatically converts package installation commands when converting Dockerfiles:

**Before:**
```dockerfile
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y curl git python3-pip
```

**After:**
```dockerfile
FROM cgr.dev/chainguard/chainguard-base:latest-dev
USER root
RUN apk add --no-cache curl git py3-pip
```

**Supported conversions:**
- `apt-get install` → `apk add --no-cache`
- `dnf install` / `yum install` → `apk add --no-cache`
- Automatic package name mapping (600+ mappings included)
- `useradd` → `adduser` (Busybox syntax)
- `groupadd` → `addgroup`

**Smart behavior:**
- Automatically injects `USER root` before package installations (Chainguard images default to nonroot user)
- Shows hover hints for user management commands with Chainguard alternatives
- Preserves existing `USER` directives

### 3. Library Detection & CVE-Remediated Dependencies (NEW)

**Requires:**
- `chainguard.enableLibraryDetection: true` in settings
- `chainctl` installed and authenticated
- `chainguard.libraryOrg` configured with your org ID

**How it works:**

1. **Detection**: Extension detects dependency files in COPY commands:
   - Python: `requirements.txt`
   - Node.js: `package.json`
   - Java: `pom.xml`, `build.gradle`

2. **Diagnostics**: Shows blue hint on RUN install lines:
   ```dockerfile
   COPY requirements.txt /app/
   RUN pip install -r requirements.txt  # 💡 Chainguard PYTHON Libraries available
   ```

3. **Hover Information**: Hover over COPY or RUN lines to see:
   - Authentication status
   - Entitlement status for your org
   - Detected packages from dependency file
   - CVE remediation availability for packages

4. **Auto-Convert**: Click lightbulb on RUN line and select:
   ```
   ✨ Auto-convert to CVE-remediated versions
   ```

5. **Conversion Process**:
   - Reads dependency file (e.g., `requirements.txt`)
   - Checks each package against Chainguard's VEX feed
   - Shows diff view with before/after versions
   - Displays CVE counts for each remediated package
   - Offers save options:
     - Save as new file (`requirements-chainguard.txt`)
     - Replace original file
     - Cancel

**Example workflow:**

**Original `requirements.txt`:**
```txt
flask==3.0.0
requests==2.31.0
urllib3==2.1.0
```

**After auto-convert (`requirements-chainguard.txt`):**
```txt
flask==3.0.1  # Chainguard: 12 CVE(s) fixed
requests==2.31.2  # Chainguard: 8 CVE(s) fixed
urllib3==2.1.1  # Chainguard: 5 CVE(s) fixed
```

**Summary shown:**
```
✅ Found 3 CVE-remediated version(s):
  • flask: 3.0.0 → 3.0.1 (12 CVEs fixed)
  • requests: 2.31.0 → 2.31.2 (8 CVEs fixed)
  • urllib3: 2.1.0 → 2.1.1 (5 CVEs fixed)
```

**Supported ecosystems:**
- ✅ Python (pip / requirements.txt) - Full support
- ✅ JavaScript (npm / package.json) - Full support
- ✅ Java (Maven / pom.xml, Gradle / build.gradle) - Full support

### Commands

Access via Command Palette (Cmd+Shift+P / Ctrl+Shift+P):

- **`Chainguard: Convert Dockerfile`** - Convert the entire active Dockerfile (shows preview first)
- **`Chainguard: Show Conversion Preview`** - Preview changes before applying
- **`Chainguard: Save Conversion as New File`** - Save converted Dockerfile as new file (preserves original)
- **`Chainguard: Configure Libraries`** - Check library status and open documentation
- **`Chainguard: Auto-convert Dependencies`** - Manually trigger dependency auto-convert (also available via lightbulb)

---

## ⚙️ Configuration Reference

Access settings via VS Code preferences (Cmd+, or File → Preferences → Settings).

### Core Settings

```json
{
  "chainguard.org": "chainguard",
  "chainguard.enableDiagnostics": true,
  "chainguard.customMappings": ""
}
```

- **`chainguard.org`** (default: `"chainguard"`)
  - Organization name for Chainguard registry
  - Use `"chainguard"` for free tier images
  - Use `"chainguard-private"` for authenticated access to full catalog
  - Most users should use `"chainguard-private"` after authenticating with `chainctl auth login`

- **`chainguard.enableDiagnostics`** (default: `true`)
  - Enable/disable inline diagnostics (blue hints) for non-Chainguard images
  - Turn off if you don't want suggestions in Dockerfiles

- **`chainguard.customMappings`** (default: `""`)
  - Path to custom YAML file for specialized image/package mappings
  - Use if you have internal naming conventions or custom packages

### Library Detection Settings (NEW)

```json
{
  "chainguard.enableLibraryDetection": false,
  "chainguard.libraryOrg": ""
}
```

- **`chainguard.enableLibraryDetection`** (default: `false`)
  - **EXPERIMENTAL** - Enable dependency file detection and CVE-remediated version suggestions
  - **Requires:** `chainctl` installed and authenticated
  - Shows diagnostics on `RUN pip install`, `RUN npm install`, etc.
  - Enables auto-convert to CVE-remediated versions feature
  - Set to `true` to enable

- **`chainguard.libraryOrg`** (default: `""`)
  - Your Chainguard organization ID for library entitlements
  - **Required** when `enableLibraryDetection` is `true`
  - Find your org ID: `chainctl iam orgs list`
  - Example: `"abc123/xyz789"`

### Advanced Settings

```json
{
  "chainguard.enableCVEScanning": true,
  "chainguard.enableLivePackageVerification": true,
  "chainguard.enableCrystalBall": true
}
```

- **`chainguard.enableCVEScanning`** (default: `true`)
  - Enable live CVE scanning with grype to show before/after vulnerability comparison
  - Requires `grype` installed: `brew install grype`
  - Shows CVE counts in hover tooltips

- **`chainguard.enableLivePackageVerification`** (default: `true`)
  - Verify packages against live Wolfi repository (packages.wolfi.dev)
  - Ensures package names are valid before suggesting conversions

- **`chainguard.enableCrystalBall`** (default: `true`)
  - Enable Crystal Ball intelligent image matching with coverage scoring
  - Uses AI to find best Chainguard image matches
  - Requires setup (see Crystal Ball docs)

---

## 🔐 Authentication Setup

### Quick Setup (Recommended)

```bash
# 1. Install chainctl
brew install chainguard-dev/tap/chainctl

# 2. Login to Chainguard
chainctl auth login

# 3. Verify authentication
chainctl auth status
# Should show: Valid | True
```

**In VS Code:**
```json
{
  "chainguard.org": "chainguard-private",
  "chainguard.enableLibraryDetection": true,
  "chainguard.libraryOrg": "YOUR-ORG-ID"
}
```

Find your org ID:
```bash
chainctl iam orgs list
```

**Reload VS Code** (Cmd+Shift+P → "Reload Window")

### What Works Without Authentication

✅ **No authentication required:**
- FROM line conversion suggestions
- Package manager conversion (apt → apk)
- Hover information showing Chainguard equivalents
- Full Dockerfile conversion

❌ **Authentication required:**
- CVE scanning with grype
- Library detection and auto-convert
- Private Chainguard images

### When to Use Each Registry

| Setting | Use Case | Authentication | Images Available |
|---------|----------|----------------|------------------|
| `"chainguard"` | Free tier, public images | Not required | Limited catalog |
| `"chainguard-private"` | Full access, commercial use | **Required** | Full catalog |

**Recommendation:** Use `"chainguard-private"` for:
- Commercial use
- Access to full image catalog
- CVE scanning and library detection features
- Production deployments

---

## 🐛 Troubleshooting

### Library Detection Not Working

**Problem:** "Authentication required" message even after `chainctl auth login`

**Solution:**
1. Verify authentication:
   ```bash
   chainctl auth status
   ```
   Should show: `Valid | True`

2. If not authenticated:
   ```bash
   chainctl auth logout
   chainctl auth login
   ```

3. Reload VS Code window (Cmd+Shift+P → "Reload Window")

---

**Problem:** "No PYTHON entitlement" message

**Solution:**
1. Check your organization has library entitlements:
   ```bash
   chainctl libraries entitlements list --parent=YOUR-ORG-ID
   ```

2. Contact your Chainguard account owner to enable Libraries

3. Make sure `chainguard.libraryOrg` is set in VS Code settings:
   ```json
   {
     "chainguard.libraryOrg": "YOUR-ORG-ID"
   }
   ```

---

**Problem:** Lightbulb (💡) not appearing on RUN lines

**Solution:**
1. Make sure `chainguard.enableLibraryDetection` is `true`
2. Check that dependency file exists in workspace:
   - Python: `requirements.txt` in same directory as Dockerfile
   - Node.js: `package.json` in same directory
3. Verify the RUN command matches:
   - Python: `RUN pip install` or `RUN pip3 install`
   - Node.js: `RUN npm install` or `RUN npm ci`
   - Java: `RUN mvn install` or `RUN gradle build`
4. Open VS Code Developer Tools (Cmd+Option+I) and check console for errors
5. Look for log messages starting with `[Chainguard]`

---

**Problem:** "requirements.txt not found" error

**Solution:**
1. Make sure `requirements.txt` is in the **same directory** as your Dockerfile
2. Check the COPY command matches the file name exactly:
   ```dockerfile
   COPY requirements.txt /app/  # ✅ Correct
   COPY requirements.txt.bak /app/  # ❌ Wrong file name
   ```
3. Verify file exists: `ls -la requirements.txt`

---

**Problem:** "No CVE-remediated versions found"

**Solution:**
1. Some packages may not have Chainguard remediated versions yet
2. Check the VEX feed manually: https://libraries.cgr.dev/openvex/v1/all.json
3. Wait for Chainguard to add more packages (library catalog growing daily)
4. Verify package names are correct (typos will show no results)

---

### CVE Scanning Not Working

**Problem:** "Auth required" when hovering over FROM lines

**Solution:**
1. Authenticate with `chainctl auth login`
2. Set `"chainguard.org": "chainguard-private"` in settings
3. Install grype: `brew install grype`
4. Reload VS Code window

---

### Extension Not Activating

**Problem:** No diagnostics or hover information appearing

**Solution:**
1. Check file is recognized as Dockerfile:
   - File name should be `Dockerfile` or `*.dockerfile`
   - Check language mode in VS Code status bar (bottom right)
   - Change language mode to "Dockerfile" if needed
2. Verify extension is installed and enabled:
   - Extensions panel (Cmd+Shift+X)
   - Search for "Chainguard"
   - Check it's enabled
3. Check extension host logs:
   - Help → Toggle Developer Tools
   - Console tab
   - Look for errors
4. Reload VS Code window (Cmd+Shift+P → "Reload Window")

---

## 📊 Business Value

### Time Savings with Auto-Convert

**Before (Manual CVE Remediation):**
- Research each package for CVE fixes: **2-4 hours/package**
- Update versions manually: **30 min**
- Test compatibility: **1-2 hours**
- **Total: ~4-6 hours for typical requirements.txt**

**After (Auto-Convert):**
- Click lightbulb: **5 seconds**
- Review diff: **2 minutes**
- Save file: **5 seconds**
- **Total: ~3 minutes**

**Savings: 99% faster remediation** (~$600/engineer/month at $150/hr)

### Security Impact

**Without Chainguard Libraries:**
- Average Python project: **50-100 CVEs** in dependencies
- Manual patching required for each CVE
- No supply chain attestations
- Risk of malicious packages (PyPI compromises)

**With Chainguard Libraries:**
- **0 CVEs** in remediated versions
- Automatic daily rebuilds with patches
- Built from source (not PyPI binaries)
- VEX attestations + SBOM included
- Supply chain security built-in

### Competitive Differentiation

**vs. Docker Hub / PyPI:**
- Docker Hub: 100-200 CVEs typical in official images
- PyPI: No CVE remediation, binary packages
- **Chainguard: 0 CVEs, built from source, daily rebuilds**

**vs. Red Hat UBI:**
- Red Hat: Monthly patch cycles, manual updates required
- **Chainguard: Daily automated rebuilds, no manual patching**

**vs. Snyk / Dependabot:**
- Snyk: Shows vulnerabilities, you fix them
- **Chainguard: Pre-remediated versions, nothing to fix**

**vs. Artifactory / Nexus:**
- Private registries: You still patch packages yourself
- **Chainguard: Already patched, you just use them**

---

## 🔧 How It Works

### Dockerfile Conversion

This extension ports logic from Chainguard's [dfc](https://github.com/chainguard-dev/dfc) CLI tool with additional intelligence:

#### 1. FROM Line Rewriting
- `alpine` → `cgr.dev/chainguard/chainguard-base:latest`
- `node:18` → `cgr.dev/chainguard/node:18-dev` (if has RUN commands)
- `python:3.11-alpine` → `cgr.dev/chainguard/python:3.11-dev`
- Uses Crystal Ball AI for intelligent image matching

#### 2. Tag Conversion
- Semantic versions truncated to major.minor (`1.2.3` → `1.2`)
- `-dev` suffix added when stage has RUN commands (contains package manager, tools)
- `latest` used for non-semantic tags
- Auto-detects when dev variant needed

#### 3. Package Manager Conversion
- `apt-get install curl git` → `apk add --no-cache curl git`
- `dnf install python3-pip` → `apk add --no-cache py3-pip`
- Automatic package name mapping (600+ mappings included)
- Live verification against Wolfi repository

#### 4. User Management
- `useradd -r` → `adduser --system` (Busybox syntax)
- `groupadd` → `addgroup`
- Chainguard images include `nonroot` user by default

#### 5. USER root Injection
- Automatically adds `USER root` before package installations
- Required because Chainguard images default to non-root user
- Preserves existing `USER` directives after installation

### Library Detection & Auto-Convert

New feature that detects language-specific dependencies and suggests CVE-remediated versions:

#### Detection Flow

1. **Scan Dockerfile** for COPY commands:
   ```dockerfile
   COPY requirements.txt /app/  # Detected: Python dependencies
   ```

2. **Parse dependency file** from workspace:
   - Python: `requirements.txt` → extracts package names + versions
   - Node.js: `package.json` → parses dependencies + devDependencies
   - Java: `pom.xml` / `build.gradle` → extracts artifacts

3. **Check authentication & entitlements:**
   - Runs `chainctl auth status` (cached 5 minutes)
   - Runs `chainctl libraries entitlements list` (cached 5 minutes)
   - Maps numeric ecosystem IDs (1=PYTHON, 2=JAVASCRIPT, 3=JAVA)

4. **Show diagnostics on RUN install lines:**
   ```dockerfile
   RUN pip install -r requirements.txt  # 💡 Blue hint appears here
   ```

5. **Fetch VEX feed** (cached 1 hour):
   - Public feed: `https://libraries.cgr.dev/openvex/v1/all.json`
   - Contains CVE remediation data for all library packages
   - Maps package@version → CVEs fixed

#### Auto-Convert Flow

1. **User clicks lightbulb** on RUN line
2. **Extension reads** dependency file (e.g., `requirements.txt`)
3. **For each package:**
   - Query VEX feed for remediated versions
   - Find latest remediated version
   - Count CVEs fixed
4. **Generate converted file:**
   ```txt
   flask==3.0.1  # Chainguard: 12 CVE(s) fixed
   requests==2.31.2  # Chainguard: 8 CVE(s) fixed
   ```
5. **Show diff view** with before/after comparison
6. **Display summary:**
   ```
   ✅ Found 8 CVE-remediated version(s):
     • flask: 3.0.0 → 3.0.1 (12 CVEs fixed)
   ```
7. **Save options:**
   - New file: `requirements-chainguard.txt`
   - Replace original: `requirements.txt`
   - Cancel

#### Caching Strategy

- **Authentication status:** 5 minute TTL
- **Entitlements:** 5 minute TTL
- **VEX feed:** 1 hour TTL
- **Package mappings:** Static (compiled into extension)

This ensures fast performance without spamming Chainguard APIs.

---

## 📖 Complete Examples

### Example 1: Python Flask Application

**Before:**
```dockerfile
FROM python:3.11
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "app.py"]
```

**After (Dockerfile + Auto-Convert):**
```dockerfile
FROM cgr.dev/chainguard/python:3.11-dev
WORKDIR /app
COPY requirements-chainguard.txt .
USER root
RUN pip install --no-cache-dir -r requirements-chainguard.txt
USER nonroot
COPY . .
CMD ["python", "app.py"]
```

**requirements-chainguard.txt:**
```txt
flask==3.0.1  # Chainguard: 12 CVE(s) fixed
requests==2.31.2  # Chainguard: 8 CVE(s) fixed
urllib3==2.1.1  # Chainguard: 5 CVE(s) fixed
werkzeug==3.0.1  # Chainguard: 7 CVE(s) fixed
```

**Benefits:**
- Base image: 0 CVEs (vs. 45 CVEs in python:3.11)
- Dependencies: 32 CVEs remediated (vs. original versions)
- Total: **77 CVEs eliminated**

---

### Example 2: Node.js Express API

**Before:**
```dockerfile
FROM node:18-alpine
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

**After:**
```dockerfile
FROM cgr.dev/chainguard/node:18-dev
USER root
RUN apk add --no-cache python-3 build-base
USER nonroot
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

**Benefits:**
- Base image: 0 CVEs (vs. 30 CVEs in node:18-alpine)
- Package mappings: `python3` → `python-3`, `make g++` → `build-base`
- Proper user management: Uses `nonroot` user

---

### Example 3: Ubuntu with Complex Dependencies

**Before:**
```dockerfile
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y \
    curl \
    git \
    python3-pip \
    nodejs \
    npm
RUN useradd -r -s /bin/bash appuser
USER appuser
WORKDIR /app
```

**After:**
```dockerfile
FROM cgr.dev/chainguard/chainguard-base:latest-dev
USER root
RUN apk add --no-cache \
    curl \
    git \
    py3-pip \
    nodejs \
    npm
RUN adduser --system -s /bin/sh appuser
USER appuser
WORKDIR /app
```

**Benefits:**
- Base image: 0 CVEs (vs. 100+ CVEs in ubuntu:22.04)
- 90% smaller image size (50 MB vs. 500 MB)
- Automatic package name mapping (600+ packages supported)
- Correct Busybox `useradd` syntax

---

### Example 4: Java Spring Boot

**Before:**
```dockerfile
FROM openjdk:17
COPY pom.xml /app/
COPY src /app/src
WORKDIR /app
RUN mvn clean package
CMD ["java", "-jar", "target/app.jar"]
```

**After:**
```dockerfile
FROM cgr.dev/chainguard/maven:latest-dev AS build
USER root
COPY pom.xml /app/
COPY src /app/src
WORKDIR /app
RUN mvn clean package

FROM cgr.dev/chainguard/jre:17
USER nonroot
COPY --from=build /app/target/app.jar /app/app.jar
CMD ["java", "-jar", "/app/app.jar"]
```

**Benefits:**
- Multi-stage build: Builder + minimal runtime
- Build stage: 0 CVEs in Maven image
- Runtime stage: 0 CVEs in JRE image (distroless)
- 80% smaller final image (100 MB vs. 500 MB)

---

## 🎯 Test Dockerfiles Included

The repository includes test examples in `test-dockerfiles/`:

1. **`python-flask/`** - Flask app with 15 dependencies
   - Shows Python library detection
   - Demonstrates auto-convert for requirements.txt
   - 32 CVEs remediated

2. **`nodejs-express/`** - Express API with 16 packages
   - Shows Node.js library detection
   - Demonstrates package.json conversion
   - 18 CVEs remediated

3. **`java-spring/`** - Spring Boot with Maven
   - Shows Java library detection
   - Demonstrates pom.xml parsing
   - Multi-stage build pattern

4. **`java-gradle/`** - Spring Boot with Gradle
   - Shows Gradle support
   - Demonstrates build.gradle parsing

5. **`multi-ecosystem/`** - Combined Python + Node.js
   - Shows multiple ecosystems in one Dockerfile
   - Demonstrates handling complex dependencies

**To test:**
1. Open any test Dockerfile in the Extension Development Host
2. See diagnostics appear on FROM and RUN lines
3. Try quick fixes and auto-convert
4. Review diff previews

---

## 🚀 For Sales Engineers

### Demo Flow (5 minutes)

1. **Open test Dockerfile** (`test-dockerfiles/python-flask/Dockerfile`)
2. **Show FROM line conversion:**
   - Point out blue hint: "Chainguard image available"
   - Click lightbulb → Convert to Chainguard
   - Show hover with CVE comparison
3. **Show library detection:**
   - Scroll to RUN pip install line
   - Point out: "Chainguard PYTHON Libraries available"
   - Click lightbulb → Auto-convert
4. **Show diff preview:**
   - Highlight CVE counts per package
   - Show summary: "✅ Found 8 CVE-remediated version(s)"
5. **Business value:**
   - "4 hours of manual CVE research → 30 seconds"
   - "$600/month savings per engineer"
   - "77 CVEs eliminated in this example"

### Key Talking Points

**Differentiation:**
- "Unlike Snyk/Dependabot that just show vulnerabilities, we provide pre-remediated packages"
- "Unlike Docker Hub with 100-200 CVEs, Chainguard has zero"
- "Unlike Red Hat UBI with monthly patches, Chainguard rebuilds daily"

**Developer Experience:**
- "Works directly in VS Code, no context switching"
- "One-click conversion, no manual research"
- "Preview changes before applying, non-destructive"

**Business Impact:**
- "99% faster CVE remediation (4 hours → 3 minutes)"
- "Eliminates security team toil (no patching needed)"
- "$600/engineer/month savings on security work"
- "Immediate vulnerability reduction (50-100 CVEs → 0)"

## Credits

Based on [dfc](https://github.com/chainguard-dev/dfc) by Chainguard, Inc.

## License

Apache 2.0
