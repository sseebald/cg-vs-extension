/*
 * Main VS Code Extension Entry Point
 * Chainguard Dockerfile Converter
 */

import * as vscode from 'vscode';
import { DockerfileConverter } from './converter/DockerfileConverter';
import { DiagnosticProvider } from './providers/DiagnosticProvider';
import { CodeActionProvider } from './providers/CodeActionProvider';
import { HoverProvider } from './providers/HoverProvider';
import { CrystalBallClient } from './services/crystal-ball-client';
import { ChainctlClient } from './services/chainctl-client';
import { VexRemediation } from './services/vex-feed-client';

// Global crystal-ball client instance
let crystalBallClient: CrystalBallClient | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('Chainguard Dockerfile Converter is now active');

  // Initialize crystal-ball client (non-blocking)
  const config = vscode.workspace.getConfiguration('chainguard');
  const enableCrystalBall = config.get('enableCrystalBall', true);

  if (enableCrystalBall) {
    crystalBallClient = new CrystalBallClient(context.extensionPath);

    // Start server in background (don't block activation)
    crystalBallClient.start().then(started => {
      if (started) {
        console.log('[Chainguard] Crystal Ball service started successfully');
      } else {
        console.log('[Chainguard] Crystal Ball unavailable, using static mappings');
      }
    }).catch(err => {
      console.error('[Chainguard] Failed to start Crystal Ball:', err);
    });
  }

  // Initialize diagnostic provider
  new DiagnosticProvider(context);

  // Register code action provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      'dockerfile',
      new CodeActionProvider(),
      {
        providedCodeActionKinds: CodeActionProvider.providedCodeActionKinds
      }
    )
  );

  // Register hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('dockerfile', new HoverProvider())
  );

  // Command: Convert entire Dockerfile
  context.subscriptions.push(
    vscode.commands.registerCommand('chainguard.convertDockerfile', async (document?: vscode.TextDocument) => {
      const editor = vscode.window.activeTextEditor;
      const doc = document || editor?.document;

      if (!doc) {
        vscode.window.showErrorMessage('No Dockerfile open');
        return;
      }

      const config = vscode.workspace.getConfiguration('chainguard');
      const org = config.get<string>('org', 'chainguard');
      const customMappings = config.get<string>('customMappings');

      const converter = new DockerfileConverter({ org });
      const result = converter.convert(doc.getText());

      if (result.changes.length === 0) {
        vscode.window.showInformationMessage('This Dockerfile is already using Chainguard images!');
        return;
      }

      // Show diff and ask for confirmation
      const choice = await vscode.window.showInformationMessage(
        `Found ${result.changes.length} changes to migrate to Chainguard images`,
        'Show Preview',
        'Apply Changes',
        'Cancel'
      );

      if (choice === 'Show Preview') {
        await showDiffPreview(doc, result.converted);
      } else if (choice === 'Apply Changes') {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), result.converted);
        await vscode.workspace.applyEdit(edit);
        vscode.window.showInformationMessage('✅ Dockerfile converted to Chainguard images!');
      }
    })
  );

  // Command: Show conversion preview
  context.subscriptions.push(
    vscode.commands.registerCommand('chainguard.showConversionPreview', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No Dockerfile open');
        return;
      }

      const config = vscode.workspace.getConfiguration('chainguard');
      const org = config.get<string>('org', 'chainguard');
      const converter = new DockerfileConverter({ org });
      const result = converter.convert(editor.document.getText());

      await showDiffPreview(editor.document, result.converted);
    })
  );

  // Command: Save conversion as new file
  context.subscriptions.push(
    vscode.commands.registerCommand('chainguard.convertDockerfileToNewFile', async (document?: vscode.TextDocument) => {
      const editor = vscode.window.activeTextEditor;
      const doc = document || editor?.document;

      if (!doc) {
        vscode.window.showErrorMessage('No Dockerfile open');
        return;
      }

      const config = vscode.workspace.getConfiguration('chainguard');
      const org = config.get<string>('org', 'chainguard');
      const converter = new DockerfileConverter({ org });
      const result = converter.convert(doc.getText());

      if (result.changes.length === 0) {
        vscode.window.showInformationMessage('This Dockerfile is already using Chainguard images!');
        return;
      }

      // Suggest a filename based on the original
      const originalPath = doc.uri;
      const originalName = originalPath.path.split('/').pop() || 'Dockerfile';
      const suggestedName = originalName === 'Dockerfile'
        ? 'Dockerfile.chainguard'
        : `${originalName}.chainguard`;

      // Prompt user for filename
      const newFileName = await vscode.window.showInputBox({
        prompt: 'Enter filename for converted Dockerfile',
        value: suggestedName,
        placeHolder: 'Dockerfile.chainguard'
      });

      if (!newFileName) {
        return; // User cancelled
      }

      // Create new file path
      const directory = originalPath.path.substring(0, originalPath.path.lastIndexOf('/'));
      const newFilePath = vscode.Uri.file(`${directory}/${newFileName}`);

      try {
        // Write the converted content to the new file
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(newFilePath, encoder.encode(result.converted));

        // Show success message with option to open
        const choice = await vscode.window.showInformationMessage(
          `✅ Converted Dockerfile saved to ${newFileName}`,
          'Open File',
          'Show Diff'
        );

        if (choice === 'Open File') {
          const newDoc = await vscode.workspace.openTextDocument(newFilePath);
          await vscode.window.showTextDocument(newDoc);
        } else if (choice === 'Show Diff') {
          const newDoc = await vscode.workspace.openTextDocument(newFilePath);
          await vscode.commands.executeCommand('vscode.diff', doc.uri, newDoc.uri, `Original vs ${newFileName}`);
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to save file: ${error.message}`);
      }
    })
  );

  // Command: Configure Chainguard Libraries
  context.subscriptions.push(
    vscode.commands.registerCommand('chainguard.configureLibraries', async (ecosystem: string) => {
      const choice = await vscode.window.showInformationMessage(
        `Configure Chainguard ${ecosystem.toUpperCase()} Libraries?`,
        'View Docs',
        'Check Status',
        'Cancel'
      );

      if (choice === 'View Docs') {
        const urls: Record<string, string> = {
          python: 'https://edu.chainguard.dev/chainguard/libraries/python/',
          javascript: 'https://edu.chainguard.dev/chainguard/libraries/javascript/',
          java: 'https://edu.chainguard.dev/chainguard/libraries/java/'
        };
        vscode.env.openExternal(vscode.Uri.parse(urls[ecosystem] || urls.python));
      } else if (choice === 'Check Status') {
        const output = vscode.window.createOutputChannel('Chainguard Libraries');
        output.clear();
        output.appendLine('Checking Chainguard Libraries status...\n');

        const hasChainctl = await ChainctlClient.isInstalled();
        output.appendLine(`chainctl installed: ${hasChainctl ? '✅ Yes' : '❌ No'}`);

        if (hasChainctl) {
          const isAuth = await ChainctlClient.isAuthenticated();
          output.appendLine(`Authenticated: ${isAuth ? '✅ Yes' : '❌ No (run: chainctl auth login)'}`);

          if (isAuth) {
            const entitlements = await ChainctlClient.getEntitlements();
            output.appendLine(`Entitlements: ${entitlements.size > 0 ? Array.from(entitlements).join(', ') : '⚠️ None'}`);
          }
        } else {
          output.appendLine('\nInstall chainctl with:');
          output.appendLine('  brew install chainguard-dev/tap/chainctl');
        }

        output.show();
      }
    })
  );

  // Command: Auto-convert dependencies to CVE-remediated versions
  context.subscriptions.push(
    vscode.commands.registerCommand('chainguard.autoConvertDependencies', async (document: vscode.TextDocument, ecosystem: string) => {
      if (ecosystem !== 'python') {
        vscode.window.showInformationMessage('Auto-convert currently only supports Python requirements.txt');
        return;
      }

      // Find requirements.txt in the same directory as the Dockerfile
      const dockerfileDir = document.uri.fsPath.substring(0, document.uri.fsPath.lastIndexOf('/'));
      const requirementsPath = `${dockerfileDir}/requirements.txt`;

      const fs = require('fs');
      if (!fs.existsSync(requirementsPath)) {
        vscode.window.showErrorMessage('requirements.txt not found in Dockerfile directory');
        return;
      }

      // Show progress
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Converting to CVE-remediated versions...',
        cancellable: false
      }, async (progress) => {
        progress.report({ message: 'Reading requirements.txt' });

        const { parseDependencyFile } = require('./parsers/dependency-parser');
        const { checkRemediationAvailability } = require('./services/vex-feed-client');

        // Parse requirements.txt
        const packages = await parseDependencyFile(requirementsPath, 'python');

        if (packages.length === 0) {
          vscode.window.showWarningMessage('No packages found in requirements.txt');
          return;
        }

        progress.report({ message: `Checking ${packages.length} packages...` });

        // Check each package for CVE-remediated versions
        const convertedLines: string[] = [];
        const changes: Array<{ package: string; oldVersion?: string; newVersion: string; cvesFixed: number }> = [];

        for (let i = 0; i < packages.length; i++) {
          const pkg = packages[i];
          progress.report({ message: `Checking ${pkg.name} (${i + 1}/${packages.length})` });

          const remediations = await checkRemediationAvailability(pkg.name, 'python');

          if (remediations.length > 0) {
            // Use the latest remediated version
            const latest = remediations.sort((a: VexRemediation, b: VexRemediation) => b.version.localeCompare(a.version))[0];
            const totalCves = remediations.reduce((sum: number, r: VexRemediation) => sum + r.cvesFixed.length, 0);

            convertedLines.push(`${pkg.name}==${latest.version}  # Chainguard: ${totalCves} CVE(s) fixed`);
            changes.push({
              package: pkg.name,
              oldVersion: pkg.version,
              newVersion: latest.version,
              cvesFixed: totalCves
            });
          } else {
            // Keep original
            if (pkg.version) {
              convertedLines.push(`${pkg.name}==${pkg.version}`);
            } else {
              convertedLines.push(pkg.name);
            }
          }
        }

        if (changes.length === 0) {
          vscode.window.showInformationMessage('No CVE-remediated versions found for any packages');
          return;
        }

        // Create converted content
        const convertedContent = convertedLines.join('\n') + '\n';

        // Show diff preview
        const originalDoc = await vscode.workspace.openTextDocument(requirementsPath);
        const convertedDoc = await vscode.workspace.openTextDocument({
          content: convertedContent,
          language: 'pip-requirements'
        });

        await vscode.commands.executeCommand(
          'vscode.diff',
          originalDoc.uri,
          convertedDoc.uri,
          `Chainguard CVE-Remediated Versions`
        );

        // Show summary
        const summary = changes.map(c =>
          `  • ${c.package}: ${c.oldVersion || 'any'} → ${c.newVersion} (${c.cvesFixed} CVEs fixed)`
        ).join('\n');

        const choice = await vscode.window.showInformationMessage(
          `✅ Found ${changes.length} CVE-remediated version(s):\n${summary}`,
          'Save as requirements-chainguard.txt',
          'Replace requirements.txt',
          'Cancel'
        );

        if (choice === 'Save as requirements-chainguard.txt') {
          const newPath = `${dockerfileDir}/requirements-chainguard.txt`;
          fs.writeFileSync(newPath, convertedContent);
          vscode.window.showInformationMessage(`✅ Saved to requirements-chainguard.txt`);

          const openChoice = await vscode.window.showInformationMessage(
            'Open the new file?',
            'Yes',
            'No'
          );
          if (openChoice === 'Yes') {
            const doc = await vscode.workspace.openTextDocument(newPath);
            await vscode.window.showTextDocument(doc);
          }
        } else if (choice === 'Replace requirements.txt') {
          fs.writeFileSync(requirementsPath, convertedContent);
          vscode.window.showInformationMessage(`✅ Updated requirements.txt with CVE-remediated versions`);
        }
      });
    })
  );
}

async function showDiffPreview(originalDoc: vscode.TextDocument, convertedContent: string) {
  // Create a temporary document with converted content
  const convertedDoc = await vscode.workspace.openTextDocument({
    content: convertedContent,
    language: 'dockerfile'
  });

  // Show diff view
  await vscode.commands.executeCommand(
    'vscode.diff',
    originalDoc.uri,
    convertedDoc.uri,
    `Chainguard Conversion Preview: ${originalDoc.fileName}`
  );
}

export function deactivate() {
  console.log('Chainguard Dockerfile Converter deactivated');

  // Stop crystal-ball server
  if (crystalBallClient) {
    crystalBallClient.stop();
  }

  // Dispose hover provider resources
  HoverProvider.dispose();
}

// Export for use in other modules
export function getCrystalBallClient(): CrystalBallClient | undefined {
  return crystalBallClient;
}
