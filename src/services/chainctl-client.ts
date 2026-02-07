import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Client for interacting with chainctl CLI
 * Handles authentication, entitlements, and library verification
 */
export class ChainctlClient {
  private static installedCache: boolean | null = null;
  private static authenticatedCache: boolean | null = null;
  private static entitlementsCache: Set<string> | null = null;
  private static cacheTimestamp: number = 0;
  private static CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Check if chainctl is installed
   */
  static async isInstalled(): Promise<boolean> {
    if (this.installedCache !== null) {
      return this.installedCache;
    }

    try {
      await execAsync('chainctl version', { timeout: 5000 });
      this.installedCache = true;
      return true;
    } catch (error) {
      this.installedCache = false;
      return false;
    }
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    if (this.authenticatedCache !== null &&
        Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
      return this.authenticatedCache;
    }

    try {
      const { stdout } = await execAsync('chainctl auth status', { timeout: 5000 });
      // chainctl auth status returns "Valid | True" when authenticated
      const isValid = stdout.toLowerCase().includes('valid') &&
                     stdout.toLowerCase().includes('true');
      this.authenticatedCache = isValid;
      this.cacheTimestamp = Date.now();
      return this.authenticatedCache;
    } catch (error) {
      this.authenticatedCache = false;
      return false;
    }
  }

  /**
   * Get available library entitlements
   * Returns: Set of ecosystem names ('PYTHON', 'JAVASCRIPT', 'JAVA')
   */
  static async getEntitlements(parent?: string): Promise<Set<string>> {
    if (this.entitlementsCache !== null &&
        Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
      return this.entitlementsCache;
    }

    try {
      const cmd = parent
        ? `chainctl libraries entitlements list --parent=${parent} -o json`
        : `chainctl libraries entitlements list -o json`;

      const { stdout } = await execAsync(cmd, { timeout: 10000 });
      const data = JSON.parse(stdout);

      const ecosystems = new Set<string>();

      // Map ecosystem numbers to names
      // 1 = Python, 2 = JavaScript, 3 = Java
      const ecosystemMap: Record<number, string> = {
        1: 'PYTHON',
        2: 'JAVASCRIPT',
        3: 'JAVA'
      };

      // Handle both array format and items format
      const items = Array.isArray(data) ? data : (data.items || []);

      items.forEach((item: any) => {
        if (item.ecosystem && ecosystemMap[item.ecosystem]) {
          ecosystems.add(ecosystemMap[item.ecosystem]);
        }
      });

      this.entitlementsCache = ecosystems;
      this.cacheTimestamp = Date.now();
      console.log(`[Chainguard] Found library entitlements: ${Array.from(ecosystems).join(', ')}`);
      return ecosystems;
    } catch (error: any) {
      console.error('[Chainguard] Failed to get library entitlements:', error.message);
      return new Set();
    }
  }

  /**
   * Clear caches (useful after login/logout)
   */
  static clearCache(): void {
    this.installedCache = null;
    this.authenticatedCache = null;
    this.entitlementsCache = null;
    this.cacheTimestamp = 0;
  }
}
