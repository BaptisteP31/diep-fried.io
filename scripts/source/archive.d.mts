export const SOURCE_LIMITS: Readonly<{
  entries: number;
  fileBytes: number;
  totalBytes: number;
  depth: number;
  pathBytes: number;
}>;
export function viteCoreLicense(root: string): Promise<string>;
export function prepareSourceArchive(options: {
  root: string;
  version?: string;
  revision?: string;
}): Promise<{
  archivePath: string;
  manifestPath: string;
  cleanup(): Promise<void>;
  verify(): Promise<void>;
  publish(outDir: string): Promise<void>;
}>;
