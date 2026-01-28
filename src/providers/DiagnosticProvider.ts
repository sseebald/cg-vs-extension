/*
 * Diagnostic Provider - highlights non-Chainguard images
 */

import * as vscode from 'vscode';
import { DockerfileConverter } from '../converter/DockerfileConverter';

export class DiagnosticProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private converter: DockerfileConverter;

  constructor(context: vscode.ExtensionContext) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('chainguard');
    this.converter = new DockerfileConverter();

    context.subscriptions.push(this.diagnosticCollection);

    // Update diagnostics on document changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        if (this.isDockerfile(event.document)) {
          this.updateDiagnostics(event.document);
        }
      })
    );

    // Update diagnostics on document open
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(document => {
        if (this.isDockerfile(document)) {
          this.updateDiagnostics(document);
        }
      })
    );

    // Update all open Dockerfiles
    vscode.workspace.textDocuments.forEach(document => {
      if (this.isDockerfile(document)) {
        this.updateDiagnostics(document);
      }
    });
  }

  private isDockerfile(document: vscode.TextDocument): boolean {
    return document.languageId === 'dockerfile' ||
           document.fileName.toLowerCase().includes('dockerfile');
  }

  private getRunDiagnosticMessage(oldLine: string, newLine: string): string {
    if (oldLine.includes('apt-get') || oldLine.includes('apt install')) {
      return 'Can convert apt packages to apk (Chainguard uses Wolfi/Alpine)';
    }
    if (oldLine.includes('dnf') || oldLine.includes('yum') || oldLine.includes('microdnf')) {
      return 'Can convert dnf/yum packages to apk (Chainguard uses Wolfi/Alpine)';
    }
    if (oldLine.includes('useradd') || oldLine.includes('groupadd')) {
      return 'Chainguard images already have a nonroot user - hover for alternatives';
    }
    return 'Can optimize for Chainguard';
  }

  private updateDiagnostics(document: vscode.TextDocument): void {
    const config = vscode.workspace.getConfiguration('chainguard');
    if (!config.get('enableDiagnostics', true)) {
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    const org = config.get<string>('org', 'chainguard');
    this.converter = new DockerfileConverter({ org });

    const result = this.converter.convert(document.getText());
    const diagnostics: vscode.Diagnostic[] = [];

    console.log(`[Chainguard] Processing ${document.fileName}: ${result.changes.length} changes detected`);

    result.changes.forEach(change => {
      console.log(`[Chainguard] Change: type=${change.type}, line=${change.line}, old="${change.old.substring(0, 50)}..."`);

      if (change.type === 'from' && change.old.trim().toUpperCase().startsWith('FROM')) {
        const range = document.lineAt(change.line).range;
        const diagnostic = new vscode.Diagnostic(
          range,
          'Chainguard image available (0 CVEs, daily rebuilds)',
          vscode.DiagnosticSeverity.Information
        );
        diagnostic.code = 'chainguard-available';
        diagnostic.source = 'Chainguard';
        diagnostics.push(diagnostic);
      }

      if (change.type === 'run') {
        console.log(`[Chainguard] RUN change detected:`);
        console.log(`  old: "${change.old}"`);
        console.log(`  new: "${change.new}"`);
        console.log(`  old.trim() !== new.trim(): ${change.old.trim() !== change.new.trim()}`);

        if (change.old && change.old.trim() !== change.new.trim()) {
          console.log(`[Chainguard] Adding diagnostic for RUN line ${change.line}`);
          const range = document.lineAt(change.line).range;
          const message = this.getRunDiagnosticMessage(change.old, change.new);
          const diagnostic = new vscode.Diagnostic(
            range,
            message,
            vscode.DiagnosticSeverity.Information
          );
          diagnostic.code = 'chainguard-package-convert';
          diagnostic.source = 'Chainguard';
          diagnostics.push(diagnostic);
          console.log(`[Chainguard] Diagnostic added: "${message}"`);
        }
      }

      if (change.type === 'user' && change.old === '') {
        // USER root was auto-injected
        const range = document.lineAt(change.line).range;
        const diagnostic = new vscode.Diagnostic(
          range,
          'USER root needed for package installation in Chainguard images',
          vscode.DiagnosticSeverity.Hint
        );
        diagnostic.code = 'chainguard-user-root';
        diagnostic.source = 'Chainguard';
        diagnostics.push(diagnostic);
      }
    });

    console.log(`[Chainguard] Setting ${diagnostics.length} diagnostics on document`);
    diagnostics.forEach(d => {
      console.log(`  - Line ${d.range.start.line}: ${d.message} (code: ${d.code})`);
    });

    this.diagnosticCollection.set(document.uri, diagnostics);
  }
}
