/*
 * Crystal Ball Client - HTTP client for crystal-ball image matching service
 *
 * Crystal Ball is Chainguard's package equivalence matching system that provides
 * sophisticated package mapping and image recommendations with coverage scoring.
 *
 * Architecture:
 * - Spawns crystal-ball HTTP server as child process
 * - Communicates via REST API (PUT /api/v3/match/{arch}/{dist}/{version})
 * - Gracefully degrades to static mappings if unavailable
 *
 * Sources:
 * - crystal-ball/cmd/match/main.go:107-126 (server command)
 * - crystal-ball/pkg/match/server/server.go:32-138 (HTTP server implementation)
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface CrystalBallMatch {
  imageRef: string;
  coverage: number; // 0.0-1.0
  probabilityScore: number; // 0-100
  satisfiedCount: number;
  totalRequired: number;
  extraPackages: number;
  satisfiedPackages?: Array<{name: string; weight: number}>;
  missingPackages?: Array<{name: string; weight: number}>;
}

export interface CrystalBallResult {
  totalExternalPackages: number;
  requiredAPKs: string[];
  topImages: CrystalBallMatch[];
  unmatchedExternalPkgs?: string[];
}

interface SBOMComponent {
  name: string;
  version?: string;
  purl?: string; // e.g., pkg:deb/debian/curl@7.88.1
}

export class CrystalBallClient {
  private serverProcess: ChildProcess | null = null;
  private serverReady: boolean = false;
  private readonly serverPort: number = 8080;
  private readonly serverUrl: string = `http://localhost:${this.serverPort}`;
  private readonly binaryPath: string;
  private readonly dbPath: string;
  private readonly extensionPath: string;

  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
    this.binaryPath = path.join(extensionPath, 'crystal-ball', 'match');
    this.dbPath = path.join(extensionPath, 'crystal-ball', 'crystal-ball.db');
  }

  /**
   * Check if crystal-ball binary and database exist
   */
  isAvailable(): boolean {
    const hasBinary = fs.existsSync(this.binaryPath);
    const hasDb = fs.existsSync(this.dbPath);

    if (!hasBinary) {
      console.log('[Chainguard] crystal-ball binary not found at:', this.binaryPath);
    }
    if (!hasDb) {
      console.log('[Chainguard] crystal-ball database not found at:', this.dbPath);
    }

    return hasBinary && hasDb;
  }

  /**
   * Start the crystal-ball HTTP server
   */
  async start(): Promise<boolean> {
    if (!this.isAvailable()) {
      console.log('[Chainguard] Crystal Ball not available, using static mappings');
      return false;
    }

    if (this.serverProcess) {
      console.log('[Chainguard] Crystal Ball server already running');
      return true;
    }

    try {
      console.log('[Chainguard] Starting crystal-ball server...');

      // Spawn server: ./match server --addr :8080 --db crystal-ball.db
      this.serverProcess = spawn(
        this.binaryPath,
        ['server', '--addr', `:${this.serverPort}`, '--db', this.dbPath],
        {
          cwd: path.dirname(this.binaryPath),
          stdio: ['ignore', 'pipe', 'pipe']
        }
      );

      // Log server output
      this.serverProcess.stdout?.on('data', (data) => {
        console.log('[Chainguard] crystal-ball:', data.toString().trim());
      });

      this.serverProcess.stderr?.on('data', (data) => {
        console.error('[Chainguard] crystal-ball error:', data.toString().trim());
      });

      this.serverProcess.on('exit', (code) => {
        console.log(`[Chainguard] crystal-ball server exited with code ${code}`);
        this.serverProcess = null;
        this.serverReady = false;
      });

      // Wait for server to be ready (max 5 seconds)
      const ready = await this.waitForServer(5000);
      if (ready) {
        console.log('[Chainguard] Crystal Ball server ready');
        this.serverReady = true;
        return true;
      } else {
        console.error('[Chainguard] Crystal Ball server failed to start');
        this.stop();
        return false;
      }
    } catch (error: any) {
      console.error('[Chainguard] Failed to start crystal-ball server:', error.message);
      return false;
    }
  }

  /**
   * Stop the crystal-ball server
   */
  stop(): void {
    if (this.serverProcess) {
      console.log('[Chainguard] Stopping crystal-ball server...');
      this.serverProcess.kill();
      this.serverProcess = null;
      this.serverReady = false;
    }
  }

  /**
   * Wait for server to become ready
   */
  private async waitForServer(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`${this.serverUrl}/api/v3/match/amd64/debian/bookworm`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bomFormat: 'CycloneDX',
            specVersion: '1.4',
            components: []
          })
        });

        if (response.ok || response.status === 400) {
          // 400 is expected for empty SBOM, but means server is up
          return true;
        }
      } catch (error) {
        // Server not ready yet, wait and retry
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return false;
  }

  /**
   * Health check - verify server is running
   */
  async healthCheck(): Promise<boolean> {
    if (!this.serverReady) {
      return false;
    }

    try {
      // Simple health check with minimal SBOM
      const response = await fetch(`${this.serverUrl}/api/v3/match/amd64/debian/bookworm`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bomFormat: 'CycloneDX',
          specVersion: '1.4',
          components: []
        })
      });

      return response.ok || response.status === 400;
    } catch (error) {
      console.error('[Chainguard] Crystal Ball health check failed:', error);
      return false;
    }
  }

  /**
   * Match a Docker image to find best Chainguard equivalent
   *
   * @param imageName - Docker image (e.g., "node:18-alpine", "python:3.9-slim")
   * @param packages - Optional package list to match
   * @returns Crystal Ball match result or null if unavailable
   */
  async matchImage(
    imageName: string,
    packages?: string[]
  ): Promise<CrystalBallResult | null> {
    if (!this.serverReady) {
      console.log('[Chainguard] Crystal Ball not ready, skipping match');
      return null;
    }

    try {
      // Parse image to determine distribution
      const distInfo = this.parseImageDistribution(imageName);
      if (!distInfo) {
        console.log('[Chainguard] Could not determine distribution for:', imageName);
        return null;
      }

      // Create minimal SBOM for the image
      const sbom = this.createSBOM(distInfo.name, distInfo.version, packages || []);

      // Call crystal-ball API
      const url = `${this.serverUrl}/api/v3/match/${distInfo.arch}/${distInfo.dist}/${distInfo.distVersion}`;

      console.log(`[Chainguard] Matching ${imageName} via crystal-ball:`, url);

      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sbom)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Chainguard] Crystal Ball match failed:', response.status, errorText);
        return null;
      }

      const result = await response.json() as CrystalBallResult;
      console.log(`[Chainguard] Crystal Ball found ${result.topImages.length} matches for ${imageName}`);

      return result;
    } catch (error: any) {
      console.error('[Chainguard] Crystal Ball match error:', error.message);
      return null;
    }
  }

  /**
   * Parse Docker image name to determine distribution, version, and arch
   *
   * Examples:
   * - "node:18-alpine" -> { dist: "alpine", distVersion: "3.18", arch: "amd64" }
   * - "python:3.9-slim" -> { dist: "debian", distVersion: "bookworm", arch: "amd64" }
   * - "ubuntu:22.04" -> { dist: "ubuntu", distVersion: "jammy", arch: "amd64" }
   */
  private parseImageDistribution(imageName: string): {
    name: string;
    version: string;
    dist: string;
    distVersion: string;
    arch: string;
  } | null {
    const [name, tag] = imageName.split(':');

    // Alpine-based images
    if (tag?.includes('alpine')) {
      return {
        name,
        version: tag,
        dist: 'alpine',
        distVersion: '3.20', // Default to latest stable
        arch: 'amd64'
      };
    }

    // Debian slim/bullseye/bookworm
    if (tag?.includes('slim') || tag?.includes('bullseye') || tag?.includes('bookworm')) {
      const distVersion = tag.includes('bullseye') ? 'bullseye' :
                         tag.includes('bookworm') ? 'bookworm' : 'bookworm';
      return {
        name,
        version: tag,
        dist: 'debian',
        distVersion,
        arch: 'amd64'
      };
    }

    // Ubuntu
    if (name === 'ubuntu' || tag?.includes('ubuntu')) {
      const distVersion = tag?.includes('20.04') ? 'focal' :
                         tag?.includes('22.04') ? 'jammy' :
                         tag?.includes('24.04') ? 'noble' : 'jammy';
      return {
        name,
        version: tag || 'latest',
        dist: 'ubuntu',
        distVersion,
        arch: 'amd64'
      };
    }

    // Default to Debian bookworm for common base images
    if (['python', 'node', 'ruby', 'php', 'java', 'golang', 'rust'].includes(name)) {
      return {
        name,
        version: tag || 'latest',
        dist: 'debian',
        distVersion: 'bookworm',
        arch: 'amd64'
      };
    }

    return null;
  }

  /**
   * Create a minimal CycloneDX SBOM for crystal-ball matching
   *
   * Format based on: crystal-ball/pkg/match/server/server.go:96-102
   */
  private createSBOM(
    name: string,
    version: string,
    packages: string[]
  ): any {
    const components: SBOMComponent[] = packages.map(pkg => {
      // Simple package name for now
      // In full implementation, would include version and proper PURL
      return {
        name: pkg,
        purl: `pkg:generic/${pkg}`
      };
    });

    return {
      bomFormat: 'CycloneDX',
      specVersion: '1.4',
      metadata: {
        component: {
          name,
          version,
          type: 'container'
        }
      },
      components
    };
  }

  /**
   * Get best Chainguard image match for a given image
   * Returns the top recommendation or null
   */
  async getBestMatch(imageName: string): Promise<string | null> {
    const result = await this.matchImage(imageName);

    if (!result || result.topImages.length === 0) {
      return null;
    }

    // Return highest scoring image
    return result.topImages[0].imageRef;
  }
}
