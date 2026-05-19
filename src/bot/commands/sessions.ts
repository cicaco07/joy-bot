import { Bot, Context } from 'grammy';

import { Env } from '../../config/env.js';
import * as formatterService from '../../services/formatterService.js';
import * as opencodeApiService from '../../services/opencodeApiService.js';
import * as sessionService from '../../services/sessionService.js';
import * as settingsService from '../../services/settingsService.js';
import { makeChatId, type SessionRecord } from '../../types/index.js';
import { htmlEscape, htmlPre } from '../../utils/htmlEscape.js';

interface Deps { env: Env; storageDir: string; }

const NO_ACTIVE_SESSION = 'Buat session dulu dengan <code>/session_new &lt;judul&gt;</code>';
const API_UNAVAILABLE = 'opencode serve tidak terjangkau. Gunakan /run untuk CLI.';

function textFromMatch(match: string | RegExpMatchArray | undefined): string {
  if (typeof match === 'string') return match.trim();
  if (match === undefined) return '';
  return match[0]?.trim() ?? '';
}

async function replyHtml(ctx: Context, text: string): Promise<void> {
  await ctx.reply(text, { parse_mode: 'HTML' });
}

function formatUnknownResponse(response: unknown): string {
  if (response === undefined || response === null) return 'OK';
  if (typeof response === 'string') return htmlPre(response);
  if (typeof response === 'number' || typeof response === 'boolean') {
    return htmlEscape(String(response));
  }
  return htmlPre(JSON.stringify(response, null, 2));
}

async function tryCreateOpencodeSession(
  env: Env,
  storageDir: string,
  session: SessionRecord,
): Promise<SessionRecord | null> {
  const probe = await opencodeApiService.probe(env.OPENCODE_SERVER_URL);
  if (!probe.available) return null;

  const created = await opencodeApiService.createSession(env.OPENCODE_SERVER_URL, {
    title: session.title,
    ...(session.agent !== undefined ? { agent: session.agent } : {}),
    ...(session.model !== undefined ? { model: session.model } : {}),
    ...(session.mode !== undefined ? { mode: session.mode } : {}),
  });
  await sessionService.linkOpencodeSession(storageDir, session.id, created.id);
  return { ...session, opencodeSessionId: created.id, status: 'active' };
}

async function getActiveSessionOrReply(ctx: Context, storageDir: string): Promise<SessionRecord | null> {
  const chatId = makeChatId(ctx.chat!.id);
  const settings = await settingsService.getSettings(storageDir, chatId);
  if (settings.activeSessionId === undefined) {
    await replyHtml(ctx, NO_ACTIVE_SESSION);
    return null;
  }

  const session = await sessionService.getSession(storageDir, settings.activeSessionId);
  if (session === null || session.chatId !== chatId) {
    await replyHtml(ctx, NO_ACTIVE_SESSION);
    return null;
  }
  return session;
}

export function register(bot: Bot<Context>, deps: Deps): void {
  const { env, storageDir } = deps;

  bot.command('sessions', async (ctx) => {
    const chatId = makeChatId(ctx.chat.id);
    const sessions = await sessionService.listSessions(storageDir, chatId);
    const settings = await settingsService.getSettings(storageDir, chatId);
    const result = formatterService.formatSessions(sessions, settings.activeSessionId);
    const text = result.kind === 'text' ? result.text : result.caption ?? '';
    await replyHtml(ctx, text);
  });

  bot.command('session_new', async (ctx) => {
    const title = textFromMatch(ctx.match);
    if (title.length === 0) {
      await replyHtml(ctx, 'Penggunaan: <code>/session_new &lt;judul&gt;</code>');
      return;
    }

    const chatId = makeChatId(ctx.chat.id);
    const session = await sessionService.createSession(storageDir, chatId, { title });
    await settingsService.setActiveSession(storageDir, chatId, session.id);

    const linked = await tryCreateOpencodeSession(env, storageDir, session);
    if (linked === null) {
      await replyHtml(ctx, `Session dibuat: <code>${htmlEscape(session.id)}</code> (pending-api). ${API_UNAVAILABLE}`);
      return;
    }

    await replyHtml(ctx, `Session aktif: <code>${htmlEscape(linked.id)}</code>`);
  });

  bot.command('session_use', async (ctx) => {
    const id = textFromMatch(ctx.match);
    const chatId = makeChatId(ctx.chat.id);
    const session = id.length > 0 ? await sessionService.getSession(storageDir, id) : null;
    if (session === null || session.chatId !== chatId) {
      await replyHtml(ctx, 'Session tidak ditemukan');
      return;
    }

    await settingsService.setActiveSession(storageDir, chatId, session.id);
    await replyHtml(ctx, `Session aktif: <code>${htmlEscape(session.id)}</code>`);
  });

  bot.command('session_current', async (ctx) => {
    const session = await getActiveSessionOrReply(ctx, storageDir);
    if (session === null) return;

    const result = formatterService.formatSessions([session], session.id);
    const text = result.kind === 'text' ? result.text : result.caption ?? '';
    await replyHtml(ctx, text);
  });

  bot.command('session_prompt', async (ctx) => {
    const text = textFromMatch(ctx.match);
    const active = await getActiveSessionOrReply(ctx, storageDir);
    if (active === null) return;

    let session = active;
    if (session.opencodeSessionId === undefined) {
      const linked = await tryCreateOpencodeSession(env, storageDir, session);
      if (linked === null) {
        await replyHtml(ctx, API_UNAVAILABLE);
        return;
      }
      session = linked;
    }

    if (session.opencodeSessionId === undefined) {
      await replyHtml(ctx, API_UNAVAILABLE);
      return;
    }

    try {
      const response = await opencodeApiService.promptSession(env.OPENCODE_SERVER_URL, {
        sessionID: session.opencodeSessionId,
        text,
      });
      await replyHtml(ctx, formatUnknownResponse(response));
    } catch (err) {
      if (err instanceof opencodeApiService.OpencodeApiUnavailableError) {
        await replyHtml(ctx, API_UNAVAILABLE);
        return;
      }
      throw err;
    }
  });

  bot.command('session_command', async (ctx) => {
    const raw = textFromMatch(ctx.match);
    const [command = '', ...args] = raw.split(/\s+/).filter((part) => part.length > 0);
    const session = await getActiveSessionOrReply(ctx, storageDir);
    if (session === null) return;
    if (session.opencodeSessionId === undefined) {
      await replyHtml(ctx, API_UNAVAILABLE);
      return;
    }

    try {
      const response = await opencodeApiService.commandSession(env.OPENCODE_SERVER_URL, {
        sessionID: session.opencodeSessionId,
        command,
        arguments: { args },
      });
      await replyHtml(ctx, formatUnknownResponse(response));
    } catch (err) {
      if (err instanceof opencodeApiService.OpencodeApiUnavailableError) {
        await replyHtml(ctx, API_UNAVAILABLE);
        return;
      }
      throw err;
    }
  });

  bot.command('session_abort', async (ctx) => {
    const chatId = makeChatId(ctx.chat.id);
    const session = await getActiveSessionOrReply(ctx, storageDir);
    if (session === null) return;
    if (session.opencodeSessionId !== undefined) {
      try {
        await opencodeApiService.abortSession(env.OPENCODE_SERVER_URL, session.opencodeSessionId);
      } catch (err) {
        if (!(err instanceof opencodeApiService.OpencodeApiUnavailableError)) throw err;
      }
    }
    await sessionService.abortSession(storageDir, session.id);
    await settingsService.setActiveSession(storageDir, chatId, null);
    await replyHtml(ctx, `Session dibatalkan: <code>${htmlEscape(session.id)}</code>`);
  });
}
