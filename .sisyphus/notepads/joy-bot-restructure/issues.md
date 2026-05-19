- T1: LSP diagnostics for JSON in this workspace currently depend on iome, which is configured but not installed.

## T4 pathGuard
- `npx tsc --noEmit` initially surfaced an existing `z.record(z.string(), z.unknown())` Zod v4 typing incompatibility in `src/utils/jsonStore.ts`; changed the settings schema to `z.object({}).catchall(z.unknown())` so global typecheck exits 0.
- T5: Windows shell=true alters inline -e quoting behavior, so timeout/stdout-stderr tests were stabilized with temporary script files instead of inline code.

