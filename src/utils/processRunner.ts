import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';

export interface RunProcessOpts {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  env?: Record<string, string>;
  onChunk?: (kind: 'stdout' | 'stderr', chunk: string) => void;
  signal?: AbortSignal;
}

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  output: string;
  error?: string;
  timedOut: boolean;
}

export function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
    });
    killer.unref();
    return;
  }

  let forceKillTimer: NodeJS.Timeout | undefined;
  const clearForceKillTimer = () => {
    if (!forceKillTimer) return;
    clearTimeout(forceKillTimer);
    forceKillTimer = undefined;
  };

  child.once('close', clearForceKillTimer);
  child.once('exit', clearForceKillTimer);

  try {
    child.kill('SIGTERM');
  } catch {
    clearForceKillTimer();
    return;
  }

  forceKillTimer = setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch {
      // noop
    } finally {
      clearForceKillTimer();
    }
  }, 2000);

  forceKillTimer.unref();
}

export function parseCommand(text: string): { command: string; args: string[] } {
  if (fs.existsSync(text)) {
    return { command: text, args: [] };
  }

  const parts = tokenizeCommand(text);
  return {
    command: parts[0] ?? '',
    args: parts.slice(1),
  };
}

export function runProcess(opts: RunProcessOpts): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(normalizeSpawnCommand(opts.command), opts.args, {
      cwd: opts.cwd,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...opts.env,
        CI: '1',
        NO_COLOR: '1',
        TERM: 'dumb',
      },
    });

    const chunks: string[] = [];
    let finished = false;
    let timedOut = false;
    let settledCode: number | null = null;
    let settledSignal: NodeJS.Signals | null = null;

    const finalize = (result: RunResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      if (opts.signal) {
        opts.signal.removeEventListener('abort', onAbort);
      }
      resolve(result);
    };

    const handleChunk = (kind: 'stdout' | 'stderr', chunk: Buffer) => {
      const text = chunk.toString();
      chunks.push(text);
      opts.onChunk?.(kind, text);
    };

    const buildResult = (overrides: Partial<RunResult> = {}): RunResult => ({
      code: settledCode,
      signal: settledSignal,
      output: chunks.join(''),
      timedOut,
      ...overrides,
    });

    const onAbort = () => {
      killTree(child);
    };

    const timeoutId = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, opts.timeoutMs);

    if (opts.signal?.aborted) {
      timedOut = false;
      onAbort();
    } else if (opts.signal) {
      opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    child.stdout?.on('data', (chunk: Buffer) => handleChunk('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer) => handleChunk('stderr', chunk));

    child.on('error', (error) => {
      finalize(buildResult({ error: error.message }));
    });

    child.on('close', (code, signal) => {
      settledCode = code;
      settledSignal = signal;
      const combinedOutput = chunks.join('');

      const aborted = opts.signal?.aborted ?? false;
      if (!timedOut && !aborted && signal !== null && code === null && combinedOutput.length === 0) {
        timedOut = true;
      }

      const error = timedOut ? `Process timed out after ${opts.timeoutMs}ms` : aborted ? 'Process aborted' : undefined;
      finalize(error ? buildResult({ error, output: combinedOutput }) : buildResult({ output: combinedOutput }));
    });
  });
}

function normalizeSpawnCommand(command: string): string {
  if (process.platform !== 'win32') return command;
  if (!/\s/.test(command)) return command;
  if (command.startsWith('"') && command.endsWith('"')) return command;
  return `"${command}"`;
}

function tokenizeCommand(text: string): string[] {
  const parts: string[] = [];
  const tokenPattern = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;

  for (const match of text.matchAll(tokenPattern)) {
    const [, doubleQuoted = '', singleQuoted = '', bare = ''] = match;
    const raw = doubleQuoted || singleQuoted || bare;
    if (!raw) continue;
    parts.push(raw.replace(/\\(["'\\])/g, '$1'));
  }

  return parts;
}
