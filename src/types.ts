/*
 * Type definitions for Chainguard Dockerfile Converter
 */

export interface MappingsConfig {
  images: Record<string, string>;
  packages: PackageMap;
}

export interface PackageMap {
  [distro: string]: {
    [sourcePackage: string]: string[];
  };
}

export interface ConversionResult {
  original: string;
  converted: string;
  changes: Change[];
}

export interface Change {
  line: number;
  old: string;
  new: string;
  type: 'from' | 'run' | 'user';
}

export interface ConversionOptions {
  org?: string;
  customMappings?: MappingsConfig;
}

export interface DockerfileStage {
  from: string;
  lines: string[];
  hasRunCommands: boolean;
  startLine: number;
}
