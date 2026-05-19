import { describe, expect, it } from 'vitest';

import { makeChatId } from '../../src/types/index.js';
import {
  getSettings,
  setActiveWorkspace,
  setCwd,
  setDefaultAgent,
  setDefaultMode,
  setDefaultModel,
  setActiveSession,
} from '../../src/services/settingsService.js';
import { withTmpRoot } from '../setup.js';

describe('settingsService', () => {
  it('getSettings returns defaults for unknown chatId', async () => {
    await withTmpRoot(async (root) => {
      const chatId = makeChatId(999);
      const settings = await getSettings(root, chatId);
      expect(settings.chatId).toBe(chatId);
      expect(settings.cwd).toBe('');
      expect(settings.defaultAgent).toBe('build');
      expect(settings.defaultMode).toBe('build');
      expect(settings.activeWorkspace).toBeUndefined();
      expect(settings.activeSessionId).toBeUndefined();
    });
  });

  it('setActiveWorkspace persists across new store instance', async () => {
    await withTmpRoot(async (root) => {
      const chatId = makeChatId(1);
      await setActiveWorkspace(root, chatId, '/my/workspace');
      const settings = await getSettings(root, chatId);
      expect(settings.activeWorkspace).toBe('/my/workspace');
    });
  });

  it('setDefaultAgent and setDefaultMode both persist', async () => {
    await withTmpRoot(async (root) => {
      const chatId = makeChatId(2);
      await setDefaultAgent(root, chatId, 'oracle');
      await setDefaultMode(root, chatId, 'plan');
      const settings = await getSettings(root, chatId);
      expect(settings.defaultAgent).toBe('oracle');
      expect(settings.defaultMode).toBe('plan');
    });
  });

  it('setCwd persists cwd value', async () => {
    await withTmpRoot(async (root) => {
      const chatId = makeChatId(3);
      await setCwd(root, chatId, '/some/path');
      const settings = await getSettings(root, chatId);
      expect(settings.cwd).toBe('/some/path');
    });
  });

  it('setActiveSession persists and clears sessionId', async () => {
    await withTmpRoot(async (root) => {
      const chatId = makeChatId(4);
      await setActiveSession(root, chatId, 'sess_abc');
      expect((await getSettings(root, chatId)).activeSessionId).toBe('sess_abc');
      await setActiveSession(root, chatId, null);
      expect((await getSettings(root, chatId)).activeSessionId).toBeUndefined();
    });
  });

  it('setDefaultModel persists and clears model', async () => {
    await withTmpRoot(async (root) => {
      const chatId = makeChatId(5);
      await setDefaultModel(root, chatId, { providerID: 'anthropic', modelID: 'claude-3' });
      expect((await getSettings(root, chatId)).defaultModel).toEqual({ providerID: 'anthropic', modelID: 'claude-3' });
      await setDefaultModel(root, chatId, undefined);
      expect((await getSettings(root, chatId)).defaultModel).toBeUndefined();
    });
  });
});
