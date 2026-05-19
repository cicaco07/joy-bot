import path from 'node:path';
import { Bot, Context, InputFile } from 'grammy';
import type { Env } from '../../config/env.js';
import * as fileService from '../../services/fileService.js';
import * as formatterService from '../../services/formatterService.js';
import * as settingsService from '../../services/settingsService.js';
import { resolveUnderRoot } from '../../utils/pathGuard.js';
import { makeChatId } from '../../types/index.js';

interface Deps {
  env: Env;
  storageDir: string;
}

async function getActiveWorkspace(
  ctx: Context,
  storageDir: string,
): Promise<{ workspaceAbsPath: string; cwd: string } | null> {
  const settings = await settingsService.getSettings(storageDir, makeChatId(ctx.chat!.id));
  if (!settings.activeWorkspace) {
    await ctx.reply(
      'Pilih workspace dulu dengan <code>/workspace use &lt;nama&gt;</code>',
      { parse_mode: 'HTML' },
    );
    return null;
  }
  return {
    workspaceAbsPath: settings.activeWorkspace,
    cwd: settings.cwd || '.',
  };
}

async function sendFormatterResult(
  ctx: Context,
  result: formatterService.FormatterResult,
): Promise<void> {
  if (result.kind === 'text') {
    await ctx.reply(result.text, { parse_mode: result.parseMode });
  } else {
    const opts: Parameters<typeof ctx.replyWithDocument>[1] = { parse_mode: result.parseMode };
    if (result.caption !== undefined) opts.caption = result.caption;
    await ctx.replyWithDocument(new InputFile(result.filePath), opts);
  }
}

export function register(bot: Bot<Context>, deps: Deps): void {
  const { env, storageDir } = deps;

  bot.command('ls', async (ctx) => {
    const ws = await getActiveWorkspace(ctx, storageDir);
    if (!ws) return;

    const inputPath = (ctx.match as string)?.trim() || ws.cwd || '.';
    const resolved = resolveUnderRoot(ws.workspaceAbsPath, inputPath);
    if (!resolved.ok) {
      await ctx.reply(`Path tidak valid: ${resolved.reason}`, { parse_mode: 'HTML' });
      return;
    }

    const result = await fileService.ls(resolved.absolute);
    const formatted = formatterService.formatLs(result.entries);
    await sendFormatterResult(ctx, formatted);
  });

  bot.command('tree', async (ctx) => {
    const ws = await getActiveWorkspace(ctx, storageDir);
    if (!ws) return;

    const inputPath = (ctx.match as string)?.trim() || ws.cwd || '.';
    const resolved = resolveUnderRoot(ws.workspaceAbsPath, inputPath);
    if (!resolved.ok) {
      await ctx.reply(`Path tidak valid: ${resolved.reason}`, { parse_mode: 'HTML' });
      return;
    }

    const result = await fileService.tree(resolved.absolute);
    const formatted = formatterService.formatTree(result.lines, result.truncated, storageDir);
    await sendFormatterResult(ctx, formatted);
  });

  async function handleOpen(ctx: Context): Promise<void> {
    const ws = await getActiveWorkspace(ctx, storageDir);
    if (!ws) return;

    const inputPath = (ctx.match as string)?.trim();
    if (!inputPath) {
      await ctx.reply('Gunakan: /open &lt;file&gt;', { parse_mode: 'HTML' });
      return;
    }

    const resolved = resolveUnderRoot(ws.workspaceAbsPath, inputPath);
    if (!resolved.ok) {
      await ctx.reply(`Path tidak valid: ${resolved.reason}`, { parse_mode: 'HTML' });
      return;
    }

    const catResult = await fileService.cat(resolved.absolute, env.FILE_READ_MAX_BYTES);
    const filename = path.basename(resolved.absolute);

    const content = catResult.kind === 'text' ? catResult.content : '';
    const bytes =
      catResult.kind !== 'missing' && catResult.kind !== 'is_dir' ? catResult.bytes : undefined;

    const formatted = formatterService.formatFile(content, filename, catResult.kind, bytes, storageDir);
    await sendFormatterResult(ctx, formatted);
  }

  bot.command('open', handleOpen);
  bot.command('cat', handleOpen);

  bot.command('find', async (ctx) => {
    const ws = await getActiveWorkspace(ctx, storageDir);
    if (!ws) return;

    const rawMatch = (ctx.match as string)?.trim() || '';
    if (!rawMatch) {
      await ctx.reply('Gunakan: /find &lt;keyword&gt; [--content]', { parse_mode: 'HTML' });
      return;
    }

    let mode: 'name' | 'content' = 'name';
    let keyword = rawMatch;

    if (rawMatch.includes('--content')) {
      mode = 'content';
      keyword = rawMatch.replace('--content', '').trim();
    }

    if (!keyword) {
      await ctx.reply('Keyword tidak boleh kosong.', { parse_mode: 'HTML' });
      return;
    }

    const resolved = resolveUnderRoot(ws.workspaceAbsPath, ws.cwd || '.');
    if (!resolved.ok) {
      await ctx.reply(`Path tidak valid: ${resolved.reason}`, { parse_mode: 'HTML' });
      return;
    }

    const findResult = await fileService.find(resolved.absolute, keyword, { mode });

    if (findResult.matches.length === 0) {
      await ctx.reply('Tidak ada hasil ditemukan.', { parse_mode: 'HTML' });
      return;
    }

    const lines = findResult.matches.map((m) => {
      const rel = path.relative(ws.workspaceAbsPath, m.path);
      if (m.line !== undefined && m.preview !== undefined) {
        return `${rel}:${m.line}: ${m.preview}`;
      }
      return rel;
    });

    const suffix = findResult.truncated ? '\n... (terpotong)' : '';
    const text = `<b>Hasil find:</b>\n<pre>${lines.join('\n')}${suffix}</pre>`;
    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  bot.command('download', async (ctx) => {
    const ws = await getActiveWorkspace(ctx, storageDir);
    if (!ws) return;

    const inputPath = (ctx.match as string)?.trim();
    if (!inputPath) {
      await ctx.reply('Gunakan: /download &lt;file&gt;', { parse_mode: 'HTML' });
      return;
    }

    const resolved = resolveUnderRoot(ws.workspaceAbsPath, inputPath);
    if (!resolved.ok) {
      await ctx.reply(`Path tidak valid: ${resolved.reason}`, { parse_mode: 'HTML' });
      return;
    }

    const dlResult = await fileService.download(resolved.absolute, env.FILE_READ_MAX_BYTES);

    if (!dlResult.ok) {
      if (dlResult.reason === 'missing') {
        await ctx.reply('File tidak ditemukan.', { parse_mode: 'HTML' });
      } else if (dlResult.reason === 'too_large') {
        await ctx.reply('File terlalu besar untuk diunduh.', { parse_mode: 'HTML' });
      } else {
        await ctx.reply('Path adalah direktori, bukan file.', { parse_mode: 'HTML' });
      }
      return;
    }

    const filename = path.basename(dlResult.filePath);
    await ctx.replyWithDocument(new InputFile(dlResult.filePath, filename));
  });
}
