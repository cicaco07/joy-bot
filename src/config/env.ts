import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  ALLOWED_TELEGRAM_USER_IDS: number[];
  PROJECTS_ROOT: string;
  OPENCODE_COMMAND: string;
  OPENCODE_TIMEOUT_MS: number;
  PROGRESS_INTERVAL_MS: number;
  MAX_TELEGRAM_MESSAGE_CHARS: number;
  OPENCODE_SERVER_URL: string;
  OMO_ALLOWED_COMMANDS: string[];
  STORAGE_DIR: string;
  LOG_RETENTION_JOBS: number;
  FILE_READ_MAX_BYTES: number;
  DOCTOR_TIMEOUT_MS: number;
}

const defaultAllowedCommands = [
  'review-work',
  'handoff',
  'hyperplan',
  'ulw-loop',
  'stop-continuation',
];

const csvToList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const csvToNumberList = (value: string): number[] =>
  csvToList(value).map((item) => Number(item));

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(10, 'TELEGRAM_BOT_TOKEN must be at least 10 characters'),
  ALLOWED_TELEGRAM_USER_IDS: z
    .string()
    .min(1, 'ALLOWED_TELEGRAM_USER_IDS is required')
    .transform((value) => csvToNumberList(value))
    .pipe(
      z
        .array(z.number().int().finite('ALLOWED_TELEGRAM_USER_IDS must contain only numbers'))
        .min(1, 'ALLOWED_TELEGRAM_USER_IDS must contain at least one user ID'),
    ),
  PROJECTS_ROOT: z
    .string()
    .min(1, 'PROJECTS_ROOT is required')
    .transform((value) => path.resolve(value))
    .superRefine((value, ctx) => {
      if (!fs.existsSync(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PROJECTS_ROOT must exist',
        });
        return;
      }

      if (!fs.statSync(value).isDirectory()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PROJECTS_ROOT must exist and be a directory',
        });
      }
    }),
  OPENCODE_COMMAND: z.string().default(process.platform === 'win32' ? 'opencode.cmd' : 'opencode'),
  OPENCODE_TIMEOUT_MS: z.coerce.number().int().positive().default(600000),
  PROGRESS_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  MAX_TELEGRAM_MESSAGE_CHARS: z.coerce.number().int().positive().default(3500),
  OPENCODE_SERVER_URL: z.string().min(1).default('http://localhost:4096'),
  OMO_ALLOWED_COMMANDS: z
    .string()
    .default(defaultAllowedCommands.join(','))
    .transform((value) => csvToList(value))
    .pipe(z.array(z.string().min(1)).min(1, 'OMO_ALLOWED_COMMANDS must contain at least one command')),
  STORAGE_DIR: z.string().default('./storage').transform((value) => path.resolve(value)),
  LOG_RETENTION_JOBS: z.coerce.number().int().positive().default(50),
  FILE_READ_MAX_BYTES: z.coerce.number().int().positive().default(1048576),
  DOCTOR_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
});

const formatZodError = (error: z.ZodError): string => {
  return error.issues
    .map((issue) => {
      const joinedPath = issue.path.join('.');
      return joinedPath.length > 0 ? `${joinedPath}: ${issue.message}` : issue.message;
    })
    .join('\n');
};

const maskToken = (token: string): string => `***...${token.slice(-4)}`;

export function loadEnv(): Env {
  dotenv.config();

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }

  return parsed.data satisfies Env;
}

export function checkConfig(): void {
  const env = loadEnv();

  console.log('Configuration OK');
  console.log(`TELEGRAM_BOT_TOKEN=${maskToken(env.TELEGRAM_BOT_TOKEN)}`);
  console.log(`ALLOWED_TELEGRAM_USER_IDS=${env.ALLOWED_TELEGRAM_USER_IDS.join(',')}`);
  console.log(`PROJECTS_ROOT=${env.PROJECTS_ROOT}`);
  console.log(`OPENCODE_COMMAND=${env.OPENCODE_COMMAND}`);
  console.log(`OPENCODE_TIMEOUT_MS=${env.OPENCODE_TIMEOUT_MS}`);
  console.log(`PROGRESS_INTERVAL_MS=${env.PROGRESS_INTERVAL_MS}`);
  console.log(`MAX_TELEGRAM_MESSAGE_CHARS=${env.MAX_TELEGRAM_MESSAGE_CHARS}`);
  console.log(`OPENCODE_SERVER_URL=${env.OPENCODE_SERVER_URL}`);
  console.log(`OMO_ALLOWED_COMMANDS=${env.OMO_ALLOWED_COMMANDS.join(',')}`);
  console.log(`STORAGE_DIR=${env.STORAGE_DIR}`);
  console.log(`LOG_RETENTION_JOBS=${env.LOG_RETENTION_JOBS}`);
  console.log(`FILE_READ_MAX_BYTES=${env.FILE_READ_MAX_BYTES}`);
  console.log(`DOCTOR_TIMEOUT_MS=${env.DOCTOR_TIMEOUT_MS}`);

  process.exit(0);
}
