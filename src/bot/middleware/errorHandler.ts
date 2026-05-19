import { BotError } from 'grammy';
import { Env } from '../../config/env.js';

export function createErrorHandler(_env: Env) {
  return async (err: BotError) => {
    console.error('Bot error:', err.error);
    try {
      await err.ctx.reply('⚠️ Terjadi kesalahan. Coba lagi atau ketik /help.', { parse_mode: 'HTML' });
    } catch { /* ignore reply failure */ }
  };
}
