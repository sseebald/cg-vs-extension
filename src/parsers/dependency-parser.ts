import * as fs from 'fs';
import * as path from 'path';
import { PackageReference } from '../types';

/**
 * Parse requirements.txt file
 * Format:
 *   requests==2.28.1
 *   flask>=2.0.0
 *   django[postgres]
 *   -r base.txt  (nested requirements - skipped for now)
 */
export async function parseRequirementsTxt(filePath: string): Promise<PackageReference[]> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const packages: PackageReference[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines, comments, and flags
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) {
        continue;
      }

      // Parse package name and version
      // Format: package_name[extras]==version or package_name>=version
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)(\[([^\]]+)\])?(==|>=|<=|>|<|~=)?(.+)?/);
      if (!match) {
        continue;
      }

      packages.push({
        name: match[1],
        version: match[5]?.trim() || undefined,
        extras: match[3] ? match[3].split(',').map(e => e.trim()) : undefined
      });
    }

    return packages;
  } catch (error: any) {
    console.warn(`[Chainguard] Failed to parse requirements.txt: ${error.message}`);
    return [];
  }
}

/**
 * Parse package.json file
 * Format: { "dependencies": { "express": "^4.18.0" } }
 */
export async function parsePackageJson(filePath: string): Promise<PackageReference[]> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const json = JSON.parse(content);
    const packages: PackageReference[] = [];

    // Parse dependencies
    const deps = json.dependencies || {};
    for (const [name, version] of Object.entries(deps)) {
      packages.push({
        name,
        version: version as string
      });
    }

    // Include devDependencies if present
    const devDeps = json.devDependencies || {};
    for (const [name, version] of Object.entries(devDeps)) {
      packages.push({
        name,
        version: version as string
      });
    }

    return packages;
  } catch (error: any) {
    console.warn(`[Chainguard] Failed to parse package.json: ${error.message}`);
    return [];
  }
}

/**
 * Parse pom.xml file
 * Format: <dependency><artifactId>spring-boot</artifactId></dependency>
 */
export async function parsePomXml(filePath: string): Promise<PackageReference[]> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const packages: PackageReference[] = [];

    // Simple regex-based parsing (no XML parser needed for MVP)
    // Match: <artifactId>NAME</artifactId>
    const artifactMatches = content.matchAll(/<artifactId>([^<]+)<\/artifactId>/g);

    for (const match of artifactMatches) {
      packages.push({
        name: match[1]
      });
    }

    return packages;
  } catch (error: any) {
    console.warn(`[Chainguard] Failed to parse pom.xml: ${error.message}`);
    return [];
  }
}

/**
 * Parse build.gradle file
 * Format: implementation 'org.springframework.boot:spring-boot-starter'
 */
export async function parseBuildGradle(filePath: string): Promise<PackageReference[]> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const packages: PackageReference[] = [];

    // Match: implementation 'group:artifact:version' or implementation "group:artifact:version"
    const depMatches = content.matchAll(/implementation\s+['"]([^:'"]+):([^:'"]+)/g);

    for (const match of depMatches) {
      packages.push({
        name: `${match[1]}:${match[2]}`
      });
    }

    return packages;
  } catch (error: any) {
    console.warn(`[Chainguard] Failed to parse build.gradle: ${error.message}`);
    return [];
  }
}

/**
 * Main dispatcher - parse any supported dependency file
 */
export async function parseDependencyFile(
  filePath: string,
  ecosystem: string
): Promise<PackageReference[]> {
  const fileName = path.basename(filePath);

  switch (ecosystem) {
    case 'python':
      if (fileName.endsWith('.txt')) {
        return await parseRequirementsTxt(filePath);
      }
      break;

    case 'javascript':
      if (fileName === 'package.json') {
        return await parsePackageJson(filePath);
      }
      break;

    case 'java':
      if (fileName === 'pom.xml') {
        return await parsePomXml(filePath);
      }
      if (fileName.startsWith('build.gradle')) {
        return await parseBuildGradle(filePath);
      }
      break;
  }

  return [];
}
