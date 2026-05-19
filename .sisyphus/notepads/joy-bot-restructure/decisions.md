- T1: Use 	sx as the TS runtime entrypoint and keep src/bot.js for legacy config checking during migration.

- T2: Route --check-config through src/index.ts and keep env parsing centralized in src/config/env.ts with Zod validation plus masked token output.

## T4 pathGuard
- Reject empty/whitespace, NUL, and Windows device namespace inputs before path resolution.
- Return `missing` for realpath failures, `outside_root` for realpath-confirmed escapes, and cache root realpaths by resolved root string.
