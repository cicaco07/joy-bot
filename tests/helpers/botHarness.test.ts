import { Bot, Context } from 'grammy';
import { describe, expect, it } from 'vitest';

import { dispatchAndCapture, makeUpdate } from './botHarness.js';

describe('botHarness', () => {
  it('captures sendMessage from a command handler', async () => {
    const bot = new Bot<Context>('fake-token', {
      botInfo: {
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
      },
    });

    bot.command('ping', (ctx) => ctx.reply('pong'));

    const calls = await dispatchAndCapture(
      bot,
      makeUpdate({ chatId: 1, fromId: 42, text: '/ping' }),
    );

    expect(calls[0]?.method).toBe('sendMessage');
    expect((calls[0]?.payload as { text?: string }).text).toBe('pong');
  });
});
