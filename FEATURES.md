# Advanced Features

## 1. Crystal Ball Intelligent Image Matching

**What it does:** Uses Chainguard's Crystal Ball service to provide intelligent image recommendations with coverage scoring and package-level matching.

**How it works:**
- Spawns crystal-ball HTTP server as background process on extension activation
- Analyzes source Docker images to identify packages and distribution
- Matches against Chainguard's image database (8,000+ packages)
- Ranks recommendations by coverage, probability score, and package weights
- Uses CPE/PURL identifiers for precise package equivalence
- Detects runtime modules (Go, Python, Node.js, etc.)

**Benefits:**
- ✅ **Intelligent matching** - not just name-based, but package-level analysis
- ✅ **Coverage scoring** - see exactly how well each image matches (e.g., "94.2% coverage")
- ✅ **Package weights** - main packages weighted ~1000x higher than dependencies
- ✅ **Multiple recommendations** - ranked list of alternative images
- ✅ **Runtime awareness** - detects Go modules, Python packages, etc.
- ✅ **Graceful fallback** - uses static mappings if unavailable

**Requirements:**
- Crystal Ball binary (included: `crystal-ball/match`)
- Crystal Ball database (SQLite: `crystal-ball/crystal-ball.db`)
- If missing, extension falls back to static mappings

**Usage:**
```json
{
  "chainguard.enableCrystalBall": true  // Default
}
```

**Performance:**
- Server startup: ~2-5 seconds (background, non-blocking)
- First match: ~100-500ms (database query)
- Health check: <10ms
- Memory: ~20-30MB for server process

**Example hover output:**
```
### 🔮 Crystal Ball Recommendation

**Match Score:** 94.2/100

- Coverage: 94.2% (32/34 packages)
- Extra packages: 12

**Alternative matches:** 3 other image(s) available
```

**Sources:**
- crystal-ball/cmd/match/main.go:107-126 (HTTP server)
- crystal-ball/pkg/match/server/server.go (API implementation)
- crystal-ball/README.md (architecture and algorithms)

---

## 2. Live Package Verification

**What it does:** Verifies packages against the live Wolfi repository (packages.wolfi.dev)

**How it works:**
- Fetches APKINDEX.tar.gz from packages.wolfi.dev
- Parses ~8,000+ available packages
- Caches results for 1 hour
- Falls back to static mappings if network fails

**Benefits:**
- ✅ Verify packages exist before suggesting them
- ✅ Find alternatives if package doesn't exist
- ✅ Always up-to-date with latest Wolfi packages

**Usage:**
```json
{
  "chainguard.enableLivePackageVerification": true  // Default
}
```

**Performance:**
- First fetch: ~500ms
- Cached: <1ms
- Offline: Falls back to static mappings (600+ packages)

---

## 2. Live CVE Scanning with Grype

**What it does:** Scans Docker images for CVEs and shows before/after comparison

**How it works:**
- Uses `grype` CLI tool (must be installed)
- Scans images in background
- Caches results for 24 hours
- Shows CVE counts by severity (Critical/High/Medium/Low)

**Installation:**
```bash
# macOS
brew install grype

# Or download from:
# https://github.com/anchore/grype
```

**Features:**
### Real-time CVE Comparison

When you hover over a FROM line:

```
### CVE Comparison

✅ Reduces 47 CVEs (100% reduction: 47 → 0)

- Current: ❌ 47 CVEs (🔴 3 critical, 🟠 12 high, 🟡 32 medium)
- Chainguard: ✅ 0 CVEs
```

### Background Scanning

- Scans happen in background (non-blocking)
- Shows "🔍 Scanning..." while in progress
- Updates hover tooltip when complete
- Results cached for 24 hours

**Configuration:**
```json
{
  "chainguard.enableCVEScanning": true  // Default
}
```

**Performance Impact:**
- **First scan:** 10-60 seconds (pulls image, scans)
- **Cached:** <1ms
- **Parallel scans:** Max 3 concurrent
- **Cache:** 24 hour TTL
- **Memory:** ~5MB per cached scan

**Graceful Degradation:**
- If grype not installed: Shows "grype not installed" message
- If scan fails: Shows error, continues to work
- Offline mode: Works without scanning

---

## Demo Use Cases

### Sales Demo: Show CVE Reduction in Real-Time

```dockerfile
FROM node:18-alpine
# Hover shows: "❌ 47 CVEs → ✅ 0 CVEs (100% reduction)"
```

**What customer sees:**
1. Hover over `FROM node:18-alpine`
2. See "🔍 Scanning..." (5-10 seconds)
3. See actual CVE count: "❌ 47 CVEs"
4. See Chainguard alternative: "✅ 0 CVEs"
5. **Instant credibility:** Real numbers, not marketing claims

### POC: Track CVE Reduction Across Migration

Before converting:
```dockerfile
FROM python:3.9          # ❌ 62 CVEs
FROM node:18-alpine      # ❌ 47 CVEs
FROM golang:1.19-alpine  # ❌ 23 CVEs
Total: 132 CVEs
```

After converting:
```dockerfile
FROM cgr.dev/chainguard/python:3.9-dev   # ✅ 0 CVEs
FROM cgr.dev/chainguard/node:18-dev      # ✅ 0 CVEs
FROM cgr.dev/chainguard/go:1.19-dev      # ✅ 0 CVEs
Total: 0 CVEs (100% reduction)
```

---

## Performance & Overhead

### Live Package Verification

| Operation | Time | Network | Overhead |
|-----------|------|---------|----------|
| First fetch | ~500ms | ~40KB | Low |
| Cached | <1ms | 0 | None |
| Offline | 0ms | 0 | None (fallback) |

### CVE Scanning

| Operation | Time | Network | Overhead |
|-----------|------|---------|----------|
| First scan | 10-60s | ~100MB (image pull) | High (one-time) |
| Cached | <1ms | 0 | None |
| Parallel (3 images) | 15-70s | ~300MB | Medium |

**Recommendation:** Enable both by default. They provide huge value with minimal overhead after initial fetch/scan.

---

## Configuration Options

### Full Settings Example

```json
{
  // Basic settings
  "chainguard.org": "chainguard",
  "chainguard.customMappings": "",
  "chainguard.enableDiagnostics": true,

  // Advanced features
  "chainguard.enableCrystalBall": true,
  "chainguard.enableLivePackageVerification": true,
  "chainguard.enableCVEScanning": true
}
```

### Disable for Offline Use

```json
{
  "chainguard.enableCrystalBall": false,
  "chainguard.enableLivePackageVerification": false,
  "chainguard.enableCVEScanning": false
}
```

Extension still works perfectly - just uses static mappings (600+ images, 8000+ packages).

---

## Troubleshooting

### Crystal Ball Not Working

1. **Check if binary and database exist:**
   ```bash
   ls -lh crystal-ball/match
   ls -lh crystal-ball/crystal-ball.db
   ```

2. **Build crystal-ball binary (if missing):**
   ```bash
   cd crystal-ball
   go build -o match ./cmd/match
   ```

3. **Obtain crystal-ball database:**
   - Database contains Chainguard package/image mappings
   - Contact Chainguard team for database access
   - Or build from scratch using ingestion tools (see crystal-ball/README.md)

4. **Check extension logs:**
   - View → Output → Select "Extension Host"
   - Look for `[Chainguard] Crystal Ball` messages
   - Verify server startup: "Crystal Ball service started successfully"

5. **If unavailable:**
   - Extension automatically falls back to static mappings
   - Disable feature to suppress startup attempts:
     ```json
     {
       "chainguard.enableCrystalBall": false
     }
     ```

### CVE Scanning Not Working

1. **Check if grype is installed:**
   ```bash
   grype version
   ```

2. **Install grype:**
   ```bash
   brew install grype
   # or
   curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin
   ```

3. **Check extension logs:**
   - View → Output → Select "Extension Host"
   - Look for `[Chainguard]` messages

### Package Verification Not Working

1. **Check network connection**
2. **Check extension logs for errors**
3. **Verify packages.wolfi.dev is accessible:**
   ```bash
   curl -I https://packages.wolfi.dev/os/aarch64/APKINDEX.tar.gz
   ```

4. **Disable and re-enable feature:**
   ```json
   {
     "chainguard.enableLivePackageVerification": false
   }
   ```
   Save, then set back to `true`

---

## Business Value

### Crystal Ball Intelligent Matching

**Technical:**
- **Precision:** Package-level matching vs. name-based guessing
- **Coverage transparency:** "94.2% coverage" shows exactly what's included
- **Multiple options:** Ranked alternatives if best match isn't perfect
- **Runtime awareness:** Detects Go modules, Python packages automatically
- **Weight-based scoring:** Main packages weighted 1000x higher than deps

**Sales:**
- **"The smartest migration tool in the industry"**
  - Competitors: simple name mapping (node → cgr.dev/chainguard/node)
  - Chainguard: package-level analysis with scoring

- **Instant credibility with data:**
  - "This image matches 94.2% of your packages"
  - "32 of 34 packages covered, 12 additional utilities included"
  - Numbers create trust, not just claims

- **Differentiation from Docker Scout / Snyk:**
  - Docker Scout: finds vulnerabilities, doesn't solve them
  - Snyk: suggests patches, doesn't provide patched images
  - Chainguard: "Here's your exact replacement, 94% match, zero CVEs"

- **ROI Story:**
  - Traditional migration: "Hope the name mapping is right, test everything"
  - Crystal Ball: "Here's what's included, what's missing, confidence score"
  - Reduces migration risk = faster POCs = faster deals

**Conversion funnel:**
1. Developer hovers over `FROM python:3.9-slim`
2. Sees "Match Score: 94.2/100"
3. Sees "Coverage: 94.2% (32/34 packages)"
4. **Thinks:** "This is sophisticated, not just find/replace"
5. Clicks convert, sees it works
6. **Outcome:** Trust in Chainguard engineering → Trial → Purchase

### Live Package Verification

**Technical:**
- Confidence that packages exist
- Catch naming differences early
- Discover new packages as Wolfi grows

**Sales:**
- "Extension verifies against live repository"
- "Always up-to-date with latest Wolfi packages"
- Professional touch vs. static tools

### CVE Scanning

**Technical:**
- Quantify security improvement
- Track progress during migration
- Prove zero-CVE claim with real data

**Sales:**
- **Killer demo:** "Watch CVEs drop to zero in real-time"
- **Credibility:** Real grype scans, not marketing numbers
- **ROI:** "47 CVEs eliminated = X hours saved patching"
- **Competitive:** "Show me another tool that does this"

**Conversion funnel:**
1. Developer hovers over FROM line
2. Sees "47 CVEs"
3. Sees "Chainguard: 0 CVEs"
4. Clicks "Convert to Chainguard"
5. Hovers again, sees "✅ 0 CVEs"
6. **Mind blown** → Shares with team → Trial signup

---

## Future Enhancements

### v0.3.0
- [ ] CVE trend charts (show CVE history over time)
- [ ] Export CVE report (PDF/JSON)
- [ ] Batch scan all images in workspace
- [ ] Show CVSS scores, not just counts

### v0.4.0
- [ ] Integrate with Chainguard's own CVE API
- [ ] Show exact CVE IDs (CVE-2023-XXXX)
- [ ] Link to CVE details
- [ ] Compare image sizes (before/after)

### v1.0.0
- [ ] Dashboard view (all Dockerfiles, CVE summary)
- [ ] CI/CD integration (export scan results)
- [ ] Team sharing (share scan cache)
- [ ] Telemetry (track CVE reductions across all users)

---

## Credits

- **Grype:** https://github.com/anchore/grype
- **Wolfi:** https://github.com/wolfi-dev/os
- **Chainguard:** https://chainguard.dev
