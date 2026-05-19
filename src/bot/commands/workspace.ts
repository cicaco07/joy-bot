import { Bot, Context } from 'grammy';
import { Env } from '../../config/env.js';
import { htmlEscape } from '../../utils/htmlEscape.js';
import * as workspaceService from '../../services/workspaceService.js';
import * as settingsService from '../../services/settingsService.js';
import { formatWorkspaces } from '../../services/formatterService.js';
import { makeChatId } from '../../types/index.js';

interface Deps {
  env: Env;
  storageDir: string;
}

export function register(bot: Bot<Context>, deps: Deps): void {
  const { env, storageDir } = deps;

  bot.command('root', async (ctx) => {
    await ctx.reply(`<code>${htmlEscape(env.PROJECTS_ROOT)}</code>`, { parse_mode: 'HTML' });
  });

  bot.command('workspaces', async (ctx) => {
    const chatId = makeChatId(ctx.chat.id);
    const settings = await settingsService.getSettings(storageDir, chatId);
    const refs = workspaceService.listWorkspaces(env.PROJECTS_ROOT);
    const names = refs.map((r) => r.name);
    const result = formatWorkspaces(names, settings.activeWorkspace);
    const text = result.kind === 'text' ? result.text : result.caption ?? '';
    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  bot.command('workspace', async (ctx) => {
    const raw = (ctx.match ?? '').trim();
    const parts = raw.split(/\s+/);
    const sub = parts[0] ?? '';

    if (sub !== 'use') {
      await ctx.reply(
        `Penggunaan: <code>/workspace use &lt;nama&gt;</code>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const name = parts.slice(1).join(' ').trim();

    if (!name) {
      await ctx.reply(
        `Penggunaan: <code>/workspace use &lt;nama&gt;</code>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    if (name.includes('/') || name.includes('\\')) {
      await ctx.reply(
        `Nama workspace tidak valid: <code>${htmlEscape(name)}</code>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const ref = workspaceService.resolveWorkspace(env.PROJECTS_ROOT, name);
    if (!ref) {
      await ctx.reply(
        `Workspace tidak ditemukan: <code>${htmlEscape(name)}</code>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const chatId = makeChatId(ctx.chat.id);
    await settingsService.setActiveWorkspace(storageDir, chatId, name);
    await settingsService.setCwd(storageDir, chatId, '');

    await ctx.reply(
      `Workspace aktif: <code>${htmlEscape(name)}</code>`,
      { parse_mode: 'HTML' },
    );
  });

  bot.command('pwd', async (ctx) => {
    const chatId = makeChatId(ctx.chat.id);
    const settings = await settingsService.getSettings(storageDir, chatId);

    if (!settings.activeWorkspace) {
      await ctx.reply(
        `Tidak ada workspace aktif. Pilih workspace dulu dengan <code>/workspace use &lt;nama&gt;</code>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const display = settings.cwd
      ? `${settings.activeWorkspace}/${settings.cwd}`
      : settings.activeWorkspace;

    await ctx.reply(`<code>${htmlEscape(display)}</code>`, { parse_mode: 'HTML' });
  });

  bot.command('cd', async (ctx) => {
    const input = (ctx.match ?? '').trim();
    const chatId = makeChatId(ctx.chat.id);
    const settings = await settingsService.getSettings(storageDir, chatId);

    if (!settings.activeWorkspace) {
      await ctx.reply(
        `Pilih workspace dulu dengan <code>/workspace use &lt;nama&gt;</code>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    if (input === '~') {
      await settingsService.setCwd(storageDir, chatId, '');
      await ctx.reply(`<code>${htmlEscape(settings.activeWorkspace)}</code>`, { parse_mode: 'HTML' });
      return;
    }

    const ref = workspaceService.resolveWorkspace(env.PROJECTS_ROOT, settings.activeWorkspace);
    if (!ref) {
      await ctx.reply(
        `Workspace tidak ditemukan: <code>${htmlEscape(settings.activeWorkspace)}</code>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const newCwdRel = workspaceService.joinCwd(settings.cwd, input);
    const resolved = workspaceService.resolveCwd(ref.absolutePath, newCwdRel);

    if (!resolved.ok) {
      await ctx.reply(
        `Path tidak valid: ${htmlEscape(resolved.reason)}`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    await settingsService.setCwd(storageDir, chatId, resolved.relative);

    const display = resolved.relative
      ? `${settings.activeWorkspace}/${resolved.relative}`
      : settings.activeWorkspace;

    await ctx.reply(`<code>${htmlEscape(display)}</code>`, { parse_mode: 'HTML' });
  });
}
