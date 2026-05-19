import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { UserFromGetMe } from '@grammyjs/types';
import { Bot, Context } from 'grammy';
import { buildApp } from '../../src/index.js';
import type { Env } from '../../src/config/env.js';
import { dispatchAndCapture, makeUpdate } from '../helpers/botHarness.js';

const BOT_INFO: UserFromGetMe = {
  id: 1,
  is_bot: true,
  first_name: 'Test',
  username: 'testbot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_manage_bots: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
};

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'joy-bot-test-'));
}

function makeEnv(storageDir: string, projectsRoot: string): Env {
  return {
    TELEGRAM_BOT_TOKEN: 'fake-token-1234567890',
    ALLOWED_TELEGRAM_USER_IDS: [1],
    PROJECTS_ROOT: projectsRoot,
    OPENCODE_COMMAND: 'opencode',
    OPENCODE_TIMEOUT_MS: 60000,
    PROGRESS_INTERVAL_MS: 30000,
    MAX_TELEGRAM_MESSAGE_CHARS: 3500,
    OPENCODE_SERVER_URL: 'http://localhost:4096',
    OMO_ALLOWED_COMMANDS: ['review-work'],
    STORAGE_DIR: storageDir,
    LOG_RETENTION_JOBS: 50,
    FILE_READ_MAX_BYTES: 1048576,
    DOCTOR_TIMEOUT_MS: 15000,
  };
}

async function makeTestApp(): Promise<Bot<Context>> {
  const storageDir = makeTmpDir();
  const projectsRoot = makeTmpDir();
  const env = makeEnv(storageDir, projectsRoot);
  const fakeBot = new Bot<Context>('fake-token-1234567890', { botInfo: BOT_INFO });
  const { bot } = await buildApp(env, fakeBot);
  return bot;
}

describe('buildApp integration', () => {
  it('/help reply contains all section headers', async () => {
    const bot = await makeTestApp();
    const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: 1, fromId: 1, text: '/help' }));
    const text = calls.find((c) => c.method === 'sendMessage')?.payload.text as string | undefined;

    expect(text).toBeDefined();
    expect(text).toContain('Workspace');
    expect(text).toContain('Files');
    expect(text).toContain('Opencode');
    expect(text).toContain('Sessions');
    expect(text).toContain('Jobs');
    expect(text).toContain('Settings');
  });

  it('non-command text triggers fallback reply', async () => {
    const bot = await makeTestApp();
    const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: 1, fromId: 1, text: 'hello world' }));
    const text = calls.find((c) => c.method === 'sendMessage')?.payload.text as string | undefined;

    expect(text).toBeDefined();
    expect(text).toContain('Ketik /help');
  });

  it('src/bot.js does not exist', () => {
    expect(fs.existsSync('src/bot.js')).toBe(false);
  });
});
