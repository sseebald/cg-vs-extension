import fetch from 'node-fetch';

export interface VexRemediation {
  packageName: string;
  ecosystem: string;
  version: string;
  cvesFixed: string[];
  advisoryUrl?: string;
}

let cachedVexData: Map<string, VexRemediation[]> | null = null;
let cacheTimestamp: number | null = null;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

/**
 * Fetch the public VEX feed from Chainguard Libraries
 * Contains CVE remediation information for library packages
 */
export async function fetchVexFeed(): Promise<Map<string, VexRemediation[]>> {
  if (cachedVexData && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_TTL) {
    console.log('[Chainguard] Using cached VEX data');
    return cachedVexData;
  }

  console.log('[Chainguard] Fetching VEX feed from libraries.cgr.dev...');

  try {
    const response = await fetch('https://libraries.cgr.dev/openvex/v1/all.json', {
      timeout: 10000
    } as any);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const remediations = parseVexData(data);

    cachedVexData = remediations;
    cacheTimestamp = Date.now();

    console.log(`[Chainguard] Fetched ${remediations.size} remediated packages from VEX feed`);
    return remediations;
  } catch (error: any) {
    console.warn('[Chainguard] Failed to fetch VEX feed:', error.message);
    return new Map();
  }
}

/**
 * Parse OpenVEX format JSON into remediation map
 */
function parseVexData(vexJson: any): Map<string, VexRemediation[]> {
  const remediations = new Map<string, VexRemediation[]>();

  if (!vexJson.documents || !Array.isArray(vexJson.documents)) {
    return remediations;
  }

  vexJson.documents.forEach((doc: any) => {
    if (!doc.statements || !Array.isArray(doc.statements)) {
      return;
    }

    doc.statements.forEach((stmt: any) => {
      const packageRef = stmt.products?.[0]?.identifiers?.[0];
      if (!packageRef) {
        return;
      }

      const remediation: VexRemediation = {
        packageName: extractPackageName(packageRef),
        ecosystem: extractEcosystem(packageRef),
        version: extractVersion(packageRef),
        cvesFixed: stmt.vulnerability_id ? [stmt.vulnerability_id] : [],
        advisoryUrl: stmt.action_statement_uri
      };

      const key = `${remediation.ecosystem}:${remediation.packageName}`;
      if (!remediations.has(key)) {
        remediations.set(key, []);
      }
      remediations.get(key)!.push(remediation);
    });
  });

  return remediations;
}

/**
 * Extract package name from PURL
 * Example: pkg:pypi/requests@2.28.1 -> requests
 */
function extractPackageName(purl: string): string {
  const match = purl.match(/pkg:[^/]+\/([^@]+)/);
  return match ? match[1] : purl;
}

/**
 * Extract ecosystem from PURL
 * Example: pkg:pypi/requests -> pypi
 */
function extractEcosystem(purl: string): string {
  const match = purl.match(/pkg:([^/]+)\//);
  return match ? match[1] : 'unknown';
}

/**
 * Extract version from PURL
 * Example: pkg:pypi/requests@2.28.1 -> 2.28.1
 */
function extractVersion(purl: string): string {
  const match = purl.match(/@(.+)$/);
  return match ? match[1] : '';
}

/**
 * Check if a specific package has CVE remediations available
 */
export async function checkRemediationAvailability(
  packageName: string,
  ecosystem: string
): Promise<VexRemediation[]> {
  const feed = await fetchVexFeed();

  // Normalize ecosystem names
  const ecosystemMap: Record<string, string> = {
    'python': 'pypi',
    'javascript': 'npm',
    'java': 'maven'
  };

  const normalizedEcosystem = ecosystemMap[ecosystem] || ecosystem;
  const key = `${normalizedEcosystem}:${packageName}`;

  return feed.get(key) || [];
}
