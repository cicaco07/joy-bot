- T1: LSP diagnostics for JSON in this workspace currently depend on iome, which is configured but not installed.

## T4 pathGuard
- `npx tsc --noEmit` initially surfaced an existing `z.record(z.string(), z.unknown())` Zod v4 typing incompatibility in `src/utils/jsonStore.ts`; changed the settings schema to `z.object({}).catchall(z.unknown())` so global typecheck exits 0.
