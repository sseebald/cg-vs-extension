/*
 * Wolfi Package Search - queries live package repository
 */

import fetch from 'node-fetch';
import * as zlib from 'zlib';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface WolfiPackage {
  name: string;
  version?: string;
  description?: string;
}

let cachedPackages: Map<string, WolfiPackage> | null = null;
let cacheTimestamp: number | null = null;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

/**
 * Fetch and parse Wolfi package index
 */
export async function fetchWolfiPackages(): Promise<Map<string, WolfiPackage>> {
  // Return cached if still valid
  if (cachedPackages && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_TTL) {
    console.log('[Chainguard] Using cached Wolfi packages');
    return cachedPackages;
  }

  console.log('[Chainguard] Fetching live Wolfi package index...');

  try {
    const url = 'https://packages.wolfi.dev/os/aarch64/APKINDEX.tar.gz';
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Decompress gzip
    const decompressed = await new Promise<Buffer>((resolve, reject) => {
      zlib.gunzip(buffer, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    // Extract APKINDEX from tar (simple header parsing)
    const apkindex = extractAPKINDEX(decompressed);
    const packages = parseAPKINDEX(apkindex);

    cachedPackages = packages;
    cacheTimestamp = Date.now();

    console.log(`[Chainguard] Fetched ${packages.size} packages from Wolfi`);
    return packages;
  } catch (error) {
    console.warn('[Chainguard] Failed to fetch Wolfi packages:', error);
    // Return empty map on error - caller will fall back to static mappings
    return new Map();
  }
}

/**
 * Simple tar extraction - finds APKINDEX file
 */
function extractAPKINDEX(tarData: Buffer): string {
  let offset = 0;

  while (offset < tarData.length) {
    // Read tar header
    const header = tarData.slice(offset, offset + 512);
    const fileName = header.slice(0, 100).toString('utf8').replace(/\0/g, '');
    const sizeStr = header.slice(124, 136).toString('utf8').trim();
    const size = parseInt(sizeStr, 8) || 0;

    offset += 512; // Move past header

    if (fileName === 'APKINDEX') {
      return tarData.slice(offset, offset + size).toString('utf8');
    }

    // Move to next file (round up to 512-byte block)
    offset += Math.ceil(size / 512) * 512;
  }

  return '';
}

/**
 * Parse APKINDEX format
 */
function parseAPKINDEX(content: string): Map<string, WolfiPackage> {
  const packages = new Map<string, WolfiPackage>();
  const lines = content.split('\n');

  let currentPackage: Partial<WolfiPackage> = {};

  for (const line of lines) {
    if (line.startsWith('P:')) {
      currentPackage.name = line.substring(2).trim();
    } else if (line.startsWith('V:')) {
      currentPackage.version = line.substring(2).trim();
    } else if (line.startsWith('T:')) {
      currentPackage.description = line.substring(2).trim();
    } else if (line === '' && currentPackage.name) {
      // End of package entry
      packages.set(currentPackage.name, currentPackage as WolfiPackage);
      currentPackage = {};
    }
  }

  // Add last package if exists
  if (currentPackage.name) {
    packages.set(currentPackage.name, currentPackage as WolfiPackage);
  }

  return packages;
}

/**
 * Check if a package exists in Wolfi
 */
export async function packageExists(packageName: string): Promise<boolean> {
  try {
    const packages = await fetchWolfiPackages();
    return packages.has(packageName);
  } catch (error) {
    console.warn('[Chainguard] Package check failed:', error);
    return true; // Assume exists on error
  }
}

/**
 * Search for packages by name
 */
export async function searchWolfiPackage(query: string): Promise<WolfiPackage[]> {
  const packages = await fetchWolfiPackages();
  const lowerQuery = query.toLowerCase();

  return Array.from(packages.values())
    .filter(pkg => pkg.name.toLowerCase().includes(lowerQuery))
    .slice(0, 10);
}

/**
 * Verify package mapping and suggest alternatives
 */
export async function verifyPackageMapping(
  sourcePackage: string,
  targetPackage: string
): Promise<{ exists: boolean; alternatives?: WolfiPackage[] }> {
  const packages = await fetchWolfiPackages();

  if (packages.has(targetPackage)) {
    return { exists: true };
  }

  // Find similar packages
  const alternatives = Array.from(packages.values())
    .filter(pkg =>
      pkg.name.includes(sourcePackage) ||
      pkg.name.includes(targetPackage) ||
      sourcePackage.includes(pkg.name.replace(/\d+/g, ''))
    )
    .slice(0, 5);

  return { exists: false, alternatives };
}
