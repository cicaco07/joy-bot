import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { parseCommand, runProcess } from '../../src/utils/processRunner.js';

const createdPaths: string[] = [];
const nodeCommand = process.platform === 'win32' ? 'node' : process.execPath;

afterEach(() => {
  for (const target of createdPaths.splice(0)) {
    fs.rmSync(target, { force: true, recursive: true });
  }
});

function makeTempScript(contents: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'process-runner-'));
  createdPaths.push(tempDir);
  const scriptPath = path.join(tempDir, 'script.js');
  fs.writeFileSync(scriptPath, contents);
  return scriptPath;
}

describe('runProcess', () => {
  it('captures stdout for successful command', async () => {
    const result = await runProcess({
      command: nodeCommand,
      args: ['-e', "process.stdout.write('ok')"],
      cwd: process.cwd(),
      timeoutMs: 2000,
    });

    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.output).toBe('ok');
    expect(result.timedOut).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('returns non-zero exit code', async () => {
    const result = await runProcess({
      command: nodeCommand,
      args: ['-e', 'process.exit(7)'],
      cwd: process.cwd(),
      timeoutMs: 2000,
    });

    expect(result.code).toBe(7);
    expect(result.timedOut).toBe(false);
  });

  it('marks process as timed out', async () => {
    const scriptPath = makeTempScript('setTimeout(()=>{},5000);');
    const result = await runProcess({
      command: nodeCommand,
      args: [scriptPath],
      cwd: process.cwd(),
      timeoutMs: 200,
    });

    expect(result.timedOut).toBe(true);
    expect(result.error).toContain('timed out');
  });

  it('aborts via AbortController', async () => {
    const scriptPath = makeTempScript('setTimeout(()=>{},5000);');
    const controller = new AbortController();
    const promise = runProcess({
      command: nodeCommand,
      args: [scriptPath],
      cwd: process.cwd(),
      timeoutMs: 5000,
      signal: controller.signal,
    });

    setTimeout(() => controller.abort(), 100);

    const result = await promise;

    expect(result.timedOut).toBe(false);
    expect(result.error).toBe('Process aborted');
  });

  it('captures stdout and stderr and forwards chunks', async () => {
    const scriptPath = makeTempScript("process.stdout.write('out'); process.stderr.write('err');");
    const seen: Array<{ kind: 'stdout' | 'stderr'; chunk: string }> = [];
    const result = await runProcess({
      command: nodeCommand,
      args: [scriptPath],
      cwd: process.cwd(),
      timeoutMs: 2000,
      onChunk: (kind, chunk) => seen.push({ kind, chunk }),
    });

    expect(result.output).toBe('outerr');
    expect(seen).toEqual([
      { kind: 'stdout', chunk: 'out' },
      { kind: 'stderr', chunk: 'err' },
    ]);
  });
});

describe('parseCommand', () => {
  it('parses plain command and args', () => {
    expect(parseCommand('npm run test')).toEqual({
      command: 'npm',
      args: ['run', 'test'],
    });
  });

  it('parses quoted args', () => {
    expect(parseCommand('node "two words" three')).toEqual({
      command: 'node',
      args: ['two words', 'three'],
    });
  });

  it('returns existing file path as command without splitting', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'process-runner-'));
    createdPaths.push(tempDir);
    const scriptPath = path.join(tempDir, 'tool with spaces.cmd');
    fs.writeFileSync(scriptPath, '');

    expect(parseCommand(scriptPath)).toEqual({
      command: scriptPath,
      args: [],
    });
  });
});
