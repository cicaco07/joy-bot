import { loadEnv, checkConfig } from './config/env.js';
import { createBot } from './bot/createBot.js';
import { ensureStorageLayout } from './utils/jsonStore.js';
import { recoverOnBoot } from './services/jobService.js';
import type { Env } from './config/env.js';
import { Bot, Context } from 'grammy';
import * as startCmd from './bot/commands/start.js';
import * as helpCmd from './bot/commands/help.js';
import * as workspaceCmd from './bot/commands/workspace.js';
import * as filesCmd from './bot/commands/files.js';
import * as opencodeCmd from './bot/commands/opencode.js';
import * as sessionsCmd from './bot/commands/sessions.js';
import * as jobsCmd from './bot/commands/jobs.js';
import * as logsCmd from './bot/commands/logs.js';
import * as settingsCmd from './bot/commands/settings.js';
import * as omoCmd from './bot/commands/omo.js';

export async function buildApp(env: Env, _bot?: Bot<Context>) {
  await ensureStorageLayout(env.STORAGE_DIR);
  const bot = createBot(env, undefined, _bot);
  const deps = { env, storageDir: env.STORAGE_DIR };

  startCmd.register(bot, deps);
  helpCmd.register(bot, deps);
  workspaceCmd.register(bot, deps);
  filesCmd.register(bot, deps);
  opencodeCmd.register(bot, deps);
  sessionsCmd.register(bot, deps);
  jobsCmd.register(bot, deps);
  logsCmd.register(bot, deps);
  settingsCmd.register(bot, deps);
  omoCmd.register(bot, deps);

  bot.on('message:text', async (ctx) => {
    if (!ctx.message.text.startsWith('/')) {
      await ctx.reply('Ketik /help untuk daftar perintah.', { parse_mode: 'HTML' });
    }
  });

  return { bot };
}

// Entry point — only run when executed directly
const isMain =
  process.argv[1]?.endsWith('index.ts') ||
  process.argv[1]?.endsWith('index.js');

if (isMain) {
  if (process.argv.includes('--check-config')) {
    checkConfig();
  } else {
    const env = loadEnv();
    await recoverOnBoot(env.STORAGE_DIR);
    const { bot } = await buildApp(env);

    process.once('SIGINT', () => { void bot.stop(); });
    process.once('SIGTERM', () => { void bot.stop(); });

    console.log(`Joy-bot starting. PROJECTS_ROOT=${env.PROJECTS_ROOT}`);
    await bot.start();
  }
}
