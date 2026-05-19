import { describe, expect, it } from 'vitest';
import { Bot, Context } from 'grammy';
import type { UserFromGetMe } from '@grammyjs/types';
import { register } from '../../../src/bot/commands/jobs.js';
import { dispatchAndCapture, makeUpdate } from '../../helpers/botHarness.js';
import { withTmpRoot } from '../../setup.js';
import { makeChatId } from '../../../src/types/index.js';
import * as jobService from '../../../src/services/jobService.js';

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

describe('/status command', () => {
  it('replies "Tidak ada job berjalan" when no active job', async () => {
    await withTmpRoot(async (root) => {
      const bot = makeBot(root);
      const calls = await dispatchAndCapture(
        bot,
        makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/status' }),
      );
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain('Tidak ada job berjalan');
    });
  });

  it('shows job info when active job exists', async () => {
    await withTmpRoot(async (root) => {
      const job = await jobService.createJob(root, makeJobInput(CHAT_ID, root));
      await jobService.markRunning(root, job.id, new AbortController());

      const bot = makeBot(root);
      const calls = await dispatchAndCapture(
        bot,
        makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/status' }),
      );
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain(job.id);
    });
  });
});

describe('/jobs command', () => {
  it('lists both job ids when 2 jobs exist', async () => {
    await withTmpRoot(async (root) => {
      const job1 = await jobService.createJob(root, makeJobInput(CHAT_ID, root));
      const job2 = await jobService.createJob(root, makeJobInput(CHAT_ID, root));

      const bot = makeBot(root);
      const calls = await dispatchAndCapture(
        bot,
        makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/jobs' }),
      );
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain(job1.id.slice(0, 16));
      expect(msg?.payload.text).toContain(job2.id.slice(0, 16));
    });
  });

  it('replies "Belum ada job" when no jobs exist', async () => {
    await withTmpRoot(async (root) => {
      const bot = makeBot(root);
      const calls = await dispatchAndCapture(
        bot,
        makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/jobs' }),
      );
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain('Belum ada job');
    });
  });
});

describe('/cancel command', () => {
  it('cancels active job and replies with confirmation', async () => {
    await withTmpRoot(async (root) => {
      const job = await jobService.createJob(root, makeJobInput(CHAT_ID, root));
      await jobService.markRunning(root, job.id, new AbortController());

      const bot = makeBot(root);
      const calls = await dispatchAndCapture(
        bot,
        makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/cancel' }),
      );
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain('dibatalkan');

      const updated = await jobService.getJob(root, job.id);
      expect(updated?.status).toBe('cancelled');
    });
  });

  it('replies "Tidak ada job berjalan" when no active job to cancel', async () => {
    await withTmpRoot(async (root) => {
      const bot = makeBot(root);
      const calls = await dispatchAndCapture(
        bot,
        makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/cancel' }),
      );
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain('Tidak ada job berjalan');
    });
  });

  it('rejects cancel of job belonging to another chat', async () => {
    await withTmpRoot(async (root) => {
      const otherChatId = 999;
      const job = await jobService.createJob(root, makeJobInput(otherChatId, root));
      await jobService.markRunning(root, job.id, new AbortController());

      const bot = makeBot(root);
      const calls = await dispatchAndCapture(
        bot,
        makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: `/cancel ${job.id}` }),
      );
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain('tidak ditemukan');

      const unchanged = await jobService.getJob(root, job.id);
      expect(unchanged?.status).toBe('running');
    });
  });
});
