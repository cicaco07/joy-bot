import { describe, it, expect, beforeEach } from 'vitest';
import { Bot, Context } from 'grammy';
import type { UserFromGetMe } from '@grammyjs/types';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { register } from '../../../src/bot/commands/opencode.js';
import { dispatchAndCapture, makeUpdate } from '../../helpers/botHarness.js';
import { withTmpRoot } from '../../setup.js';
import * as settingsService from '../../../src/services/settingsService.js';
import * as jobService from '../../../src/services/jobService.js';
import { makeChatId } from '../../../src/types/index.js';
import type { Env } from '../../../src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAKE_OPENCODE = path.resolve(__dirname, '../../fixtures/fake-opencode.cjs');

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

function makeEnv(storageDir: string): Env {
  return {
    TELEGRAM_BOT_TOKEN: 'fake-token',
    ALLOWED_TELEGRAM_USER_IDS: [1],
    PROJECTS_ROOT: storageDir,
    OPENCODE_COMMAND: 'node C:\\Users\\ARYODE~1\\2021\\PROJEC~1\\ml\\joy-bot\\tests\\fixtures\\fake-opencode.cjs',
    OPENCODE_TIMEOUT_MS: 10000,
    PROGRESS_INTERVAL_MS: 999999,
    MAX_TELEGRAM_MESSAGE_CHARS: 3500,
    OPENCODE_SERVER_URL: 'http://localhost:4096',
    OMO_ALLOWED_COMMANDS: ['review-work'],
    STORAGE_DIR: storageDir,
    LOG_RETENTION_JOBS: 10,
    FILE_READ_MAX_BYTES: 1024 * 1024,
    DOCTOR_TIMEOUT_MS: 5000,
  };
}

function makeBot(env: Env, storageDir: string): Bot<Context> {
  const bot = new Bot<Context>('fake-token', { botInfo: BOT_INFO });
  register(bot, { env, storageDir });
  return bot;
}

const CHAT_ID = 42;
const FROM_ID = 99;

describe('/run command', () => {
  it('replies error when no active workspace', async () => {
    await withTmpRoot(async (root) => {
      const env = makeEnv(root);
      const bot = makeBot(env, root);

      const calls = await dispatchAndCapture(
        bot,
        makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/run do something' }),
      );

      const texts = calls
        .filter((c) => c.method === 'sendMessage')
        .map((c) => c.payload.text as string);

      expect(texts.some((t) => t.toLowerCase().includes('workspace'))).toBe(true);
    });
  });

  it('creates job and sends completion summary with checkmark when workspace active', async () => {
    await withTmpRoot(async (root) => {
      const env = makeEnv(root);
      const bot = makeBot(env, root);
      const chatId = makeChatId(CHAT_ID);

      await settingsService.setActiveWorkspace(root, chatId, root);
      await settingsService.setCwd(root, chatId, root);

      const calls = await dispatchAndCapture(
        bot,
        makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/run hello world' }),
      );

      const texts = calls
        .filter((c) => c.method === 'sendMessage')
        .map((c) => c.payload.text as string);

      const captions = calls
        .filter((c) => c.method === 'sendDocument')
        .map((c) => (c.payload.caption as string | undefined) ?? '');

      const allContent = [...texts, ...captions];
      expect(allContent.some((t) => t.includes('✅'))).toBe(true);
    });
  });

  it('replies busy message when a job is already running', async () => {
    await withTmpRoot(async (root) => {
      const env = makeEnv(root);
      const bot = makeBot(env, root);
      const chatId = makeChatId(CHAT_ID);

      await settingsService.setActiveWorkspace(root, chatId, root);
      await settingsService.setCwd(root, chatId, root);

      // Create a running job manually
      const job = await jobService.createJob(root, {
        chatId,
        type: 'opencode.cli',
        workspace: root,
        cwd: root,
        command: 'fake',
        args: [],
        promptPreview: 'existing job',
      });
      const abort = new AbortController();
      await jobService.markRunning(root, job.id, abort);

      const calls = await dispatchAndCapture(
        bot,
        makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/run another task' }),
      );

      const texts = calls
        .filter((c) => c.method === 'sendMessage')
        .map((c) => c.payload.text as string);

      expect(texts.some((t) => t.includes('Masih ada job berjalan'))).toBe(true);
    });
  });
});

describe('/doctor command', () => {
  it('sends a summary containing "Doctor opencode"', async () => {
    await withTmpRoot(async (root) => {
      const env = makeEnv(root);
      const bot = makeBot(env, root);

      const calls = await dispatchAndCapture(
        bot,
        makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/doctor' }),
      );

      const texts = calls
        .filter((c) => c.method === 'sendMessage')
        .map((c) => c.payload.text as string);

      expect(texts.some((t) => t.includes('Doctor opencode'))).toBe(true);
    });
  });
});
