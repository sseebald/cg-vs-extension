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
  type: 'from' | 'run' | 'user' | 'user-reset';
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

/**
 * Represents a dependency file detected in a Dockerfile
 */
export interface DependencyFile {
  line: number; // Line in Dockerfile where COPY occurs
  ecosystem: 'python' | 'javascript' | 'java' | 'ruby';
  filePath: string; // Relative path (e.g., "requirements.txt")
  absolutePath?: string; // Resolved workspace path
  packages: PackageReference[]; // Parsed from file
}

/**
 * Represents a package reference from a dependency file
 */
export interface PackageReference {
  name: string;
  version?: string; // From requirements.txt: "requests==2.28.1"
  extras?: string[]; // From requirements.txt: "package[extra1,extra2]"
}

/**
 * Represents library availability status from Chainguard
 */
export interface LibraryAvailability {
  package: string;
  ecosystem: string;
  available: boolean;
  hasRemediatedVersion?: boolean;
  cvesFixed?: number;
  error?: string;
}
