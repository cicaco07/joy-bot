import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Bot, Context } from 'grammy';
import type { UserFromGetMe } from '@grammyjs/types';

import { withTmpRoot, mkTmpRoot } from '../setup.js';
import { makeUpdate, attachOutboundCapture } from '../helpers/botHarness.js';
import { makeChatId } from '../../src/types/index.js';
import type { Env } from '../../src/config/env.js';
import { createBot } from '../../src/bot/createBot.js';
import * as workspaceCmd from '../../src/bot/commands/workspace.js';
import * as filesCmd from '../../src/bot/commands/files.js';
import * as jobsCmd from '../../src/bot/commands/jobs.js';
import * as logsCmd from '../../src/bot/commands/logs.js';
import * as sessionsCmd from '../../src/bot/commands/sessions.js';
import * as omoCmd from '../../src/bot/commands/omo.js';
import * as startCmd from '../../src/bot/commands/start.js';
import * as opencodeCmd from '../../src/bot/commands/opencode.js';
import * as jobService from '../../src/services/jobService.js';
import * as settingsService from '../../src/services/settingsService.js';
import * as settingsCmd from '../../src/bot/commands/settings.js';

const ALLOWED_ID = 42;
const DENIED_ID = 99;

const FAKE_BOT_INFO = {
  id: 1,
  is_bot: true,
  first_name: 'TestBot',
  username: 'testbot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
} as unknown as UserFromGetMe;

function makeTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    TELEGRAM_BOT_TOKEN: 'fake-token',
    ALLOWED_TELEGRAM_USER_IDS: [ALLOWED_ID],
    PROJECTS_ROOT: overrides.PROJECTS_ROOT ?? os.tmpdir(),
    OPENCODE_COMMAND: `node ${path.resolve('tests/fixtures/fake-opencode.cjs')}`,
    OPENCODE_TIMEOUT_MS: 5000,
    PROGRESS_INTERVAL_MS: 60000,
    MAX_TELEGRAM_MESSAGE_CHARS: 3500,
    OPENCODE_SERVER_URL: 'http://localhost:19999',
    OMO_ALLOWED_COMMANDS: ['review-work', 'handoff'],
    STORAGE_DIR: overrides.STORAGE_DIR ?? os.tmpdir(),
    LOG_RETENTION_JOBS: 50,
    FILE_READ_MAX_BYTES: 1048576,
    DOCTOR_TIMEOUT_MS: 5000,
    ...overrides,
  } as Env;
}

type Calls = ReturnType<typeof attachOutboundCapture>['calls'];

function buildTestBot(env: Env, storageDir: string): { bot: Bot<Context>; calls: Calls } {
  const bot = createBot(env, FAKE_BOT_INFO);
  const { calls } = attachOutboundCapture(bot);

  startCmd.register(bot, { env });
  workspaceCmd.register(bot, { env, storageDir });
  filesCmd.register(bot, { env, storageDir });
  jobsCmd.register(bot, { env, storageDir });
  logsCmd.register(bot, { env, storageDir });
  sessionsCmd.register(bot, { env, storageDir });
  omoCmd.register(bot, { env, storageDir });
  opencodeCmd.register(bot, { env, storageDir });
  settingsCmd.register(bot, { env, storageDir });

  return { bot, calls };
}

async function dispatch(
  bot: Bot<Context>,
  calls: Calls,
  chatId: number,
  fromId: number,
  text: string,
): Promise<{ text: string; hasDocs: boolean }> {
  const before = calls.length;
  await bot.handleUpdate(makeUpdate({ chatId, fromId, text }));
  const newCalls = calls.slice(before);
  const msgs = newCalls.filter((c) => c.method === 'sendMessage');
  const docs = newCalls.filter((c) => c.method === 'sendDocument');
  const lastMsg = msgs[msgs.length - 1];
  return {
    text: (lastMsg?.payload as { text?: string })?.text ?? '',
    hasDocs: docs.length > 0,
  };
}

// ─── Flow A: browse workspace ─────────────────────────────────────────────────

describe('Flow A — browse workspace', () => {
  it('lists workspaces, selects one, navigates, lists files, opens and downloads a file', async () => {
    await withTmpRoot(async (root) => {
      const storageDir = mkTmpRoot('joy-storage-');
      try {
        const wsDir = path.join(root, 'myproject');
        fs.mkdirSync(wsDir, { recursive: true });
        fs.writeFileSync(path.join(wsDir, 'file.ts'), 'export const x = 1;');
        fs.writeFileSync(path.join(wsDir, 'main.ts'), 'console.log("hello");');

        const env = makeTestEnv({ PROJECTS_ROOT: root, STORAGE_DIR: storageDir });
        const { bot, calls } = buildTestBot(env, storageDir);

        const r1 = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/workspaces');
        expect(r1.text).toMatch(/myproject/);

        const r2 = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/workspace use myproject');
        expect(r2.text).toMatch(/myproject/);

        // files.ts uses settings.activeWorkspace as absolute path — patch it to the real abs path
        await settingsService.setActiveWorkspace(storageDir, makeChatId(ALLOWED_ID), wsDir);

        const r3 = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/cd .');
        expect(r3.text.length).toBeGreaterThan(0);

        const r4 = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/ls');
        expect(r4.text).toMatch(/main\.ts/);

        const r5 = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/open main.ts');
        expect(r5.text.length + (r5.hasDocs ? 1 : 0)).toBeGreaterThan(0);

        const r6 = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/download main.ts');
        expect(r6.hasDocs).toBe(true);
      } finally {
        fs.rmSync(storageDir, { recursive: true, force: true });
      }
    });
  });
});

// ─── Flow B: run job ──────────────────────────────────────────────────────────

describe('Flow B — run job with fake-opencode', () => {
  it('runs a job, lists jobs, views logs, downloads logs', async () => {
    await withTmpRoot(async (root) => {
      const storageDir = mkTmpRoot('joy-storage-');
      try {
        const wsDir = path.join(root, 'ws');
        fs.mkdirSync(wsDir, { recursive: true });

        const env = makeTestEnv({
          PROJECTS_ROOT: root,
          STORAGE_DIR: storageDir,
          OPENCODE_COMMAND: `node ${path.resolve('tests/fixtures/fake-opencode.cjs')}`,
          OPENCODE_TIMEOUT_MS: 5000,
        });
        const { bot, calls } = buildTestBot(env, storageDir);

        await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/workspace use ws');

        const runR = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/run hello');
        expect(runR.text.length).toBeGreaterThan(0);

        await new Promise((r) => setTimeout(r, 1500));

        const jobsR = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/jobs');
        expect(jobsR.text.length).toBeGreaterThan(0);

        const jobs = await jobService.listJobs(storageDir, makeChatId(ALLOWED_ID), { limit: 1 });
        expect(jobs.length).toBeGreaterThan(0);
        const jobId = jobs[0]!.id;

        const logsR = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, `/logs ${jobId}`);
        expect(logsR.text.length).toBeGreaterThan(0);

        const dlR = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, `/logs ${jobId} download`);
        expect(dlR.hasDocs).toBe(true);
      } finally {
        fs.rmSync(storageDir, { recursive: true, force: true });
      }
    });
  });
});

// ─── Flow C: session with API stub ───────────────────────────────────────────

describe('Flow C — session with API stub', () => {
  let stubServer: http.Server;
  let stubPort: number;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      stubServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk; });
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          if (req.url === '/health' || req.url === '/') {
            res.writeHead(200); res.end(JSON.stringify({ ok: true })); return;
          }
          if (req.url === '/session' && req.method === 'POST') {
            res.writeHead(200); res.end(JSON.stringify({ id: 'oc-sess-001', title: 'demo' })); return;
          }
          if (req.url?.startsWith('/session/') && (req.method === 'POST' || req.method === 'DELETE')) {
            res.writeHead(200); res.end(JSON.stringify({ ok: true })); return;
          }
          if (req.url?.includes('/command')) {
            res.writeHead(200); res.end(JSON.stringify({ ok: true })); return;
          }
          res.writeHead(404); res.end(JSON.stringify({ error: 'not found' }));
        });
      });
      stubServer.listen(0, '127.0.0.1', () => {
        stubPort = (stubServer.address() as { port: number }).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => stubServer.close(() => resolve()));
  });

  it('creates session, sets model/agent, sends prompt, aborts', async () => {
    await withTmpRoot(async (root) => {
      const storageDir = mkTmpRoot('joy-storage-');
      try {
        fs.mkdirSync(path.join(root, 'ws'), { recursive: true });

        const env = makeTestEnv({
          PROJECTS_ROOT: root,
          STORAGE_DIR: storageDir,
          OPENCODE_SERVER_URL: `http://127.0.0.1:${stubPort}`,
        });
        const { bot, calls } = buildTestBot(env, storageDir);

        const r1 = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/session_new demo');
        expect(r1.text.length).toBeGreaterThan(0);

        const r2 = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/model use 9router/foo');
        expect(r2.text.length).toBeGreaterThan(0);

        const r3 = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/agent use deep');
        expect(r3.text.length).toBeGreaterThan(0);

        const r4 = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/session_prompt hello');
        expect(r4.text.length).toBeGreaterThan(0);

        const r5 = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/session_abort');
        expect(r5.text.length).toBeGreaterThan(0);
      } finally {
        fs.rmSync(storageDir, { recursive: true, force: true });
      }
    });
  });
});

// ─── Flow D: omo allowlist ────────────────────────────────────────────────────

describe('Flow D — omo allowlist enforcement', () => {
  let stubServer: http.Server;
  let stubPort: number;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      stubServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk; });
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          if (req.url === '/health' || req.url === '/') {
            res.writeHead(200); res.end(JSON.stringify({ ok: true })); return;
          }
          if (req.url === '/session' && req.method === 'POST') {
            res.writeHead(200); res.end(JSON.stringify({ id: 'oc-sess-omo', title: 'x' })); return;
          }
          if (req.url?.includes('/command')) {
            res.writeHead(200); res.end(JSON.stringify({ ok: true })); return;
          }
          res.writeHead(404); res.end(JSON.stringify({ error: 'not found' }));
        });
      });
      stubServer.listen(0, '127.0.0.1', () => {
        stubPort = (stubServer.address() as { port: number }).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => stubServer.close(() => resolve()));
  });

  it('allows review-work and blocks bad-cmd', async () => {
    await withTmpRoot(async (root) => {
      const storageDir = mkTmpRoot('joy-storage-');
      try {
        fs.mkdirSync(path.join(root, 'ws'), { recursive: true });

        const env = makeTestEnv({
          PROJECTS_ROOT: root,
          STORAGE_DIR: storageDir,
          OPENCODE_SERVER_URL: `http://127.0.0.1:${stubPort}`,
          OMO_ALLOWED_COMMANDS: ['review-work', 'handoff'],
        });
        const { bot, calls } = buildTestBot(env, storageDir);

        await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/session_new x');

        const allowedR = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/omo review-work');
        expect(allowedR.text.length).toBeGreaterThan(0);

        const blockedR = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/omo bad-cmd');
        expect(blockedR.text).toMatch(/tidak diizinkan|Perintah yang diizinkan/i);
      } finally {
        fs.rmSync(storageDir, { recursive: true, force: true });
      }
    });
  });
});

// ─── Flow E: auth ─────────────────────────────────────────────────────────────

describe('Flow E — auth enforcement', () => {
  it('denies unauthorized user and allows authorized user', async () => {
    await withTmpRoot(async (root) => {
      const storageDir = mkTmpRoot('joy-storage-');
      try {
        const env = makeTestEnv({ PROJECTS_ROOT: root, STORAGE_DIR: storageDir });
        const { bot, calls } = buildTestBot(env, storageDir);

        const deniedR = await dispatch(bot, calls, DENIED_ID, DENIED_ID, '/start');
        expect(deniedR.text).toMatch(/Akses ditolak/i);

        const allowedR = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/start');
        expect(allowedR.text).not.toMatch(/Akses ditolak/i);
        expect(allowedR.text.length).toBeGreaterThan(0);
      } finally {
        fs.rmSync(storageDir, { recursive: true, force: true });
      }
    });
  });
});

// ─── Flow F: recoverOnBoot ────────────────────────────────────────────────────

describe('Flow F — recoverOnBoot marks running jobs as interrupted', () => {
  it('creates a running job, calls recoverOnBoot, then /jobs shows the job with interrupted badge', async () => {
    await withTmpRoot(async (root) => {
      const storageDir = mkTmpRoot('joy-storage-');
      try {
        const wsDir = path.join(root, 'ws');
        fs.mkdirSync(wsDir, { recursive: true });

        const chatId = makeChatId(ALLOWED_ID);

        const job = await jobService.createJob(storageDir, {
          chatId,
          type: 'opencode.cli',
          workspace: 'ws',
          cwd: wsDir,
          command: 'fake',
          args: ['run', 'test'],
          promptPreview: 'test',
        });

        const abort = new AbortController();
        await jobService.markRunning(storageDir, job.id, abort);

        const before = await jobService.getJob(storageDir, job.id);
        expect(before?.status).toBe('running');

        await jobService.recoverOnBoot(storageDir);

        const after = await jobService.getJob(storageDir, job.id);
        expect(after?.status).toBe('interrupted');

        const env = makeTestEnv({ PROJECTS_ROOT: root, STORAGE_DIR: storageDir });
        const { bot, calls } = buildTestBot(env, storageDir);

        const jobsR = await dispatch(bot, calls, ALLOWED_ID, ALLOWED_ID, '/jobs');
        expect(jobsR.text).toMatch(/⚠️/);
      } finally {
        fs.rmSync(storageDir, { recursive: true, force: true });
      }
    });
  });
});
