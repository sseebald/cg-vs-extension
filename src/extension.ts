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
