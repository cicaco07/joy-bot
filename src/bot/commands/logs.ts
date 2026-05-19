import { Bot, Context, InputFile } from 'grammy';
import { Env } from '../../config/env.js';
import { makeChatId } from '../../types/index.js';
import type { JobId } from '../../types/index.js';
import * as jobService from '../../services/jobService.js';
import * as logService from '../../services/logService.js';
import {
  formatLogPreview,
  type FormatterResult,
} from '../../services/formatterService.js';

interface Deps {
  env: Env;
  storageDir: string;
}

async function sendResult(ctx: Context, result: FormatterResult): Promise<void> {
  if (result.kind === 'text') {
    await ctx.reply(result.text, { parse_mode: 'HTML' });
  } else {
    const opts: Parameters<typeof ctx.replyWithDocument>[1] = { parse_mode: 'HTML' };
    if (result.caption !== undefined) {
      opts.caption = result.caption;
    }
    await ctx.replyWithDocument(new InputFile(result.filePath), opts);
  }
}

async function resolveJobId(
  storageDir: string,
  chatId: ReturnType<typeof makeChatId>,
  arg: string,
): Promise<{ jobId: JobId; logFile: string } | null> {
  const jobId = arg as JobId;
  const job = await jobService.getJob(storageDir, jobId);
  if (job === null || job.chatId !== chatId) {
    return null;
  }
  return { jobId, logFile: job.logFile };
}

export function register(bot: Bot<Context>, deps: Deps): void {
  const { storageDir } = deps;

  bot.command('logs', async (ctx) => {
    const chatId = makeChatId(ctx.chat!.id);
    const raw = (ctx.match as string).trim();
    const parts = raw.split(/\s+/);
    const sub = parts[0] ?? '';

    if (sub === 'latest' || sub === '') {
      const jobs = await jobService.listJobs(storageDir, chatId, { limit: 20 });
      const finished = jobs.find(
        (j) => j.status === 'done' || j.status === 'failed' || j.status === 'timeout' || j.status === 'cancelled' || j.status === 'interrupted',
      );
      if (finished === undefined) {
        await ctx.reply('Belum ada job selesai.', { parse_mode: 'HTML' });
        return;
      }
      const log = await logService.readLog(finished.logFile, { tail: 60 });
      await sendResult(ctx, formatLogPreview(finished.id, log, storageDir));
      return;
    }

    const resolved = await resolveJobId(storageDir, chatId, sub);
    if (resolved === null) {
      await ctx.reply('Job tidak ditemukan.', { parse_mode: 'HTML' });
      return;
    }

    const modifier = parts[1] ?? '';

    if (modifier === 'download') {
      const filePath = logService.getLogPath(storageDir, resolved.jobId);
      await ctx.replyWithDocument(new InputFile(filePath), {
        caption: `Log: ${resolved.jobId}`,
        parse_mode: 'HTML',
      });
      return;
    }

    if (modifier === 'errors') {
      const log = await logService.readLog(resolved.logFile, { filter: 'stderr' });
      await sendResult(ctx, formatLogPreview(resolved.jobId, log, storageDir, 'stderr'));
      return;
    }

    const log = await logService.readLog(resolved.logFile, { tail: 60 });
    await sendResult(ctx, formatLogPreview(resolved.jobId, log, storageDir));
  });
}
