import * as fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { withTmpRoot } from '../setup.js';
import { appendLog, getLogPath, pruneOldLogs, readLog } from '../../src/services/logService.js';

describe('logService', () => {
  it('appendLog and readLog round-trip all lines', async () => {
    await withTmpRoot(async (root) => {
      const logFile = getLogPath(root, 'job-roundtrip');

      await appendLog(logFile, 'stdout', 'out-1');
      await appendLog(logFile, 'stdout', 'out-2');
      await appendLog(logFile, 'stdout', 'out-3');
      await appendLog(logFile, 'stderr', 'err-1');
      await appendLog(logFile, 'stderr', 'err-2');

      const content = await readLog(logFile);
      const lines = content.split('\n');

      expect(lines).toHaveLength(5);
      expect(lines[0]).toContain('[stdout] out-1');
      expect(lines[4]).toContain('[stderr] err-2');
    });
  });

  it('readLog filters stderr lines', async () => {
    await withTmpRoot(async (root) => {
      const logFile = getLogPath(root, 'job-filter');

      await appendLog(logFile, 'stdout', 'out-1');
      await appendLog(logFile, 'stderr', 'err-1');
      await appendLog(logFile, 'system', 'sys-1');
      await appendLog(logFile, 'stderr', 'err-2');

      const content = await readLog(logFile, { filter: 'stderr' });
      const lines = content.split('\n');

      expect(lines).toHaveLength(2);
      expect(lines.every((line) => line.includes('[stderr]'))).toBe(true);
    });
  });

  it('readLog tails the last lines', async () => {
    await withTmpRoot(async (root) => {
      const logFile = getLogPath(root, 'job-tail');

      await appendLog(logFile, 'stdout', 'line-1');
      await appendLog(logFile, 'stdout', 'line-2');
      await appendLog(logFile, 'stderr', 'line-3');
      await appendLog(logFile, 'system', 'line-4');
      await appendLog(logFile, 'stdout', 'line-5');

      const content = await readLog(logFile, { tail: 3 });
      const lines = content.split('\n');

      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain('line-3');
      expect(lines[2]).toContain('line-5');
    });
  });

  it('pruneOldLogs keeps only newest retained files', async () => {
    await withTmpRoot(async (root) => {
      const logsDir = path.join(root, 'logs');
      await fs.mkdir(logsDir, { recursive: true });

      for (let index = 0; index < 60; index += 1) {
        const logFile = path.join(logsDir, `job-${index.toString().padStart(2, '0')}.log`);
        await fs.writeFile(logFile, `entry-${index}\n`, 'utf8');
        const when = new Date(Date.now() - (60 - index) * 1000);
        await fs.utimes(logFile, when, when);
      }

      await pruneOldLogs(root, 50);

      const remainingEntries = await fs.readdir(logsDir);
      const remainingLogs = remainingEntries.filter((entry) => entry.endsWith('.log')).sort();

      expect(remainingLogs).toHaveLength(50);
      expect(remainingLogs).not.toContain('job-00.log');
      expect(remainingLogs).not.toContain('job-09.log');
      expect(remainingLogs).toContain('job-10.log');
      expect(remainingLogs).toContain('job-59.log');
    });
  });
});
