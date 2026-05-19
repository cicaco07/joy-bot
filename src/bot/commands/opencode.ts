import { Bot, Context } from 'grammy';

import type { Env } from '../../config/env.js';
import { makeChatId } from '../../types/index.js';
import * as jobService from '../../services/jobService.js';
import * as logService from '../../services/logService.js';
import * as settingsService from '../../services/settingsService.js';
import * as opencodeCliService from '../../services/opencodeCliService.js';
import * as formatterService from '../../services/formatterService.js';
import { htmlEscape } from '../../utils/htmlEscape.js';

interface Deps {
  env: Env;
  storageDir: string;
}

async function sendResult(
  ctx: Context,
  result: formatterService.FormatterResult,
): Promise<void> {
  if (result.kind === 'text') {
    await ctx.reply(result.text, { parse_mode: result.parseMode });
  } else if (result.caption !== undefined) {
    await ctx.replyWithDocument(result.filePath, {
      caption: result.caption,
      parse_mode: result.parseMode,
    });
  } else {
    await ctx.replyWithDocument(result.filePath, { parse_mode: result.parseMode });
  }
}

async function handleRun(
  ctx: Context,
  prompt: string,
  deps: Deps,
): Promise<void> {
  const chatId = makeChatId(ctx.chat!.id);
  const { env, storageDir } = deps;

  // 1. Check active workspace
  const settings = await settingsService.getSettings(storageDir, chatId);
  if (!settings.activeWorkspace) {
    await ctx.reply('Belum ada workspace aktif. Gunakan /workspace use &lt;name&gt; terlebih dahulu.', {
      parse_mode: 'HTML',
    });
    return;
  }

  // 2. Check for running job
  const activeJob = await jobService.getActiveJobForChat(storageDir, chatId);
  if (activeJob !== null) {
    await ctx.reply('Masih ada job berjalan. Gunakan /status atau /cancel.');
    return;
  }

  // 3. Create job
  const promptPreview = prompt.slice(0, 200);
  const job = await jobService.createJob(storageDir, {
    chatId,
    type: 'opencode.cli',
    workspace: settings.activeWorkspace,
    cwd: settings.cwd || settings.activeWorkspace,
    command: env.OPENCODE_COMMAND,
    args: ['run', promptPreview],
    promptPreview,
  });

  // 4. Reply starting
  await ctx.reply('Menjalankan opencode...');

  const abort = new AbortController();
  await jobService.markRunning(storageDir, job.id, abort);

  // 5. Progress interval
  const startedAt = Date.now();
  const progressInterval = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const m = Math.floor(elapsed / 60000);
    const s = Math.floor((elapsed % 60000) / 1000);
    ctx.reply(`Opencode masih berjalan... (${m}m ${s}s)`).catch(() => undefined);
  }, env.PROGRESS_INTERVAL_MS);

  try {
    const result = await opencodeCliService.runCli({
      prompt,
      cwd: settings.cwd || settings.activeWorkspace,
      env,
      jobId: job.id,
      abort,
      onChunk: (kind, chunk) => {
        logService.appendLog(job.logFile, kind, chunk).catch(() => undefined);
      },
    });

    const exitCode = result.code ?? 1;
    if (result.timedOut) {
      await jobService.markTimeout(storageDir, job.id);
    } else if (exitCode === 0) {
      await jobService.markDone(storageDir, job.id, exitCode);
    } else {
      await jobService.markFailed(storageDir, job.id, `exit code ${exitCode}`);
    }

    // 6. Read log and send summary
    const logPreview = await logService.readLog(job.logFile, { tail: 60 });
    const updatedJob = await jobService.getJob(storageDir, job.id);
    const formatted = formatterService.formatJobSummary(updatedJob ?? job, logPreview);
    await sendResult(ctx, formatted);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await jobService.markFailed(storageDir, job.id, msg);
    await ctx.reply(`❌ Error: ${htmlEscape(msg)}`, { parse_mode: 'HTML' });
  } finally {
    clearInterval(progressInterval);
  }
}

export function register(bot: Bot<Context>, deps: Deps): void {
  // /run <prompt>
  bot.command('run', async (ctx) => {
    const prompt = ctx.match?.trim() ?? '';
    if (!prompt) {
      await ctx.reply('Penggunaan: /run &lt;prompt&gt;', { parse_mode: 'HTML' });
      return;
    }
    await handleRun(ctx, prompt, deps);
  });

  // /task <prompt> — alias for /run
  bot.command('task', async (ctx) => {
    const prompt = ctx.match?.trim() ?? '';
    if (!prompt) {
      await ctx.reply('Penggunaan: /task &lt;prompt&gt;', { parse_mode: 'HTML' });
      return;
    }
    await handleRun(ctx, prompt, deps);
  });

  // /doctor
  bot.command('doctor', async (ctx) => {
    const result = await opencodeCliService.doctor(deps.env);
    const statusIcon = result.ok ? '✅' : '❌';
    const lines = [
      `<b>Doctor opencode</b> ${statusIcon}`,
      `Perintah: <code>${htmlEscape(result.command)}</code>`,
      `Exit code: <code>${result.exitCode ?? 'null'}</code>`,
      `CWD: <code>${htmlEscape(result.cwd)}</code>`,
    ];
    if (result.error) {
      lines.push(`Error: <code>${htmlEscape(result.error)}</code>`);
    }
    if (result.output) {
      const preview = result.output.slice(0, 500);
      lines.push(`\nOutput:\n<pre>${htmlEscape(preview)}</pre>`);
    }
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  // /opencode_help
  bot.command('opencode_help', async (ctx) => {
    const text = await opencodeCliService.helpText(deps.env);
    const MAX = 3500;
    if (text.length <= MAX) {
      await ctx.reply(`<pre>${htmlEscape(text)}</pre>`, { parse_mode: 'HTML' });
    } else {
      // Send as document via temp file approach — write inline
      const { default: fs } = await import('node:fs/promises');
      const { default: path } = await import('node:path');
      const tmpDir = path.join(deps.storageDir, 'tmp');
      await fs.mkdir(tmpDir, { recursive: true });
      const rand = Math.random().toString(36).slice(2, 10);
      const filePath = path.join(tmpDir, `opencode_help_${rand}.txt`);
      await fs.writeFile(filePath, text, 'utf8');
      await ctx.replyWithDocument(filePath, { caption: 'opencode --help' });
    }
  });
}
