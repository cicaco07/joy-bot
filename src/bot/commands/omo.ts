import { Bot, Context } from 'grammy';

import { Env } from '../../config/env.js';
import * as opencodeApiService from '../../services/opencodeApiService.js';
import * as sessionService from '../../services/sessionService.js';
import { makeChatId } from '../../types/index.js';
import { htmlEscape } from '../../utils/htmlEscape.js';

interface Deps { env: Env; storageDir: string; }

async function replyHtml(ctx: Context, text: string): Promise<void> {
  await ctx.reply(text, { parse_mode: 'HTML' });
}

function textFromMatch(match: string | RegExpMatchArray | undefined): string {
  if (typeof match === 'string') return match.trim();
  if (match === undefined) return '';
  return match[0]?.trim() ?? '';
}

export function register(bot: Bot<Context>, deps: Deps): void {
  const { env, storageDir } = deps;

  bot.command('omo', async (ctx) => {
    const chatId = makeChatId(ctx.chat!.id);
    const raw = textFromMatch(ctx.match);
    const parts = raw.split(/\s+/).filter(Boolean);
    const cmd = parts[0];

    if (!cmd) {
      await replyHtml(
        ctx,
        `Penggunaan: <code>/omo &lt;command&gt; [args...]</code>\nPerintah yang diizinkan: <code>${env.OMO_ALLOWED_COMMANDS.join(', ')}</code>`,
      );
      return;
    }

    const allowed = env.OMO_ALLOWED_COMMANDS;
    if (!allowed.includes(cmd)) {
      await replyHtml(
        ctx,
        `Perintah tidak diizinkan: <code>${htmlEscape(cmd)}</code>\nPerintah yang diizinkan: <code>${allowed.join(', ')}</code>`,
      );
      return;
    }

    const activeSession = await sessionService.getActiveSession(storageDir, chatId);
    if (activeSession === null || activeSession.opencodeSessionId === undefined) {
      await replyHtml(ctx, 'Buat session dulu dengan /session_new');
      return;
    }

    const argsStr = parts.slice(1).join(' ');
    await opencodeApiService.commandSession(env.OPENCODE_SERVER_URL, {
      sessionID: activeSession.opencodeSessionId,
      command: cmd,
      ...(argsStr ? { arguments: argsStr } : {}),
    });

    await replyHtml(ctx, `Perintah <code>${htmlEscape(cmd)}</code> dikirim ke session.`);
  });
}
