- T1: itest run needs --passWithNoTests here to satisfy zero-test verification on this repo.

- T2: dotenv.config() should be mocked in env tests so local .env values do not override test-controlled process.env state.

## T4 pathGuard
- `resolveUnderRoot` now uses `fs.realpathSync.native` on both candidate and cached root before checking containment, which closes symlink/junction escapes while still allowing nested paths.
- `npx vitest run tests/utils/pathGuard.test.ts --coverage` passed with 34 adversarial tests and 100% line coverage for `src/utils/pathGuard.ts`.
