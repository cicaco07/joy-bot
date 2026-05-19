import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { mkTmpRoot, withTmpRoot } from '../setup.js';
import {
  listWorkspaces,
  resolveWorkspace,
  joinCwd,
  resolveCwd,
} from '../../src/services/workspaceService.js';

describe('listWorkspaces', () => {
  it('returns sorted non-hidden directories only', async () => {
    await withTmpRoot(async (root) => {
      fs.mkdirSync(path.join(root, 'b'));
      fs.mkdirSync(path.join(root, 'a'));
      fs.mkdirSync(path.join(root, '.hidden'));
      fs.writeFileSync(path.join(root, 'file.txt'), '');

      const result = listWorkspaces(root);

      expect(result.map((w) => w.name)).toEqual(['a', 'b']);
      expect(result[0]?.absolutePath).toBe(path.join(root, 'a'));
      expect(result[0]?.relativePath).toBe('a');
    });
  });
});

describe('resolveWorkspace', () => {
  it('returns WorkspaceRef for valid existing workspace', async () => {
    await withTmpRoot(async (root) => {
      fs.mkdirSync(path.join(root, 'myproject'));

      const result = resolveWorkspace(root, 'myproject');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('myproject');
      expect(result?.absolutePath).toBe(path.join(root, 'myproject'));
      expect(result?.relativePath).toBe('myproject');
    });
  });

  it('returns null for unknown workspace name', async () => {
    await withTmpRoot(async (root) => {
      const result = resolveWorkspace(root, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  it('returns null for name containing slash', async () => {
    await withTmpRoot(async (root) => {
      const result = resolveWorkspace(root, 'foo/bar');
      expect(result).toBeNull();
    });
  });

  it('returns null for name containing ..', async () => {
    await withTmpRoot(async (root) => {
      const result = resolveWorkspace(root, '..');
      expect(result).toBeNull();
    });
  });
});

describe('joinCwd', () => {
  it('navigates up with ..', () => {
    expect(joinCwd('a/b', '..')).toBe('a');
  });

  it('resets to root when escaping beyond root', () => {
    expect(joinCwd('a', '../..')).toBe('');
  });

  it('resets to root for ~ input', () => {
    expect(joinCwd('', '~')).toBe('');
    expect(joinCwd('a/b', '~')).toBe('');
  });

  it('navigates into subdirectory', () => {
    expect(joinCwd('a', 'b')).toBe('a/b');
  });

  it('handles . (stay in place)', () => {
    expect(joinCwd('a/b', '.')).toBe('a/b');
  });

  it('resets to root for absolute-looking input', () => {
    expect(joinCwd('a/b', '/etc')).toBe('');
  });
});

describe('resolveCwd', () => {
  it('returns ok for valid nested path', async () => {
    await withTmpRoot(async (root) => {
      fs.mkdirSync(path.join(root, 'sub', 'deep'), { recursive: true });

      const result = resolveCwd(root, 'sub/deep');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.relative).toMatch(/sub/);
      }
    });
  });

  it('rejects escape attempt', async () => {
    await withTmpRoot(async (root) => {
      const result = resolveCwd(root, '../etc/passwd');

      expect(result.ok).toBe(false);
    });
  });

  it('treats empty cwdRel as workspace root', async () => {
    await withTmpRoot(async (root) => {
      const result = resolveCwd(root, '');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.relative).toBe('');
      }
    });
  });
});
