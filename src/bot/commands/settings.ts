import { join } from 'node:path';

import { Bot, Context } from 'grammy';
import { z } from 'zod';

import { Env } from '../../config/env.js';
import * as sessionService from '../../services/sessionService.js';
import * as settingsService from '../../services/settingsService.js';
import { makeChatId, type Mode, type ModelRef, type SessionRecord } from '../../types/index.js';
import { createJsonStore } from '../../utils/jsonStore.js';
import { htmlEscape } from '../../utils/htmlEscape.js';

interface Deps { env: Env; storageDir: string; }

const VALID_MODES: Mode[] = ['plan', 'build', 'deep', 'ultrawork'];

async function replyHtml(ctx: Context, text: string): Promise<void> {
  await ctx.reply(text, { parse_mode: 'HTML' });
}

function textFromMatch(match: string | RegExpMatchArray | undefined): string {
  if (typeof match === 'string') return match.trim();
  if (match === undefined) return '';
  return match[0]?.trim() ?? '';
}

async function patchSessionModel(storageDir: string, sessionId: string, model: ModelRef): Promise<void> {
  const file = join(storageDir, 'sessions', `${sessionId}.json`);
  const store = createJsonStore<SessionRecord | null>({
    file,
    schema: z.unknown() as z.ZodType<SessionRecord | null>,
    default: null,
  });
  await store.update((record) => {
    if (record === null) throw new Error(`Session not found: ${sessionId}`);
    return { ...record, model, updatedAt: new Date().toISOString() };
  });
}

export function register(bot: Bot<Context>, deps: Deps): void {
  const { storageDir } = deps;

  bot.command('model', async (ctx) => {
    const chatId = makeChatId(ctx.chat!.id);
    const raw = textFromMatch(ctx.match);
    const parts = raw.split(/\s+/).filter(Boolean);

    if (parts[0] === 'list') {
      await replyHtml(
        ctx,
        'Gunakan <code>/model use &lt;providerID/modelID&gt;</code> untuk mengatur model',
      );
      return;
    }

    if (parts[0] === 'use') {
      const modelArg = parts[1];
      if (!modelArg) {
        await replyHtml(ctx, 'Penggunaan: <code>/model use &lt;providerID/modelID&gt;</code>');
        return;
      }

      const hasSessionFlag = parts.includes('--session');
      const slashIdx = modelArg.indexOf('/');
      if (slashIdx === -1) {
        await replyHtml(
          ctx,
          `Format model tidak valid: <code>${htmlEscape(modelArg)}</code>\nGunakan format <code>providerID/modelID</code>`,
        );
        return;
      }

      const providerID = modelArg.slice(0, slashIdx);
      const modelID = modelArg.slice(slashIdx + 1);

      if (hasSessionFlag) {
        const settings = await settingsService.getSettings(storageDir, chatId);
        if (settings.activeSessionId === undefined) {
          await replyHtml(ctx, 'Tidak ada session aktif. Buat session dulu dengan <code>/session_new</code>');
          return;
        }
        await patchSessionModel(storageDir, settings.activeSessionId, { providerID, modelID });
        await replyHtml(
          ctx,
          `Model session diatur ke <code>${htmlEscape(providerID)}/${htmlEscape(modelID)}</code>`,
        );
      } else {
        await settingsService.setDefaultModel(storageDir, chatId, { providerID, modelID });
        await replyHtml(
          ctx,
          `Model default diatur ke <code>${htmlEscape(providerID)}/${htmlEscape(modelID)}</code>`,
        );
      }
      return;
    }

    // /model — show current
    const settings = await settingsService.getSettings(storageDir, chatId);
    const defaultModel = settings.defaultModel
      ? `<code>${htmlEscape(settings.defaultModel.providerID)}/${htmlEscape(settings.defaultModel.modelID)}</code>`
      : '<i>tidak diatur</i>';

    let sessionModel = '';
    if (settings.activeSessionId !== undefined) {
      const session = await sessionService.getSession(storageDir, settings.activeSessionId);
      if (session?.model !== undefined) {
        sessionModel = `\nModel session aktif: <code>${htmlEscape(session.model.providerID)}/${htmlEscape(session.model.modelID)}</code>`;
      }
    }

    await replyHtml(ctx, `Model default: ${defaultModel}${sessionModel}`);
  });

  // /agent — show or set default agent
  bot.command('agent', async (ctx) => {
    const chatId = makeChatId(ctx.chat!.id);
    const raw = textFromMatch(ctx.match);
    const parts = raw.split(/\s+/).filter(Boolean);

    if (parts[0] === 'use') {
      const agentName = parts[1];
      if (!agentName) {
        await replyHtml(ctx, 'Penggunaan: <code>/agent use &lt;name&gt;</code>');
        return;
      }
      await settingsService.setDefaultAgent(storageDir, chatId, agentName);
      await replyHtml(ctx, `Agent default diatur ke <code>${htmlEscape(agentName)}</code>`);
      return;
    }

    // /agent — show current
    const settings = await settingsService.getSettings(storageDir, chatId);
    await replyHtml(ctx, `Agent default: <code>${htmlEscape(settings.defaultAgent)}</code>`);
  });

  // /mode <plan|build|deep|ultrawork>
  bot.command('mode', async (ctx) => {
    const chatId = makeChatId(ctx.chat!.id);
    const raw = textFromMatch(ctx.match);
    const modeArg = raw.split(/\s+/).filter(Boolean)[0];

    if (!modeArg) {
      const settings = await settingsService.getSettings(storageDir, chatId);
      await replyHtml(ctx, `Mode default: <code>${htmlEscape(settings.defaultMode)}</code>`);
      return;
    }

    if (!(VALID_MODES as string[]).includes(modeArg)) {
      await replyHtml(
        ctx,
        `Mode tidak valid: <code>${htmlEscape(modeArg)}</code>\nMode yang tersedia: <code>${VALID_MODES.join(', ')}</code>`,
      );
      return;
    }

    await settingsService.setDefaultMode(storageDir, chatId, modeArg as Mode);
    await replyHtml(ctx, `Mode default diatur ke <code>${htmlEscape(modeArg)}</code>`);
  });
}
