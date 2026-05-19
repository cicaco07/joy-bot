import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Bot, Context } from 'grammy';
import type { UserFromGetMe } from '@grammyjs/types';
import { register } from '../../../src/bot/commands/logs.js';
import { dispatchAndCapture, makeUpdate } from '../../helpers/botHarness.js';
import { withTmpRoot } from '../../setup.js';
import { makeChatId } from '../../../src/types/index.js';
import * as jobService from '../../../src/services/jobService.js';
import * as logService from '../../../src/services/logService.js';

const BOT_INFO: UserFromGetMe = {
  id: 1,
  is_bot: true,
  first_name: 'Test',
  username: 'testbot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_manage_bots: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
};

const CHAT_ID = 42;
const FROM_ID = 99;

function makeBot(storageDir: string): Bot<Context> {
  const bot = new Bot<Context>('fake-token', { botInfo: BOT_INFO });
  register(bot, { env: {} as never, storageDir });
  return bot;
}

function makeJobInput(chatId: number, storageDir: string) {
  return {
    chatId: makeChatId(chatId),
    type: 'opencode.cli' as const,
    workspace: 'test-ws',
    cwd: storageDir,
    command: 'opencode',
    args: ['run', 'hello'],
    promptPreview: 'hello',
  };
}

describe('/logs <jobId> download', () => {
  it('calls sendDocument with the correct log file path', async () => {
    await withTmpRoot(async (root) => {
      const job = await jobService.createJob(root, makeJobInput(CHAT_ID, root));
      await jobService.markDone(root, job.id, 0);

      const logPath = logService.getLogPath(root, job.id);
      fs.mkdirSync(require('node:path').dirname(logPath), { recursive: true });
      fs.writeFileSync(logPath, '[2026-01-01T00:00:00.000Z] [stdout] hello\n', 'utf8');

      const bot = makeBot(root);
      const calls = await dispatchAndCapture(
        bot,
        makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: `/logs ${job.id} download` }),
      );
      const doc = calls.find((c) => c.method === 'sendDocument');
      expect(doc).toBeDefined();
    });
  });
});

describe('/logs <jobId> errors', () => {
  it('reply text contains only stderr lines', async () => {
    await withTmpRoot(async (root) => {
      const job = await jobService.createJob(root, makeJobInput(CHAT_ID, root));
      await jobService.markDone(root, job.id, 0);

      const logPath = logService.getLogPath(root, job.id);
      fs.mkdirSync(require('node:path').dirname(logPath), { recursive: true });
      fs.writeFileSync(
        logPath,
        '[2026-01-01T00:00:00.000Z] [stdout] normal output\n[2026-01-01T00:00:01.000Z] [stderr] error line\n',
        'utf8',
      );

      const bot = makeBot(root);
      const calls = await dispatchAndCapture(
        bot,
        makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: `/logs ${job.id} errors` }),
      );
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain('stderr');
      expect(msg?.payload.text).not.toContain('normal output');
    });
  });
});

describe('/logs latest', () => {
  it('shows log preview of last finished job', async () => {
    await withTmpRoot(async (root) => {
      const job = await jobService.createJob(root, makeJobInput(CHAT_ID, root));
      await jobService.markDone(root, job.id, 0);

      const logPath = logService.getLogPath(root, job.id);
      fs.mkdirSync(require('node:path').dirname(logPath), { recursive: true });
      fs.writeFileSync(logPath, '[2026-01-01T00:00:00.000Z] [stdout] finished output\n', 'utf8');

      const bot = makeBot(root);
      const calls = await dispatchAndCapture(
        bot,
        makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/logs latest' }),
      );
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain(job.id);
    });
  });

  it('replies "Belum ada job selesai" when no finished jobs', async () => {
    await withTmpRoot(async (root) => {
      const bot = makeBot(root);
      const calls = await dispatchAndCapture(
        bot,
        makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/logs latest' }),
      );
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain('Belum ada job selesai');
    });
  });
});
