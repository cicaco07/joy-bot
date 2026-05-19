import os from 'os';
import fs from 'fs';
import path from 'path';

export function mkTmpRoot(prefix = 'joy-bot-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export async function withTmpRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkTmpRoot();
  try {
    return await fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
