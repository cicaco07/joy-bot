import fs from 'node:fs';
import path from 'node:path';

type PathGuardFailureReason = 'invalid_input' | 'outside_root' | 'missing';

export type PathGuardResult =
  | { ok: true; absolute: string; relative: string }
  | { ok: false; reason: PathGuardFailureReason };

const realRootCache = new Map<string, string>();

export class PathGuardError extends Error {
  readonly reason: PathGuardFailureReason;

  constructor(reason: PathGuardFailureReason, root: string, input: string) {
    super(`Path is not allowed under root: ${reason}`);
    this.name = 'PathGuardError';
    this.reason = reason;
    Object.defineProperty(this, 'root', { value: root, enumerable: false });
    Object.defineProperty(this, 'input', { value: input, enumerable: false });
  }
}

export function resolveUnderRoot(root: string, input: string): PathGuardResult {
  if (!isValidInput(input)) {
    return { ok: false, reason: 'invalid_input' };
  }

  const candidate = path.isAbsolute(input) ? input : path.resolve(root, input);

  let realCandidate: string;
  let realRoot: string;

  try {
    realCandidate = fs.realpathSync.native(candidate);
    realRoot = realpathRoot(root);
  } catch {
    return { ok: false, reason: 'missing' };
  }

  if (!isUnderRealRoot(realRoot, realCandidate)) {
    return { ok: false, reason: 'outside_root' };
  }

  return {
    ok: true,
    absolute: realCandidate,
    relative: path.relative(realRoot, realCandidate),
  };
}

export function assertUnderRoot(root: string, input: string): { absolute: string; relative: string } {
  const result = resolveUnderRoot(root, input);

  if (!result.ok) {
    throw new PathGuardError(result.reason, root, input);
  }

  return { absolute: result.absolute, relative: result.relative };
}

function isValidInput(input: string): boolean {
  if (input.length === 0 || input.trim().length === 0 || input.includes('\0')) {
    return false;
  }

  return !startsWithWindowsDeviceNamespace(input);
}

function startsWithWindowsDeviceNamespace(input: string): boolean {
  return input.startsWith('\\\\?\\') || input.startsWith('\\\\.\\');
}

function realpathRoot(root: string): string {
  const resolvedRoot = path.resolve(root);
  const cached = realRootCache.get(resolvedRoot);

  if (cached !== undefined) {
    return cached;
  }

  const realRoot = fs.realpathSync.native(resolvedRoot);
  realRootCache.set(resolvedRoot, realRoot);
  return realRoot;
}

function isUnderRealRoot(realRoot: string, realCandidate: string): boolean {
  const normalizedRoot = normalizeForPlatform(realRoot);
  const normalizedCandidate = normalizeForPlatform(realCandidate);

  if (normalizedCandidate === normalizedRoot) {
    return true;
  }

  const relative = path.relative(normalizedRoot, normalizedCandidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function normalizeForPlatform(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.replaceAll('/', '\\').toLowerCase() : normalized;
}
