import { Bot, Context, InputFile } from 'grammy';
import { Env } from '../../config/env.js';
import { makeChatId } from '../../types/index.js';
import type { JobId } from '../../types/index.js';
import * as jobService from '../../services/jobService.js';
import * as logService from '../../services/logService.js';
import {
  formatJobSummary,
  formatJobList,
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

export function register(bot: Bot<Context>, deps: Deps): void {
  const { storageDir } = deps;

  bot.command('status', async (ctx) => {
    const chatId = makeChatId(ctx.chat!.id);
    const job = await jobService.getActiveJobForChat(storageDir, chatId);
    if (job === null) {
      await ctx.reply('Tidak ada job berjalan.', { parse_mode: 'HTML' });
      return;
    }
    const log = await logService.readLog(job.logFile, { tail: 60 });
    await sendResult(ctx, formatJobSummary(job, log));
  });

  bot.command('jobs', async (ctx) => {
    const chatId = makeChatId(ctx.chat!.id);
    const jobs = await jobService.listJobs(storageDir, chatId, { limit: 10 });
    await sendResult(ctx, formatJobList(jobs));
  });

  bot.command('job', async (ctx) => {
    const chatId = makeChatId(ctx.chat!.id);
    const arg = (ctx.match as string).trim();
    if (!arg) {
      await ctx.reply('Gunakan: /job &lt;id&gt;', { parse_mode: 'HTML' });
      return;
    }
    const jobId = arg as JobId;
    const job = await jobService.getJob(storageDir, jobId);
    if (job === null || job.chatId !== chatId) {
      await ctx.reply('Job tidak ditemukan.', { parse_mode: 'HTML' });
      return;
    }
    const log = await logService.readLog(job.logFile, { tail: 60 });
    await sendResult(ctx, formatJobSummary(job, log));
  });

  bot.command('cancel', async (ctx) => {
    const chatId = makeChatId(ctx.chat!.id);
    const arg = (ctx.match as string).trim();

    if (!arg) {
      const job = await jobService.getActiveJobForChat(storageDir, chatId);
      if (job === null) {
        await ctx.reply('Tidak ada job berjalan.', { parse_mode: 'HTML' });
        return;
      }
      await jobService.cancelJob(storageDir, job.id);
      await ctx.reply(`Job <code>${job.id}</code> dibatalkan.`, { parse_mode: 'HTML' });
      return;
    }

    const jobId = arg as JobId;
    const job = await jobService.getJob(storageDir, jobId);
    if (job === null || job.chatId !== chatId) {
      await ctx.reply('Job tidak ditemukan.', { parse_mode: 'HTML' });
      return;
    }
    await jobService.cancelJob(storageDir, jobId);
    await ctx.reply(`Job <code>${jobId}</code> dibatalkan.`, { parse_mode: 'HTML' });
  });

  bot.command('cancel_all', async (ctx) => {
    const chatId = makeChatId(ctx.chat!.id);
    const jobs = await jobService.listJobs(storageDir, chatId);
    const active = jobs.filter(
      (j) => j.status === 'running' || j.status === 'pending',
    );
    if (active.length === 0) {
      await ctx.reply('Tidak ada job berjalan.', { parse_mode: 'HTML' });
      return;
    }
    for (const job of active) {
      await jobService.cancelJob(storageDir, job.id);
    }
    await ctx.reply(`${active.length} job dibatalkan.`, { parse_mode: 'HTML' });
  });
}
