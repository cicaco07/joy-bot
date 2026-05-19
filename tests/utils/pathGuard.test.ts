import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { PathGuardError, assertUnderRoot, resolveUnderRoot } from '../../src/utils/pathGuard.js';

const isWindows = process.platform === 'win32';

let tmpRoot = '';
let outsideRoot = '';

beforeEach(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pathguard-'));
  tmpRoot = path.join(base, 'root');
  outsideRoot = path.join(base, 'outside');

  mkdir('a/b/c');
  mkdir('a/b');
  mkdir('proj/🚀');
  mkdir('my project/src');
  mkdir('src/lib');
  mkdir('.git');
  write('.env', 'secret');
  write('a/b/c/file.txt', 'nested');
  write('proj/🚀/file.ts', 'rocket');
  write('my project/src/index.ts', 'spaces');
  write('src/lib/index.ts', 'lib');
  write('.git/config', 'config');
  fs.mkdirSync(outsideRoot, { recursive: true });
  fs.writeFileSync(path.join(outsideRoot, 'secret.txt'), 'outside');

  fs.symlinkSync(path.join(outsideRoot, 'secret.txt'), path.join(tmpRoot, 'outside-file-link'));
  fs.symlinkSync(path.join(tmpRoot, 'a'), path.join(tmpRoot, 'inside-dir-link'), 'dir');
});

afterEach(() => {
  fs.rmSync(path.dirname(tmpRoot), { recursive: true, force: true });
});

describe('resolveUnderRoot', () => {
  test.each([
    ['normal nested', 'a/b/c', 'a/b/c'],
    ['mixed slashes', mixed('a\\b/c'), path.join('a', 'b', 'c')],
    ['dot directory', '.git', '.git'],
    ['dot file', '.env', '.env'],
    ['unicode emoji path', 'proj/🚀/file.ts', path.join('proj', '🚀', 'file.ts')],
    ['path with spaces', 'my project/src', path.join('my project', 'src')],
    ['./ prefix', './src/lib', path.join('src', 'lib')],
    ['multiple ./ segments', './a/./b', path.join('a', 'b')],
    ['relative through valid nested path', 'a/b/../b/c', path.join('a', 'b', 'c')],
    ['root itself with dot', '.', ''],
    ['root itself with absolute root', () => tmpRoot, ''],
    ['inside symlink', 'inside-dir-link/b/c', path.join('a', 'b', 'c')],
  ])('allows %s', (_name, inputSource, relativeSuffix) => {
    const input = typeof inputSource === 'function' ? inputSource() : inputSource;
    const result = resolveUnderRoot(tmpRoot, input);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error(result.reason);
    expect(result.absolute).toBe(fs.realpathSync.native(path.join(tmpRoot, relativeSuffix)));
    expect(result.relative).toBe(path.relative(fs.realpathSync.native(tmpRoot), result.absolute));
  });

  test.each([
    ['empty string', '', 'invalid_input'],
    ['whitespace only', '   ', 'invalid_input'],
    ['NUL byte', 'a\0b', 'invalid_input'],
    ['device namespace question mark', '\\\\?\\C:\\foo', 'invalid_input'],
    ['device namespace dot', '\\\\.\\COM1', 'invalid_input'],
    ['up traversal one level', '..', 'outside_root'],
    ['up traversal two levels', '../..', 'outside_root'],
    ['up traversal through nested path', 'a/../../outside', 'outside_root'],
    ['absolute POSIX outside', '/etc/passwd', isWindows ? 'missing' : 'outside_root'],
    ['missing nested file', 'a/b/c/missing.txt', 'missing'],
    ['UNC share', '\\\\server\\share', isWindows ? 'missing' : 'missing'],
    ['symlink pointing outside', 'outside-file-link', 'outside_root'],
  ])('rejects %s', (_name, input, reason) => {
    const result = resolveUnderRoot(tmpRoot, input);
    expect(result).toEqual({ ok: false, reason });
  });

  test('rejects absolute outside existing path', () => {
    const result = resolveUnderRoot(tmpRoot, path.join(outsideRoot, 'secret.txt'));
    expect(result).toEqual({ ok: false, reason: 'outside_root' });
  });

  test('handles a very long existing path', () => {
    const segments = Array.from({ length: 14 }, (_, index) => `segment-${index.toString().padStart(2, '0')}-longname`);
    const longRelative = path.join(...segments, 'file.txt');
    write(longRelative, 'long');

    const result = resolveUnderRoot(tmpRoot, longRelative);

    expect(longRelative.length).toBeGreaterThan(260);
    expect(result).toMatchObject({ ok: true });
  });

  test('returns missing when candidate realpath fails', () => {
    expect(resolveUnderRoot(tmpRoot, 'does-not-exist')).toEqual({ ok: false, reason: 'missing' });
  });

  test('returns missing when root realpath fails', () => {
    const missingRoot = path.join(tmpRoot, 'missing-root');
    expect(resolveUnderRoot(missingRoot, 'child')).toEqual({ ok: false, reason: 'missing' });
  });

  test('assertUnderRoot returns resolved paths for valid input', () => {
    const result = assertUnderRoot(tmpRoot, 'a/b/c');
    expect(result.absolute).toBe(fs.realpathSync.native(path.join(tmpRoot, 'a/b/c')));
    expect(result.relative).toBe(path.relative(fs.realpathSync.native(tmpRoot), result.absolute));
  });

  test('assertUnderRoot throws PathGuardError on invalid input', () => {
    expect(() => assertUnderRoot(tmpRoot, '..')).toThrow(PathGuardError);

    try {
      assertUnderRoot(tmpRoot, '..');
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(PathGuardError);
      expect((error as PathGuardError).reason).toBe('outside_root');
    }
  });

  test.skipIf(!isWindows)('rejects Windows absolute outside path', () => {
    const result = resolveUnderRoot(tmpRoot, 'C:\\Windows');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(['outside_root', 'missing']).toContain(result.reason);
  });

  test.skipIf(!isWindows)('rejects drive swap absolute path', () => {
    const drive = path.parse(tmpRoot).root.slice(0, 1).toUpperCase() === 'C' ? 'D' : 'C';
    const result = resolveUnderRoot(tmpRoot, `${drive}:\\foo`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(['outside_root', 'missing']).toContain(result.reason);
  });

  test.skipIf(!isWindows)('allows case-only difference on Windows', () => {
    mkdir('CaseOnly/SRC');
    const result = resolveUnderRoot(tmpRoot.toUpperCase(), 'caseonly/src');
    expect(result).toMatchObject({ ok: true });
  });

  test.skipIf(!isWindows)('rejects junction pointing outside', () => {
    const junction = path.join(tmpRoot, 'outside-junction');
    fs.symlinkSync(outsideRoot, junction, 'junction');

    expect(resolveUnderRoot(tmpRoot, 'outside-junction/secret.txt')).toEqual({ ok: false, reason: 'outside_root' });
  });
});

function mkdir(relative: string): void {
  fs.mkdirSync(path.join(tmpRoot, relative), { recursive: true });
}

function write(relative: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(tmpRoot, relative)), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, relative), content);
}

function mixed(value: string): string {
  return isWindows ? value : value.replaceAll('\\', '/');
}
