/*
 * Grype CVE Scanner - scans Docker images for vulnerabilities
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CVEScanResult {
  image: string;
  cveCount: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  negligible: number;
  scanning: boolean;
  error?: string;
  scannedAt?: Date;
}

// Cache scan results (24 hour TTL)
const scanCache = new Map<string, CVEScanResult>();
const SCAN_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

/**
 * Check if grype is installed
 */
export async function isGrypeInstalled(): Promise<boolean> {
  try {
    await execAsync('grype version');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Scan a Docker image for CVEs using grype
 */
export async function scanImage(image: string): Promise<CVEScanResult> {
  // Check cache first
  const cached = scanCache.get(image);
  if (cached && cached.scannedAt) {
    const age = Date.now() - cached.scannedAt.getTime();
    if (age < SCAN_CACHE_TTL) {
      console.log(`[Chainguard] Using cached scan for ${image}`);
      return cached;
    }
  }

  // Return in-progress if already scanning
  if (cached?.scanning) {
    return cached;
  }

  // Mark as scanning
  const inProgress: CVEScanResult = {
    image,
    cveCount: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    negligible: 0,
    scanning: true
  };
  scanCache.set(image, inProgress);

  console.log(`[Chainguard] Starting grype scan for ${image}...`);

  try {
    // Check if grype is installed
    const hasGrype = await isGrypeInstalled();
    if (!hasGrype) {
      const result: CVEScanResult = {
        image,
        cveCount: -1,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        negligible: 0,
        scanning: false,
        error: 'grype not installed'
      };
      scanCache.set(image, result);
      return result;
    }

    // Run grype scan with JSON output
    // Note: If image requires auth, this will timeout trying to authenticate interactively
    const { stdout } = await execAsync(`grype ${image} -o json --quiet`, {
      timeout: 60000, // 1 minute timeout (shorter to fail fast on auth issues)
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    const scanData = JSON.parse(stdout);
    const matches = scanData.matches || [];

    // Count CVEs by severity
    const counts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      negligible: 0
    };

    matches.forEach((match: any) => {
      const severity = (match.vulnerability?.severity || '').toLowerCase();
      if (severity in counts) {
        counts[severity as keyof typeof counts]++;
      }
    });

    const result: CVEScanResult = {
      image,
      cveCount: matches.length,
      ...counts,
      scanning: false,
      scannedAt: new Date()
    };

    scanCache.set(image, result);
    console.log(`[Chainguard] Scan complete for ${image}: ${result.cveCount} CVEs`);

    return result;
  } catch (error: any) {
    console.error(`[Chainguard] Grype scan failed for ${image}:`, error.message);

    // Check if it's an authentication error
    let errorMessage = error.message;
    if (error.message.includes('Authenticating') ||
        error.message.includes('authentication') ||
        error.message.includes('unauthorized') ||
        error.message.includes('denied')) {
      errorMessage = 'Authentication required. Run: chainctl auth login';
      console.error(`[Chainguard] Authentication required for ${image}. Run 'chainctl auth login' or 'docker login cgr.dev'`);
    }

    const result: CVEScanResult = {
      image,
      cveCount: -1,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      negligible: 0,
      scanning: false,
      error: errorMessage
    };

    scanCache.set(image, result);
    return result;
  }
}

/**
 * Scan multiple images in parallel
 */
export async function scanImages(images: string[]): Promise<Map<string, CVEScanResult>> {
  const results = new Map<string, CVEScanResult>();

  // Scan in parallel (max 3 concurrent)
  const chunks = [];
  for (let i = 0; i < images.length; i += 3) {
    chunks.push(images.slice(i, i + 3));
  }

  for (const chunk of chunks) {
    const scans = await Promise.all(chunk.map(img => scanImage(img)));
    scans.forEach(result => results.set(result.image, result));
  }

  return results;
}

/**
 * Get cached scan result without triggering new scan
 */
export function getCachedScan(image: string): CVEScanResult | null {
  return scanCache.get(image) || null;
}

/**
 * Clear scan cache
 */
export function clearScanCache(): void {
  scanCache.clear();
}

/**
 * Format CVE count for display
 */
export function formatCVECount(result: CVEScanResult): string {
  if (result.scanning) {
    return '🔍 Scanning...';
  }

  if (result.error) {
    // Show specific error message for auth issues
    if (result.error.includes('Authentication required')) {
      return '🔐 Auth required (run `chainctl auth login`)';
    }
    return `❌ Scan failed: ${result.error}`;
  }

  if (result.cveCount === -1) {
    return '⚠️ Unable to scan';
  }

  if (result.cveCount === 0) {
    return '✅ 0 CVEs';
  }

  const parts = [];
  if (result.critical > 0) parts.push(`🔴 ${result.critical} critical`);
  if (result.high > 0) parts.push(`🟠 ${result.high} high`);
  if (result.medium > 0) parts.push(`🟡 ${result.medium} medium`);

  return `❌ ${result.cveCount} CVEs (${parts.join(', ')})`;
}

/**
 * Compare before/after CVE counts
 */
export function compareCVEs(before: CVEScanResult, after: CVEScanResult): string {
  if (before.scanning || after.scanning) {
    return '🔍 Scanning images...';
  }

  if (before.cveCount === -1 || after.cveCount === -1) {
    return 'Unable to compare';
  }

  const reduction = before.cveCount - after.cveCount;
  const percentage = before.cveCount > 0
    ? Math.round((reduction / before.cveCount) * 100)
    : 0;

  if (reduction > 0) {
    return `✅ Reduces ${reduction} CVEs (${percentage}% reduction: ${before.cveCount} → ${after.cveCount})`;
  } else if (reduction === 0) {
    return `Both images: ${before.cveCount} CVEs`;
  } else {
    return `Warning: Target has ${Math.abs(reduction)} more CVEs`;
  }
}
