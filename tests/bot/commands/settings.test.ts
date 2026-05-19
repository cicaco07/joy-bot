import { Bot, Context } from 'grammy';
import type { UserFromGetMe } from '@grammyjs/types';
import { describe, expect, it } from 'vitest';

import { register } from '../../../src/bot/commands/settings.js';
import { Env } from '../../../src/config/env.js';
import * as sessionService from '../../../src/services/sessionService.js';
import * as settingsService from '../../../src/services/settingsService.js';
import { makeChatId } from '../../../src/types/index.js';
import { dispatchAndCapture, makeUpdate } from '../../helpers/botHarness.js';
import { withTmpRoot } from '../../setup.js';

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
    ALLOWED_TELEGRAM_USER_IDS: [2],
    PROJECTS_ROOT: storageDir,
    OPENCODE_COMMAND: 'opencode',
    OPENCODE_TIMEOUT_MS: 600000,
    PROGRESS_INTERVAL_MS: 30000,
    MAX_TELEGRAM_MESSAGE_CHARS: 3500,
    OPENCODE_SERVER_URL: 'http://localhost:4096',
    OMO_ALLOWED_COMMANDS: ['review-work'],
    STORAGE_DIR: storageDir,
    LOG_RETENTION_JOBS: 100,
    FILE_READ_MAX_BYTES: 100000,
    DOCTOR_TIMEOUT_MS: 1000,
  };
}

function makeBot(storageDir: string): Bot<Context> {
  const bot = new Bot<Context>('fake-token', { botInfo: BOT_INFO });
  register(bot, { env: makeEnv(storageDir), storageDir });
  return bot;
}

describe('settings commands', () => {
  it('/model use 9router/foo sets default model', async () => {
    await withTmpRoot(async (root) => {
      const bot = makeBot(root);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: 10, fromId: 2, text: '/model use 9router/foo' }));
      const reply = calls.find((c) => c.method === 'sendMessage');
      expect(reply).toBeDefined();
      expect(reply!.payload.text).toContain('9router/foo');

      const settings = await settingsService.getSettings(root, makeChatId(10));
      expect(settings.defaultModel).toEqual({ providerID: '9router', modelID: 'foo' });
    });
  });

  it('/model use 9router/foo --session updates session model, not chat default', async () => {
    await withTmpRoot(async (root) => {
      const chatId = makeChatId(10);
      const session = await sessionService.createSession(root, chatId, { title: 'test' });
      await settingsService.setActiveSession(root, chatId, session.id);

      const bot = makeBot(root);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: 10, fromId: 2, text: '/model use 9router/foo --session' }));
      const reply = calls.find((c) => c.method === 'sendMessage');
      expect(reply).toBeDefined();
      expect(reply!.payload.text).toContain('session');

      const updatedSession = await sessionService.getSession(root, session.id);
      expect(updatedSession?.model).toEqual({ providerID: '9router', modelID: 'foo' });

      const settings = await settingsService.getSettings(root, chatId);
      expect(settings.defaultModel).toBeUndefined();
    });
  });

  it('/agent use deep sets default agent', async () => {
    await withTmpRoot(async (root) => {
      const bot = makeBot(root);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: 10, fromId: 2, text: '/agent use deep' }));
      const reply = calls.find((c) => c.method === 'sendMessage');
      expect(reply).toBeDefined();
      expect(reply!.payload.text).toContain('deep');

      const settings = await settingsService.getSettings(root, makeChatId(10));
      expect(settings.defaultAgent).toBe('deep');
    });
  });

  it('/mode ultrawork sets default mode', async () => {
    await withTmpRoot(async (root) => {
      const bot = makeBot(root);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: 10, fromId: 2, text: '/mode ultrawork' }));
      const reply = calls.find((c) => c.method === 'sendMessage');
      expect(reply).toBeDefined();
      expect(reply!.payload.text).toContain('ultrawork');

      const settings = await settingsService.getSettings(root, makeChatId(10));
      expect(settings.defaultMode).toBe('ultrawork');
    });
  });

  it('/mode invalid replies with error message', async () => {
    await withTmpRoot(async (root) => {
      const bot = makeBot(root);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: 10, fromId: 2, text: '/mode invalid' }));
      const reply = calls.find((c) => c.method === 'sendMessage');
      expect(reply).toBeDefined();
      expect(reply!.payload.text).toContain('Mode tidak valid');
    });
  });
});
