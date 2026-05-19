- T1: itest run needs --passWithNoTests here to satisfy zero-test verification on this repo.

- T2: dotenv.config() should be mocked in env tests so local .env values do not override test-controlled process.env state.

## T4 pathGuard
- `resolveUnderRoot` now uses `fs.realpathSync.native` on both candidate and cached root before checking containment, which closes symlink/junction escapes while still allowing nested paths.
- `npx vitest run tests/utils/pathGuard.test.ts --coverage` passed with 34 adversarial tests and 100% line coverage for `src/utils/pathGuard.ts`.

- T6: Keep branded domain IDs in a shared src/types/index.ts module and verify them with a @ts-expect-error compile-time guard plus a runtime factory format test.
`n- T3: htmlEscape escapes &, <, >, and " in order; splitForTelegram preserves whole <pre> blocks and logs when a pre block exceeds max.
- T5: processRunner uses spawn with Windows shell mode, merged CI-safe env, combined stdout/stderr capture, timeout killTree, and AbortSignal handling.

- T7: jsonStore serializes per-file updates with a promise-chain mutex; atomic writes stay on the same directory via `<file>.tmp` + rename, and rename failures leave the original file intact.

