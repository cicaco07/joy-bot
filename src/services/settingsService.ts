import { join } from 'node:path';

import { z } from 'zod';

import { type Agent, type ChatId, type ChatSettings, type Mode, type ModelRef } from '../types/index.js';
import { createJsonStore } from '../utils/jsonStore.js';

const modelRefSchema: z.ZodType<ModelRef> = z.object({
  providerID: z.string(),
  modelID: z.string(),
});

const chatSettingsSchema: z.ZodType<ChatSettings> = z.object({
  chatId: z.number().transform((n) => n as ChatId),
  activeWorkspace: z.string().optional(),
  cwd: z.string(),
  activeSessionId: z.string().optional(),
  defaultAgent: z.string() as z.ZodType<Agent>,
  defaultMode: z.enum(['plan', 'build', 'deep', 'ultrawork']) as z.ZodType<Mode>,
  defaultModel: modelRefSchema.optional(),
}) as unknown as z.ZodType<ChatSettings>;

const settingsMapSchema: z.ZodType<Record<string, ChatSettings>> = z.record(
  z.string(),
  chatSettingsSchema,
) as unknown as z.ZodType<Record<string, ChatSettings>>;

type SettingsMap = Record<string, ChatSettings>;

function getStore(storageDir: string) {
  return createJsonStore<SettingsMap>({
    file: join(storageDir, 'settings.json'),
    schema: settingsMapSchema,
    default: {},
  });
}

function defaultSettings(chatId: ChatId): ChatSettings {
  return {
    chatId,
    cwd: '',
    defaultAgent: 'build',
    defaultMode: 'build',
  };
}

export async function getSettings(storageDir: string, chatId: ChatId): Promise<ChatSettings> {
  const store = getStore(storageDir);
  const map = await store.read();
  return map[String(chatId)] ?? defaultSettings(chatId);
}

export async function setActiveWorkspace(storageDir: string, chatId: ChatId, workspace: string): Promise<void> {
  const store = getStore(storageDir);
  await store.update((map) => {
    const current = map[String(chatId)] ?? defaultSettings(chatId);
    return { ...map, [String(chatId)]: { ...current, activeWorkspace: workspace } };
  });
}

export async function setCwd(storageDir: string, chatId: ChatId, cwd: string): Promise<void> {
  const store = getStore(storageDir);
  await store.update((map) => {
    const current = map[String(chatId)] ?? defaultSettings(chatId);
    return { ...map, [String(chatId)]: { ...current, cwd } };
  });
}

export async function setActiveSession(storageDir: string, chatId: ChatId, sessionId: string | null): Promise<void> {
  const store = getStore(storageDir);
  await store.update((map) => {
    const current = map[String(chatId)] ?? defaultSettings(chatId);
    if (sessionId === null) {
      const { activeSessionId: _removed, ...rest } = current;
      return { ...map, [String(chatId)]: rest };
    }
    return { ...map, [String(chatId)]: { ...current, activeSessionId: sessionId } };
  });
}

export async function setDefaultAgent(storageDir: string, chatId: ChatId, agent: Agent): Promise<void> {
  const store = getStore(storageDir);
  await store.update((map) => {
    const current = map[String(chatId)] ?? defaultSettings(chatId);
    return { ...map, [String(chatId)]: { ...current, defaultAgent: agent } };
  });
}

export async function setDefaultModel(storageDir: string, chatId: ChatId, model: ModelRef | undefined): Promise<void> {
  const store = getStore(storageDir);
  await store.update((map) => {
    const current = map[String(chatId)] ?? defaultSettings(chatId);
    if (model === undefined) {
      const { defaultModel: _removed, ...rest } = current;
      return { ...map, [String(chatId)]: rest };
    }
    return { ...map, [String(chatId)]: { ...current, defaultModel: model } };
  });
}

export async function setDefaultMode(storageDir: string, chatId: ChatId, mode: Mode): Promise<void> {
  const store = getStore(storageDir);
  await store.update((map) => {
    const current = map[String(chatId)] ?? defaultSettings(chatId);
    return { ...map, [String(chatId)]: { ...current, defaultMode: mode } };
  });
}
