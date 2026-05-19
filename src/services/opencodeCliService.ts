import path from 'node:path';

import { runProcess, parseCommand } from '../utils/processRunner.js';
import type { Env } from '../config/env.js';
import type { JobId } from '../types/index.js';

export interface CliRunOpts {
  prompt: string;
  cwd: string;
  env: Env;
  jobId: JobId;
  abort: AbortController;
  onChunk: (kind: 'stdout' | 'stderr', chunk: string) => void;
}

export interface CliRunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}

export interface DoctorResult {
  ok: boolean;
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  output: string;
  error?: string;
}

export async function runCli(opts: CliRunOpts): Promise<CliRunResult> {
  const { command, args: parsedArgs } = parseCommand(opts.env.OPENCODE_COMMAND);
  const result = await runProcess({
    command,
    args: [...parsedArgs, 'run', opts.prompt],
    cwd: opts.cwd,
    timeoutMs: opts.env.OPENCODE_TIMEOUT_MS,
    signal: opts.abort.signal,
    onChunk: opts.onChunk,
  });
  return {
    code: result.code,
    signal: result.signal,
    timedOut: result.timedOut,
  };
}

export async function doctor(env: Env): Promise<DoctorResult> {
  const { command, args: parsedArgs } = parseCommand(env.OPENCODE_COMMAND);
  const cwd = process.cwd();
  try {
    const result = await runProcess({
      command,
      args: [...parsedArgs, '--help'],
      cwd,
      timeoutMs: env.DOCTOR_TIMEOUT_MS,
    });
    const ok = result.code === 0 && !result.timedOut;
    const doctorResult: DoctorResult = {
      ok,
      command,
      args: [...parsedArgs, '--help'],
      cwd,
      exitCode: result.code,
      output: result.output,
    };
    if (result.error !== undefined) {
      doctorResult.error = result.error;
    }
    return doctorResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      command,
      args: [...parsedArgs, '--help'],
      cwd,
      exitCode: null,
      output: '',
      error: msg,
    };
  }
}

export async function helpText(env: Env): Promise<string> {
  const { command, args: parsedArgs } = parseCommand(env.OPENCODE_COMMAND);
  const result = await runProcess({
    command,
    args: [...parsedArgs, '--help'],
    cwd: process.cwd(),
    timeoutMs: env.DOCTOR_TIMEOUT_MS,
  });
  return result.output;
}
