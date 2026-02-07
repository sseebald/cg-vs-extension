/*
 * Hover Provider - shows Chainguard equivalent on hover
 * Enhanced with crystal-ball intelligent image matching
 */

import * as vscode from 'vscode';
import { DockerfileConverter } from '../converter/DockerfileConverter';
import { scanImage, getCachedScan, formatCVECount, compareCVEs } from '../scanner/grype-scanner';
import { verifyPackageMapping } from '../mappings/package-search';
import { getCrystalBallClient } from '../extension';
import { ChainctlClient } from '../services/chainctl-client';
import { parseDependencyFile } from '../parsers/dependency-parser';
import { checkRemediationAvailability } from '../services/vex-feed-client';
import * as fs from 'fs';

export class HoverProvider implements vscode.HoverProvider {
  private static statusBarItem: vscode.StatusBarItem | undefined;
  private static scanningImages = new Set<string>();

  constructor() {
    // Create status bar item for scan notifications
    if (!HoverProvider.statusBarItem) {
      HoverProvider.statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
      );
    }
  }

  private updateStatusBar(message: string, timeout: number = 3000): void {
    if (HoverProvider.statusBarItem) {
      HoverProvider.statusBarItem.text = message;
      HoverProvider.statusBarItem.show();

      setTimeout(() => {
        HoverProvider.statusBarItem?.hide();
      }, timeout);
    }
  }
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    const line = document.lineAt(position.line);
    const lineText = line.text.trim();

    const config = vscode.workspace.getConfiguration('chainguard');
    const org = config.get<string>('org', 'chainguard');
    const converter = new DockerfileConverter({ org });

    // Handle FROM lines
    if (lineText.toUpperCase().startsWith('FROM')) {
      return this.handleFromHover(lineText, line, converter, config);
    }

    // Handle RUN lines with package managers
    if (lineText.toUpperCase().startsWith('RUN') &&
        (lineText.includes('apt-get') || lineText.includes('apt install') ||
         lineText.includes('dnf') || lineText.includes('yum') || lineText.includes('microdnf'))) {
      return this.handlePackageManagerHover(document, position, line, converter);
    }

    // Handle useradd/groupadd lines
    if (lineText.toUpperCase().startsWith('RUN') &&
        (lineText.includes('useradd') || lineText.includes('groupadd'))) {
      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = true;
      markdown.supportHtml = true;

      markdown.appendMarkdown('### User Management in Chainguard Images\n\n');
      markdown.appendMarkdown('**⚠️ Important:** Chainguard images already include a `nonroot` user (UID 65532).\n\n');

      markdown.appendMarkdown('**Recommended approach:**\n');
      markdown.appendCodeblock('USER nonroot\nCOPY --chown=nonroot:nonroot . /app', 'dockerfile');

      markdown.appendMarkdown('\n**If you need custom users, you have two options:**\n\n');
      markdown.appendMarkdown('1. **Use Busybox adduser** (limited functionality):\n');
      markdown.appendCodeblock('RUN adduser -D myuser  # No password\nRUN adduser -S myuser  # System user', 'bash');

      markdown.appendMarkdown('\n2. **Install shadow package** for full useradd:\n');
      markdown.appendCodeblock('RUN apk add --no-cache shadow\nRUN useradd -m myuser', 'bash');

      markdown.appendMarkdown('\n[Learn more about Chainguard user management](https://edu.chainguard.dev/chainguard/chainguard-images/getting-started/users-and-groups/)');

      return new vscode.Hover(markdown, line.range);
    }

    // Handle COPY commands with dependency files
    if (lineText.toUpperCase().startsWith('COPY') &&
        /requirements.*\.txt|package\.json|pom\.xml|build\.gradle/.test(lineText)) {
      return this.handleDependencyFileHover(document, position, line, converter, config);
    }

    // Handle RUN commands with package installation
    if (lineText.toUpperCase().startsWith('RUN') &&
        /pip3?\s+install|npm\s+(install|ci)|yarn\s+(install|add)|mvn\s+|gradle\s+/.test(lineText)) {
      return this.handleDependencyInstallHover(document, position, line, converter, config);
    }

    return;
  }

  private async handleFromHover(
    lineText: string,
    line: vscode.TextLine,
    converter: DockerfileConverter,
    config: vscode.WorkspaceConfiguration
  ): Promise<vscode.Hover | undefined> {
    const result = converter.convert(line.text);
    const change = result.changes.find(c => c.type === 'from');

    if (!change || change.old === change.new) {
      return;
    }

    // Extract image names
    const oldImage = this.extractImageName(change.old);
    const newImage = this.extractImageName(change.new);

    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    markdown.appendMarkdown('### Chainguard Equivalent\n\n');
    markdown.appendCodeblock(change.new, 'dockerfile');

    // Add best practices guidance
    markdown.appendMarkdown('\n---\n\n');
    markdown.appendMarkdown('### 📋 Best Practices\n\n');

    // Check if this is a -dev variant
    const isDevVariant = change.new.includes('-dev');

    if (isDevVariant) {
      markdown.appendMarkdown('**Multi-stage builds recommended:**\n');
      markdown.appendCodeblock(
        '# Build stage (has apk, shell, build tools)\nFROM ' + change.new.split('\n')[0].replace('FROM ', '') + ' AS builder\nRUN apk add --no-cache build-base\n# ... build steps\n\n# Runtime stage (distroless - no shell/apk)\nFROM ' + change.new.split('\n')[0].replace('FROM ', '').replace('-dev', '') + '\nCOPY --from=builder /app /app',
        'dockerfile'
      );
      markdown.appendMarkdown('\n**Why distroless for runtime?**\n');
      markdown.appendMarkdown('- Smaller attack surface (no shell, no package manager)\n');
      markdown.appendMarkdown('- Fewer CVEs (minimal components)\n');
      markdown.appendMarkdown('- Best practice for production deployments\n');
    } else {
      markdown.appendMarkdown('✅ Using **distroless** image (no shell/package manager)\n\n');
      markdown.appendMarkdown('- Minimal attack surface\n');
      markdown.appendMarkdown('- Best for production runtime\n');
      markdown.appendMarkdown('- For build steps, use `-dev` variant instead\n');
    }

    // Try crystal-ball for enhanced recommendations
    const enableCrystalBall = config.get('enableCrystalBall', true);
    if (enableCrystalBall && oldImage) {
      const crystalBall = getCrystalBallClient();
      if (crystalBall) {
        try {
          const matches = await crystalBall.matchImage(oldImage);
          if (matches && matches.topImages.length > 0) {
            const best = matches.topImages[0];
            markdown.appendMarkdown('\n---\n\n');
            markdown.appendMarkdown('### 🔮 Crystal Ball Recommendation\n\n');
            markdown.appendMarkdown(`**Match Score:** ${best.probabilityScore.toFixed(1)}/100\n\n`);
            markdown.appendMarkdown(`- Coverage: ${(best.coverage * 100).toFixed(1)}% (${best.satisfiedCount}/${best.totalRequired} packages)\n`);
            markdown.appendMarkdown(`- Extra packages: ${best.extraPackages}\n`);

            if (matches.topImages.length > 1) {
              markdown.appendMarkdown(`\n**Alternative matches:** ${matches.topImages.length - 1} other image(s) available\n`);
            }
          }
        } catch (error: any) {
          console.error('[Chainguard] Crystal Ball match failed:', error.message);
        }
      }
    }

    // Check if CVE scanning is enabled
    const enableScanning = config.get('enableCVEScanning', true);

    if (enableScanning && oldImage) {
      markdown.appendMarkdown('\n---\n\n');
      markdown.appendMarkdown('### CVE Comparison\n\n');

      // Check cache first
      const cachedOld = getCachedScan(oldImage);
      const cachedNew = newImage ? getCachedScan(newImage) : null;

      // Check if scans are currently running (tracked separately)
      const oldScanning = HoverProvider.scanningImages.has(oldImage);
      const newScanning = newImage ? HoverProvider.scanningImages.has(newImage) : false;

      // Debug logging
      console.log(`[Chainguard] Hover CVE check:`, {
        oldImage,
        newImage,
        cachedOld: cachedOld ? `${cachedOld.cveCount} CVEs, scanning=${cachedOld.scanning}` : 'null',
        cachedNew: cachedNew ? `${cachedNew.cveCount} CVEs, scanning=${cachedNew.scanning}` : 'null',
        oldScanning,
        newScanning,
        scanningImagesSet: Array.from(HoverProvider.scanningImages)
      });

      // Show results if we have at least the old image scan complete
      const hasOldResults = cachedOld && !cachedOld.scanning && !oldScanning;
      const hasNewResults = cachedNew && !cachedNew.scanning && !newScanning;

      if (hasOldResults && hasNewResults) {
        // We have both results - show full comparison
        const comparison = compareCVEs(cachedOld, cachedNew);
        markdown.appendMarkdown(`**${comparison}**\n\n`);
        markdown.appendMarkdown(`- Current: ${formatCVECount(cachedOld)}\n`);
        markdown.appendMarkdown(`- Chainguard: ${formatCVECount(cachedNew)}\n`);
      } else if (hasOldResults && newScanning) {
        // Old scan complete, new scan in progress - show partial results
        markdown.appendMarkdown(`- Current: ${formatCVECount(cachedOld)}\n`);
        markdown.appendMarkdown(`- Chainguard: 🔍 Scanning...\n`);
      } else if (hasOldResults && !hasNewResults) {
        // Old scan complete, new scan not started or failed - show what we have
        markdown.appendMarkdown(`- Current: ${formatCVECount(cachedOld)}\n`);
        if (newImage) {
          markdown.appendMarkdown(`- Chainguard: *Scan not available*\n`);
        }
      } else if (oldScanning || newScanning) {
        // Scans currently in progress
        markdown.appendMarkdown('🔍 **Scanning in progress...**\n\n');
        markdown.appendMarkdown('Hover again in a few seconds to see results.\n');
      } else {
        // Trigger background scans
        markdown.appendMarkdown('🔍 Scanning images for CVEs...\n\n');
        markdown.appendMarkdown('*(Hover again in a few seconds to see results)*\n');

        // Track pending scans and start them individually
        const scanPromises: Promise<void>[] = [];

        if (!cachedOld || cachedOld.scanning) {
          HoverProvider.scanningImages.add(oldImage);

          // Start old image scan and clear from Set when done
          const oldScan = scanImage(oldImage).then(() => {
            HoverProvider.scanningImages.delete(oldImage);
            console.log(`[Chainguard] Scan complete for ${oldImage}`);
            this.updateStatusBar('$(check) CVE scan complete - hover again to see results');
          }).catch(err => {
            HoverProvider.scanningImages.delete(oldImage);
            console.error(`[Chainguard] Scan failed for ${oldImage}:`, err);
          });
          scanPromises.push(oldScan);
        }

        if (newImage && (!cachedNew || cachedNew.scanning)) {
          HoverProvider.scanningImages.add(newImage);

          // Start new image scan and clear from Set when done
          const newScan = scanImage(newImage).then(() => {
            HoverProvider.scanningImages.delete(newImage);
            console.log(`[Chainguard] Scan complete for ${newImage}`);
            this.updateStatusBar('$(check) CVE scan complete - hover again to see results');
          }).catch(err => {
            HoverProvider.scanningImages.delete(newImage);
            console.error(`[Chainguard] Scan failed for ${newImage}:`, err);
          });
          scanPromises.push(newScan);
        }

        // Show notification when ALL scans complete
        if (scanPromises.length > 0) {
          Promise.all(scanPromises).then(() => {
            console.log(`[Chainguard] All CVE scans complete`);
            vscode.window.showInformationMessage(
              'CVE scans complete! Hover over the FROM line again to see results.',
              'Dismiss'
            );
          }).catch(() => {
            // Errors already logged in individual handlers
          });
        }
      }
    }

    markdown.appendMarkdown('\n---\n\n');
    markdown.appendMarkdown('**Benefits:**\n\n');
    markdown.appendMarkdown('- ✅ Zero CVEs (vs. 15-200 in typical images)\n');
    markdown.appendMarkdown('- 🔄 Daily automated rebuilds\n');
    markdown.appendMarkdown('- 📦 Smaller attack surface\n');
    markdown.appendMarkdown('- 📋 Built-in SBOM & signatures\n');
    markdown.appendMarkdown('- 🏢 Commercial support available\n\n');
    markdown.appendMarkdown('[Learn more about Chainguard Images](https://edu.chainguard.dev/chainguard/chainguard-images/overview/)');

    return new vscode.Hover(markdown, line.range);
  }

  private async handlePackageManagerHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    line: vscode.TextLine,
    converter: DockerfileConverter
  ): Promise<vscode.Hover | undefined> {
    // Read multi-line command if it has backslash continuations
    const { fullCommand } = this.readMultilineCommand(document, position.line);
    const result = converter.convert(fullCommand);
    const change = result.changes.find(c => c.type === 'run' && c.line === 0);

    if (!change || change.old === change.new) {
      return;
    }

    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    markdown.appendMarkdown('### Chainguard Package Conversion\n\n');
    markdown.appendMarkdown('Chainguard images use **Wolfi** (glibc-based) package manager.\n\n');
    markdown.appendMarkdown('**Converted command:**\n\n');
    markdown.appendCodeblock(change.new, 'bash');
    markdown.appendMarkdown('\n---\n\n');
    markdown.appendMarkdown('**Why apk?**\n\n');
    markdown.appendMarkdown('- Wolfi OS uses apk package manager\n');
    markdown.appendMarkdown('- Packages are automatically mapped (600+ mappings)\n');
    markdown.appendMarkdown('- Uses **glibc** (faster than Alpine\'s musl)\n');
    markdown.appendMarkdown('- `--no-cache` flag reduces image size\n\n');
    markdown.appendMarkdown('💡 **Tip:** Package installs require `USER root` in Chainguard images (default user is `nonroot`)\n\n');

    // Extract packages from converted command
    const packageMatch = change.new.match(/apk add --no-cache (.+)/);
    if (packageMatch) {
      const packages = packageMatch[1].trim().split(/\s+/);

      // Check if package verification is enabled
      const config = vscode.workspace.getConfiguration('chainguard');
      const enableVerification = config.get('enableLivePackageVerification', true);

      if (enableVerification && packages.length > 0) {
        markdown.appendMarkdown('---\n\n');
        markdown.appendMarkdown('**📦 Package Verification:**\n\n');

        // Verify packages exist in Wolfi (show first few)
        const packagesToCheck = packages.slice(0, 3);
        let hasWarning = false;

        for (const pkg of packagesToCheck) {
          const verification = await verifyPackageMapping(pkg, pkg);
          if (!verification.exists) {
            hasWarning = true;
            markdown.appendMarkdown(`⚠️ \`${pkg}\` not found in Wolfi repository\n`);
            if (verification.alternatives && verification.alternatives.length > 0) {
              markdown.appendMarkdown(`   Suggestions: ${verification.alternatives.map(a => `\`${a.name}\``).join(', ')}\n`);
            }
          }
        }

        if (hasWarning) {
          markdown.appendMarkdown('\n💡 Search for packages: [APK Explorer](https://apk.dag.dev/) | [packages.wolfi.dev](https://packages.wolfi.dev/)\n');
        }

        if (packages.length > 3) {
          markdown.appendMarkdown(`\n*(Showing ${packagesToCheck.length} of ${packages.length} packages)*\n`);
        }
      }
    }

    markdown.appendMarkdown('\n[Learn more about Wolfi](https://edu.chainguard.dev/open-source/wolfi/overview/)');

    return new vscode.Hover(markdown, line.range);
  }

  private async handleDependencyFileHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    line: vscode.TextLine,
    converter: DockerfileConverter,
    config: vscode.WorkspaceConfiguration
  ): Promise<vscode.Hover | undefined> {
    const enableLibraryDetection = config.get('enableLibraryDetection', false);

    if (!enableLibraryDetection) {
      return undefined;
    }

    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    markdown.appendMarkdown('## Chainguard Libraries\n\n');

    // Detect dependency file
    const depFiles = converter.extractDependencyFiles(
      document.getText(),
      document.uri.fsPath
    );

    const depFile = depFiles.find(f => f.line === position.line);
    if (!depFile) {
      return undefined;
    }

    markdown.appendMarkdown(`**Detected**: ${depFile.ecosystem.toUpperCase()} dependency file\n\n`);

    // Check chainctl availability
    const hasChainctl = await ChainctlClient.isInstalled();
    const isAuthenticated = hasChainctl ? await ChainctlClient.isAuthenticated() : false;

    if (!hasChainctl) {
      markdown.appendMarkdown('⚠️ **`chainctl` not installed**\n\n');
      markdown.appendMarkdown('Install with:\n');
      markdown.appendCodeblock('brew install chainguard-dev/tap/chainctl', 'bash');
      markdown.appendMarkdown('\nChainguard Libraries provide:\n');
      markdown.appendMarkdown('- Supply-chain-secured packages built from source\n');
      markdown.appendMarkdown('- CVE-remediated versions with backported fixes\n');
      markdown.appendMarkdown('- VEX attestations for scanner integration\n\n');
      markdown.appendMarkdown('[Learn more](https://edu.chainguard.dev/chainguard/libraries/)\n');
      return new vscode.Hover(markdown, line.range);
    }

    if (!isAuthenticated) {
      markdown.appendMarkdown('🔐 **Authentication required**\n\n');
      markdown.appendMarkdown('Run:\n');
      markdown.appendCodeblock('chainctl auth login', 'bash');
      markdown.appendMarkdown('\nAuthentication is required to access `libraries.cgr.dev`\n\n');
      markdown.appendMarkdown('[Learn more about authentication](https://edu.chainguard.dev/chainguard/libraries/)\n');
      return new vscode.Hover(markdown, line.range);
    }

    // Get entitlements - use libraryOrg config if set, otherwise show config prompt
    const libraryOrg = config.get<string>('libraryOrg', '');

    if (!libraryOrg) {
      markdown.appendMarkdown(`⚠️ **Organization not configured**\n\n`);
      markdown.appendMarkdown('Set your Chainguard organization for library entitlements:\n\n');
      markdown.appendMarkdown('1. Open Settings: `Cmd+,`\n');
      markdown.appendMarkdown('2. Search: `chainguard.libraryOrg`\n');
      markdown.appendMarkdown('3. Set to your org (e.g., `sseebald.dev`)\n\n');
      markdown.appendMarkdown('Or add to `settings.json`:\n');
      markdown.appendCodeblock('"chainguard.libraryOrg": "your-org.dev"', 'json');
      markdown.appendMarkdown('\n[Find your orgs](https://console.chainguard.dev)\n');
      return new vscode.Hover(markdown, line.range);
    }

    const entitlements = await ChainctlClient.getEntitlements(libraryOrg);
    const ecosystemKey = depFile.ecosystem.toUpperCase();

    if (!entitlements.has(ecosystemKey)) {
      markdown.appendMarkdown(`⚠️ **No ${ecosystemKey} entitlement**\n\n`);
      markdown.appendMarkdown(`Organization \`${libraryOrg}\` does not have ${ecosystemKey} Libraries enabled.\n\n`);
      if (entitlements.size > 0) {
        markdown.appendMarkdown(`**Available ecosystems**: ${Array.from(entitlements).join(', ')}\n\n`);
      } else {
        markdown.appendMarkdown('Contact your Chainguard account owner to enable Libraries.\n\n');
      }
      markdown.appendMarkdown('[Learn more about entitlements](https://edu.chainguard.dev/chainguard/libraries/)\n');
      return new vscode.Hover(markdown, line.range);
    }

    markdown.appendMarkdown(`✅ **${ecosystemKey} Libraries available**\n\n`);
    markdown.appendMarkdown('---\n\n');

    // Parse dependency file and show packages
    if (!depFile.absolutePath || !fs.existsSync(depFile.absolutePath)) {
      markdown.appendMarkdown(`⚠️ **Cannot find file**: \`${depFile.filePath}\`\n\n`);
      markdown.appendMarkdown('Make sure the file exists in your workspace.\n');
      return new vscode.Hover(markdown, line.range);
    }

    const packages = await parseDependencyFile(depFile.absolutePath, depFile.ecosystem);

    if (packages.length === 0) {
      markdown.appendMarkdown('No packages detected in dependency file.\n');
      return new vscode.Hover(markdown, line.range);
    }

    markdown.appendMarkdown(`**Detected ${packages.length} package(s)**:\n\n`);

    // Show first 5 packages
    const preview = packages.slice(0, 5);
    for (const pkg of preview) {
      const versionStr = pkg.version ? `@${pkg.version}` : '';
      markdown.appendMarkdown(`- \`${pkg.name}${versionStr}\`\n`);
    }

    if (packages.length > 5) {
      markdown.appendMarkdown(`\n*...and ${packages.length - 5} more*\n`);
    }

    // Check CVE remediation status for first 3 packages
    markdown.appendMarkdown('\n**CVE Remediation Status**:\n\n');

    try {
      const checkPromises = preview.slice(0, 3).map(pkg =>
        checkRemediationAvailability(pkg.name, depFile.ecosystem)
      );

      const results = await Promise.all(checkPromises);

      let hasRemediations = false;
      for (let i = 0; i < preview.length && i < 3; i++) {
        const pkg = preview[i];
        const remediations = results[i];

        if (remediations.length > 0) {
          const totalCves = remediations.reduce((sum, r) => sum + r.cvesFixed.length, 0);
          markdown.appendMarkdown(`- \`${pkg.name}\`: ✅ ${totalCves} CVE(s) remediated\n`);
          hasRemediations = true;
        } else {
          markdown.appendMarkdown(`- \`${pkg.name}\`: Available from Chainguard\n`);
        }
      }

      if (!hasRemediations && preview.length > 0) {
        markdown.appendMarkdown('\n💡 All packages checked are available from Chainguard Libraries.\n');
      }

      if (packages.length > 3) {
        markdown.appendMarkdown(`\n*CVE status shown for first 3 packages only*\n`);
      }
    } catch (error: any) {
      console.warn('[Chainguard] Failed to check CVE remediation:', error.message);
      markdown.appendMarkdown('⚠️ Unable to fetch CVE remediation data at this time.\n');
    }

    markdown.appendMarkdown('\n---\n\n');
    markdown.appendMarkdown('**Next steps**:\n\n');
    markdown.appendMarkdown(`1. Configure your ${depFile.ecosystem} package manager\n`);
    markdown.appendMarkdown('2. Point to Chainguard Libraries registry\n');
    markdown.appendMarkdown('3. Install dependencies as usual\n\n');
    markdown.appendMarkdown('[Configuration guide →](https://edu.chainguard.dev/chainguard/libraries/)\n');

    return new vscode.Hover(markdown, line.range);
  }

  private async handleDependencyInstallHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    line: vscode.TextLine,
    converter: DockerfileConverter,
    config: vscode.WorkspaceConfiguration
  ): Promise<vscode.Hover | undefined> {
    const enableLibraryDetection = config.get('enableLibraryDetection', false);

    if (!enableLibraryDetection) {
      return undefined;
    }

    const lineText = line.text.trim();
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    // Detect ecosystem
    let ecosystem: string | null = null;
    if (/pip3?\s+install/.test(lineText)) {
      ecosystem = 'python';
    } else if (/(npm|yarn)\s+(install|add|ci)/.test(lineText)) {
      ecosystem = 'javascript';
    } else if (/mvn\s+/.test(lineText)) {
      ecosystem = 'java';
    } else if (/gradle\s+/.test(lineText)) {
      ecosystem = 'java';
    }

    if (!ecosystem) {
      return undefined;
    }

    markdown.appendMarkdown('## Chainguard Libraries\n\n');
    markdown.appendMarkdown(`**Installing ${ecosystem.toUpperCase()} packages**\n\n`);

    // Find the corresponding dependency file
    const depFiles = converter.extractDependencyFiles(
      document.getText(),
      document.uri.fsPath
    );

    const depFile = depFiles.find(f => f.ecosystem === ecosystem);

    if (!depFile) {
      markdown.appendMarkdown('💡 **Tip**: Copy a dependency file (requirements.txt, package.json, etc.) to enable package detection.\n');
      return new vscode.Hover(markdown, line.range);
    }

    // Check authentication
    const hasChainctl = await ChainctlClient.isInstalled();
    const isAuthenticated = hasChainctl ? await ChainctlClient.isAuthenticated() : false;

    if (!hasChainctl) {
      markdown.appendMarkdown('⚠️ **`chainctl` not installed**\n\n');
      markdown.appendMarkdown('[Install chainctl](https://edu.chainguard.dev/chainguard/libraries/) to check for CVE-remediated versions\n');
      return new vscode.Hover(markdown, line.range);
    }

    if (!isAuthenticated) {
      markdown.appendMarkdown('🔐 **Authentication required**\n\n');
      markdown.appendMarkdown('Run: `chainctl auth login`\n');
      return new vscode.Hover(markdown, line.range);
    }

    // Check library org config
    const libraryOrg = config.get<string>('libraryOrg', '');
    if (!libraryOrg) {
      markdown.appendMarkdown('⚠️ **Set `chainguard.libraryOrg` in settings**\n');
      return new vscode.Hover(markdown, line.range);
    }

    const entitlements = await ChainctlClient.getEntitlements(libraryOrg);
    if (!entitlements.has(ecosystem.toUpperCase())) {
      markdown.appendMarkdown(`⚠️ No ${ecosystem.toUpperCase()} Libraries entitlement\n`);
      return new vscode.Hover(markdown, line.range);
    }

    markdown.appendMarkdown(`✅ **${ecosystem.toUpperCase()} Libraries available**\n\n`);

    // Parse and show packages
    if (depFile.absolutePath && fs.existsSync(depFile.absolutePath)) {
      const packages = await parseDependencyFile(depFile.absolutePath, ecosystem);

      if (packages.length > 0) {
        markdown.appendMarkdown(`📦 **${packages.length} packages** from \`${depFile.filePath}\`\n\n`);

        // Show auto-convert option
        markdown.appendMarkdown('---\n\n');
        markdown.appendMarkdown('**💡 Actions:**\n\n');
        markdown.appendMarkdown('- Click the lightbulb 💡 to **auto-convert to CVE-remediated versions**\n');
        markdown.appendMarkdown('- Hover over the COPY line for detailed package info\n\n');
        markdown.appendMarkdown('[Learn more](https://edu.chainguard.dev/chainguard/libraries/)\n');
      }
    }

    return new vscode.Hover(markdown, line.range);
  }

  private extractImageName(fromLine: string): string | null {
    const match = fromLine.match(/FROM\s+([^\s]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Read a potentially multi-line command (with backslash continuations)
   */
  private readMultilineCommand(document: vscode.TextDocument, startLine: number): { fullCommand: string; lineCount: number } {
    let fullCommand = document.lineAt(startLine).text;
    let lineCount = 1;

    while (startLine + lineCount < document.lineCount && fullCommand.trimEnd().endsWith('\\')) {
      fullCommand = fullCommand.trimEnd().slice(0, -1) + ' ' + document.lineAt(startLine + lineCount).text.trim();
      lineCount++;
    }

    return { fullCommand, lineCount };
  }

  /**
   * Dispose of status bar item
   */
  static dispose(): void {
    if (HoverProvider.statusBarItem) {
      HoverProvider.statusBarItem.dispose();
      HoverProvider.statusBarItem = undefined;
    }
  }
}
