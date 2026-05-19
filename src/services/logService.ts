import * as fs from 'node:fs/promises';
import path from 'node:path';

const MAX_READ_BYTES = 1024 * 1024;

type LogKind = 'stdout' | 'stderr' | 'system';
type ReadLogFilter = 'all' | 'stderr' | 'system';

export async function appendLog(
  logFile: string,
  kind: LogKind,
  chunk: string,
): Promise<void> {
  const line = `[${new Date().toISOString()}] [${kind}] ${chunk}\n`;

  await fs.mkdir(path.dirname(logFile), { recursive: true });
  await fs.appendFile(logFile, line, 'utf8');
}

export async function readLog(
  logFile: string,
  opts: { tail?: number; filter?: ReadLogFilter } = {},
): Promise<string> {
  let raw: string;

  try {
    const handle = await fs.open(logFile, 'r');

    try {
      const stat = await handle.stat();
      const start = Math.max(stat.size - MAX_READ_BYTES, 0);
      const length = stat.size - start;
      const buffer = Buffer.alloc(length);

      await handle.read(buffer, 0, length, start);
      raw = buffer.toString('utf8');
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return '';
    }

    throw error;
  }

  const filter = opts.filter ?? 'all';
  const lines = raw.split('\n').filter((line) => line.length > 0);
  const filteredLines = lines.filter((line) => {
    if (filter === 'all') {
      return true;
    }

    return line.includes(`[${filter}]`);
  });

  const tailedLines =
    typeof opts.tail === 'number' ? filteredLines.slice(-opts.tail) : filteredLines;
  const joined = tailedLines.join('\n');

  if (Buffer.byteLength(joined, 'utf8') <= MAX_READ_BYTES) {
    return joined;
  }

  let start = joined.length;
  let bytes = 0;

  while (start > 0 && bytes < MAX_READ_BYTES) {
    start -= 1;
    bytes = Buffer.byteLength(joined.slice(start), 'utf8');
  }

  const safeStart = bytes > MAX_READ_BYTES ? start + 1 : start;
  return joined.slice(safeStart);
}

export function getLogPath(storageDir: string, jobId: string): string {
  return path.join(storageDir, 'logs', `${jobId}.log`);
}

export async function pruneOldLogs(
  storageDir: string,
  retentionCount: number,
): Promise<void> {
  const logsDir = path.join(storageDir, 'logs');

  let entries: string[];

  try {
    entries = await fs.readdir(logsDir);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return;
    }

    throw error;
  }

  const logFiles = entries.filter((entry) => entry.endsWith('.log'));
  const filesWithStats = await Promise.all(
    logFiles.map(async (file) => {
      const filePath = path.join(logsDir, file);
      const stat = await fs.stat(filePath);

      return { filePath, mtimeMs: stat.mtimeMs };
    }),
  );

  filesWithStats.sort((left, right) => right.mtimeMs - left.mtimeMs);

  const filesToDelete = filesWithStats.slice(Math.max(retentionCount, 0));
  await Promise.all(filesToDelete.map(({ filePath }) => fs.rm(filePath, { force: true })));
}
