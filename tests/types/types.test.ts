import { describe, expect, it } from 'vitest';

import { makeChatId, makeJobId, type ChatId } from '../../src/types/index.js';

function takesChatId(chatId: ChatId): ChatId {
  return chatId;
}

describe('domain types', () => {
  it('makeChatId produces a branded ChatId value', () => {
    const chatId = makeChatId(123456);

    expect(chatId).toBe(123456);
    expect(takesChatId(chatId)).toBe(123456);
  });

  it('makeJobId produces a branded JobId matching expected format', () => {
    const jobId = makeJobId();

    expect(jobId).toMatch(/^job_\d+_[a-z0-9]+$/);
  });

  it('rejects raw numbers where ChatId is required at compile time', () => {
    // @ts-expect-error raw number must not be assignable to ChatId
    takesChatId(123456);

    expect(true).toBe(true);
  });
});
