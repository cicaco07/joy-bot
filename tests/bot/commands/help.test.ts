import { describe, expect, it } from 'vitest';
import { Bot, Context } from 'grammy';
import type { UserFromGetMe } from '@grammyjs/types';
import { register } from '../../../src/bot/commands/help.js';
import { dispatchAndCapture, makeUpdate } from '../../helpers/botHarness.js';

const BOT_INFO: UserFromGetMe = {
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
};

function makeBot(): Bot<Context> {
  const bot = new Bot<Context>('fake-token', { botInfo: BOT_INFO });
  register(bot, { env: {} as never });
  return bot;
}

describe('/help command', () => {
  it('includes all required section headers', async () => {
    const bot = makeBot();
    const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: 1, fromId: 2, text: '/help' }));
    const text = calls.find((call) => call.method === 'sendMessage')?.payload.text;

    expect(text).toBeDefined();
    expect(text).toContain('Workspace');
    expect(text).toContain('Files');
    expect(text).toContain('Opencode');
    expect(text).toContain('Sessions');
    expect(text).toContain('Jobs');
    expect(text).toContain('Settings');
  });

  it('does not include legacy /folders command', async () => {
    const bot = makeBot();
    const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: 1, fromId: 2, text: '/help' }));
    const text = calls.find((call) => call.method === 'sendMessage')?.payload.text;

    expect(text).toBeDefined();
    expect(text).not.toContain('/folders');
  });
});
