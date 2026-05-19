import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  formatStart,
  formatHelp,
  formatWorkspaces,
  formatLs,
  formatTree,
  formatFile,
  formatJobSummary,
  formatJobList,
  formatLogPreview,
  formatSessions,
  formatSettings,
  formatError,
} from '../../src/services/formatterService.js';
import type { JobRecord, SessionRecord, ChatSettings } from '../../src/types/index.js';
import { makeChatId, makeJobId } from '../../src/types/index.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'formatter-test-'));
}

function makeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: makeJobId(),
    chatId: makeChatId(123),
    type: 'opencode.cli',
    workspace: 'my-workspace',
    cwd: '/home/user/project',
    command: 'opencode',
    args: ['run', 'hello'],
    status: 'done',
    startedAt: new Date(Date.now() - 5000).toISOString(),
    endedAt: new Date().toISOString(),
    logFile: '/storage/logs/job.log',
    ...overrides,
  };
}

describe('formatterService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('formatLs escapes HTML in filenames', () => {
    const result = formatLs([
      { name: '<script>alert(1)</script>', kind: 'file', mtime: '2024-01-01' },
      { name: 'normal.txt', kind: 'file', mtime: '2024-01-01' },
    ]);
    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.text).toContain('&lt;script&gt;');
      expect(result.text).not.toContain('<script>');
    }
  });

  it('formatJobSummary returns document for long log', () => {
    const longLog = 'x'.repeat(200) + '\n';
    const log = Array.from({ length: 100 }, (_, i) => `line ${i}: ${longLog}`).join('');
    const storageDir = tmpDir;
    const job = makeJob({ logFile: path.join(storageDir, 'logs', 'job.log') });
    const result = formatJobSummary(job, log);
    expect(result.kind).toBe('document');
    if (result.kind === 'document') {
      expect(fs.existsSync(result.filePath)).toBe(true);
    }
  });

  it('formatError with Error object contains "Terjadi kesalahan" and no stack', () => {
    const err = new Error('something went wrong');
    const result = formatError(err);
    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.text).toContain('Terjadi kesalahan');
      expect(result.text).not.toContain('at ');
      expect(result.text).not.toContain('Error:');
    }
  });

  it('formatWorkspaces marks active workspace with ▶', () => {
    const result = formatWorkspaces(['alpha', 'beta', 'gamma'], 'beta');
    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.text).toContain('▶');
      expect(result.text).toContain('beta');
    }
  });

  it('formatSettings contains agent and mode values', () => {
    const settings: ChatSettings = {
      chatId: makeChatId(42),
      cwd: '/home/user',
      defaultAgent: 'build',
      defaultMode: 'plan',
      activeWorkspace: 'my-ws',
    };
    const result = formatSettings(settings);
    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.text).toContain('build');
      expect(result.text).toContain('plan');
    }
  });

  it('formatHelp contains all 6 section headers', () => {
    const result = formatHelp();
    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.text).toContain('Workspace');
      expect(result.text).toContain('Opencode');
      expect(result.text).toContain('Sessions');
      expect(result.text).toContain('Jobs');
      expect(result.text).toContain('Settings');
      expect(result.text).toContain('OMO');
    }
  });

  it('formatTree returns document when output exceeds maxChars', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `${'  '.repeat(i % 5)}dir_${i}/`);
    const result = formatTree(lines, false, tmpDir, 100);
    expect(result.kind).toBe('document');
    if (result.kind === 'document') {
      expect(fs.existsSync(result.filePath)).toBe(true);
    }
  });

  it('formatFile text short returns text with pre block', () => {
    const result = formatFile('hello world', 'test.txt', 'text', 11, tmpDir, 3500);
    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.text).toContain('<pre>');
      expect(result.text).toContain('hello world');
    }
  });

  it('formatFile binary returns text with download hint', () => {
    const result = formatFile('', 'image.png', 'binary');
    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.text).toContain('/download');
    }
  });

  it('formatFile missing returns not found message', () => {
    const result = formatFile('', 'ghost.txt', 'missing');
    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.text).toContain('tidak ditemukan');
    }
  });

  it('formatJobList shows status badges and workspace', () => {
    const jobs = [
      makeJob({ status: 'done', workspace: 'ws-a' }),
      makeJob({ status: 'failed', workspace: 'ws-b' }),
    ];
    const result = formatJobList(jobs);
    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.text).toContain('✅');
      expect(result.text).toContain('❌');
      expect(result.text).toContain('ws-a');
      expect(result.text).toContain('ws-b');
    }
  });

  it('formatSessions marks active session with ▶', () => {
    const sessions: SessionRecord[] = [
      { id: 'ses-1', chatId: makeChatId(1), title: 'First', createdAt: '', updatedAt: '', status: 'active' },
      { id: 'ses-2', chatId: makeChatId(1), title: 'Second', createdAt: '', updatedAt: '', status: 'active' },
    ];
    const result = formatSessions(sessions, 'ses-2');
    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.text).toContain('▶');
      expect(result.text).toContain('Second');
    }
  });

  it('formatLogPreview filters lines by keyword', () => {
    const log = 'line one\nERROR: bad thing\nline three\nERROR: another\n';
    const result = formatLogPreview('job-123', log, '/tmp/storage', 'ERROR');
    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.text).toContain('bad thing');
      expect(result.text).not.toContain('line one');
    }
  });

  it('formatStart returns HTML with parseMode HTML', () => {
    const result = formatStart();
    expect(result.parseMode).toBe('HTML');
    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.text).toContain('/run');
    }
  });
});
