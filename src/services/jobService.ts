import * as fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { JobRecord, JobId, JobStatus, ChatId, makeJobId } from '../types/index.js';
import { createJsonStore } from '../utils/jsonStore.js';

const activeControllers = new Map<JobId, AbortController>();

const jobStatusSchema = z.enum([
  'pending',
  'running',
  'done',
  'failed',
  'timeout',
  'cancelled',
  'interrupted',
]);

const jobRecordSchema = z.object({
  id: z.string() as unknown as z.ZodType<JobId>,
  chatId: z.number() as unknown as z.ZodType<ChatId>,
  type: z.enum(['opencode.cli', 'opencode.session', 'omo']),
  workspace: z.string(),
  cwd: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  status: jobStatusSchema,
  exitCode: z.number().int().optional(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  logFile: z.string(),
  promptPreview: z.string().optional(),
  sessionId: z.string().optional(),
}) as unknown as z.ZodType<JobRecord>;

interface JobIndexEntry {
  id: JobId;
  chatId: ChatId;
  startedAt: string;
}

const jobIndexEntrySchema = z.object({
  id: z.string() as unknown as z.ZodType<JobId>,
  chatId: z.number() as unknown as z.ZodType<ChatId>,
  startedAt: z.string(),
}) as unknown as z.ZodType<JobIndexEntry>;

const jobIndexSchema = z.array(jobIndexEntrySchema);

function jobsDir(storageDir: string): string {
  return path.join(storageDir, 'jobs');
}

function logsDir(storageDir: string): string {
  return path.join(storageDir, 'logs');
}

function jobFile(storageDir: string, id: JobId): string {
  return path.join(jobsDir(storageDir), `${id}.json`);
}

function indexFile(storageDir: string): string {
  return path.join(jobsDir(storageDir), 'index.json');
}

function jobStore(storageDir: string, id: JobId, fallback: JobRecord): ReturnType<typeof createJsonStore<JobRecord>> {
  return createJsonStore<JobRecord>({
    file: jobFile(storageDir, id),
    schema: jobRecordSchema,
    default: fallback,
  });
}

function indexStore(storageDir: string): ReturnType<typeof createJsonStore<JobIndexEntry[]>> {
  return createJsonStore<JobIndexEntry[]>({
    file: indexFile(storageDir),
    schema: jobIndexSchema,
    default: [],
  });
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

async function updateJob(
  storageDir: string,
  id: JobId,
  mutate: (job: JobRecord) => JobRecord,
): Promise<JobRecord> {
  const existing = await getJob(storageDir, id);
  if (existing === null) {
    throw new Error(`Job not found: ${id}`);
  }

  return jobStore(storageDir, id, existing).update(mutate);
}

async function appendSystemLog(job: JobRecord, message: string): Promise<void> {
  const line = `[${new Date().toISOString()}] ${message}\n`;

  fs.mkdir(path.dirname(job.logFile), { recursive: true })
    .then(() => fs.appendFile(job.logFile, line, 'utf8'))
    .catch(() => undefined);
}

function finishJob(status: JobStatus, extras: Partial<Pick<JobRecord, 'exitCode'>> = {}) {
  return (job: JobRecord): JobRecord => ({
    ...job,
    ...extras,
    status,
    endedAt: new Date().toISOString(),
  });
}

export async function createJob(
  storageDir: string,
  input: Omit<JobRecord, 'id' | 'startedAt' | 'status' | 'logFile'>,
): Promise<JobRecord> {
  const id = makeJobId();
  const startedAt = new Date().toISOString();
  const record: JobRecord = {
    ...input,
    id,
    status: 'pending',
    startedAt,
    logFile: path.join(logsDir(storageDir), `${id}.log`),
  };

  await fs.mkdir(logsDir(storageDir), { recursive: true });
  await jobStore(storageDir, id, record).write(record);
  await indexStore(storageDir).update((current) => [
    ...current,
    { id, chatId: record.chatId, startedAt },
  ]);

  return record;
}

export async function markRunning(storageDir: string, id: JobId, abort: AbortController): Promise<void> {
  await updateJob(storageDir, id, (job) => ({ ...job, status: 'running' }));
  activeControllers.set(id, abort);
}

export async function markDone(storageDir: string, id: JobId, exitCode: number): Promise<void> {
  await updateJob(storageDir, id, finishJob('done', { exitCode }));
  activeControllers.delete(id);
}

export async function markFailed(storageDir: string, id: JobId, error: string): Promise<void> {
  const updated = await updateJob(storageDir, id, finishJob('failed'));
  activeControllers.delete(id);
  await appendSystemLog(updated, `Job failed: ${error}`);
}

export async function markTimeout(storageDir: string, id: JobId): Promise<void> {
  const updated = await updateJob(storageDir, id, finishJob('timeout'));
  activeControllers.delete(id);
  await appendSystemLog(updated, 'Job timed out.');
}

export async function markCancelled(storageDir: string, id: JobId): Promise<void> {
  const updated = await updateJob(storageDir, id, finishJob('cancelled'));
  activeControllers.delete(id);
  await appendSystemLog(updated, 'Job cancelled.');
}

export async function markInterrupted(storageDir: string, id: JobId): Promise<void> {
  const updated = await updateJob(storageDir, id, finishJob('interrupted'));
  activeControllers.delete(id);
  await appendSystemLog(updated, 'Job interrupted by bot restart.');
}

export async function getJob(storageDir: string, id: JobId): Promise<JobRecord | null> {
  try {
    const raw = await fs.readFile(jobFile(storageDir, id), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return jobRecordSchema.parse(parsed);
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  }
}

export async function listJobs(
  storageDir: string,
  chatId: ChatId,
  opts: { limit?: number; status?: JobStatus } = {},
): Promise<JobRecord[]> {
  const index = await indexStore(storageDir).read();
  const records: JobRecord[] = [];

  for (const entry of index) {
    if (entry.chatId !== chatId) {
      continue;
    }

    const job = await getJob(storageDir, entry.id);
    if (job !== null && (opts.status === undefined || job.status === opts.status)) {
      records.push(job);
    }
  }

  const newestFirst = records.reverse();
  return typeof opts.limit === 'number' ? newestFirst.slice(0, opts.limit) : newestFirst;
}

export async function getActiveJobForChat(storageDir: string, chatId: ChatId): Promise<JobRecord | null> {
  const jobs = await listJobs(storageDir, chatId);
  return jobs.find((job) => job.status === 'running' || job.status === 'pending') ?? null;
}

export async function cancelJob(storageDir: string, id: JobId): Promise<void> {
  const controller = activeControllers.get(id);
  if (controller !== undefined) {
    controller.abort();
  }

  await markCancelled(storageDir, id);
}

export async function recoverOnBoot(storageDir: string): Promise<void> {
  const index = await indexStore(storageDir).read();

  for (const entry of index) {
    const job = await getJob(storageDir, entry.id);
    if (job?.status === 'running') {
      await markInterrupted(storageDir, entry.id);
    }
  }
}
