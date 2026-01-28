# Crystal Ball Integration (Optional)

Crystal Ball is Chainguard's intelligent image matching system that provides enhanced package-level recommendations with coverage scoring.

## Status

Crystal Ball integration is **optional** - the extension works perfectly without it, using static mappings from the dfc project.

## Setup (Optional)

If you want to enable Crystal Ball features:

### 1. Clone the Crystal Ball Repository

```bash
# Clone into the extension directory
git clone https://github.com/chainguard-sandbox/crystal-ball.git
```

### 2. Build the Binary

```bash
cd crystal-ball
go build -o match ./cmd/match
```

### 3. Obtain the Database

The Crystal Ball database (`crystal-ball.db`) contains Chainguard package and image mappings.

**Option A:** Contact Chainguard for access to a pre-built database

**Option B:** Build your own using the ingestion tools (see crystal-ball/README.md)

### 4. Enable in Settings

```json
{
  "chainguard.enableCrystalBall": true
}
```

## What You Get With Crystal Ball

Without Crystal Ball:
```
FROM golang:1.20
→ FROM cgr.dev/chainguard/go:1.20-dev
```

With Crystal Ball:
```
FROM golang:1.20

🔮 Crystal Ball Recommendation

Match Score: 94.2/100
- Coverage: 94.2% (32/34 packages)
- Extra packages: 12

Alternative matches: 3 other image(s) available
```

## Fallback Behavior

If Crystal Ball is not available:
- Extension uses static mappings (600+ images, 8000+ packages from dfc)
- All conversion features still work
- You just won't see the enhanced coverage scoring

## Architecture

The extension:
1. Starts crystal-ball HTTP server on activation (if available)
2. Calls REST API for intelligent image matching
3. Falls back gracefully to static mappings if unavailable

See `src/services/crystal-ball-client.ts` for implementation details.

## More Information

- Crystal Ball repo: https://github.com/chainguard-sandbox/crystal-ball
- See `FEATURES.md` for details on the Crystal Ball integration
