import { resolveUnderRoot } from '../utils/pathGuard.js';
import { WorkspaceRef } from '../types/index.js';
import fs from 'fs';
import path from 'path';

/**
 * List direct children of projectsRoot that are directories (not hidden).
 * Returns sorted alphabetically.
 */
export function listWorkspaces(projectsRoot: string): WorkspaceRef[] {
  const entries = fs.readdirSync(projectsRoot, { withFileTypes: true });

  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e): WorkspaceRef => ({
      name: e.name,
      absolutePath: path.join(projectsRoot, e.name),
      relativePath: e.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve a workspace by name (direct child only — no slashes allowed in name).
 * Returns null if invalid, not found, or not a directory.
 */
export function resolveWorkspace(projectsRoot: string, name: string): WorkspaceRef | null {
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    return null;
  }

  const absPath = path.join(projectsRoot, name);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(absPath);
  } catch {
    return null;
  }

  if (!stat.isDirectory()) {
    return null;
  }

  return {
    name,
    absolutePath: absPath,
    relativePath: name,
  };
}

/**
 * Join cwd segments using posix semantics.
 * Handles .., ., absolute-looking input, normalizes separators.
 * Returns new relative cwd string (NOT validated — caller must call resolveCwd).
 */
export function joinCwd(currentRel: string, input: string): string {
  // Handle ~ as reset to root
  if (input === '~' || input.startsWith('~/') || input.startsWith('~\\')) {
    return '';
  }

  // Normalize input separators to posix
  const normalizedInput = input.replace(/\\/g, '/');

  // If input is absolute (starts with /), treat as reset to root
  if (normalizedInput.startsWith('/')) {
    return '';
  }

  const base = currentRel ? currentRel.replace(/\\/g, '/') : '.';
  const joined = path.posix.normalize(path.posix.join(base, normalizedInput));

  // Strip leading ./
  const stripped = joined.startsWith('./') ? joined.slice(2) : joined === '.' ? '' : joined;

  // If result escapes root, reset to root
  if (stripped.startsWith('..')) {
    return '';
  }

  return stripped;
}

/**
 * Validate that cwdRel is safe under workspaceAbsPath using pathGuard.
 */
export function resolveCwd(
  workspaceAbsPath: string,
  cwdRel: string,
): { ok: true; absolute: string; relative: string } | { ok: false; reason: string } {
  const input = cwdRel === '' ? '.' : cwdRel;
  const result = resolveUnderRoot(workspaceAbsPath, input);

  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  return { ok: true, absolute: result.absolute, relative: result.relative };
}
