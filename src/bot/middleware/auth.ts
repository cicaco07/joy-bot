import { Middleware } from 'grammy';
import { Env } from '../../config/env.js';

export function createAuthMiddleware(env: Env): Middleware {
  return async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !env.ALLOWED_TELEGRAM_USER_IDS.includes(userId)) {
      await ctx.reply('<b>Akses ditolak.</b> Telegram user ID kamu tidak diizinkan.', { parse_mode: 'HTML' });
      return; // do NOT call next()
    }
    await next();
  };
}
