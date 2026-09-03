import * as fs from "fs";
import * as path from "path";

/** Root for Virlo pulls/reports. Override with VIRLO_DATA_DIR. */
export function virloDataDir(): string {
  return path.resolve(process.env.VIRLO_DATA_DIR || path.join(process.cwd(), "data", "virlo"));
}

export function snapshotDir(nicheKey: string): string {
  return path.join(virloDataDir(), "snapshots", nicheKey);
}

export function reportDir(): string {
  return path.join(virloDataDir(), "reports");
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function timestampSlug(d = new Date()): string {
  return d.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}
