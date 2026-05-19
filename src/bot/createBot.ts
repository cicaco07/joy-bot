import { Bot, Context } from 'grammy';
import type { UserFromGetMe } from '@grammyjs/types';
import { Env } from '../config/env.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createErrorHandler } from './middleware/errorHandler.js';
import { createLoggingMiddleware } from './middleware/logging.js';

export function createBot(env: Env, botInfo?: UserFromGetMe, _bot?: Bot<Context>): Bot<Context> {
  const bot = _bot ?? new Bot<Context>(env.TELEGRAM_BOT_TOKEN, botInfo ? { botInfo } : undefined);

  bot.api.config.use((prev, method, payload, signal) => {
    if (method === 'sendMessage' || method === 'sendDocument') {
      return prev(method, { parse_mode: 'HTML', ...payload } as typeof payload, signal);
    }
    return prev(method, payload, signal);
  });

  bot.use(createLoggingMiddleware());
  bot.use(createAuthMiddleware(env));

  bot.catch(createErrorHandler(env));

  return bot;
}
