import { join } from 'node:path';

import { z } from 'zod';

import { type ChatId, type Mode, type ModelRef, type SessionRecord } from '../types/index.js';
import { createJsonStore } from '../utils/jsonStore.js';
import { getSettings, setActiveSession } from './settingsService.js';

const modelRefSchema: z.ZodType<ModelRef> = z.object({
  providerID: z.string(),
  modelID: z.string(),
});

const sessionRecordSchema: z.ZodType<SessionRecord> = z.object({
  id: z.string(),
  chatId: z.number().transform((n) => n as ChatId),
  title: z.string(),
  opencodeSessionId: z.string().optional(),
  agent: z.string().optional(),
  model: modelRefSchema.optional(),
  mode: z.enum(['plan', 'build', 'deep', 'ultrawork']).optional() as z.ZodType<Mode | undefined>,
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(['active', 'aborted', 'archived', 'pending-api']),
}) as unknown as z.ZodType<SessionRecord>;

const indexSchema: z.ZodType<string[]> = z.array(z.string());

function sessionFile(storageDir: string, id: string): string {
  return join(storageDir, 'sessions', `${id}.json`);
}

function indexFile(storageDir: string): string {
  return join(storageDir, 'sessions', 'index.json');
}

function getSessionStore(storageDir: string, id: string) {
  return createJsonStore<SessionRecord | null>({
    file: sessionFile(storageDir, id),
    schema: sessionRecordSchema.nullable(),
    default: null,
  });
}

function getIndexStore(storageDir: string) {
  return createJsonStore<string[]>({
    file: indexFile(storageDir),
    schema: indexSchema,
    default: [],
  });
}

export async function createSession(
  storageDir: string,
  chatId: ChatId,
  input: { title: string; agent?: string; model?: ModelRef; mode?: Mode },
): Promise<SessionRecord> {
  const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const record: SessionRecord = {
    id,
    chatId,
    title: input.title,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...(input.agent !== undefined ? { agent: input.agent } : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.mode !== undefined ? { mode: input.mode } : {}),
  };

  const sessionStore = getSessionStore(storageDir, id);
  await sessionStore.write(record);

  const indexStore = getIndexStore(storageDir);
  await indexStore.update((ids) => [...ids, id]);

  return record;
}

export async function listSessions(storageDir: string, chatId: ChatId): Promise<SessionRecord[]> {
  const indexStore = getIndexStore(storageDir);
  const ids = await indexStore.read();

  const records = await Promise.all(ids.map((id) => getSession(storageDir, id)));

  return records.filter(
    (r): r is SessionRecord => r !== null && r.chatId === chatId,
  );
}

export async function getSession(storageDir: string, id: string): Promise<SessionRecord | null> {
  const store = getSessionStore(storageDir, id);
  return store.read();
}

export async function getActiveSession(storageDir: string, chatId: ChatId): Promise<SessionRecord | null> {
  const settings = await getSettings(storageDir, chatId);
  if (settings.activeSessionId === undefined) return null;
  return getSession(storageDir, settings.activeSessionId);
}

export async function linkOpencodeSession(storageDir: string, id: string, opencodeSessionId: string): Promise<void> {
  const store = getSessionStore(storageDir, id);
  await store.update((record) => {
    if (record === null) throw new Error(`Session not found: ${id}`);
    return { ...record, opencodeSessionId, updatedAt: new Date().toISOString() };
  });
}

export async function abortSession(storageDir: string, id: string): Promise<void> {
  const store = getSessionStore(storageDir, id);
  await store.update((record) => {
    if (record === null) throw new Error(`Session not found: ${id}`);
    return { ...record, status: 'aborted', updatedAt: new Date().toISOString() };
  });
}
