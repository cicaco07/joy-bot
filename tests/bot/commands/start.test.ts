import { describe, expect, it } from 'vitest';
import { Bot, Context } from 'grammy';
import type { UserFromGetMe } from '@grammyjs/types';
import { register } from '../../../src/bot/commands/start.js';
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

describe('/start command', () => {
  it('sends help text with /workspaces and /run', async () => {
    const bot = makeBot();
    const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: 1, fromId: 2, text: '/start' }));
    const sendMessage = calls.find((call) => call.method === 'sendMessage');

    expect(sendMessage).toBeDefined();
    expect(sendMessage?.payload.text).toContain('/workspaces');
    expect(sendMessage?.payload.text).toContain('/run');
  });

  it('does not include legacy commands', async () => {
    const bot = makeBot();
    const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: 1, fromId: 2, text: '/start' }));
    const sendMessage = calls.find((call) => call.method === 'sendMessage');

    expect(sendMessage).toBeDefined();
    expect(sendMessage?.payload.text).not.toContain('/folders');
    expect(sendMessage?.payload.text).not.toContain('/use ');
  });
});
