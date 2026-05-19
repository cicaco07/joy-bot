import { describe, expect, it } from 'vitest';

import { makeChatId } from '../../src/types/index.js';
import {
  createSession,
  listSessions,
  getSession,
  getActiveSession,
  linkOpencodeSession,
  abortSession,
} from '../../src/services/sessionService.js';
import { setActiveSession } from '../../src/services/settingsService.js';
import { withTmpRoot } from '../setup.js';

describe('sessionService', () => {
  it('createSession persists record with status active', async () => {
    await withTmpRoot(async (root) => {
      const chatId = makeChatId(1);
      const record = await createSession(root, chatId, { title: 'Test session' });
      expect(record.status).toBe('active');
      expect(record.chatId).toBe(chatId);
      expect(record.title).toBe('Test session');
      expect(record.id).toMatch(/^sess_/);

      const fetched = await getSession(root, record.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(record.id);
    });
  });

  it('listSessions returns sessions for correct chatId only', async () => {
    await withTmpRoot(async (root) => {
      const chatA = makeChatId(10);
      const chatB = makeChatId(20);
      await createSession(root, chatA, { title: 'A1' });
      await createSession(root, chatA, { title: 'A2' });
      await createSession(root, chatB, { title: 'B1' });

      const sessionsA = await listSessions(root, chatA);
      const sessionsB = await listSessions(root, chatB);

      expect(sessionsA).toHaveLength(2);
      expect(sessionsA.every((s) => s.chatId === chatA)).toBe(true);
      expect(sessionsB).toHaveLength(1);
      expect(sessionsB[0]!.title).toBe('B1');
    });
  });

  it('abortSession sets status to aborted', async () => {
    await withTmpRoot(async (root) => {
      const chatId = makeChatId(2);
      const record = await createSession(root, chatId, { title: 'To abort' });
      await abortSession(root, record.id);
      const updated = await getSession(root, record.id);
      expect(updated?.status).toBe('aborted');
    });
  });

  it('linkOpencodeSession sets opencodeSessionId', async () => {
    await withTmpRoot(async (root) => {
      const chatId = makeChatId(3);
      const record = await createSession(root, chatId, { title: 'Link test' });
      await linkOpencodeSession(root, record.id, 'oc_session_xyz');
      const updated = await getSession(root, record.id);
      expect(updated?.opencodeSessionId).toBe('oc_session_xyz');
    });
  });

  it('getActiveSession returns null when no active session set', async () => {
    await withTmpRoot(async (root) => {
      const chatId = makeChatId(4);
      const result = await getActiveSession(root, chatId);
      expect(result).toBeNull();
    });
  });

  it('getActiveSession returns correct session after setActiveSession', async () => {
    await withTmpRoot(async (root) => {
      const chatId = makeChatId(5);
      const record = await createSession(root, chatId, { title: 'Active one' });
      await setActiveSession(root, chatId, record.id);
      const active = await getActiveSession(root, chatId);
      expect(active?.id).toBe(record.id);
    });
  });
});
