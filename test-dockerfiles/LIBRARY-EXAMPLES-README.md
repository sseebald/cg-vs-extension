# Chainguard Libraries Detection Examples

This folder contains example Dockerfiles with dependency files to showcase the **Chainguard Libraries Detection** feature.

## Setup

1. **Enable Library Detection** in VS Code settings:
   ```json
   {
     "chainguard.enableLibraryDetection": true
   }
   ```

2. **Install chainctl** (optional - to see full features):
   ```bash
   brew install chainguard-dev/tap/chainctl
   chainctl auth login
   ```

## Examples Overview

### 1. Python Flask (`python-flask/`)
**Files:**
- `Dockerfile` - Flask web application
- `requirements.txt` - 15 Python packages including Flask, SQLAlchemy, Redis, Celery

**What to demo:**
1. Open `python-flask/Dockerfile`
2. Hover over line 8: `COPY requirements.txt /app/`
3. **Without chainctl**: Shows installation instructions
4. **With chainctl**: Shows authentication prompt or entitlements
5. **Authenticated**: Shows all 15 packages parsed from requirements.txt
6. **CVE Status**: Shows CVE remediation counts for first 3 packages

**Expected packages detected:**
- flask, requests, urllib3, sqlalchemy, psycopg2-binary, redis, celery, python-dotenv, gunicorn, cryptography, pyyaml, jinja2, click, werkzeug, itsdangerous

---

### 2. Node.js Express (`nodejs-express/`)
**Files:**
- `Dockerfile` - Express API server
- `package.json` - 13 production dependencies + 3 dev dependencies

**What to demo:**
1. Open `nodejs-express/Dockerfile`
2. Hover over line 8: `COPY package.json package-lock.json /app/`
3. Shows JavaScript ecosystem detection
4. Displays packages like express, cors, helmet, pg, redis, axios, winston

**Expected packages detected:**
- express, cors, helmet, dotenv, pg, redis, jsonwebtoken, bcrypt, axios, winston, express-validator, morgan, compression
- Dev: nodemon, eslint, jest

---

### 3. Java Spring Boot with Maven (`java-spring/`)
**Files:**
- `Dockerfile` - Spring Boot REST API
- `pom.xml` - Maven dependencies including Spring Boot starters

**What to demo:**
1. Open `java-spring/Dockerfile`
2. Hover over line 8: `COPY pom.xml /app/`
3. Shows Java/Maven ecosystem detection
4. Displays Spring Boot artifacts

**Expected artifacts detected:**
- spring-boot-starter-web
- spring-boot-starter-data-jpa
- spring-boot-starter-security
- spring-boot-starter-validation
- spring-boot-starter-actuator
- postgresql
- spring-boot-starter-data-redis
- jjwt-api
- commons-lang3
- logback-classic

---

### 4. Java Spring Boot with Gradle (`java-gradle/`)
**Files:**
- `Dockerfile` - Spring Boot with Gradle build
- `build.gradle` - Gradle dependencies
- `settings.gradle` - Project configuration

**What to demo:**
1. Open `java-gradle/Dockerfile`
2. Hover over line 8: `COPY build.gradle settings.gradle /app/`
3. Shows Java/Gradle ecosystem detection
4. Similar Spring Boot dependencies as Maven example

**Expected artifacts detected:**
- Same Spring Boot starters as Maven example
- Plus: guava, jjwt-impl, jjwt-jackson

---

## Demo Flow

### Scenario 1: New User (No chainctl)
1. Open any Dockerfile
2. Hover over COPY line with dependency file
3. **Shows**:
   - "⚠️ chainctl not installed"
   - Installation command: `brew install chainguard-dev/tap/chainctl`
   - Benefits of Chainguard Libraries
   - Link to documentation

### Scenario 2: chainctl Installed, Not Authenticated
1. Install chainctl
2. Hover over COPY line
3. **Shows**:
   - "🔐 Authentication required"
   - Command: `chainctl auth login`
   - Link to authentication docs

### Scenario 3: Fully Authenticated
1. Login with `chainctl auth login`
2. Hover over COPY line
3. **Shows**:
   - "✅ PYTHON/JAVASCRIPT/JAVA Libraries available"
   - List of detected packages (first 5)
   - CVE Remediation Status (first 3 packages)
   - Configuration next steps
   - Link to configuration guide

### Scenario 4: No Entitlement
1. Authenticated but no library entitlement
2. **Shows**:
   - "⚠️ No PYTHON entitlement"
   - Prompt to contact account owner
   - List of available ecosystems

---

## Code Actions

Click the lightbulb 💡 or blue diagnostic hint on COPY lines:
- **"📚 Configure Chainguard PYTHON Libraries"**
  - Opens dialog with "View Docs" or "Check Status"
- **View Docs**: Opens browser to ecosystem-specific documentation
- **Check Status**: Opens Output panel showing:
  - chainctl installation: ✅/❌
  - Authentication: ✅/❌
  - Entitlements: PYTHON, JAVASCRIPT, JAVA

---

## Testing Checklist

- [ ] Python example shows 15 packages from requirements.txt
- [ ] Node.js example shows 16 packages from package.json
- [ ] Java Maven example shows 10+ artifacts from pom.xml
- [ ] Java Gradle example shows 10+ artifacts from build.gradle
- [ ] Hover tooltips display correctly
- [ ] Authentication flow works (install → login → entitlements)
- [ ] CVE remediation counts appear for available packages
- [ ] Code actions trigger correctly
- [ ] "Check Status" output panel shows current state
- [ ] "View Docs" opens correct URL in browser

---

## Business Value Talking Points

When demoing, emphasize:

1. **Time Savings**:
   - Manual CVE research: 2-4 hours per package
   - With Chainguard Libraries: 5 seconds (instant)
   - **80% reduction in remediation time**

2. **Cost Impact**:
   - 10 developers × 4 hours/month saved = 40 hours
   - At $150/hour = **$6,000/month savings**

3. **Supply Chain Security**:
   - Built from source (eliminates binary malware risk)
   - Daily rebuilds with CVE fixes
   - VEX attestations for scanner integration

4. **Developer Experience**:
   - Discovery happens in IDE (no context switching)
   - Clear next steps for configuration
   - Immediate visibility into CVE remediation

5. **Competitive Differentiation**:
   - **vs Docker Hub**: Shows CVE-free alternatives
   - **vs Snyk**: Replacement packages, not just vulnerabilities
   - **vs Artifactory**: Proactive discovery in workflow

---

## Troubleshooting

**Hover not showing?**
- Check `chainguard.enableLibraryDetection` is `true`
- Reload VS Code window

**"Cannot find file" warning?**
- Dependency file must exist in workspace
- Check file path matches Dockerfile COPY command

**No packages detected?**
- Verify file format (valid requirements.txt, package.json, etc.)
- Check console for parser errors

**CVE data not showing?**
- VEX feed fetch may have failed (check console)
- Wait 1 hour for cache refresh

---

## Feature Status

- ✅ Phase 1: Basic dependency file detection
- ✅ Phase 2: chainctl CLI integration
- ✅ Phase 3: CVE remediation data from VEX feed
- ✅ Phase 4: Code actions and commands

**Configuration**: Disabled by default (experimental)
**Requirements**: None (chainctl optional for full features)
