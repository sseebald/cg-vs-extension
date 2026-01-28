/*
 * Code Action Provider - quick fixes for converting to Chainguard
 */

import * as vscode from 'vscode';
import { DockerfileConverter } from '../converter/DockerfileConverter';

export class CodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] | undefined {
    // Check for Chainguard diagnostics
    const hasImageDiagnostic = context.diagnostics.some(
      d => d.code === 'chainguard-available'
    );
    const hasPackageDiagnostic = context.diagnostics.some(
      d => d.code === 'chainguard-package-convert'
    );

    if (!hasImageDiagnostic && !hasPackageDiagnostic) {
      return;
    }

    const line = document.lineAt(range.start.line);
    const lineText = line.text.trim();

    const actions: vscode.CodeAction[] = [];

    if (lineText.toUpperCase().startsWith('FROM')) {
      actions.push(this.createConvertFromAction(document, line));
      actions.push(this.createConvertDockerfileAction(document));
    }

    if (lineText.toUpperCase().startsWith('RUN') &&
        (lineText.includes('apt-get') || lineText.includes('apt install') ||
         lineText.includes('dnf') || lineText.includes('yum') || lineText.includes('microdnf'))) {
      actions.push(this.createConvertRunAction(document, line));
      actions.push(this.createConvertDockerfileAction(document));
    }

    return actions.length > 0 ? actions : undefined;
  }

  private createConvertFromAction(document: vscode.TextDocument, line: vscode.TextLine): vscode.CodeAction {
    const config = vscode.workspace.getConfiguration('chainguard');
    const org = config.get<string>('org', 'chainguard');
    const converter = new DockerfileConverter({ org });

    const action = new vscode.CodeAction(
      '🔒 Convert to Chainguard image',
      vscode.CodeActionKind.QuickFix
    );
    action.isPreferred = true;

    // Convert just this line
    const result = converter.convert(line.text);
    const converted = result.converted.trim();

    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(document.uri, line.range, converted);

    return action;
  }

  private createConvertRunAction(document: vscode.TextDocument, line: vscode.TextLine): vscode.CodeAction {
    const config = vscode.workspace.getConfiguration('chainguard');
    const org = config.get<string>('org', 'chainguard');
    const converter = new DockerfileConverter({ org });

    const action = new vscode.CodeAction(
      '📦 Convert packages to apk (Wolfi/Alpine)',
      vscode.CodeActionKind.QuickFix
    );
    action.isPreferred = true;

    // Read multi-line command if it has backslash continuations
    const { fullCommand, lineCount } = this.readMultilineCommand(document, line.lineNumber);

    // Convert the full multi-line command
    const result = converter.convert(fullCommand);
    const converted = result.converted.trim();

    // Replace the entire range (all continuation lines)
    const endLine = line.lineNumber + lineCount - 1;
    const endLineObj = document.lineAt(endLine);
    const replaceRange = new vscode.Range(
      line.range.start,
      endLineObj.range.end
    );

    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(document.uri, replaceRange, converted);

    return action;
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

  private createConvertDockerfileAction(document: vscode.TextDocument): vscode.CodeAction {
    const action = new vscode.CodeAction(
      '🔒 Convert entire Dockerfile to Chainguard',
      vscode.CodeActionKind.QuickFix
    );

    action.command = {
      command: 'chainguard.convertDockerfile',
      title: 'Convert Dockerfile',
      arguments: [document]
    };

    return action;
  }
}
