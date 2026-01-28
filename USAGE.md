# Usage Guide

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Compile TypeScript**
   ```bash
   npm run compile
   ```

3. **Run in VS Code**
   - Press `F5` to launch Extension Development Host
   - Open any Dockerfile
   - See inline diagnostics and quick fixes

## Testing the Converter

Run the test script to see conversion examples:

```bash
node test-convert.js
```

This will convert the sample Dockerfiles in `test-dockerfiles/` and show the changes.

## Features Demonstrated

### ✅ Working Features

1. **FROM Line Conversion**
   - `FROM node:18-alpine` → `FROM cgr.dev/chainguard/node:18-dev`
   - `FROM python:3.9` → `FROM cgr.dev/chainguard/python:3.9-dev`
   - `FROM alpine` → `FROM cgr.dev/chainguard/chainguard-base:latest`
   - `FROM golang:1.19-alpine AS builder` → `FROM cgr.dev/chainguard/golang:1.19-dev AS builder`

2. **Tag Intelligence**
   - Strips suffixes: `18-alpine` → `18`
   - Truncates versions: `3.11.2` → `3.11`
   - Adds `-dev` when stage has RUN commands
   - Uses `latest` for chainguard-base

3. **Package Manager Conversion** (single-line)
   - `apt-get install -y curl git` → `apk add --no-cache curl git`
   - `dnf install python3-pip` → `apk add --no-cache py3-pip`
   - Package name mapping (600+ packages)

4. **USER root Injection**
   - Automatically adds `USER root` before package installations
   - Required for Chainguard's non-root default

5. **User Management**
   - `useradd -r` → `adduser --system`
   - `groupadd` → `addgroup`

6. **Multi-stage Support**
   - Converts each stage independently
   - Applies `-dev` only to stages with RUN commands

### 🚧 Known Limitations (v0.1.0)

1. **Multi-line RUN Commands**
   - Currently only handles single-line RUN statements
   - Multi-line commands with `\` continuation are partially converted
   - **Workaround**: Manually join lines or use dfc CLI for complex Dockerfiles
   - **Future**: Implement proper line continuation handling

2. **Complex Package Install Patterns**
   - Simple patterns work: `apt-get install pkg1 pkg2`
   - Complex patterns may need manual review: multiple `&&` chains, pipes, etc.

## Example Conversions

### Simple Python App

**Before:**
```dockerfile
FROM python:3.9
RUN apt-get update && apt-get install -y curl git build-essential
RUN useradd -r appuser
USER appuser
```

**After:**
```dockerfile
FROM cgr.dev/chainguard/python:3.9-dev
USER root
RUN apk add --no-cache curl git build-base
RUN adduser --system appuser
USER appuser
```

### Multi-stage Go Build

**Before:**
```dockerfile
FROM golang:1.19-alpine AS builder
RUN apk add --no-cache git
COPY . .
RUN go build -o app

FROM alpine:latest
COPY --from=builder /app /app
CMD ["/app"]
```

**After:**
```dockerfile
FROM cgr.dev/chainguard/go:1.19-dev AS builder
USER root
RUN apk add --no-cache git
COPY . .
RUN go build -o app

FROM cgr.dev/chainguard/chainguard-base:latest
COPY --from=builder /app /app
CMD ["/app"]
```

Note: The second stage doesn't get `-dev` suffix because it has no RUN commands (distroless-friendly).

## VS Code Extension Features

### 1. Inline Diagnostics

Open any Dockerfile and see informational hints on FROM lines:

```
💡 Chainguard image available (0 CVEs, daily rebuilds)
```

### 2. Quick Fixes

Press `Cmd+.` (or click lightbulb) on a FROM line:
- **Convert to Chainguard image** - converts just this line
- **Convert entire Dockerfile** - migrates the whole file

### 3. Hover Tooltips

Hover over a FROM line to see:
- Chainguard equivalent
- Security benefits
- Links to documentation

### 4. Commands

Open command palette (`Cmd+Shift+P`) and search:
- `Chainguard: Convert Dockerfile` - full conversion with preview
- `Chainguard: Show Conversion Preview` - see diff before applying

## Configuration

Settings (`Cmd+,` → search "Chainguard"):

```json
{
  "chainguard.org": "chainguard",
  "chainguard.customMappings": "",
  "chainguard.enableDiagnostics": true
}
```

### Custom Mappings

Create a YAML file with custom image/package mappings:

```yaml
# custom-mappings.yaml
images:
  mycompany/node: node:latest
  mycompany/python: python:latest

packages:
  debian:
    custom-package: wolfi-equivalent
```

Then set in VS Code settings:
```json
{
  "chainguard.customMappings": "/path/to/custom-mappings.yaml"
}
```

## Development

### Project Structure

```
vs_extension/
├── src/
│   ├── converter/
│   │   └── DockerfileConverter.ts   # Core conversion logic
│   ├── mappings/
│   │   ├── loader.ts                # Mapping file loader
│   │   └── builtin-mappings.yaml   # Image/package mappings
│   ├── providers/
│   │   ├── DiagnosticProvider.ts   # Inline hints
│   │   ├── CodeActionProvider.ts   # Quick fixes
│   │   └── HoverProvider.ts        # Hover tooltips
│   ├── types.ts                     # TypeScript interfaces
│   └── extension.ts                 # Main entry point
├── test-dockerfiles/                # Sample Dockerfiles
└── package.json                     # Extension manifest
```

### Adding New Mappings

Mappings are automatically pulled from dfc's builtin-mappings.yaml. To update:

```bash
curl -o src/mappings/builtin-mappings.yaml \
  https://raw.githubusercontent.com/chainguard-dev/dfc/main/pkg/dfc/builtin-mappings.yaml

npm run compile
cp src/mappings/builtin-mappings.yaml out/mappings/
```

### Debugging

1. Set breakpoints in TypeScript files
2. Press `F5` to launch Extension Development Host
3. Breakpoints will hit when you trigger the extension

## Roadmap

### v0.2.0
- [ ] Multi-line RUN command support
- [ ] Better package extraction (complex patterns)
- [ ] Inline diff view (without full preview)

### v0.3.0
- [ ] CVE count comparison (before/after)
- [ ] Image size comparison
- [ ] Telemetry (privacy-respecting)

### v1.0.0
- [ ] Publish to VS Code Marketplace
- [ ] Auto-update mappings from Chainguard
- [ ] Integration with Docker extension

## Contributing

This extension ports logic from [dfc](https://github.com/chainguard-dev/dfc). For mapping updates or conversion logic improvements, consider contributing upstream.

## License

Apache 2.0
