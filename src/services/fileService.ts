import fs from 'node:fs';
import path from 'node:path';

export interface LsEntry {
  name: string;
  kind: 'dir' | 'file' | 'other';
  size?: number;
  mtime: string;
}

export interface LsResult {
  entries: LsEntry[];
}

export interface TreeResult {
  lines: string[];
  truncated: boolean;
}

export type CatResult =
  | { kind: 'text'; content: string; bytes: number }
  | { kind: 'binary'; bytes: number }
  | { kind: 'too_large'; bytes: number }
  | { kind: 'missing' }
  | { kind: 'is_dir' };

export type DownloadResult =
  | { ok: true; filePath: string; bytes: number }
  | { ok: false; reason: 'missing' | 'too_large' | 'is_dir' };

export interface FindMatch {
  path: string;
  line?: number;
  preview?: string;
}

export interface FindResult {
  matches: FindMatch[];
  truncated: boolean;
}

const BINARY_SNIFF_BYTES = 8192;
const FIND_CONTENT_MAX_FILE_SIZE = 128 * 1024;

function isBinaryBuffer(buf: Buffer): boolean {
  return buf.includes(0);
}

async function statSafe(p: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.stat(p);
  } catch {
    return null;
  }
}

export async function ls(
  absDir: string,
  opts?: { showHidden?: boolean },
): Promise<LsResult> {
  const showHidden = opts?.showHidden ?? false;
  const dirents = await fs.promises.readdir(absDir, { withFileTypes: true });
  const entries: LsEntry[] = [];

  for (const dirent of dirents) {
    if (!showHidden && dirent.name.startsWith('.')) continue;

    let kind: 'dir' | 'file' | 'other';
    if (dirent.isDirectory()) kind = 'dir';
    else if (dirent.isFile()) kind = 'file';
    else kind = 'other';

    const fullPath = path.join(absDir, dirent.name);
    const st = await statSafe(fullPath);

    const entry: LsEntry = {
      name: dirent.name,
      kind,
      mtime: st ? st.mtime.toISOString() : new Date(0).toISOString(),
    };

    if (kind === 'file' && st) {
      entry.size = st.size;
    }

    entries.push(entry);
  }

  entries.sort((a, b) => {
    const aIsDir = a.kind === 'dir' ? 0 : 1;
    const bIsDir = b.kind === 'dir' ? 0 : 1;
    if (aIsDir !== bIsDir) return aIsDir - bIsDir;
    return a.name.localeCompare(b.name);
  });

  return { entries };
}

export async function tree(
  absDir: string,
  opts?: { depth?: number; maxEntries?: number },
): Promise<TreeResult> {
  const maxDepth = opts?.depth ?? 3;
  const maxEntries = opts?.maxEntries ?? 200;
  const lines: string[] = [];
  let count = 0;
  let truncated = false;

  lines.push(path.basename(absDir) || absDir);

  async function walk(dir: string, prefix: string, depth: number): Promise<void> {
    if (depth > maxDepth || truncated) return;

    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    dirents.sort((a, b) => {
      const aIsDir = a.isDirectory() ? 0 : 1;
      const bIsDir = b.isDirectory() ? 0 : 1;
      if (aIsDir !== bIsDir) return aIsDir - bIsDir;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < dirents.length; i++) {
      if (truncated) return;
      if (count >= maxEntries) {
        truncated = true;
        return;
      }

      const dirent = dirents[i];
      if (dirent === undefined) continue;
      const isLast = i === dirents.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? '    ' : '│   ';

      lines.push(prefix + connector + dirent.name);
      count++;

      if (dirent.isDirectory()) {
        await walk(path.join(dir, dirent.name), prefix + childPrefix, depth + 1);
      }
    }
  }

  await walk(absDir, '', 1);

  return { lines, truncated };
}

export async function cat(absFile: string, maxBytes: number): Promise<CatResult> {
  const st = await statSafe(absFile);

  if (st === null) return { kind: 'missing' };
  if (st.isDirectory()) return { kind: 'is_dir' };
  if (st.size > maxBytes) return { kind: 'too_large', bytes: st.size };

  if (st.size > 0) {
    const sniffSize = Math.min(st.size, BINARY_SNIFF_BYTES);
    const fd = await fs.promises.open(absFile, 'r');
    try {
      const sniffBuf = Buffer.alloc(sniffSize);
      await fd.read(sniffBuf, 0, sniffSize, 0);
      if (isBinaryBuffer(sniffBuf)) {
        return { kind: 'binary', bytes: st.size };
      }
    } finally {
      await fd.close();
    }
  }

  const content = await fs.promises.readFile(absFile, 'utf8');
  return { kind: 'text', content, bytes: st.size };
}

export async function download(absFile: string, maxBytes: number): Promise<DownloadResult> {
  const st = await statSafe(absFile);

  if (st === null) return { ok: false, reason: 'missing' };
  if (st.isDirectory()) return { ok: false, reason: 'is_dir' };
  if (st.size > maxBytes) return { ok: false, reason: 'too_large' };

  return { ok: true, filePath: absFile, bytes: st.size };
}

export async function find(
  absDir: string,
  query: string,
  opts?: { mode?: 'name' | 'content'; maxResults?: number },
): Promise<FindResult> {
  const mode = opts?.mode ?? 'name';
  const maxResults = opts?.maxResults ?? 100;
  const matches: FindMatch[] = [];
  let truncated = false;

  async function walk(dir: string): Promise<void> {
    if (truncated) return;

    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const dirent of dirents) {
      if (truncated) return;

      const fullPath = path.join(dir, dirent.name);

      if (dirent.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!dirent.isFile()) continue;

      if (mode === 'name') {
        if (dirent.name.toLowerCase().includes(query.toLowerCase())) {
          matches.push({ path: fullPath });
          if (matches.length >= maxResults) {
            truncated = true;
            return;
          }
        }
      } else {
        const st = await statSafe(fullPath);
        if (st === null || st.size > FIND_CONTENT_MAX_FILE_SIZE) continue;

        if (st.size > 0) {
          const sniffSize = Math.min(st.size, BINARY_SNIFF_BYTES);
          const fd = await fs.promises.open(fullPath, 'r');
          let isBin = false;
          try {
            const sniffBuf = Buffer.alloc(sniffSize);
            await fd.read(sniffBuf, 0, sniffSize, 0);
            isBin = isBinaryBuffer(sniffBuf);
          } finally {
            await fd.close();
          }
          if (isBin) continue;
        }

        let text: string;
        try {
          text = await fs.promises.readFile(fullPath, 'utf8');
        } catch {
          continue;
        }

        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line === undefined) continue;
          if (line.includes(query)) {
            matches.push({
              path: fullPath,
              line: i + 1,
              preview: line.trim().slice(0, 200),
            });
            if (matches.length >= maxResults) {
              truncated = true;
              return;
            }
          }
        }
      }
    }
  }

  await walk(absDir);

  return { matches, truncated };
}
