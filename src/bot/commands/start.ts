import { Bot, Context } from 'grammy';
import { Env } from '../../config/env.js';
import { formatStart } from '../../services/formatterService.js';

interface Deps { env: Env }

export function register(bot: Bot<Context>, deps: Deps): void {
  void deps;

  bot.command('start', async (ctx) => {
    const result = formatStart();
    if (result.kind === 'text') {
      await ctx.reply(result.text, { parse_mode: 'HTML' });
    }
  });
}
