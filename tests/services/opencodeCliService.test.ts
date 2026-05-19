import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { runCli, doctor } from '../../src/services/opencodeCliService.js';
import type { Env } from '../../src/config/env.js';
import { makeJobId } from '../../src/types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fakeOpencode = path.resolve(__dirname, process.platform === 'win32' ? '../fixtures/fake-opencode.cmd' : '../fixtures/fake-opencode.cjs');
const fakeExit2 = path.resolve(__dirname, process.platform === 'win32' ? '../fixtures/fake-exit2.cmd' : '../fixtures/fake-exit2.cjs');

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    TELEGRAM_BOT_TOKEN: 'test-token-1234567890',
    ALLOWED_TELEGRAM_USER_IDS: [123],
    PROJECTS_ROOT: process.cwd(),
    OPENCODE_COMMAND: fakeOpencode,
    OPENCODE_TIMEOUT_MS: 10000,
    PROGRESS_INTERVAL_MS: 30000,
    MAX_TELEGRAM_MESSAGE_CHARS: 3500,
    OPENCODE_SERVER_URL: 'http://localhost:4096',
    OMO_ALLOWED_COMMANDS: ['review-work'],
    STORAGE_DIR: path.resolve('./storage'),
    LOG_RETENTION_JOBS: 50,
    FILE_READ_MAX_BYTES: 1048576,
    DOCTOR_TIMEOUT_MS: 10000,
    ...overrides,
  };
}

describe('runCli', () => {
  it('exits code 0 and delivers stdout chunk via onChunk', async () => {
    const env = makeEnv();
    const chunks: Array<{ kind: 'stdout' | 'stderr'; chunk: string }> = [];
    const abort = new AbortController();

    const result = await runCli({
      prompt: 'hello world',
      cwd: process.cwd(),
      env,
      jobId: makeJobId(),
      abort,
      onChunk: (kind, chunk) => chunks.push({ kind, chunk }),
    });

    expect(result.code).toBe(0);
    expect(result.timedOut).toBe(false);
    const stdoutChunks = chunks.filter((c) => c.kind === 'stdout').map((c) => c.chunk).join('');
    expect(stdoutChunks).toContain('hello world');
  });

  it('returns non-zero exit code when stub exits non-zero', async () => {
    const env = makeEnv({
      OPENCODE_COMMAND: fakeExit2,
    });
    const abort = new AbortController();

    const result = await runCli({
      prompt: 'anything',
      cwd: process.cwd(),
      env,
      jobId: makeJobId(),
      abort,
      onChunk: () => {},
    });

    expect(result.code).toBe(2);
    expect(result.timedOut).toBe(false);
  });
});

describe('doctor', () => {
  it('returns ok:true with fake-opencode stub', async () => {
    const env = makeEnv();
    const result = await doctor(env);

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('fake opencode help');
  });

  it('returns ok:false with a missing binary', async () => {
    const env = makeEnv({
      OPENCODE_COMMAND: 'this-binary-does-not-exist-xyz-abc',
    });
    const result = await doctor(env);

    expect(result.ok).toBe(false);
    const combined = (result.error ?? '') + result.output;
    expect(combined.length).toBeGreaterThan(0);
  });
});
