/*
 * Main Dockerfile converter - ports dfc logic to TypeScript
 * Based on: https://github.com/chainguard-dev/dfc
 *
 * Enhanced with crystal-ball integration for intelligent image matching
 */

import { MappingsConfig, ConversionResult, Change, ConversionOptions } from '../types';
import { loadMappings } from '../mappings/loader';
import { CrystalBallClient } from '../services/crystal-ball-client';

export class DockerfileConverter {
  private mappings: MappingsConfig;
  private org: string;
  private crystalBall?: CrystalBallClient;

  constructor(options: ConversionOptions = {}, crystalBall?: CrystalBallClient) {
    this.org = options.org || 'ORG';
    this.mappings = options.customMappings || loadMappings();
    this.crystalBall = crystalBall;
  }

  /**
   * Convert entire Dockerfile content
   */
  convert(content: string): ConversionResult {
    const lines = content.split('\n');
    const converted: string[] = [];
    const changes: Change[] = [];

    let needsUserRoot = false;
    let stageHasRun = false;
    let currentStageStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // FROM conversion
      if (trimmed.toUpperCase().startsWith('FROM')) {
        // Check if upcoming stage has RUN commands
        stageHasRun = this.checkStageHasRun(lines, i);
        currentStageStart = i;
        needsUserRoot = false;

        const convertedFrom = this.convertFrom(line, stageHasRun);
        converted.push(convertedFrom);

        if (line !== convertedFrom) {
          changes.push({ line: i, old: line, new: convertedFrom, type: 'from' });
        }
        continue;
      }

      // RUN conversion
      if (trimmed.toUpperCase().startsWith('RUN')) {
        // Handle multi-line RUN commands with backslash continuation
        const { fullCommand, lineCount } = this.readMultilineCommand(lines, i);
        const result = this.convertRun(fullCommand);

        // Add USER root before first package install
        if (result.needsRoot && !needsUserRoot) {
          converted.push('USER root');
          changes.push({ line: i, old: '', new: 'USER root', type: 'user' });
          needsUserRoot = true;
        }

        // Split converted command back into multiple lines if original was multi-line
        const convertedLines = this.formatMultilineCommand(result.converted, lineCount);
        convertedLines.forEach(l => converted.push(l));

        if (fullCommand.trim() !== result.converted.trim()) {
          changes.push({ line: i, old: fullCommand, new: result.converted, type: 'run' });
        }

        // Skip the continuation lines we already processed
        i += lineCount - 1;
        continue;
      }

      // User/group management conversion
      if (trimmed.includes('useradd') || trimmed.includes('groupadd')) {
        const convertedUser = this.convertUserManagement(line);
        converted.push(convertedUser);

        if (line !== convertedUser) {
          changes.push({ line: i, old: line, new: convertedUser, type: 'user' });
        }
        continue;
      }

      // Pass through unchanged
      converted.push(line);
    }

    return {
      original: content,
      converted: converted.join('\n'),
      changes
    };
  }

  /**
   * Convert a FROM instruction
   * Rule: Rewrite registry path and apply tag conversions
   */
  private convertFrom(line: string, hasRun: boolean): string {
    const match = line.match(/^(\s*)FROM\s+([^\s:]+)(?::([^\s]+))?(\s+[Aa][Ss]\s+\S+)?(\s*)$/);
    if (!match) {
      return line;
    }

    const [, indent, image, tag, alias, trailing] = match;

    // Look up image mapping (with wildcard support)
    const lookupKey = tag ? `${image}:${tag}` : image;
    const mappedImage = this.findImageMapping(lookupKey, image);

    // Extract just the image name (remove :version if present in mapping)
    const [mappedImageName] = mappedImage.split(':');

    // Convert tag per dfc rules
    const newTag = this.convertTag(tag, image, mappedImage, hasRun);

    return `${indent}FROM cgr.dev/${this.org}/${mappedImageName}:${newTag}${alias || ''}${trailing || ''}`;
  }

  /**
   * Find image mapping with wildcard support
   * Examples:
   *   - "golang" matches "golang*" → "go"
   *   - "nodejs" matches "nodejs*" → "node"
   *   - "golang:1.20" exact match takes precedence over wildcard
   */
  private findImageMapping(lookupKey: string, baseImage: string): string {
    // Try exact match first (with tag)
    if (this.mappings.images[lookupKey]) {
      return this.mappings.images[lookupKey];
    }

    // Try exact match without tag
    if (this.mappings.images[baseImage]) {
      return this.mappings.images[baseImage];
    }

    // Try wildcard matches (e.g., "golang*", "nodejs*")
    for (const [pattern, target] of Object.entries(this.mappings.images)) {
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        if (baseImage.startsWith(prefix)) {
          return target;
        }
      }
    }

    // No mapping found, return original
    return baseImage;
  }

  /**
   * Convert tag based on dfc rules:
   * 1. chainguard-base always uses 'latest'
   * 2. No tag or non-semantic → 'latest' (+ -dev if needed)
   * 3. Semantic version → truncate to major.minor
   * 4. Add -dev suffix when stage has RUN commands
   */
  private convertTag(tag: string | undefined, baseImage: string, mappedImage: string, hasRun: boolean): string {
    // Rule 1: chainguard-base always uses 'latest'
    if (mappedImage.includes('chainguard-base')) {
      return 'latest';
    }

    // Rule 2: No tag or non-semantic → 'latest'
    if (!tag || tag === 'latest') {
      return hasRun ? 'latest-dev' : 'latest';
    }

    // Extract version and suffix (e.g., "18-alpine" → version="18", suffix="alpine")
    const versionMatch = tag.match(/^(\d+(?:\.\d+)*)(?:-(.+))?$/);
    if (!versionMatch) {
      return hasRun ? 'latest-dev' : 'latest';
    }

    const [, version] = versionMatch;

    // Rule 3: Truncate semantic version to major.minor
    const parts = version.split('.');
    const truncated = parts.slice(0, 2).join('.');

    // Rule 4: Add -dev if stage has RUN commands
    return hasRun ? `${truncated}-dev` : truncated;
  }

  /**
   * Check if a version string is semantic (e.g., 1.2.3, 14.17, etc.)
   */
  private isSemanticVersion(tag: string): boolean {
    // Remove common suffixes
    const cleaned = tag.replace(/-alpine|-slim|-bullseye|-buster|-fpm|-cli|-dev$/g, '');
    return /^\d+(\.\d+)*$/.test(cleaned);
  }

  /**
   * Check if a stage has RUN commands
   */
  private checkStageHasRun(lines: string[], fromIndex: number): boolean {
    for (let i = fromIndex + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim().toUpperCase();
      if (trimmed.startsWith('FROM')) {
        break; // Next stage
      }
      if (trimmed.startsWith('RUN')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Convert RUN instruction with package manager commands
   */
  private convertRun(line: string): { converted: string; needsRoot: boolean } {
    const trimmed = line.trim();

    // First, handle user/group management if present
    let converted = line;
    if (trimmed.includes('useradd') || trimmed.includes('groupadd')) {
      converted = this.convertUserManagement(converted);
    }

    // apt-get pattern (check with regex to handle flags like -y)
    if (/(?:apt-get|apt)\s+.*install/.test(converted)) {
      const packages = this.extractAptPackages(converted);
      if (packages.length > 0) {
        const mapped = this.mapPackages(packages, 'debian');
        const indent = converted.match(/^(\s*)/)?.[1] || '';
        return {
          converted: `${indent}RUN apk add --no-cache ${mapped.join(' ')}`,
          needsRoot: true
        };
      }
    }

    // dnf/yum pattern (check with regex to handle flags like -y)
    if (/(?:dnf|yum|microdnf)\s+.*install/.test(converted)) {
      const packages = this.extractDnfPackages(converted);
      if (packages.length > 0) {
        const mapped = this.mapPackages(packages, 'fedora');
        const indent = converted.match(/^(\s*)/)?.[1] || '';
        return {
          converted: `${indent}RUN apk add --no-cache ${mapped.join(' ')}`,
          needsRoot: true
        };
      }
    }

    // apt-get/dnf update or clean commands - remove them (not needed with apk)
    if (converted.includes('apt-get update') || converted.includes('apt update') ||
        converted.includes('dnf -y update') || converted.includes('yum update') ||
        converted.includes('dnf clean') || converted.includes('yum clean') ||
        converted.includes('rm -rf /var/lib/apt/lists')) {
      // If it's just an update/clean line with nothing else, skip it
      if (converted.trim().match(/^RUN\s+(apt-get|apt|dnf|yum)\s+(-y\s+)?(update|clean)(\s+all)?(\s*&&\s*)?$/)) {
        return { converted: '', needsRoot: false };
      }
      // If there's more after update/clean, remove those parts
      const cleaned = converted
        .replace(/apt-get\s+update\s*&&\s*/g, '')
        .replace(/apt\s+update\s*&&\s*/g, '')
        .replace(/dnf\s+-y\s+update\s*&&\s*/g, '')
        .replace(/yum\s+update\s*&&\s*/g, '')
        .replace(/\s*&&\s*dnf\s+clean\s+all/g, '')
        .replace(/\s*&&\s*yum\s+clean\s+all/g, '')
        .replace(/\s*&&\s*rm\s+-rf\s+\/var\/lib\/apt\/lists\/?\*?/g, '');

      if (cleaned !== converted) {
        return this.convertRun(cleaned);
      }
    }

    // If we made useradd/groupadd changes but no package manager changes, return the converted line
    if (converted !== line) {
      return { converted, needsRoot: false };
    }

    return { converted: line, needsRoot: false };
  }

  /**
   * Extract package names from apt-get install command
   */
  private extractAptPackages(line: string): string[] {
    // Match: apt-get install -y pkg1 pkg2 pkg3
    // Handle continuation with backslash
    const match = line.match(/(?:apt-get|apt)\s+install\s+(?:-y\s+)?(.+?)(?:\s*(?:&&|\\|$))/);
    if (!match) return [];

    return match[1]
      .trim()
      .split(/\s+/)
      .filter(p => p && p !== '-y' && !p.startsWith('-') && p !== '\\');
  }

  /**
   * Extract package names from dnf/yum install command
   */
  private extractDnfPackages(line: string): string[] {
    // Match: dnf install -y pkg1 pkg2 pkg3
    // Handle continuation with backslash
    const match = line.match(/(?:dnf|yum|microdnf)\s+(?:-y\s+)?install\s+(?:-y\s+)?(.+?)(?:\s*(?:&&|\\|$))/);
    if (!match) return [];

    return match[1]
      .trim()
      .split(/\s+/)
      .filter(p => p && p !== '-y' && !p.startsWith('-') && p !== '\\');
  }

  /**
   * Map package names from source distro to Wolfi
   */
  private mapPackages(packages: string[], distro: string): string[] {
    return packages.map(pkg => {
      const mapping = this.mappings.packages[distro]?.[pkg];
      if (mapping && mapping.length > 0) {
        return mapping[0]; // Use first mapping
      }
      return pkg; // Use original if no mapping
    });
  }

  /**
   * Convert user/group management commands
   * Note: Chainguard images already have a 'nonroot' user (UID 65532)
   * Best practice is to use that instead of creating new users
   */
  private convertUserManagement(line: string): string {
    let converted = line;

    // useradd -r → adduser -S (Busybox system user flag)
    // Note: This requires being root and may fail without shadow package
    converted = converted.replace(/useradd\s+-r\s+/g, 'adduser -S ');

    // useradd → adduser -D (Busybox no-password user)
    // Note: -D creates user without password (Busybox default)
    converted = converted.replace(/useradd\s+/g, 'adduser -D ');

    // groupadd → addgroup
    converted = converted.replace(/groupadd\s+/g, 'addgroup ');

    return converted;
  }

  /**
   * Read a multi-line command that uses backslash continuation
   */
  private readMultilineCommand(lines: string[], startIndex: number): { fullCommand: string; lineCount: number } {
    let fullCommand = lines[startIndex];
    let lineCount = 1;

    // Check if line ends with backslash
    while (startIndex + lineCount < lines.length && fullCommand.trimEnd().endsWith('\\')) {
      // Remove the backslash and add the next line
      fullCommand = fullCommand.trimEnd().slice(0, -1) + ' ' + lines[startIndex + lineCount].trim();
      lineCount++;
    }

    return { fullCommand, lineCount };
  }

  /**
   * Format a converted command back into multiple lines if needed
   */
  private formatMultilineCommand(command: string, originalLineCount: number): string[] {
    // If original was single line, return as single line
    if (originalLineCount === 1) {
      return [command];
    }

    // For multi-line, try to keep similar formatting
    // Extract the RUN prefix and the rest
    const match = command.match(/^(\s*RUN\s+)(.+)$/s);
    if (!match) {
      return [command];
    }

    const [, prefix, rest] = match;

    // If the command is now simple enough, keep it on one line
    if (rest.length < 80 && !rest.includes('&&')) {
      return [command];
    }

    // Otherwise, format with backslash continuation
    const result: string[] = [];
    const indent = prefix.match(/^(\s*)/)?.[1] || '';

    // Split on && and keep each part on its own line
    const parts = rest.split('&&').map(p => p.trim()).filter(p => p);

    if (parts.length === 1) {
      // No && chains, just return as is
      return [command];
    }

    // First part on the same line as RUN
    result.push(`${prefix}${parts[0]} \\`);

    // Middle parts with indentation and backslash
    for (let i = 1; i < parts.length - 1; i++) {
      result.push(`${indent}    && ${parts[i]} \\`);
    }

    // Last part without backslash
    result.push(`${indent}    && ${parts[parts.length - 1]}`);

    return result;
  }
}
