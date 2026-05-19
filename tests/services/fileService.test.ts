import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ls, tree, cat, download, find } from '../../src/services/fileService.js';

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fileservice-test-'));
}

function rmTmp(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function write(p: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

describe('ls', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { rmTmp(tmp); });

  it('sorts dirs first then files alphabetically, excludes hidden by default', async () => {
    fs.mkdirSync(path.join(tmp, 'zebra-dir'));
    fs.mkdirSync(path.join(tmp, 'alpha-dir'));
    write(path.join(tmp, 'z-file.txt'), 'z');
    write(path.join(tmp, 'a-file.txt'), 'a');
    write(path.join(tmp, '.hidden'), 'h');

    const { entries } = await ls(tmp);

    expect(entries.find(e => e.name === '.hidden')).toBeUndefined();
    expect(entries[0]?.kind).toBe('dir');
    expect(entries[1]?.kind).toBe('dir');
    expect(entries[0]?.name).toBe('alpha-dir');
    expect(entries[1]?.name).toBe('zebra-dir');
    expect(entries[2]?.name).toBe('a-file.txt');
    expect(entries[3]?.name).toBe('z-file.txt');
  });

  it('includes dotfiles when showHidden: true', async () => {
    write(path.join(tmp, '.env'), 'secret');
    write(path.join(tmp, 'visible.txt'), 'hi');

    const { entries } = await ls(tmp, { showHidden: true });

    expect(entries.find(e => e.name === '.env')).toBeDefined();
    expect(entries.find(e => e.name === 'visible.txt')).toBeDefined();
  });

  it('returns size for files but not dirs', async () => {
    fs.mkdirSync(path.join(tmp, 'subdir'));
    write(path.join(tmp, 'file.txt'), 'hello');

    const { entries } = await ls(tmp);
    const dir = entries.find(e => e.name === 'subdir');
    const file = entries.find(e => e.name === 'file.txt');

    expect(dir?.size).toBeUndefined();
    expect(file?.size).toBe(5);
  });
});

describe('tree', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { rmTmp(tmp); });

  it('truncates at maxEntries and sets truncated: true', async () => {
    for (let i = 0; i < 5; i++) {
      write(path.join(tmp, `file${i}.txt`), 'x');
    }

    const result = await tree(tmp, { maxEntries: 3 });

    expect(result.truncated).toBe(true);
    expect(result.lines.length).toBe(4);
  });

  it('returns truncated: false when under limit', async () => {
    write(path.join(tmp, 'a.txt'), 'a');
    write(path.join(tmp, 'b.txt'), 'b');

    const result = await tree(tmp, { maxEntries: 200 });

    expect(result.truncated).toBe(false);
    expect(result.lines.length).toBe(3);
  });

  it('respects depth limit', async () => {
    fs.mkdirSync(path.join(tmp, 'level1', 'level2', 'level3'), { recursive: true });
    write(path.join(tmp, 'level1', 'level2', 'level3', 'deep.txt'), 'deep');

    const result = await tree(tmp, { depth: 2 });

    const hasDeep = result.lines.some(l => l.includes('deep.txt'));
    expect(hasDeep).toBe(false);
  });
});

describe('cat', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { rmTmp(tmp); });

  it('returns { kind: "text" } for a text file', async () => {
    const p = path.join(tmp, 'hello.txt');
    write(p, 'hello world');

    const result = await cat(p, 1024 * 1024);

    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.content).toBe('hello world');
      expect(result.bytes).toBe(11);
    }
  });

  it('returns { kind: "binary" } for a file containing NUL byte', async () => {
    const p = path.join(tmp, 'binary.bin');
    write(p, Buffer.from([0x50, 0x4b, 0x00, 0x04, 0x61, 0x62]));

    const result = await cat(p, 1024 * 1024);

    expect(result.kind).toBe('binary');
    if (result.kind === 'binary') {
      expect(result.bytes).toBe(6);
    }
  });

  it('returns { kind: "too_large" } when file exceeds maxBytes', async () => {
    const p = path.join(tmp, 'big.txt');
    write(p, 'a'.repeat(100));

    const result = await cat(p, 50);

    expect(result.kind).toBe('too_large');
    if (result.kind === 'too_large') {
      expect(result.bytes).toBe(100);
    }
  });

  it('returns { kind: "missing" } for non-existent file', async () => {
    const result = await cat(path.join(tmp, 'nope.txt'), 1024);
    expect(result.kind).toBe('missing');
  });

  it('returns { kind: "is_dir" } for a directory', async () => {
    const result = await cat(tmp, 1024);
    expect(result.kind).toBe('is_dir');
  });
});

describe('download', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { rmTmp(tmp); });

  it('returns ok: true with filePath and bytes on success', async () => {
    const p = path.join(tmp, 'data.txt');
    write(p, 'hello');

    const result = await download(p, 1024 * 1024);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.filePath).toBe(p);
      expect(result.bytes).toBe(5);
    }
  });

  it('returns ok: false reason: too_large when file exceeds maxBytes', async () => {
    const p = path.join(tmp, 'big.bin');
    write(p, 'x'.repeat(200));

    const result = await download(p, 100);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('too_large');
    }
  });

  it('returns ok: false reason: missing for non-existent file', async () => {
    const result = await download(path.join(tmp, 'ghost.txt'), 1024);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing');
  });

  it('returns ok: false reason: is_dir for a directory', async () => {
    const result = await download(tmp, 1024 * 1024);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('is_dir');
  });
});

describe('find', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { rmTmp(tmp); });

  it('name mode: matches filename case-insensitively', async () => {
    write(path.join(tmp, 'README.md'), '# readme');
    write(path.join(tmp, 'index.ts'), 'export {}');
    write(path.join(tmp, 'sub', 'readme.txt'), 'sub readme');

    const result = await find(tmp, 'readme', { mode: 'name' });

    expect(result.matches.length).toBe(2);
    expect(result.matches.every(m => m.path.toLowerCase().includes('readme'))).toBe(true);
    expect(result.truncated).toBe(false);
  });

  it('name mode: truncates at maxResults', async () => {
    for (let i = 0; i < 5; i++) {
      write(path.join(tmp, `match-${i}.txt`), 'x');
    }

    const result = await find(tmp, 'match', { mode: 'name', maxResults: 3 });

    expect(result.matches.length).toBe(3);
    expect(result.truncated).toBe(true);
  });

  it('content mode: finds query string with line number and preview', async () => {
    const p = path.join(tmp, 'source.ts');
    write(p, 'line one\nconst SECRET = "hello"\nline three\n');

    const result = await find(tmp, 'SECRET', { mode: 'content' });

    expect(result.matches.length).toBe(1);
    expect(result.matches[0]?.line).toBe(2);
    expect(result.matches[0]?.preview).toContain('SECRET');
  });

  it('content mode: skips binary files', async () => {
    const p = path.join(tmp, 'binary.bin');
    write(p, Buffer.from([0x00, 0x01, 0x02, 0x53, 0x45, 0x43, 0x52, 0x45, 0x54]));

    const result = await find(tmp, 'SECRET', { mode: 'content' });

    expect(result.matches.length).toBe(0);
  });
});
