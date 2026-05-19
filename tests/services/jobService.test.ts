import * as fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  cancelJob,
  createJob,
  getActiveJobForChat,
  getJob,
  markDone,
  markRunning,
  recoverOnBoot,
} from '../../src/services/jobService.js';
import { JobRecord, ChatId, makeChatId } from '../../src/types/index.js';
import { withTmpRoot } from '../setup.js';

function jobInput(chatId: ChatId): Omit<JobRecord, 'id' | 'startedAt' | 'status' | 'logFile'> {
  return {
    chatId,
    type: 'opencode.cli',
    workspace: 'demo',
    cwd: process.cwd(),
    command: 'opencode',
    args: ['run', 'hello'],
    promptPreview: 'hello',
  };
}

describe('jobService', () => {
  it('createJob persists to disk and getJob returns it', async () => {
    await withTmpRoot(async (root) => {
      const job = await createJob(root, jobInput(makeChatId(101)));

      const stored = await getJob(root, job.id);
      const disk = await fs.readFile(path.join(root, 'jobs', `${job.id}.json`), 'utf8');
      const index = JSON.parse(await fs.readFile(path.join(root, 'jobs', 'index.json'), 'utf8')) as unknown;

      expect(stored).toEqual(job);
      expect(JSON.parse(disk)).toEqual(job);
      expect(index).toEqual([{ id: job.id, chatId: job.chatId, startedAt: job.startedAt }]);
      expect(job.status).toBe('pending');
      expect(job.logFile).toBe(path.join(root, 'logs', `${job.id}.log`));
    });
  });

  it('markDone updates status, exitCode, and endedAt', async () => {
    await withTmpRoot(async (root) => {
      const job = await createJob(root, jobInput(makeChatId(102)));

      await markDone(root, job.id, 7);

      const stored = await getJob(root, job.id);
      expect(stored?.status).toBe('done');
      expect(stored?.exitCode).toBe(7);
      expect(stored?.endedAt).toEqual(expect.any(String));
    });
  });

  it('cancelJob aborts the live controller and marks cancelled', async () => {
    await withTmpRoot(async (root) => {
      const job = await createJob(root, jobInput(makeChatId(103)));
      const controller = new AbortController();
      await markRunning(root, job.id, controller);

      await cancelJob(root, job.id);

      const stored = await getJob(root, job.id);
      expect(controller.signal.aborted).toBe(true);
      expect(stored?.status).toBe('cancelled');
      expect(stored?.endedAt).toEqual(expect.any(String));
    });
  });

  it('recoverOnBoot transitions running jobs to interrupted and writes a system log message', async () => {
    await withTmpRoot(async (root) => {
      const job = await createJob(root, jobInput(makeChatId(104)));
      await markRunning(root, job.id, new AbortController());

      await recoverOnBoot(root);
      await new Promise((resolve) => setTimeout(resolve, 25));

      const stored = await getJob(root, job.id);
      const log = await fs.readFile(job.logFile, 'utf8');
      expect(stored?.status).toBe('interrupted');
      expect(stored?.endedAt).toEqual(expect.any(String));
      expect(log).toContain('Job interrupted by bot restart.');
    });
  });

  it('getActiveJobForChat returns running job and null after done', async () => {
    await withTmpRoot(async (root) => {
      const chatId = makeChatId(105);
      const job = await createJob(root, jobInput(chatId));
      await markRunning(root, job.id, new AbortController());

      await expect(getActiveJobForChat(root, chatId)).resolves.toMatchObject({ id: job.id });

      await markDone(root, job.id, 0);

      await expect(getActiveJobForChat(root, chatId)).resolves.toBeNull();
    });
  });
});
