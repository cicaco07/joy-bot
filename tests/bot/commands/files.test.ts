import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Bot, Context } from 'grammy';
import type { UserFromGetMe } from '@grammyjs/types';
import { register } from '../../../src/bot/commands/files.js';
import { dispatchAndCapture, makeUpdate } from '../../helpers/botHarness.js';
import { withTmpRoot } from '../../setup.js';
import { setActiveWorkspace } from '../../../src/services/settingsService.js';
import { makeChatId } from '../../../src/types/index.js';

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

const CHAT_ID = 42;
const FROM_ID = 99;
const FILE_READ_MAX_BYTES = 1024 * 1024;

function makeBot(storageDir: string): Bot<Context> {
  const bot = new Bot<Context>('fake-token', { botInfo: BOT_INFO });
  register(bot, {
    env: { FILE_READ_MAX_BYTES } as never,
    storageDir,
  });
  return bot;
}

describe('/ls command', () => {
  it('replies with workspace prompt when no active workspace', async () => {
    await withTmpRoot(async (root) => {
      const bot = makeBot(root);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/ls' }));
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain('Pilih workspace dulu');
    });
  });

  it('returns file listing when active workspace is set', async () => {
    await withTmpRoot(async (root) => {
      const wsDir = path.join(root, 'myproject');
      fs.mkdirSync(wsDir);
      fs.writeFileSync(path.join(wsDir, 'hello.txt'), 'hi');
      fs.mkdirSync(path.join(wsDir, 'subdir'));

      await setActiveWorkspace(root, makeChatId(CHAT_ID), wsDir);

      const bot = makeBot(root);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/ls' }));
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain('hello.txt');
    });
  });
});

describe('/open command', () => {
  it('reports binary file with "(file biner" message', async () => {
    await withTmpRoot(async (root) => {
      const wsDir = path.join(root, 'ws');
      fs.mkdirSync(wsDir);
      const binFile = path.join(wsDir, 'image.bin');
      const buf = Buffer.alloc(16);
      buf[4] = 0;
      fs.writeFileSync(binFile, buf);

      await setActiveWorkspace(root, makeChatId(CHAT_ID), wsDir);

      const bot = makeBot(root);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/open image.bin' }));
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain('(file biner');
    });
  });
});

describe('/download command', () => {
  it('replies with "terlalu besar" when file exceeds max bytes', async () => {
    await withTmpRoot(async (root) => {
      const wsDir = path.join(root, 'ws');
      fs.mkdirSync(wsDir);
      const bigFile = path.join(wsDir, 'big.txt');
      fs.writeFileSync(bigFile, 'x'.repeat(10));

      await setActiveWorkspace(root, makeChatId(CHAT_ID), wsDir);

      const bot = makeBot(root);
      register(bot, {
        env: { FILE_READ_MAX_BYTES: 5 } as never,
        storageDir: root,
      });

      const smallBot = new Bot<Context>('fake-token', { botInfo: BOT_INFO });
      register(smallBot, {
        env: { FILE_READ_MAX_BYTES: 5 } as never,
        storageDir: root,
      });

      const calls = await dispatchAndCapture(smallBot, makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/download big.txt' }));
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain('terlalu besar');
    });
  });
});

describe('/find command', () => {
  it('returns matches for keyword search', async () => {
    await withTmpRoot(async (root) => {
      const wsDir = path.join(root, 'ws');
      fs.mkdirSync(wsDir);
      fs.writeFileSync(path.join(wsDir, 'readme.txt'), 'hello world');
      fs.writeFileSync(path.join(wsDir, 'notes.md'), 'some notes');
      fs.writeFileSync(path.join(wsDir, 'config.json'), '{}');

      await setActiveWorkspace(root, makeChatId(CHAT_ID), wsDir);

      const bot = makeBot(root);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/find readme' }));
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain('readme');
    });
  });

  it('returns content matches with --content flag', async () => {
    await withTmpRoot(async (root) => {
      const wsDir = path.join(root, 'ws');
      fs.mkdirSync(wsDir);
      fs.writeFileSync(path.join(wsDir, 'app.ts'), 'const secret = "jwt-token-here";');
      fs.writeFileSync(path.join(wsDir, 'other.ts'), 'const x = 1;');

      await setActiveWorkspace(root, makeChatId(CHAT_ID), wsDir);

      const bot = makeBot(root);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/find --content jwt' }));
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain('app.ts');
    });
  });
});

describe('/tree command', () => {
  it('returns tree output for active workspace', async () => {
    await withTmpRoot(async (root) => {
      const wsDir = path.join(root, 'ws');
      fs.mkdirSync(wsDir);
      fs.mkdirSync(path.join(wsDir, 'src'));
      fs.writeFileSync(path.join(wsDir, 'src', 'index.ts'), 'export {}');

      await setActiveWorkspace(root, makeChatId(CHAT_ID), wsDir);

      const bot = makeBot(root);
      const calls = await dispatchAndCapture(bot, makeUpdate({ chatId: CHAT_ID, fromId: FROM_ID, text: '/tree' }));
      const msg = calls.find((c) => c.method === 'sendMessage');
      expect(msg).toBeDefined();
      expect(msg?.payload.text).toContain('src');
    });
  });
});
