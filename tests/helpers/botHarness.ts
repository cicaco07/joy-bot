import { Bot, Context } from 'grammy';
import type { Update } from '@grammyjs/types';

export interface CapturedCall {
  method: string;
  payload: Record<string, unknown>;
}

/**
 * Build a minimal Telegram Update for a text message command.
 */
export function makeUpdate(opts: {
  chatId: number;
  fromId: number;
  text: string;
  updateId?: number;
}): Update {
  const entities = opts.text.startsWith('/')
    ? [{ type: 'bot_command' as const, offset: 0, length: opts.text.split(' ')[0]!.length }]
    : [];

  return {
    update_id: opts.updateId ?? 1,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: opts.chatId, type: 'private' as const, first_name: 'TestChat' },
      from: { id: opts.fromId, is_bot: false, first_name: 'TestUser' },
      text: opts.text,
      entities,
    },
  };
}

/**
 * Attach an outbound capture transformer to the bot.
 * Returns the calls array (mutated as calls come in) and a restore function.
 */
export function attachOutboundCapture(bot: Bot<Context>): {
  calls: CapturedCall[];
  restore: () => void;
} {
  const calls: CapturedCall[] = [];

  bot.api.config.use((prev, method, payload, signal) => {
    calls.push({ method, payload: payload as Record<string, unknown> });

    if (method === 'sendMessage') {
      return Promise.resolve({
        ok: true,
        result: {
          message_id: calls.length,
          date: 0,
          chat: { id: (payload as { chat_id: number }).chat_id },
          text: (payload as { text?: string }).text ?? '',
        },
      } as any);
    }

    if (method === 'sendDocument') {
      return Promise.resolve({
        ok: true,
        result: {
          message_id: calls.length,
          date: 0,
          chat: { id: (payload as { chat_id: number }).chat_id },
        },
      } as any);
    }

    return prev(method, payload, signal);
  });

  return {
    calls,
    restore: () => {
      // grammY transformers are not easily removable; create a new bot per test
    },
  };
}

/**
 * Convenience: dispatch update and return captured calls.
 */
export async function dispatchAndCapture(
  bot: Bot<Context>,
  update: Update,
): Promise<CapturedCall[]> {
  const { calls } = attachOutboundCapture(bot);
  await bot.handleUpdate(update);
  return calls;
}
