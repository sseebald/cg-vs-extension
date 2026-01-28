/*
 * Mapping file loader - loads image and package mappings from YAML
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { MappingsConfig } from '../types';

let cachedMappings: MappingsConfig | null = null;

export function loadMappings(customMappingsPath?: string): MappingsConfig {
  // Return cached if available
  if (cachedMappings && !customMappingsPath) {
    return cachedMappings;
  }

  // Load builtin mappings
  const builtinPath = path.join(__dirname, 'builtin-mappings.yaml');
  const builtinContent = fs.readFileSync(builtinPath, 'utf8');
  const builtinMappings = yaml.load(builtinContent) as MappingsConfig;

  // If custom mappings provided, merge them
  if (customMappingsPath && fs.existsSync(customMappingsPath)) {
    const customContent = fs.readFileSync(customMappingsPath, 'utf8');
    const customMappings = yaml.load(customContent) as MappingsConfig;
    return mergeMappings(builtinMappings, customMappings);
  }

  cachedMappings = builtinMappings;
  return builtinMappings;
}

function mergeMappings(base: MappingsConfig, overlay: MappingsConfig): MappingsConfig {
  const result: MappingsConfig = {
    images: { ...base.images, ...overlay.images },
    packages: { ...base.packages }
  };

  // Merge packages per distro
  for (const distro in overlay.packages) {
    if (!result.packages[distro]) {
      result.packages[distro] = {};
    }
    result.packages[distro] = {
      ...result.packages[distro],
      ...overlay.packages[distro]
    };
  }

  return result;
}
