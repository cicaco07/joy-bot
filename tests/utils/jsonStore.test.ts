import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createJsonStore, ensureStorageLayout } from "../../src/utils/jsonStore.js";

const actualFs = await vi.importActual<typeof import("node:fs/promises")>(
  "node:fs/promises",
);
const directoriesToClean: string[] = [];

async function createTempDir(): Promise<string> {
  const directory = await fs.mkdtemp(join(tmpdir(), "json-store-test-"));
  directoriesToClean.push(directory);
  return directory;
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.doUnmock("node:fs/promises");
  vi.resetModules();

  await Promise.all(
    directoriesToClean.splice(0).map((directory) =>
      actualFs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("createJsonStore", () => {
  const schema = z.object({ counter: z.number().int().nonnegative() });

  it("returns default when file is missing", async () => {
    const dir = await createTempDir();
    const store = createJsonStore({
      file: join(dir, "missing.json"),
      schema,
      default: { counter: 0 },
    });

    await expect(store.read()).resolves.toEqual({ counter: 0 });
  });

  it("writes and reads back data", async () => {
    const dir = await createTempDir();
    const file = join(dir, "data.json");
    const store = createJsonStore({
      file,
      schema,
      default: { counter: 0 },
    });

    await store.write({ counter: 7 });

    await expect(store.read()).resolves.toEqual({ counter: 7 });
    await expect(actualFs.readFile(file, "utf8")).resolves.toBe(
      `{
  "counter": 7
}
`,
    );
  });

  it("throws a clear error for invalid json", async () => {
    const dir = await createTempDir();
    const file = join(dir, "broken.json");
    await actualFs.writeFile(file, "{not valid json", "utf8");

    const store = createJsonStore({
      file,
      schema,
      default: { counter: 0 },
    });

    await expect(store.read()).rejects.toThrow(`Invalid JSON in ${file}`);
  });

  it("serializes concurrent updates per file", async () => {
    const dir = await createTempDir();
    const store = createJsonStore({
      file: join(dir, "counter.json"),
      schema,
      default: { counter: 0 },
    });

    await Promise.all(
      Array.from({ length: 10 }, () =>
        store.update((current) => ({ counter: current.counter + 1 })),
      ),
    );

    await expect(store.read()).resolves.toEqual({ counter: 10 });
  });

  it("keeps original file untouched when rename fails", async () => {
    const dir = await createTempDir();
    const file = join(dir, "atomic.json");
    await actualFs.writeFile(
      file,
      `{
  "counter": 1
}
`,
      "utf8",
    );

    const renameMock = vi.fn(async (...args: Parameters<typeof actualFs.rename>) =>
      actualFs.rename(...args),
    );
    renameMock.mockRejectedValueOnce(new Error("rename failed"));

    vi.doMock("node:fs/promises", () => ({
      ...actualFs,
      rename: renameMock,
    }));

    const { createJsonStore: createMockedJsonStore } = await import(
      "../../src/utils/jsonStore.js"
    );

    const store = createMockedJsonStore({
      file,
      schema,
      default: { counter: 0 },
    });

    await expect(store.write({ counter: 2 })).rejects.toThrow("rename failed");
    await expect(actualFs.readFile(file, "utf8")).resolves.toBe(
      `{
  "counter": 1
}
`,
    );
    await expect(actualFs.readFile(`${file}.tmp`, "utf8")).resolves.toBe(
      `{
  "counter": 2
}
`,
    );
    expect(renameMock).toHaveBeenCalledTimes(1);
  });
});

describe("ensureStorageLayout", () => {
  it("creates directories and settings.json when absent", async () => {
    const dir = await createTempDir();
    const storageDir = join(dir, "storage");

    await ensureStorageLayout(storageDir);

    await expect(actualFs.stat(join(storageDir, "jobs"))).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    });
    await expect(actualFs.stat(join(storageDir, "sessions"))).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    });
    await expect(actualFs.stat(join(storageDir, "logs"))).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    });
    await expect(actualFs.stat(join(storageDir, "tmp"))).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    });
    await expect(
      actualFs.readFile(join(storageDir, "settings.json"), "utf8"),
    ).resolves.toBe("{}\n");
  });
});
