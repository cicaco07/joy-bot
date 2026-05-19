import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

import { Bot, Context } from 'grammy';
import type { UserFromGetMe } from '@grammyjs/types';
import { describe, expect, it } from 'vitest';

import { register } from '../../../src/bot/commands/sessions.js';
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

function makeEnv(serverUrl: string, storageDir: string): Env {
  return {
    TELEGRAM_BOT_TOKEN: 'fake-token',
    ALLOWED_TELEGRAM_USER_IDS: [2],
    PROJECTS_ROOT: storageDir,
    OPENCODE_COMMAND: 'opencode',
    OPENCODE_TIMEOUT_MS: 600000,
    PROGRESS_INTERVAL_MS: 30000,
    MAX_TELEGRAM_MESSAGE_CHARS: 3500,
    OPENCODE_SERVER_URL: serverUrl,
    OMO_ALLOWED_COMMANDS: ['review-work'],
    STORAGE_DIR: storageDir,
    LOG_RETENTION_JOBS: 100,
    FILE_READ_MAX_BYTES: 100000,
    DOCTOR_TIMEOUT_MS: 1000,
  };
}

function makeBot(storageDir: string, serverUrl: string): Bot<Context> {
  const bot = new Bot<Context>('fake-token', { botInfo: BOT_INFO });
  register(bot, { env: makeEnv(serverUrl, storageDir), storageDir });
  return bot;
}

async function withApiStub<T>(fn: (url: string) => Promise<T>): Promise<T> {
  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && req.url === '/v2/global/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v2/session') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'opencode-demo' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err === undefined ? resolve() : reject(err)));
    });
  }
}

function firstMessageText(calls: Awaited<ReturnType<typeof dispatchAndCapture>>): string {
  const text = calls.find((call) => call.method === 'sendMessage')?.payload.text;
  expect(typeof text).toBe('string');
  return text as string;
}

describe('session commands', () => {
  it('/session_new demo with API up creates, links, and activates a session', async () => {
    await withTmpRoot(async (root) => {
      await withApiStub(async (url) => {
        const bot = makeBot(root, url);
        const chatId = makeChatId(10);

        const calls = await dispatchAndCapture(bot, makeUpdate({ chatId, fromId: 2, text: '/session_new demo' }));
        const sessions = await sessionService.listSessions(root, chatId);
        const settings = await settingsService.getSettings(root, chatId);

        expect(firstMessageText(calls)).toContain('Session aktif');
        expect(sessions).toHaveLength(1);
        expect(sessions[0]?.title).toBe('demo');
        expect(sessions[0]?.opencodeSessionId).toBe('opencode-demo');
        expect(settings.activeSessionId).toBe(sessions[0]?.id);
      });
    });
  });

  it('/session_new demo with API down creates pending-api session and sends notice', async () => {
    await withTmpRoot(async (root) => {
      const bot = makeBot(root, 'http://127.0.0.1:1');
      const chatId = makeChatId(11);

      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId, fromId: 2, text: '/session_new demo' }));
      const sessions = await sessionService.listSessions(root, chatId);
      const settings = await settingsService.getSettings(root, chatId);

      expect(firstMessageText(calls)).toContain('pending-api');
      expect(firstMessageText(calls)).toContain('opencode serve tidak terjangkau');
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.opencodeSessionId).toBeUndefined();
      expect(settings.activeSessionId).toBe(sessions[0]?.id);
    });
  });

  it('/session_prompt hello with no active session tells user to create one first', async () => {
    await withTmpRoot(async (root) => {
      const bot = makeBot(root, 'http://127.0.0.1:1');
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: 12, fromId: 2, text: '/session_prompt hello' }));

      expect(firstMessageText(calls)).toContain('Buat session dulu');
    });
  });

  it('/session_use foreign-id rejects sessions owned by another chat', async () => {
    await withTmpRoot(async (root) => {
      const foreign = await sessionService.createSession(root, makeChatId(99), { title: 'foreign' });
      const bot = makeBot(root, 'http://127.0.0.1:1');

      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: 13, fromId: 2, text: `/session_use ${foreign.id}` }));

      expect(firstMessageText(calls)).toContain('Session tidak ditemukan');
    });
  });
});
