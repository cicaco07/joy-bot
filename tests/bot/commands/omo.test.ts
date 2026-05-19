import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

import { Bot, Context } from 'grammy';
import type { UserFromGetMe } from '@grammyjs/types';
import { describe, expect, it } from 'vitest';

import { register } from '../../../src/bot/commands/omo.js';
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
    OMO_ALLOWED_COMMANDS: ['review-work', 'handoff'],
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

async function withApiStub<T>(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  fn: (url: string) => Promise<T>,
): Promise<T> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  try {
    return await fn(url);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

describe('omo command', () => {
  it('/omo review-work with active session calls API', async () => {
    await withTmpRoot(async (root) => {
      const chatId = makeChatId(10);
      const session = await sessionService.createSession(root, chatId, { title: 'test' });

      const file = `${root}/sessions/${session.id}.json`;
      const fs = await import('node:fs/promises');
      const raw = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
      raw['opencodeSessionId'] = 'oc-session-1';
      await fs.writeFile(file, JSON.stringify(raw));

      await settingsService.setActiveSession(root, chatId, session.id);

      let commandCalled = false;

      await withApiStub(
        (req, res) => {
          if (req.method === 'POST' && req.url?.includes('/command')) {
            commandCalled = true;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          res.writeHead(404);
          res.end('{}');
        },
        async (url) => {
          const bot = makeBot(root, url);
          await dispatchAndCapture(bot, makeUpdate({ chatId: 10, fromId: 2, text: '/omo review-work' }));
        },
      );

      expect(commandCalled).toBe(true);
    });
  });

  it('/omo evil-cmd replies with tidak diizinkan and lists allowed', async () => {
    await withTmpRoot(async (root) => {
      const bot = makeBot(root, 'http://localhost:4096');
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: 10, fromId: 2, text: '/omo evil-cmd' }));
      const reply = calls.find((c) => c.method === 'sendMessage');
      expect(reply).toBeDefined();
      expect(reply!.payload.text).toContain('tidak diizinkan');
      expect(reply!.payload.text).toContain('review-work');
    });
  });

  it('/omo review-work with no active session replies Buat session dulu', async () => {
    await withTmpRoot(async (root) => {
      const bot = makeBot(root, 'http://localhost:4096');
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: 10, fromId: 2, text: '/omo review-work' }));
      const reply = calls.find((c) => c.method === 'sendMessage');
      expect(reply).toBeDefined();
      expect(reply!.payload.text).toContain('Buat session dulu');
    });
  });
});
