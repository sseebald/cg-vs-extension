# Changelog

All notable changes to the Chainguard Dockerfile Converter extension will be documented in this file.

## [0.1.0] - 2024-01-28

### Initial Release

#### Features
- **Automatic Dockerfile Conversion** - Convert FROM lines to Chainguard equivalents
- **Package Manager Migration** - Automatically convert apt/dnf/yum → apk with package mappings (600+ mappings)
- **Inline Diagnostics** - Real-time detection of non-Chainguard images
- **Quick Fixes** - One-click conversion via code actions
- **Hover Information** - See Chainguard equivalents and benefits on hover
- **CVE Comparison** - Live grype scanning to compare vulnerabilities (before/after)
- **Multi-stage Build Support** - Intelligent `-dev` suffix detection
- **Live Package Verification** - Verify packages against Wolfi repository
- **Crystal Ball Integration** - Optional intelligent image matching with coverage scoring
- **Preview Mode** - Show diff before applying changes
- **Save as New File** - Preserve original Dockerfiles

#### Best Practices Built-in
- Automatic `USER root` injection for package installs
- Automatic `USER nonroot` reset after package operations
- Distroless pattern recommendations
- Multi-stage build guidance
- Package verification with alternatives
- `--no-cache` flag enforcement

#### Commands
- `Chainguard: Convert Dockerfile` - Convert entire Dockerfile (overwrites)
- `Chainguard: Show Conversion Preview` - Preview changes before applying
- `Chainguard: Save Conversion as New File` - Save converted version as new file

#### Configuration Options
- `chainguard.org` - Organization name (default: `chainguard`)
- `chainguard.customMappings` - Path to custom mappings file
- `chainguard.enableDiagnostics` - Enable/disable inline diagnostics
- `chainguard.enableCVEScanning` - Enable live CVE scanning with grype
- `chainguard.enableLivePackageVerification` - Verify packages against Wolfi
- `chainguard.enableCrystalBall` - Enable intelligent image matching

#### Documentation
- Comprehensive README with setup instructions
- Authentication guide for private Chainguard registry
- Crystal Ball integration guide
- Package mapping documentation

---

## Future Enhancements (Roadmap)

- Digest pinning suggestions
- Entrypoint conflict detection
- Python virtual environment pattern templates
- Enhanced multi-line command consolidation
- VS Code workspace-level configuration
- Bulk conversion for multiple Dockerfiles
