import { describe, it, expect, vi } from 'vitest';
import { Bot, BotError, Context } from 'grammy';
import type { UserFromGetMe } from '@grammyjs/types';
import { createAuthMiddleware } from '../../src/bot/middleware/auth.js';
import { createLoggingMiddleware } from '../../src/bot/middleware/logging.js';
import { createErrorHandler } from '../../src/bot/middleware/errorHandler.js';
import { Env } from '../../src/config/env.js';

const baseEnv: Env = {
  TELEGRAM_BOT_TOKEN: 'test-token-123456789',
  ALLOWED_TELEGRAM_USER_IDS: [100, 200],
  PROJECTS_ROOT: '/tmp',
  OPENCODE_COMMAND: 'opencode',
  OPENCODE_TIMEOUT_MS: 600000,
  PROGRESS_INTERVAL_MS: 30000,
  MAX_TELEGRAM_MESSAGE_CHARS: 3500,
  OPENCODE_SERVER_URL: 'http://localhost:4096',
  OMO_ALLOWED_COMMANDS: ['review-work'],
  STORAGE_DIR: '/tmp/storage',
  LOG_RETENTION_JOBS: 10,
  FILE_READ_MAX_BYTES: 1048576,
  DOCTOR_TIMEOUT_MS: 30000,
};

const testBotInfo: UserFromGetMe = {
  id: 42,
  is_bot: true,
  first_name: 'TestBot',
  username: 'testbot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  can_manage_bots: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
};

function makeBot() {
  const bot = new Bot<Context>('test-token-123456789', { botInfo: testBotInfo });
  const calls: Array<{ method: string; payload: unknown }> = [];
  bot.api.config.use((prev, method, payload, signal) => {
    calls.push({ method, payload });
    if (method === 'sendMessage') {
      return Promise.resolve({
        ok: true as const,
        result: { message_id: 1, date: 0, chat: { id: 1, type: 'private' as const, first_name: 'T' }, text: (payload as Record<string, unknown>)['text'] as string },
      }) as ReturnType<typeof prev>;
    }
    return prev(method, payload, signal);
  });
  return { bot, calls };
}

function makeUpdate(fromId: number, text = 'hi') {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' as const, first_name: 'Test' },
      from: { id: fromId, is_bot: false as const, first_name: 'Test' },
      text,
    },
  };
}

describe('createAuthMiddleware', () => {
  it('blocks user not in allowedUserIds', async () => {
    const { bot, calls } = makeBot();
    const next = vi.fn();
    bot.use(createAuthMiddleware(baseEnv));
    bot.on('message', next);

    await bot.handleUpdate(makeUpdate(999));

    const texts = calls
      .filter((c) => c.method === 'sendMessage')
      .map((c) => (c.payload as Record<string, unknown>)['text'] as string);
    expect(texts.some((t) => t.includes('Akses ditolak'))).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows user in allowedUserIds', async () => {
    const { bot } = makeBot();
    const next = vi.fn();
    bot.use(createAuthMiddleware(baseEnv));
    bot.on('message', next);

    await bot.handleUpdate(makeUpdate(100));

    expect(next).toHaveBeenCalledOnce();
  });

  it('blocks update with no from field', async () => {
    const { bot, calls } = makeBot();
    const next = vi.fn();
    bot.use(createAuthMiddleware(baseEnv));
    bot.on('message', next);

    const update = {
      update_id: 2,
      message: {
        message_id: 2,
        date: 0,
        chat: { id: 1, type: 'private' as const, first_name: 'Test' },
        text: 'hi',
      },
    };
    await bot.handleUpdate(update as Parameters<typeof bot.handleUpdate>[0]);

    const texts = calls
      .filter((c) => c.method === 'sendMessage')
      .map((c) => (c.payload as Record<string, unknown>)['text'] as string);
    expect(texts.some((t) => t.includes('Akses ditolak'))).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('createLoggingMiddleware', () => {
  it('calls next after logging', async () => {
    const { bot } = makeBot();
    const next = vi.fn();
    bot.use(createLoggingMiddleware());
    bot.on('message', next);

    await bot.handleUpdate(makeUpdate(100, 'test message'));

    expect(next).toHaveBeenCalledOnce();
  });

  it('logs update_id and chat id to console', async () => {
    const { bot } = makeBot();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    bot.use(createLoggingMiddleware());
    bot.on('message', async () => undefined);

    await bot.handleUpdate(makeUpdate(100, 'logged text'));

    expect(logSpy).toHaveBeenCalled();
    const logArg = logSpy.mock.calls[0]?.[0] as string;
    expect(logArg).toContain('update=1');
    logSpy.mockRestore();
  });

  it('truncates long text to 80 chars in log', async () => {
    const { bot } = makeBot();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    bot.use(createLoggingMiddleware());
    bot.on('message', async () => undefined);

    const longText = 'a'.repeat(200);
    await bot.handleUpdate(makeUpdate(100, longText));

    const logArg = logSpy.mock.calls[0]?.[0] as string;
    const textPart = logArg.split('text=')[1] ?? '';
    expect(textPart.length).toBeLessThanOrEqual(80);
    logSpy.mockRestore();
  });
});

describe('createErrorHandler', () => {
  it('replies with terjadi kesalahan on error', async () => {
    const { bot, calls } = makeBot();

    const update = makeUpdate(100);
    const ctx = new Context(update, bot.api, testBotInfo);
    const botErr = new BotError(new Error('test error'), ctx);
    await createErrorHandler(baseEnv)(botErr);

    const texts = calls
      .filter((c) => c.method === 'sendMessage')
      .map((c) => (c.payload as Record<string, unknown>)['text'] as string);
    expect(texts.some((t) => t.includes('Terjadi kesalahan'))).toBe(true);
  });
});
