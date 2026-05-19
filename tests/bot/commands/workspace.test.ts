import { describe, it, expect, beforeEach } from 'vitest';
import { Bot, Context } from 'grammy';
import fs from 'fs';
import path from 'path';
import { withTmpRoot } from '../../setup.js';
import { makeUpdate, dispatchAndCapture } from '../../helpers/botHarness.js';
import { register } from '../../../src/bot/commands/workspace.js';
import { makeChatId } from '../../../src/types/index.js';
import * as settingsService from '../../../src/services/settingsService.js';
import type { Env } from '../../../src/config/env.js';

function makeEnv(projectsRoot: string): Env {
  return {
    TELEGRAM_BOT_TOKEN: 'test-token',
    ALLOWED_TELEGRAM_USER_IDS: [1],
    PROJECTS_ROOT: projectsRoot,
    OPENCODE_COMMAND: 'opencode',
    OPENCODE_TIMEOUT_MS: 60000,
    PROGRESS_INTERVAL_MS: 5000,
    MAX_TELEGRAM_MESSAGE_CHARS: 3500,
    OPENCODE_SERVER_URL: 'http://localhost:4096',
    OMO_ALLOWED_COMMANDS: ['review-work'],
    STORAGE_DIR: '',
    LOG_RETENTION_JOBS: 50,
    FILE_READ_MAX_BYTES: 1048576,
    DOCTOR_TIMEOUT_MS: 10000,
  };
}

function makeBot(projectsRoot: string, storageDir: string): Bot<Context> {
  const bot = new Bot<Context>('test-token', { botInfo: { id: 1, is_bot: true, first_name: 'TestBot', username: 'testbot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_manage_bots: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false } as any });
  register(bot, { env: makeEnv(projectsRoot), storageDir });
  return bot;
}

const CHAT_ID = 1;
const FROM_ID = 1;

describe('workspace commands', () => {
  it('/workspaces lists workspace names', async () => {
    await withTmpRoot(async (root) => {
      fs.mkdirSync(path.join(root, 'alpha'));
      fs.mkdirSync(path.join(root, 'beta'));
      const storageDir = fs.mkdtempSync(path.join(root, 'storage-'));
      const bot = makeBot(root, storageDir);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/workspaces' }));
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg!.payload.text as string).toContain('alpha');
      expect(msg!.payload.text as string).toContain('beta');
    });
  });

  it('/workspace use <valid> persists and replies confirmation', async () => {
    await withTmpRoot(async (root) => {
      fs.mkdirSync(path.join(root, 'myproject'));
      const storageDir = fs.mkdtempSync(path.join(root, 'storage-'));
      const bot = makeBot(root, storageDir);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/workspace use myproject' }));
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg!.payload.text as string).toContain('myproject');
      const settings = await settingsService.getSettings(storageDir, makeChatId(CHAT_ID));
      expect(settings.activeWorkspace).toBe('myproject');
      expect(settings.cwd).toBe('');
    });
  });

  it('/workspace use <invalid slash> replies error', async () => {
    await withTmpRoot(async (root) => {
      const storageDir = fs.mkdtempSync(path.join(root, 'storage-'));
      const bot = makeBot(root, storageDir);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/workspace use foo/bar' }));
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg!.payload.text as string).toContain('tidak valid');
    });
  });

  it('/pwd after workspace set shows workspace/cwd', async () => {
    await withTmpRoot(async (root) => {
      fs.mkdirSync(path.join(root, 'proj'));
      fs.mkdirSync(path.join(root, 'proj', 'src'));
      const storageDir = fs.mkdtempSync(path.join(root, 'storage-'));
      const chatId = makeChatId(CHAT_ID);
      await settingsService.setActiveWorkspace(storageDir, chatId, 'proj');
      await settingsService.setCwd(storageDir, chatId, 'src');
      const bot = makeBot(root, storageDir);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/pwd' }));
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg!.payload.text as string).toContain('proj/src');
    });
  });

  it('/cd src updates cwd and replies new pwd', async () => {
    await withTmpRoot(async (root) => {
      fs.mkdirSync(path.join(root, 'proj'));
      fs.mkdirSync(path.join(root, 'proj', 'src'));
      const storageDir = fs.mkdtempSync(path.join(root, 'storage-'));
      const chatId = makeChatId(CHAT_ID);
      await settingsService.setActiveWorkspace(storageDir, chatId, 'proj');
      const bot = makeBot(root, storageDir);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/cd src' }));
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg!.payload.text as string).toContain('proj/src');
      const settings = await settingsService.getSettings(storageDir, chatId);
      expect(settings.cwd).toBe('src');
    });
  });

  it('/cd ../../etc is sanitized to workspace root (no escape)', async () => {
    await withTmpRoot(async (root) => {
      fs.mkdirSync(path.join(root, 'proj'));
      const storageDir = fs.mkdtempSync(path.join(root, 'storage-'));
      const chatId = makeChatId(CHAT_ID);
      await settingsService.setActiveWorkspace(storageDir, chatId, 'proj');
      const bot = makeBot(root, storageDir);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/cd ../../etc' }));
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      const text = msg!.payload.text as string;
      expect(text).toContain('proj');
      expect(text).not.toContain('etc');
      const settings = await settingsService.getSettings(storageDir, chatId);
      expect(settings.cwd).toBe('');
    });
  });

  it('/cd ~ resets cwd to empty', async () => {
    await withTmpRoot(async (root) => {
      fs.mkdirSync(path.join(root, 'proj'));
      fs.mkdirSync(path.join(root, 'proj', 'src'));
      const storageDir = fs.mkdtempSync(path.join(root, 'storage-'));
      const chatId = makeChatId(CHAT_ID);
      await settingsService.setActiveWorkspace(storageDir, chatId, 'proj');
      await settingsService.setCwd(storageDir, chatId, 'src');
      const bot = makeBot(root, storageDir);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/cd ~' }));
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg!.payload.text as string).toContain('proj');
      expect(msg!.payload.text as string).not.toContain('proj/src');
      const settings = await settingsService.getSettings(storageDir, chatId);
      expect(settings.cwd).toBe('');
    });
  });
});
