import * as fs from "node:fs/promises";
import { dirname, join } from "node:path";

import { z, type ZodType } from "zod";

export interface JsonStoreOpts<T> {
  file: string;
  schema: ZodType<T>;
  default: T;
}

type JsonStore<T> = {
  read(): Promise<T>;
  write(value: T): Promise<void>;
  update(fn: (current: T) => T): Promise<T>;
};

const fileMutex = new Map<string, Promise<void>>();

async function withFileLock<T>(file: string, task: () => Promise<T>): Promise<T> {
  const previous = fileMutex.get(file) ?? Promise.resolve();

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  fileMutex.set(file, previous.then(() => current));

  await previous;

  try {
    return await task();
  } finally {
    release();

    if (fileMutex.get(file) === current) {
      fileMutex.delete(file);
    }
  }
}

export function createJsonStore<T>(opts: JsonStoreOpts<T>): JsonStore<T> {
  const tmpFile = `${opts.file}.tmp`;

  async function readCurrent(): Promise<T> {
    let raw: string;

    try {
      raw = await fs.readFile(opts.file, "utf8");
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return opts.default;
      }

      throw error;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON in ${opts.file}: ${message}`);
    }

    const result = opts.schema.safeParse(parsed);

    if (!result.success) {
      throw new Error(
        `Invalid JSON data in ${opts.file}: ${result.error.message}`,
      );
    }

    return result.data;
  }

  async function writeCurrent(value: T): Promise<void> {
    const payload = `${JSON.stringify(value, null, 2)}\n`;

    await fs.mkdir(dirname(opts.file), { recursive: true });
    await fs.writeFile(tmpFile, payload, "utf8");
    await fs.rename(tmpFile, opts.file);
  }

  return {
    read(): Promise<T> {
      return readCurrent();
    },
    write(value: T): Promise<void> {
      return withFileLock(opts.file, async () => {
        await writeCurrent(value);
      });
    },
    update(fn: (current: T) => T): Promise<T> {
      return withFileLock(opts.file, async () => {
        const nextValue = fn(await readCurrent());
        await writeCurrent(nextValue);
        return nextValue;
      });
    },
  };
}

export async function ensureStorageLayout(storageDir: string): Promise<void> {
  const directories = ["jobs", "sessions", "logs", "tmp"];

  await Promise.all(
    directories.map((directory) =>
      fs.mkdir(join(storageDir, directory), { recursive: true }),
    ),
  );

  const settingsStore = createJsonStore<Record<string, unknown>>({
    file: join(storageDir, "settings.json"),
    schema: z.object({}).catchall(z.unknown()),
    default: {},
  });

  await settingsStore.write(await settingsStore.read());
}
