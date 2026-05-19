import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import dotenv from 'dotenv';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { checkConfig, loadEnv } from '../../src/config/env.js';

const ENV_KEYS = [
  'TELEGRAM_BOT_TOKEN',
  'ALLOWED_TELEGRAM_USER_IDS',
  'PROJECTS_ROOT',
  'OPENCODE_COMMAND',
  'OPENCODE_TIMEOUT_MS',
  'PROGRESS_INTERVAL_MS',
  'MAX_TELEGRAM_MESSAGE_CHARS',
  'OPENCODE_SERVER_URL',
  'OMO_ALLOWED_COMMANDS',
  'STORAGE_DIR',
  'LOG_RETENTION_JOBS',
  'FILE_READ_MAX_BYTES',
  'DOCTOR_TIMEOUT_MS',
] as const;

const originalEnv = { ...process.env };

const setBaseEnv = (projectsRoot: string): void => {
  process.env.TELEGRAM_BOT_TOKEN = '1234567890abcdef';
  process.env.ALLOWED_TELEGRAM_USER_IDS = '123,456';
  process.env.PROJECTS_ROOT = projectsRoot;
  delete process.env.OPENCODE_COMMAND;
  delete process.env.OPENCODE_TIMEOUT_MS;
  delete process.env.PROGRESS_INTERVAL_MS;
  delete process.env.MAX_TELEGRAM_MESSAGE_CHARS;
  delete process.env.OPENCODE_SERVER_URL;
  delete process.env.OMO_ALLOWED_COMMANDS;
  delete process.env.STORAGE_DIR;
  delete process.env.LOG_RETENTION_JOBS;
  delete process.env.FILE_READ_MAX_BYTES;
  delete process.env.DOCTOR_TIMEOUT_MS;
};

describe('env config', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joy-bot-env-'));
    vi.spyOn(dotenv, 'config').mockReturnValue({ parsed: {} });
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    setBaseEnv(tempRoot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('loads required and default values', () => {
    const env = loadEnv();

    expect(env.TELEGRAM_BOT_TOKEN).toBe('1234567890abcdef');
    expect(env.ALLOWED_TELEGRAM_USER_IDS).toEqual([123, 456]);
    expect(env.PROJECTS_ROOT).toBe(path.resolve(tempRoot));
    expect(env.OPENCODE_COMMAND).toBe(process.platform === 'win32' ? 'opencode.cmd' : 'opencode');
    expect(env.MAX_TELEGRAM_MESSAGE_CHARS).toBe(3500);
    expect(env.OMO_ALLOWED_COMMANDS).toEqual([
      'review-work',
      'handoff',
      'hyperplan',
      'ulw-loop',
      'stop-continuation',
    ]);
    expect(env.STORAGE_DIR).toBe(path.resolve('./storage'));
  });

  it('resolves configured paths and parses csv values', () => {
    process.env.PROJECTS_ROOT = '.';
    process.env.STORAGE_DIR = './tmp-storage';
    process.env.OMO_ALLOWED_COMMANDS = 'alpha, beta ,gamma';

    const env = loadEnv();

    expect(env.PROJECTS_ROOT).toBe(path.resolve('.'));
    expect(env.STORAGE_DIR).toBe(path.resolve('./tmp-storage'));
    expect(env.OMO_ALLOWED_COMMANDS).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('parses numeric overrides', () => {
    process.env.OPENCODE_TIMEOUT_MS = '1234';
    process.env.PROGRESS_INTERVAL_MS = '5678';
    process.env.MAX_TELEGRAM_MESSAGE_CHARS = '999';
    process.env.LOG_RETENTION_JOBS = '12';
    process.env.FILE_READ_MAX_BYTES = '4096';
    process.env.DOCTOR_TIMEOUT_MS = '77';

    const env = loadEnv();

    expect(env.OPENCODE_TIMEOUT_MS).toBe(1234);
    expect(env.PROGRESS_INTERVAL_MS).toBe(5678);
    expect(env.MAX_TELEGRAM_MESSAGE_CHARS).toBe(999);
    expect(env.LOG_RETENTION_JOBS).toBe(12);
    expect(env.FILE_READ_MAX_BYTES).toBe(4096);
    expect(env.DOCTOR_TIMEOUT_MS).toBe(77);
  });

  it('throws when allowed telegram user ids are empty', () => {
    process.env.ALLOWED_TELEGRAM_USER_IDS = '   ';

    expect(() => loadEnv()).toThrow(/ALLOWED_TELEGRAM_USER_IDS/);
  });

  it('throws when allowed telegram user ids contain non-numeric values', () => {
    process.env.ALLOWED_TELEGRAM_USER_IDS = '123,nope';

    expect(() => loadEnv()).toThrow(/ALLOWED_TELEGRAM_USER_IDS/);
  });

  it('throws when projects root does not exist', () => {
    process.env.PROJECTS_ROOT = path.join(tempRoot, 'missing-dir');

    expect(() => loadEnv()).toThrow(/PROJECTS_ROOT must exist/);
  });

  it('throws when projects root is not a directory', () => {
    const filePath = path.join(tempRoot, 'file.txt');
    fs.writeFileSync(filePath, 'hello');
    process.env.PROJECTS_ROOT = filePath;

    expect(() => loadEnv()).toThrow(/PROJECTS_ROOT must exist/);
  });

  it('checkConfig prints masked summary and exits zero', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`EXIT:${code}`);
    });

    expect(() => checkConfig()).toThrow('EXIT:0');
    expect(logSpy).toHaveBeenCalledWith('Configuration OK');
    expect(logSpy).toHaveBeenCalledWith('TELEGRAM_BOT_TOKEN=***...cdef');
    expect(logSpy).toHaveBeenCalledWith(`PROJECTS_ROOT=${path.resolve(tempRoot)}`);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
