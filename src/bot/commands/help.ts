import { Bot, Context } from 'grammy';
import { Env } from '../../config/env.js';
import { formatHelp } from '../../services/formatterService.js';

interface Deps { env: Env }

export function register(bot: Bot<Context>, deps: Deps): void {
  void deps;

  bot.command(['help', '?'], async (ctx) => {
    const result = formatHelp();
    if (result.kind === 'text') {
      await ctx.reply(result.text, { parse_mode: 'HTML' });
    }
  });
}
