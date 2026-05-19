import { describe, it, expect, vi } from 'vitest';
import { Bot, BotError, Context } from 'grammy';
import type { UserFromGetMe } from '@grammyjs/types';
import { createBot } from '../../src/bot/createBot.js';
import { createErrorHandler } from '../../src/bot/middleware/errorHandler.js';
import { Env } from '../../src/config/env.js';

const baseEnv: Env = {
  TELEGRAM_BOT_TOKEN: 'test-token-123456789',
  ALLOWED_TELEGRAM_USER_IDS: [100],
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

function makeUpdate(chatId: number, fromId: number, text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: chatId, type: 'private' as const, first_name: 'Test' },
      from: { id: fromId, is_bot: false as const, first_name: 'Test' },
      text,
    },
  };
}

function attachCapture(bot: Bot<Context>) {
  const calls: Array<{ method: string; payload: unknown }> = [];
  bot.api.config.use((prev, method, payload, signal) => {
    calls.push({ method, payload });
    if (method === 'sendMessage') {
      return Promise.resolve({
        ok: true as const,
        result: { message_id: 1, date: 0, chat: { id: 1, type: 'private' as const, first_name: 'Test' }, text: (payload as Record<string, unknown>)['text'] as string },
      }) as ReturnType<typeof prev>;
    }
    if (method === 'sendDocument') {
      return Promise.resolve({
        ok: true as const,
        result: { message_id: 2, date: 0, chat: { id: 1, type: 'private' as const, first_name: 'Test' } },
      }) as ReturnType<typeof prev>;
    }
    return prev(method, payload, signal);
  });
  return calls;
}

function attachInnerCapture(bot: Bot<Context>) {
  const calls: Array<{ method: string; payload: unknown }> = [];
  bot.api.config.use((_prev, method, payload, _signal) => {
    calls.push({ method, payload });
    return Promise.resolve({ ok: true as const, result: true }) as ReturnType<typeof _prev>;
  });
  return calls;
}

describe('createBot', () => {
  it('unauthorized user receives akses ditolak and handler is not called', async () => {
    const bot = createBot(baseEnv, testBotInfo);
    const calls = attachCapture(bot);
    const handlerCalled = vi.fn();
    bot.on('message', handlerCalled);

    await bot.handleUpdate(makeUpdate(1, 999, 'hello'));

    const sendCalls = calls.filter((c) => c.method === 'sendMessage');
    expect(sendCalls.length).toBeGreaterThan(0);
    const texts = sendCalls.map((c) => (c.payload as Record<string, unknown>)['text'] as string);
    expect(texts.some((t) => t.includes('Akses ditolak'))).toBe(true);
    expect(handlerCalled).not.toHaveBeenCalled();
  });

  it('authorized user passes through to handler', async () => {
    const bot = createBot(baseEnv, testBotInfo);
    attachCapture(bot);
    const handlerCalled = vi.fn();
    bot.on('message', handlerCalled);

    await bot.handleUpdate(makeUpdate(1, 100, 'hello'));

    expect(handlerCalled).toHaveBeenCalledOnce();
  });

  it('parse_mode HTML is injected into outbound sendMessage', async () => {
    const preBot = new Bot<Context>(baseEnv.TELEGRAM_BOT_TOKEN, { botInfo: testBotInfo });
    const calls: Array<{ method: string; payload: unknown }> = [];
    preBot.api.config.use((_prev, method, payload, _signal) => {
      calls.push({ method, payload });
      return Promise.resolve({ ok: true as const, result: true }) as ReturnType<typeof _prev>;
    });
    const bot = createBot(baseEnv, testBotInfo, preBot);
    bot.on('message', async (ctx) => {
      await ctx.reply('test message');
    });

    await bot.handleUpdate(makeUpdate(1, 100, 'hello'));

    const sendCalls = calls.filter((c) => c.method === 'sendMessage');
    expect(sendCalls.length).toBeGreaterThan(0);
    const parseModes = sendCalls.map((c) => (c.payload as Record<string, unknown>)['parse_mode']);
    expect(parseModes.every((pm) => pm === 'HTML')).toBe(true);
  });

  it('error handler replies with terjadi kesalahan', async () => {
    const bot = createBot(baseEnv, testBotInfo);
    const calls = attachCapture(bot);

    const update = makeUpdate(1, 100, 'hello');
    const ctx = new Context(update, bot.api, testBotInfo);
    const botErr = new BotError(new Error('boom'), ctx);
    await createErrorHandler(baseEnv)(botErr);

    const sendCalls = calls.filter((c) => c.method === 'sendMessage');
    const texts = sendCalls.map((c) => (c.payload as Record<string, unknown>)['text'] as string);
    expect(texts.some((t) => t.includes('Terjadi kesalahan'))).toBe(true);
  });
});
