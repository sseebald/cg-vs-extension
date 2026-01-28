/*
 * Hover Provider - shows Chainguard equivalent on hover
 * Enhanced with crystal-ball intelligent image matching
 */

import * as vscode from 'vscode';
import { DockerfileConverter } from '../converter/DockerfileConverter';
import { scanImage, getCachedScan, formatCVECount, compareCVEs } from '../scanner/grype-scanner';
import { verifyPackageMapping } from '../mappings/package-search';
import { getCrystalBallClient } from '../extension';

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
      markdown.appendMarkdown('Chainguard images use **Wolfi** (Alpine-based) package manager.\n\n');
      markdown.appendMarkdown('**Converted command:**\n\n');
      markdown.appendCodeblock(change.new, 'bash');
      markdown.appendMarkdown('\n---\n\n');
      markdown.appendMarkdown('**Why apk?**\n\n');
      markdown.appendMarkdown('- Wolfi OS uses Alpine package manager (apk)\n');
      markdown.appendMarkdown('- Packages are automatically mapped (600+ mappings)\n');
      markdown.appendMarkdown('- Smaller, faster, more secure than apt/dnf\n\n');
      markdown.appendMarkdown('[Learn more about Wolfi](https://edu.chainguard.dev/open-source/wolfi/overview/)');

      return new vscode.Hover(markdown, line.range);
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
