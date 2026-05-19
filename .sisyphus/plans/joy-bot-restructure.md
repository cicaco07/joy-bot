# Joy-Bot Restructure: TypeScript Migration + Modular Commands + Nested Workspace + Opencode/OMO Bridge

## TL;DR

> **Quick Summary**: Replace the monolithic `src/bot.js` with a modular TypeScript codebase that gives the Telegram bot nested workspace navigation, a clean opencode CLI/SDK bridge, persistent jobs/sessions/logs, and Telegram-friendly summarized output. New command surface replaces old commands cleanly.
>
> **Deliverables**:
> - `src/index.ts` + modular `bot/`, `services/`, `utils/`, `config/` tree (TypeScript via `tsx`)
> - Strict `pathGuard` permitting nested paths under `PROJECTS_ROOT` while blocking traversal/symlink escape
> - Workspace + cwd model (`/workspace use`, `/cd`, `/pwd`) replacing the direct-child-only restriction
> - Read-only file browser (`/ls`, `/tree`, `/open`, `/cat`, `/find`, `/download`)
> - Job runner with persistent state (`storage/jobs/*.json`, `storage/logs/*.log`) and HTML-formatted Telegram summaries
> - Hybrid opencode bridge: SDK against `http://localhost:4096` first, CLI `opencode run` fallback
> - Per-chat settings + per-session overrides for model, agent, mode
> - OMO command bridge with `.env` allowlist
> - Vitest unit + handler tests using grammY's `bot.handleUpdate` + outbound transformer pattern
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: T1 (scaffold) → T4 (pathGuard) → T7 (workspaceService) → T9 (jobService) → T13 (opencodeService) → T17 (bot wiring) → T20 (commands) → F1–F4 → user okay

---

## Context

### Original Request
User finds the current bot too simplistic: commands live in one file (`src/bot.js`), folder access is restricted to direct children of `PROJECTS_ROOT`, raw logs flood Telegram messages, and there is no way to drive opencode/OMO features (model selection, plan/build/deep/ultrawork mode, sessions) from Telegram. They asked for recommendations and a mature plan before any execution. They confirmed: migrate to TypeScript now, restructure modularly, add nested folder access, add opencode/session/model/agent/mode/OMO commands, improve log UX.

### Interview Summary
**Key Discussions**:
- Current state verified: `src/bot.js` is ~473 lines, grammY-based, in-memory state only, only `opencode run` integration, raw output dumps to Telegram
- User wants ONE plan (Single Plan Mandate) covering full restructure across phases
- Backwards compatibility: REPLACE old commands cleanly (breaking change accepted)
- Read-only file ops only; writes must flow through opencode/agent
- Hybrid opencode integration: SDK first, CLI fallback

**Resolved Decisions**:
- TS runtime: `tsx` (no build step)
- Tests: `vitest` with TDD for pure utilities, tests-after for handler/service code
- Storage: filesystem JSON (`storage/*.json` + `storage/logs/`)
- Workspace model: any directory under `PROJECTS_ROOT` can be a workspace; `/cd` for in-workspace navigation
- Settings binding: per-chat defaults, per-session overrides
- OMO surface: allowlist via `.env` (default: `review-work,handoff,hyperplan,ulw-loop,stop-continuation`)
- Telegram format: HTML mode with `sendDocument` fallback for output >3500 chars

**Research Findings**:
- grammY supports `bot.handleUpdate(fakeUpdate)` + `bot.api.config.use(transformer)` for unit testing without real Telegram (locks in Verification Strategy)
- `@opencode-ai/sdk` exposes both `client.session.*` and `client.v2.session.*` — plan locks in `client.v2.session` for forward compatibility
- `opencode serve` runs on `http://localhost:4096` by default; SDK uses same baseUrl
- Long-polling (current default) is simpler than webhooks for a single-instance personal bot — explicitly locked in

### Metis Review
**Identified Gaps (addressed)**:
- Polling vs webhook ambiguity → locked to **long-polling, single instance**
- Concurrency model → **one foreground CLI job per chat**, SDK session prompts allowed in parallel (SDK has its own abort)
- Bot restart leaves stale jobs → jobs persisted, on boot mark `running` jobs as `interrupted` and surface via `/jobs`
- pathGuard is the highest-risk change → dedicated task with adversarial test matrix (Windows quirks, symlinks, junctions, UNC, drive letters, 8.3 short names, NTFS streams)
- HTML escaping for filenames/output (filenames may contain `<`, `>`, `&`, emoji) → centralized `htmlEscape` utility
- Binary file detection + size cap for `/open` and `/cat` → 1 MB cap, null-byte sniff for binary
- `/find` indexes filenames (not contents) by default to avoid heavy I/O; content search is `/find --content` opt-in
- Telegram rate-limit (429) handling → grammY auto-retry transformer
- `opencode serve` health check before SDK use → `/v1/server` ping with 1s timeout, fallback to CLI
- QA verification approach → `bot.handleUpdate` + outbound transformer captures the reply payload, asserted in vitest. Evidence = JSON snapshots of captured Telegram API calls

---

## Work Objectives

### Core Objective
Replace the single-file JavaScript bot with a modular TypeScript codebase that turns the Telegram bot into a safe, ergonomic remote control for the laptop's opencode + 9router/OMO toolchain, while preserving the existing security boundary (allowlisted users, sandboxed under `PROJECTS_ROOT`).

### Concrete Deliverables
- `src/index.ts` entrypoint
- `src/config/env.ts` typed env loader (Zod schema)
- `src/bot/createBot.ts` + `src/bot/middleware/{auth,errorHandler,logging}.ts`
- `src/bot/commands/{start,help,workspace,files,opencode,sessions,jobs,logs,settings,omo}.ts`
- `src/services/{workspaceService,fileService,opencodeCliService,opencodeApiService,jobService,sessionService,logService,formatterService,settingsService}.ts`
- `src/utils/{pathGuard,processRunner,telegramText,htmlEscape,paginate}.ts`
- `storage/` tree with JSON files for `settings.json`, `jobs/*.json`, `sessions/*.json`, and `logs/*.log`
- `tests/` mirror with vitest specs
- `package.json` updated: `tsx`, `typescript`, `vitest`, `@opencode-ai/sdk`, `zod`, `@types/node`
- `tsconfig.json`, `vitest.config.ts`, updated `.env.example`, updated `README.md`
- `src/bot.js` removed (replaced cleanly)

### Definition of Done
- [ ] `npx tsx src/index.ts --check-config` exits 0 and prints typed config summary
- [ ] `npm run check` (tsc --noEmit) passes
- [ ] `npm test` (vitest) passes with ≥80% coverage on `utils/` and ≥60% on `services/`
- [ ] All new Telegram commands respond correctly in vitest harness with captured API call snapshots stored under `.sisyphus/evidence/`
- [ ] `pathGuard` adversarial suite passes 100% (≥30 cases including Windows-specific traversal vectors)
- [ ] Manual smoke test against real Telegram bot succeeds for: `/start`, `/workspaces`, `/workspace use`, `/cd`, `/ls`, `/open`, `/run`, `/jobs`, `/logs`, `/sessions`, `/model use`, `/agent use`, `/mode`, `/omo review-work`
- [ ] Log files >3500 chars delivered as Telegram document, not chunked text
- [ ] Old `src/bot.js` file deleted and old commands no longer registered

### Must Have
- TypeScript codebase runnable via `npx tsx src/index.ts` (no build step required)
- Nested folder access under `PROJECTS_ROOT` with bullet-proof `pathGuard`
- Read-only file browser commands (`/ls`, `/tree`, `/open`, `/cat`, `/find`, `/download`)
- Persistent job tracking surviving bot restart
- Per-chat settings persistence (model, agent, mode, active workspace, active session)
- Hybrid opencode bridge: SDK with CLI fallback
- HTML-formatted Telegram output with safe escaping; long output via `sendDocument`
- OMO command bridge gated by `.env` allowlist
- Vitest test suite with grammY `handleUpdate` harness; 0 hand-rolled Telegram mocking
- Allowlist enforcement for `ALLOWED_TELEGRAM_USER_IDS` on every handler

### Must NOT Have (Guardrails)
- No raw `/shell`, `/exec`, or `/eval` command
- No write operations from Telegram (no `/write`, `/rm`, `/mkdir`, `/append`)
- No transmission of API keys or 9router secrets via Telegram
- No path access escaping `PROJECTS_ROOT` after symlink resolution
- No hardcoded credentials; `.env` is the only config source
- No build step (no `dist/`, no `tsc --emit` in production path); `tsx` runs `.ts` directly
- No re-introduction of legacy commands (`/folders`, `/projects`, `/use`, `/active`, `/task`, `/prompt`)
- No web UI, no Tailscale integration, no multi-user concurrency model beyond per-chat
- No automatic spawning of `opencode serve` (user manages it; bot probes and falls back to CLI)
- No file reads beyond 1 MB or on detected-binary files for `/open`/`/cat`
- No silent swallowing of opencode errors — every error surfaces in formatted summary plus log file
- No business logic in command files (commands parse args + delegate to services)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed. No "user manually checks" criteria allowed.
> Evidence files saved under `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

### Test Decision
- **Infrastructure exists**: NO (greenfield TS + vitest setup)
- **Automated tests**: YES — TDD for `utils/` (pure functions), tests-after for `services/` and `commands/` (use grammY harness)
- **Framework**: `vitest` (chosen by user)
- **Coverage targets**: `utils/` ≥80%, `services/` ≥60%, `commands/` smoke-tested via `bot.handleUpdate`

### grammY Test Harness Pattern
Every command/handler test uses this pattern (locked in by Metis):

```ts
const calls: Array<{ method: string; payload: any }> = [];
bot.api.config.use((prev, method, payload) => {
  calls.push({ method, payload });
  // return a fake API response shape per method
  return Promise.resolve({ ok: true, result: { message_id: 1, date: 0, chat: payload.chat_id, text: payload.text } } as any);
});
await bot.handleUpdate(fakeUpdate({ text: "/ls", from: ALLOWED_USER_ID }));
expect(calls[0].method).toBe("sendMessage");
expect(calls[0].payload.text).toContain("...");
```

### QA Tool Mapping
- **Pure utilities** (pathGuard, htmlEscape, paginate, env, telegramText): vitest direct unit tests
- **Services** (workspaceService, fileService, jobService, etc.): vitest with real filesystem in `tmp/` directories created via `os.tmpdir()` + cleanup
- **Bot commands**: vitest + grammY `bot.handleUpdate` + outbound transformer; assert captured `sendMessage` / `sendDocument` payloads
- **Opencode CLI service**: vitest + spawning a stub script (`tests/fixtures/fake-opencode.cjs`) that emits known stdout/stderr
- **Opencode API service**: vitest + `msw` or simple `http.createServer` stub on a random port
- **Final QA**: real `node --check` (compatibility), `npx tsc --noEmit`, `npx vitest run --coverage`, then live smoke against a test bot token if user provides one (otherwise harness-only)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (foundation, max parallel — 8 tasks):
├── T1: Scaffold tsconfig + package.json deps + scripts + .gitignore [quick]
├── T2: Zod-typed env loader (config/env.ts) + .env.example update [quick]
├── T3: HTML escape + paginate + telegramText utilities [quick]
├── T4: pathGuard utility (CRITICAL — adversarial test matrix) [deep]
├── T5: processRunner utility (cross-platform spawn + kill) [quick]
├── T6: Domain types (types/index.ts: Job, Session, Settings, Workspace) [quick]
├── T7: storage layout + JSON read/write helpers (utils/jsonStore.ts) [quick]
└── T8: vitest config + first failing pathGuard test set [quick]

Wave 2 (services, max parallel — 7 tasks, depend on Wave 1):
├── T9: workspaceService (workspaces, cwd, /cd resolution) [unspecified-high]
├── T10: fileService (ls, tree, open, cat, find, download) [unspecified-high]
├── T11: jobService (create, status, cancel, persistent state, restart recovery) [deep]
├── T12: logService (append-only log files, retention prune) [quick]
├── T13: opencodeCliService (spawn opencode run, health check) [unspecified-high]
├── T14: opencodeApiService (SDK client wrapper, server health probe) [unspecified-high]
└── T15: settingsService + sessionService (per-chat + per-session) [unspecified-high]

Wave 3 (formatters + bot core, depend on services):
├── T16: formatterService (HTML summaries, doc fallback, error formatting) [unspecified-high]
├── T17: createBot + auth middleware + error middleware + logging middleware [unspecified-high]
└── T18: grammY test harness helper (tests/helpers/botHarness.ts) [quick]

Wave 4 (command modules, max parallel — 7 tasks):
├── T19: commands/start.ts + commands/help.ts [quick]
├── T20: commands/workspace.ts (/root /workspaces /workspace use /pwd /cd) [unspecified-high]
├── T21: commands/files.ts (/ls /tree /open /cat /find /download) [unspecified-high]
├── T22: commands/opencode.ts (/run /task /doctor /opencode_help) [unspecified-high]
├── T23: commands/jobs.ts + commands/logs.ts (/status /jobs /job /cancel /cancel_all /logs ...) [unspecified-high]
├── T24: commands/sessions.ts (/sessions /session_new /session_use /session_current /session_prompt /session_command /session_abort) [deep]
└── T25: commands/settings.ts + commands/omo.ts (/model /agent /mode /omo) [unspecified-high]

Wave 5 (integration + cleanup):
├── T26: src/index.ts wires everything; remove src/bot.js; npm scripts (start/dev/test/check) [unspecified-high]
├── T27: README + .env.example final pass [writing]
└── T28: Coverage + smoke harness suite (tests/smoke/*.test.ts) [unspecified-high]

Wave FINAL (4 parallel reviewers — ALL must APPROVE; await user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA via grammY harness + smoke (unspecified-high)
└── F4: Scope fidelity check vs spec (deep)
→ Present results → wait for user "okay" → mark complete

Critical Path: T1 → T4 → T7 → T9 → T11 → T13/T14 → T17 → T20 → T22 → T26 → F1–F4 → user okay
Max Concurrent: 8 (Wave 1)
Estimated Speedup vs sequential: ~65%
```

### Dependency Matrix (abbreviated)

- **T1**: — → T2-T28 (foundation)
- **T2**: T1 → T9, T13, T14, T17, T26
- **T3**: T1 → T16, T20, T21, T23, T24
- **T4**: T1 → T9, T10, T11
- **T5**: T1 → T11, T13
- **T6**: T1 → T9, T11, T14, T15
- **T7**: T1 → T11, T12, T15
- **T8**: T1 → all subsequent test-bearing tasks
- **T9**: T2, T4, T6 → T20, T21
- **T10**: T4 → T21
- **T11**: T5, T6, T7 → T22, T23
- **T12**: T7 → T23
- **T13**: T2, T5 → T22, T24
- **T14**: T2, T6 → T24, T25
- **T15**: T6, T7 → T20, T24, T25
- **T16**: T3, T11, T12 → all command tasks
- **T17**: T2, T16 → all command tasks
- **T18**: T17 → all command tests
- **T19**: T17 → T26
- **T20**: T9, T17 → T26
- **T21**: T9, T10, T17 → T26
- **T22**: T11, T13, T17 → T26
- **T23**: T11, T12, T17 → T26
- **T24**: T11, T14, T15, T17 → T26
- **T25**: T15, T17 → T26
- **T26**: T19–T25 → T28, F-wave
- **T27**: T26 → F-wave
- **T28**: T26 → F-wave

### Agent Dispatch Summary

- **Wave 1 (8)**: T1 → quick, T2 → quick, T3 → quick, T4 → deep, T5 → quick, T6 → quick, T7 → quick, T8 → quick
- **Wave 2 (7)**: T9 → unspecified-high, T10 → unspecified-high, T11 → deep, T12 → quick, T13 → unspecified-high, T14 → unspecified-high, T15 → unspecified-high
- **Wave 3 (3)**: T16 → unspecified-high, T17 → unspecified-high, T18 → quick
- **Wave 4 (7)**: T19 → quick, T20–T23, T25 → unspecified-high, T24 → deep
- **Wave 5 (3)**: T26 → unspecified-high, T27 → writing, T28 → unspecified-high
- **FINAL (4)**: F1 → oracle, F2 → unspecified-high, F3 → unspecified-high, F4 → deep

---

## TODOs

- [ ] 1. Scaffold TypeScript toolchain

  **What to do**:
  - **Initialize git** if `.git` does not already exist: `git init`, set initial branch to `main` (`git symbolic-ref HEAD refs/heads/main`). The current workspace is NOT yet a git repository — this step is required so per-task commits and the F4 diff-based audit can run.
  - Update `package.json`: set `"type": "module"`, replace `main` with `"src/index.ts"`, add scripts `start` (`tsx src/index.ts`), `dev` (`tsx watch src/index.ts`), `check-config` (`tsx src/index.ts --check-config`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:watch` (`vitest`), `test:coverage` (`vitest run --coverage`)
  - Add devDependencies: `typescript@^5`, `tsx@^4`, `vitest@^1`, `@vitest/coverage-v8`, `@types/node@^20`
  - Add runtime dependencies: `@opencode-ai/sdk`, `zod`
  - Keep existing: `grammy`, `dotenv`
  - Create `tsconfig.json` with: `target ES2022`, `module Node16`, `moduleResolution Node16`, `strict true`, `noUncheckedIndexedAccess true`, `exactOptionalPropertyTypes true`, `resolveJsonModule true`, `esModuleInterop true`, `skipLibCheck true`, `outDir` left unset (no emit), `rootDir src`, `include ["src/**/*", "tests/**/*"]`
  - Create `.gitignore` additions: `node_modules/`, `.env`, `storage/`, `.sisyphus/evidence/`, `coverage/`
  - Create empty `src/index.ts` placeholder so tsc has something to parse: `export {}`
  - Do NOT delete `src/bot.js` yet (T26 handles removal)

  **Must NOT do**:
  - Do not enable `tsc --emit`/`outDir dist` — runtime is `tsx`
  - Do not add eslint/prettier (out of scope)
  - Do not change `engines` field

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: deterministic config edits, no design decisions
  - **Skills**: []
    - No skill matches; this is straightforward config wiring
  - **Skills Evaluated but Omitted**:
    - `git-master`: not needed — single commit at end suffices

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundation; everything else depends on it)
  - **Parallel Group**: Wave 1, but executes alone first
  - **Blocks**: T2–T28
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `package.json:1-18` — current minimal manifest; preserve `grammy`, `dotenv`, replace scripts and add deps

  **External References**:
  - tsx docs: `https://tsx.is/getting-started` — running `.ts` directly
  - vitest config: `https://vitest.dev/config/` — basic Node env config
  - `tsconfig` strict matrix: `https://www.typescriptlang.org/tsconfig#strict`

  **WHY Each Reference Matters**:
  - tsx getting-started shows that `npx tsx file.ts` works without any compile step — locks in our "no build" decision
  - vitest config — needed to set `test.environment: "node"` and `test.coverage.provider: "v8"`
  - tsconfig strict — `noUncheckedIndexedAccess` is critical because we'll do a lot of array/object indexing in workspaces and pathGuard

  **Acceptance Criteria**:
  - [ ] `npm install` succeeds with no peer warnings (capture stdout)
  - [ ] `npx tsc --noEmit` exits 0
  - [ ] `npx tsx src/index.ts` runs (prints nothing or empty) and exits 0
  - [ ] `npx vitest run` reports "no test files found" and exits 0
  - [ ] `package.json` contains every required script and dep version range stated above
  - [ ] `.gitignore` contains `storage/` and `.sisyphus/evidence/`
  - [ ] `.git` directory exists; `git rev-parse --is-inside-work-tree` returns `true`
  - [ ] Initial branch is `main` (`git symbolic-ref --short HEAD` prints `main`)

  **QA Scenarios**:

  ```
  Scenario: Fresh install + scripts wire up
    Tool: Bash (npm)
    Preconditions: clean clone, no node_modules
    Steps:
      1. Run `npm install` in repo root
      2. Run `npx tsc --noEmit`
      3. Run `npx tsx src/index.ts`
      4. Run `npx vitest run`
    Expected Result: install ok, tsc 0 errors, tsx exits 0, vitest reports no tests with exit 0
    Failure Indicators: peer dep error, tsc errors, tsx ENOENT, vitest non-zero exit
    Evidence: .sisyphus/evidence/task-1-install-and-scripts.txt (combined stdout)

  Scenario: Required scripts present
    Tool: Bash (jq via node)
    Preconditions: package.json updated
    Steps:
      1. Run `node -e "const p=require('./package.json'); for (const s of ['start','dev','check-config','typecheck','test','test:watch','test:coverage']) if (!p.scripts[s]) { console.error('missing',s); process.exit(1) } console.log('ok')"`
    Expected Result: prints `ok`, exit 0
    Evidence: .sisyphus/evidence/task-1-scripts-check.txt
  ```

  ```
  Scenario: Git repo initialized
    Tool: Bash (git)
    Preconditions: T1 ran
    Steps:
      1. Run `git rev-parse --is-inside-work-tree`
      2. Run `git symbolic-ref --short HEAD`
    Expected Result: step 1 prints `true`; step 2 prints `main`
    Evidence: .sisyphus/evidence/task-1-git-init.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-1-install-and-scripts.txt`
  - [ ] `.sisyphus/evidence/task-1-scripts-check.txt`
  - [ ] `.sisyphus/evidence/task-1-git-init.txt`

  **Commit**: YES
  - Message: `chore: scaffold typescript toolchain (tsx, vitest, tsconfig)`
  - Files: `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/index.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run`

- [ ] 2. Typed env loader

  **What to do**:
  - Create `src/config/env.ts`
  - Use `zod` to validate env: `TELEGRAM_BOT_TOKEN` (string min 10), `ALLOWED_TELEGRAM_USER_IDS` (CSV → number[]), `PROJECTS_ROOT` (path, must exist, must be directory, real-path resolved), `OPENCODE_COMMAND` (default platform-aware: `opencode.cmd` on win32 else `opencode`), `OPENCODE_TIMEOUT_MS` (number default 600000), `PROGRESS_INTERVAL_MS` (number default 30000), `MAX_TELEGRAM_MESSAGE_CHARS` (number default 3500), `OPENCODE_SERVER_URL` (url default `http://localhost:4096`), `OMO_ALLOWED_COMMANDS` (CSV → string[] default `review-work,handoff,hyperplan,ulw-loop,stop-continuation`), `STORAGE_DIR` (path default `./storage`), `LOG_RETENTION_JOBS` (number default 50), `FILE_READ_MAX_BYTES` (number default 1048576)
  - Export typed `Env` object and a `loadEnv()` function that throws clear errors on invalid config
  - Export `--check-config` CLI handler that prints summary and exits 0
  - Update `.env.example` with every variable documented
  - All paths normalized via `path.resolve` + `fs.realpathSync.native`

  **Must NOT do**:
  - Do not import `process.env` outside `env.ts`
  - Do not silently default `TELEGRAM_BOT_TOKEN` or `ALLOWED_TELEGRAM_USER_IDS`
  - Do not log secrets in `--check-config` (mask token)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: schema authoring, no architectural decisions
  - **Skills**: []
  - **Skills Evaluated but Omitted**: none relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 with T3, T4, T5, T6, T7, T8
  - **Blocks**: T9, T13, T14, T17, T26
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `src/bot.js:1-40` — current ad-hoc env reading; replicate the same variable set, then add new ones
  - `.env.example:1-7` — current variables to preserve

  **API/Type References**:
  - Zod parse + safeParse: `https://zod.dev/?id=basic-usage`

  **WHY Each Reference Matters**:
  - The current bot reads env in scattered locations; this task centralizes it. The variable list in `bot.js` is the contract we must preserve while extending.

  **Acceptance Criteria**:
  - [ ] `npx tsx src/index.ts --check-config` exits 0 and prints all variables (token masked)
  - [ ] Invalid `PROJECTS_ROOT` (missing dir) → exit code 1 with message `PROJECTS_ROOT must exist and be a directory`
  - [ ] Empty `ALLOWED_TELEGRAM_USER_IDS` → exit code 1 with message `ALLOWED_TELEGRAM_USER_IDS must contain at least one numeric id`
  - [ ] Vitest unit suite covers happy path + 5 invalid-input cases

  **QA Scenarios**:

  ```
  Scenario: Valid config prints summary
    Tool: Bash (tsx)
    Preconditions: valid .env present, PROJECTS_ROOT exists
    Steps:
      1. Run `npx tsx src/index.ts --check-config`
    Expected Result: exit 0, stdout contains "PROJECTS_ROOT:" and "OMO_ALLOWED_COMMANDS:" and token shown as `***...XYZ` (last 4 chars)
    Evidence: .sisyphus/evidence/task-2-check-config-ok.txt

  Scenario: Invalid PROJECTS_ROOT fails clearly
    Tool: Bash (tsx with env override)
    Preconditions: temp .env with PROJECTS_ROOT pointing at non-existent dir
    Steps:
      1. Run `PROJECTS_ROOT=Z:\does\not\exist npx tsx src/index.ts --check-config`
    Expected Result: exit code 1, stderr contains `PROJECTS_ROOT must exist`
    Evidence: .sisyphus/evidence/task-2-check-config-bad-root.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-2-check-config-ok.txt`
  - [ ] `.sisyphus/evidence/task-2-check-config-bad-root.txt`
  - [ ] vitest output snippet for env tests

  **Commit**: YES
  - Message: `feat(config): typed env loader with zod schema`
  - Files: `src/config/env.ts`, `.env.example`, `tests/config/env.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/config`

- [ ] 3. HTML escape, paginate, telegramText utilities

  **What to do**:
  - `src/utils/htmlEscape.ts`: function `htmlEscape(s: string): string` replacing `& < > "` with entities; export `htmlCode(s)` wrapping in `<code>` after escape; export `htmlPre(s)` wrapping in `<pre>` after escape
  - `src/utils/paginate.ts`: function `paginate<T>(items: T[], page: number, pageSize: number): { slice: T[]; page: number; totalPages: number; total: number }`
  - `src/utils/telegramText.ts`: `splitForTelegram(text: string, max = 3500): string[]` (split on newlines preferring boundaries, never mid-tag), `shouldSendAsDocument(text: string, max = 3500): boolean`
  - All functions pure, exported with explicit types

  **Must NOT do**:
  - No I/O, no async, no globals
  - No use of `any`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: pure functions, deterministic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 with T2, T4, T5, T6, T7, T8
  - **Blocks**: T16, T20, T21, T23, T24
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `src/bot.js:382-389 splitTelegramMessage` — current naive 3900-char split; replace with newline-aware split that never breaks `<pre>` blocks

  **External References**:
  - Telegram Bot API HTML mode: `https://core.telegram.org/bots/api#html-style` — list of supported tags and entities

  **WHY Each Reference Matters**:
  - Current splitter cuts mid-tag which would corrupt HTML mode; the new splitter must respect tag boundaries (we restrict ourselves to `<b>`, `<code>`, `<pre>`, `<i>`, `<a>` per Telegram HTML spec)

  **Acceptance Criteria**:
  - [ ] vitest covers htmlEscape with 8 cases (empty, `&`, `<`, `>`, `"`, mixed, emoji, control chars)
  - [ ] paginate covers 6 cases (empty, single page, exact boundary, last page partial, page out of range high, page <1)
  - [ ] splitForTelegram covers 5 cases (short, long plain, long with `<pre>` block, exact-boundary, no-newline long blob)

  **QA Scenarios**:

  ```
  Scenario: htmlEscape preserves printable + escapes specials
    Tool: Bash (vitest)
    Steps:
      1. Run `npx vitest run tests/utils/htmlEscape.test.ts --reporter=verbose`
    Expected Result: 8/8 pass; output shows escapes for `<&"`
    Evidence: .sisyphus/evidence/task-3-htmlEscape.txt

  Scenario: splitForTelegram never cuts inside <pre>
    Tool: Bash (vitest)
    Steps:
      1. Run `npx vitest run tests/utils/telegramText.test.ts`
    Expected Result: all chunks either fully outside or fully containing intact `<pre>...</pre>`; no chunk exceeds 3500 chars
    Evidence: .sisyphus/evidence/task-3-telegramText.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-3-htmlEscape.txt`
  - [ ] `.sisyphus/evidence/task-3-telegramText.txt`

  **Commit**: YES
  - Message: `feat(utils): html escape + paginate + telegram text helpers`
  - Files: `src/utils/htmlEscape.ts`, `src/utils/paginate.ts`, `src/utils/telegramText.ts`, `tests/utils/*.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/utils`

- [ ] 4. Adversarial pathGuard utility (CRITICAL)

  **What to do**:
  - Create `src/utils/pathGuard.ts` exporting `resolveUnderRoot(root: string, input: string): { ok: true; absolute: string; relative: string } | { ok: false; reason: string }`
  - Algorithm:
    1. Reject if `input` is empty, contains NUL byte (`\0`), starts with `\\?\` or `\\.\` (Win32 device namespace)
    2. If `input` is absolute, treat as candidate; else `path.resolve(root, input)`
    3. Real-path the candidate via `fs.realpathSync.native` (handles symlinks, junctions, drive letter casing)
    4. Real-path the root the same way; cache it on first call
    5. Confirm `path.relative(realRoot, realCandidate)` is non-empty, does NOT start with `..`, is NOT absolute (drive change)
    6. Confirm candidate exists OR (for `download`/`open` callers, optional `mustExist` flag) — return `ok: false` with `reason: "missing"`
    7. On Windows, normalize separators to `path.sep` before comparison; do case-insensitive prefix check (compare with `toLowerCase()` on Win32)
    8. Reject UNC paths starting with `\\` (after normalization) unless they resolve under root after realpath
  - Export `assertUnderRoot(root, input)` that throws `PathGuardError` on failure
  - Build adversarial test matrix (at least 30 cases) covering:
    - normal nested: `a/b/c`
    - up-traversal: `..`, `../..`, `a/../../etc`
    - absolute outside: `C:\Windows`, `/etc/passwd`
    - drive swap: `D:\foo` when root is `C:\...`
    - mixed slashes: `a\b/c`, `./a/./b`
    - dot files: `.git`, `.env`
    - whitespace: `  `, `a/ /b`
    - unicode/emoji: `proj/🚀/file.ts`
    - very long: 260+ char path
    - NUL byte: `a\0b`
    - device namespace: `\\?\C:\foo`, `\\.\COM1`
    - UNC: `\\server\share`
    - symlink in nested path that escapes root (created in test setup)
    - junction (Windows test only, skip on non-win32)
    - 8.3 short name (`PROGRA~1`) — if Win32 only
    - empty / null / undefined
    - root itself (must be allowed; relative is empty string → policy: allow with relative `"."`)
    - relative through symlink that stays inside root (must allow)
    - case-only difference (`SRC` vs `src` on Win32)

  **Must NOT do**:
  - Do not use `path.relative` alone — symlink + realpath combination is required
  - Do not catch and swallow errors from `realpathSync` — surface as guard failure
  - Do not perform any I/O outside the resolve+realpath calls

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: highest-risk security-sensitive logic; needs careful adversarial reasoning
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - none — this is pure logic, no skill applies

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 with T2, T3, T5, T6, T7, T8
  - **Blocks**: T9, T10, T11
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `src/bot.js:305-314 resolveProjectPath` — current restrictive guard. Note its rejection of `/`, `\`, `..` — the new guard MUST allow nested paths but still block escape. Use this as the negative reference (what we're replacing) and document the broader threat model.

  **External References**:
  - Node.js path docs: `https://nodejs.org/api/path.html` — `path.relative`, `path.resolve`, behavior on win32
  - Node.js fs realpath: `https://nodejs.org/api/fs.html#fsrealpathsyncnativepath-options`
  - OWASP Path Traversal: `https://owasp.org/www-community/attacks/Path_Traversal` — categories of bypasses to test
  - Win32 device namespace: `https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file#win32-device-namespaces`

  **WHY Each Reference Matters**:
  - The current bot rejects nested traversal entirely; we are deliberately weakening that rule, so we must compensate with a more thorough guard. The OWASP categories and Win32 device namespace docs ensure our test matrix covers known bypass shapes.

  **Acceptance Criteria**:
  - [ ] `tests/utils/pathGuard.test.ts` contains ≥30 cases, all pass
  - [ ] Guard rejects every traversal/escape case in matrix
  - [ ] Guard accepts every legitimate nested case in matrix
  - [ ] Coverage on `pathGuard.ts` ≥95% lines
  - [ ] Test setup creates real symlinks (skip-if-no-permission on Win32) and verifies realpath catches escape

  **QA Scenarios**:

  ```
  Scenario: Nested legitimate path resolves under root
    Tool: Bash (vitest)
    Preconditions: tmp root with `a/b/c.txt`
    Steps:
      1. Call `resolveUnderRoot(root, "a/b/c.txt")`
    Expected Result: `{ ok: true, absolute: <root>/a/b/c.txt, relative: "a/b/c.txt" }`
    Evidence: .sisyphus/evidence/task-4-pathguard-nested.txt

  Scenario: Up-traversal blocked
    Tool: Bash (vitest)
    Preconditions: tmp root
    Steps:
      1. Call `resolveUnderRoot(root, "../etc/passwd")`
    Expected Result: `{ ok: false, reason: "outside_root" }`
    Evidence: .sisyphus/evidence/task-4-pathguard-traversal.txt

  Scenario: Symlink escape blocked
    Tool: Bash (vitest)
    Preconditions: tmp root with `link` -> tmp/outside (created in setup), tmp/outside is a sibling
    Steps:
      1. Call `resolveUnderRoot(root, "link/secret")`
    Expected Result: `{ ok: false, reason: "outside_root" }` after realpath resolution
    Evidence: .sisyphus/evidence/task-4-pathguard-symlink.txt

  Scenario: NUL byte rejected pre-resolve
    Tool: Bash (vitest)
    Preconditions: any root
    Steps:
      1. Call `resolveUnderRoot(root, "a\0b")`
    Expected Result: `{ ok: false, reason: "invalid_input" }`
    Evidence: .sisyphus/evidence/task-4-pathguard-nul.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-4-pathguard-nested.txt`
  - [ ] `.sisyphus/evidence/task-4-pathguard-traversal.txt`
  - [ ] `.sisyphus/evidence/task-4-pathguard-symlink.txt`
  - [ ] `.sisyphus/evidence/task-4-pathguard-nul.txt`
  - [ ] `.sisyphus/evidence/task-4-pathguard-coverage.txt` (vitest --coverage stdout for this file)

  **Commit**: YES
  - Message: `feat(utils): adversarial pathGuard for nested workspace access`
  - Files: `src/utils/pathGuard.ts`, `tests/utils/pathGuard.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/utils/pathGuard.test.ts --coverage`

- [ ] 5. Cross-platform processRunner

  **What to do**:
  - Create `src/utils/processRunner.ts`
  - Export `runProcess(opts: { command: string; args: string[]; cwd: string; timeoutMs: number; env?: Record<string,string>; onChunk?: (kind: 'stdout'|'stderr', chunk: string) => void; signal?: AbortSignal; }): Promise<{ code: number | null; signal: NodeJS.Signals | null; output: string; error?: string; timedOut: boolean; }>`
  - Use `child_process.spawn` with `shell: process.platform === 'win32'`, `windowsHide: true`, `stdio: ['ignore', 'pipe', 'pipe']`
  - Always set env defaults `CI=1`, `NO_COLOR=1`, `TERM=dumb` unless caller overrides
  - Capture stdout+stderr into a single output string AND forward to `onChunk` for streaming
  - Implement timeout: on expiry, call internal `killTree(child)` and resolve with `timedOut: true`
  - Implement `killTree`: on win32 use `spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])`; on POSIX `child.kill('SIGTERM')` then `SIGKILL` after 2s grace
  - Honor `AbortSignal` (caller can cancel from `/cancel`)
  - Export `parseCommand(text: string): { command: string; args: string[] }` mirroring current `parseProcessCommand` but typed and tested

  **Must NOT do**:
  - Do not use `exec`/`execSync` (no shell injection surface)
  - Do not concatenate user input into the command string
  - Do not silently drop stderr

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: well-known pattern, replicating + typing existing JS
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 with T2, T3, T4, T6, T7, T8
  - **Blocks**: T11, T13
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `src/bot.js:316-372 runOpencode` — current spawn + progress/cancel/timeout flow; this task generalizes the bare process-running primitive only (progress/timeout-message wiring belongs in jobService)
  - `src/bot.js:403-413 stopChild` — current taskkill approach; preserve, but expose as `killTree`
  - `src/bot.js:415-455 runProcess` — already a generic version; port to TS

  **External References**:
  - Node child_process spawn: `https://nodejs.org/api/child_process.html#child_processspawncommand-args-options`
  - AbortController + spawn signal: `https://nodejs.org/api/child_process.html#optionssignal`

  **WHY Each Reference Matters**:
  - We're not redesigning the spawn flow, just extracting + typing it. Keeping the current behavior (windowsHide, NO_COLOR, taskkill /T /F) avoids regressions.

  **Acceptance Criteria**:
  - [ ] vitest covers: success exit 0, non-zero exit, timeout (using `node -e "setTimeout(()=>{}, 5000)"` with 200ms timeout), abort via signal, stdout+stderr interleaving captured in order, `parseCommand` for plain, quoted-path, mixed
  - [ ] `killTree` invoked on win32 path uses `taskkill /T /F` (assert via spy on spawn)

  **QA Scenarios**:

  ```
  Scenario: Successful run captures stdout
    Tool: Bash (vitest)
    Steps:
      1. runProcess({ command: process.execPath, args: ['-e', 'console.log("hi")'], cwd: process.cwd(), timeoutMs: 5000 })
    Expected: code 0, output contains "hi", timedOut false
    Evidence: .sisyphus/evidence/task-5-runner-success.txt

  Scenario: Timeout kills the tree
    Tool: Bash (vitest)
    Steps:
      1. runProcess({ command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], cwd: process.cwd(), timeoutMs: 200 })
    Expected: timedOut true, code null OR signal != null
    Evidence: .sisyphus/evidence/task-5-runner-timeout.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-5-runner-success.txt`
  - [ ] `.sisyphus/evidence/task-5-runner-timeout.txt`

  **Commit**: YES
  - Message: `feat(utils): cross-platform processRunner with timeout + kill`
  - Files: `src/utils/processRunner.ts`, `tests/utils/processRunner.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/utils/processRunner.test.ts`

- [ ] 6. Domain types

  **What to do**:
  - Create `src/types/index.ts` with:
    - `WorkspaceRef`: `{ name: string; absolutePath: string; relativePath: string }`
    - `ChatId`: branded `number` (`type ChatId = number & { readonly __brand: 'ChatId' }`)
    - `JobId`: branded string `job_<timestamp>_<rand>`
    - `JobStatus`: `'pending' | 'running' | 'done' | 'failed' | 'timeout' | 'cancelled' | 'interrupted'`
    - `JobRecord`: `{ id: JobId; chatId: ChatId; type: 'opencode.cli' | 'opencode.session' | 'omo'; workspace: string; cwd: string; command: string; args: string[]; status: JobStatus; exitCode?: number; startedAt: string; endedAt?: string; logFile: string; promptPreview?: string; sessionId?: string }`
    - `SessionRecord`: `{ id: string; chatId: ChatId; title: string; opencodeSessionId?: string; agent?: string; model?: { providerID: string; modelID: string }; mode?: 'plan' | 'build' | 'deep' | 'ultrawork'; createdAt: string; updatedAt: string; status: 'active' | 'aborted' | 'archived' }`
    - `ChatSettings`: `{ chatId: ChatId; activeWorkspace?: string; cwd: string; activeSessionId?: string; defaultAgent: string; defaultMode: 'plan' | 'build' | 'deep' | 'ultrawork'; defaultModel?: { providerID: string; modelID: string } }`
    - `Mode = 'plan' | 'build' | 'deep' | 'ultrawork'`
    - `Agent = 'build' | 'plan' | 'deep' | 'ultrabrain' | 'oracle' | 'librarian' | 'metis' | 'momus' | string`
  - Add small constructors: `makeChatId(n: number): ChatId`, `makeJobId(): JobId`

  **Must NOT do**:
  - No runtime logic beyond id factories
  - No Zod schemas here (those live in services that read JSON)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: T9, T11, T14, T15
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `src/bot.js:43-44 runningJobs/activeProjects` — current Map shapes; the new types replace these untyped maps

  **External References**:
  - Branded types pattern: `https://www.typescriptlang.org/play?#example/branded-types`

  **WHY Each Reference Matters**:
  - Branded `ChatId`/`JobId` prevent accidental cross-use of `number`/`string` across services.

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` passes
  - [ ] vitest type-only test asserts factories produce branded values

  **QA Scenarios**:

  ```
  Scenario: tsc accepts and rejects appropriately
    Tool: Bash (tsc)
    Steps:
      1. Run `npx tsc --noEmit`
      2. Run `npx vitest run tests/types/types.test.ts`
    Expected: tsc 0 errors; vitest passes including a `// @ts-expect-error` line that prevents passing raw `number` where `ChatId` is required
    Evidence: .sisyphus/evidence/task-6-types.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-6-types.txt`

  **Commit**: YES
  - Message: `feat(types): domain types for job/session/settings/workspace`
  - Files: `src/types/index.ts`, `tests/types/types.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/types`

- [ ] 7. JSON store and storage tree

  **What to do**:
  - Create `src/utils/jsonStore.ts` exporting `createJsonStore<T>(opts: { file: string; schema: ZodType<T>; default: T })` returning `{ read(): Promise<T>; write(value: T): Promise<void>; update(fn: (current: T) => T): Promise<T> }`
  - Use atomic write: write to `<file>.tmp` then `fs.promises.rename` to final path
  - Acquire in-process mutex per file path (simple `Map<string, Promise<void>>` chain) to avoid concurrent writes within same Node process
  - Initialize storage tree on first use: ensure `STORAGE_DIR/jobs/`, `STORAGE_DIR/sessions/`, `STORAGE_DIR/logs/` exist; create `STORAGE_DIR/settings.json` with `{}` if absent
  - Export `ensureStorageLayout(env: Env): Promise<void>`

  **Must NOT do**:
  - No cross-process locking (single-instance bot is the constraint)
  - No JSON Schema generation; rely on Zod runtime validation only
  - Do not touch `.env` or paths outside `STORAGE_DIR`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: T11, T12, T15
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `src/bot.js:43-44` — runningJobs/activeProjects in-memory; replace with JSON-backed equivalents

  **External References**:
  - Atomic write pattern: `https://github.com/npm/write-file-atomic` — algorithm reference (do not add as dep)

  **WHY Each Reference Matters**:
  - Atomic rename prevents partial writes if bot crashes mid-write — important for jobs.json which mutates often.

  **Acceptance Criteria**:
  - [ ] vitest covers: read missing → returns default; read invalid JSON → throws clear error; write+read round-trip; update concurrent (10 parallel updates yield consistent value); ensureStorageLayout creates missing directories

  **QA Scenarios**:

  ```
  Scenario: Concurrent updates serialize correctly
    Tool: Bash (vitest)
    Steps:
      1. Create store with `{ counter: 0 }` schema
      2. Run `Promise.all` of 10 update calls each incrementing counter
    Expected: final counter === 10
    Evidence: .sisyphus/evidence/task-7-jsonstore-concurrent.txt

  Scenario: Atomic write survives mid-write crash simulation
    Tool: Bash (vitest)
    Steps:
      1. Mock `fs.promises.rename` to throw on first call
      2. Call write; expect exception; original file untouched
    Expected: original file content unchanged; .tmp file may exist
    Evidence: .sisyphus/evidence/task-7-jsonstore-atomic.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-7-jsonstore-concurrent.txt`
  - [ ] `.sisyphus/evidence/task-7-jsonstore-atomic.txt`

  **Commit**: YES
  - Message: `feat(utils): json store + storage tree`
  - Files: `src/utils/jsonStore.ts`, `tests/utils/jsonStore.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/utils/jsonStore.test.ts`

- [ ] 8. Vitest scaffold and adversarial pathGuard suite kickoff

  **What to do**:
  - Create `vitest.config.ts` with `test.environment: "node"`, `test.coverage.provider: "v8"`, `test.coverage.include: ["src/**/*.ts"]`, `test.coverage.exclude: ["src/index.ts", "src/types/**"]`, `test.testTimeout: 15000`
  - Create `tests/setup.ts` for shared helpers (e.g. `mkTmpRoot`, `withTmpRoot`)
  - Create initial **failing** tests for T4 pathGuard (TDD). Marked `.skip` only if `pathGuard.ts` doesn't exist yet — but since T4 runs in same wave, prefer ordering T8 to land tests after T4 module exists, or put T4's tests inside this task's test file
  - Decision: tests for T4 live in `tests/utils/pathGuard.test.ts` (delivered by T4). T8 only sets up vitest config + shared helpers + a smoke test (`tests/smoke.test.ts` that asserts `1+1===2`)

  **Must NOT do**:
  - Do not duplicate T4's adversarial cases here

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: every test-bearing task
  - **Blocked By**: T1

  **References**:

  **External References**:
  - Vitest config: `https://vitest.dev/config/`
  - V8 coverage provider: `https://vitest.dev/guide/coverage.html#coverage-providers`

  **Acceptance Criteria**:
  - [ ] `npx vitest run` exits 0 with the smoke test passing
  - [ ] `npx vitest run --coverage` writes a coverage report to `coverage/`

  **QA Scenarios**:

  ```
  Scenario: Vitest smoke + coverage
    Tool: Bash (vitest)
    Steps:
      1. Run `npx vitest run`
      2. Run `npx vitest run --coverage`
    Expected: both pass; coverage/ directory created
    Evidence: .sisyphus/evidence/task-8-vitest-smoke.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-8-vitest-smoke.txt`

  **Commit**: YES
  - Message: `test: vitest scaffold + smoke + tmp root helper`
  - Files: `vitest.config.ts`, `tests/setup.ts`, `tests/smoke.test.ts`
  - Pre-commit: `npx vitest run`

- [ ] 9. workspaceService

  **What to do**:
  - Create `src/services/workspaceService.ts`
  - Responsibilities:
    - `listWorkspaces(env): Promise<WorkspaceRef[]>` — list direct children of `PROJECTS_ROOT` (preserves backwards-compatible discovery semantics)
    - `resolveWorkspace(env, name): WorkspaceRef | null` — name must pass `pathGuard` + must be a directory
    - `setActiveWorkspace(chatId, ref)` / `getActiveWorkspace(chatId)` (delegates to settingsService — declared in T15; for now expose pure functions and let T20 wire chat state)
    - `resolveCwd(env, workspaceRef, cwdRel): { ok: true; absolute: string; relative: string } | { ok: false; reason: string }` — uses `pathGuard.resolveUnderRoot(workspaceRef.absolutePath, cwdRel)`
    - `joinCwd(currentRel: string, input: string): string` — handles `..`, `.`, absolute-looking input, normalizes separators; the result must still be validated via `resolveCwd`
  - All functions pure where possible; persistence is in T15

  **Must NOT do**:
  - Do not write to disk here (T15 handles settings persistence)
  - Do not bypass pathGuard for any input

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: integrates pathGuard, types, and env; not trivial but well-scoped
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2 with T10–T15
  - **Blocks**: T20, T21
  - **Blocked By**: T2, T4, T6

  **References**:

  **Pattern References**:
  - `src/bot.js:298-303 listProjects` — current listing logic; preserved as `listWorkspaces`
  - `src/bot.js:305-314 resolveProjectPath` — superseded by pathGuard + this service

  **API/Type References**:
  - `src/types/index.ts:WorkspaceRef` — return shape

  **WHY Each Reference Matters**:
  - The new service replaces the old direct-child-only logic but must still discover existing project folders the same way for `/workspaces` to remain useful.

  **Acceptance Criteria**:
  - [ ] vitest with tmp root containing `a/`, `b/`, `.hidden/` returns `[a, b]` in sorted order, hidden excluded
  - [ ] `resolveWorkspace` returns null for unknown name and rejects names containing `/`
  - [ ] `joinCwd("a/b", "..")` returns `"a"`; `joinCwd("a", "../..")` returns `""`; `joinCwd("a", "/abs")` returns the input absolute (and is later rejected by resolveCwd)
  - [ ] `resolveCwd` blocks any escape attempt validated by pathGuard

  **QA Scenarios**:

  ```
  Scenario: Workspace listing matches direct-child discovery
    Tool: Bash (vitest with tmp root)
    Steps:
      1. mkdir tmpRoot/a, tmpRoot/b, tmpRoot/.hidden
      2. listWorkspaces({ projectsRoot: tmpRoot })
    Expected: [{ name: "a" }, { name: "b" }]
    Evidence: .sisyphus/evidence/task-9-listWorkspaces.txt

  Scenario: cwd navigation respects pathGuard
    Tool: Bash (vitest)
    Steps:
      1. ws = resolveWorkspace(env, "a")
      2. resolveCwd(env, ws, "src/lib")
      3. resolveCwd(env, ws, "../../etc")
    Expected: step 2 ok with relative "src/lib"; step 3 rejected
    Evidence: .sisyphus/evidence/task-9-resolveCwd.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-9-listWorkspaces.txt`
  - [ ] `.sisyphus/evidence/task-9-resolveCwd.txt`

  **Commit**: YES
  - Message: `feat(services): workspaceService with cwd + nested resolution`
  - Files: `src/services/workspaceService.ts`, `tests/services/workspaceService.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/services/workspaceService.test.ts`

- [ ] 10. fileService (read-only)

  **What to do**:
  - Create `src/services/fileService.ts`
  - Functions (all path inputs go through pathGuard):
    - `ls(absDir, opts?: { showHidden?: boolean }): Promise<{ entries: { name: string; kind: 'dir'|'file'|'other'; size?: number; mtime: string }[] }>` — sorted: dirs first then files alphabetic
    - `tree(absDir, opts?: { depth?: number; maxEntries?: number }): Promise<{ lines: string[]; truncated: boolean }>` — default depth 3, default maxEntries 200
    - `cat(absFile, env): Promise<{ kind: 'text'|'binary'|'too_large'; content?: string; bytes?: number }>` — read first `FILE_READ_MAX_BYTES`; detect binary via NUL byte sniff in first 8KB
    - `download(absFile, env): Promise<{ ok: true; filePath: string; bytes: number } | { ok: false; reason: 'missing'|'too_large'|'is_dir' }>` — passes filePath to caller for `sendDocument`; cap = `FILE_READ_MAX_BYTES`
    - `find(absDir, query: string, opts?: { mode?: 'name'|'content'; maxResults?: number }): Promise<{ matches: { path: string; line?: number; preview?: string }[]; truncated: boolean }>` — name mode default; content mode reads files <128KB and skips binaries; maxResults default 100
  - All filenames returned must be htmlEscape-safe consumers (this service returns raw strings; escaping done in formatter)

  **Must NOT do**:
  - No write/delete/mkdir
  - No symlink follow when listing (use `withFileTypes: true` and don't dereference); pathGuard already realpath-checks the requested directory
  - Do not stream entire files — apply size caps

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: T21
  - **Blocked By**: T4

  **References**:

  **Pattern References**:
  - `src/bot.js:298-303 listProjects` — uses `withFileTypes: true`; same approach for ls

  **External References**:
  - Node fs.promises.readdir withFileTypes: `https://nodejs.org/api/fs.html#fspromisesreaddirpath-options`

  **WHY Each Reference Matters**:
  - withFileTypes avoids extra stat calls and matches existing project discovery style.

  **Acceptance Criteria**:
  - [ ] vitest covers ls (sorted, hidden flag), tree (depth limit, truncation flag), cat (text, binary detection, too_large), download (success path returns absolute path; rejects oversized/dir), find (name match, content match with `--mode content`, truncation)

  **QA Scenarios**:

  ```
  Scenario: cat detects binary
    Tool: Bash (vitest)
    Steps:
      1. Write tmpFile with bytes [0x48,0x00,0x49] (contains NUL)
      2. cat(tmpFile, env)
    Expected: { kind: "binary" }
    Evidence: .sisyphus/evidence/task-10-cat-binary.txt

  Scenario: tree truncates at maxEntries
    Tool: Bash (vitest)
    Steps:
      1. Build tmp tree with 500 files
      2. tree(root, { maxEntries: 50 })
    Expected: lines.length === 50, truncated true
    Evidence: .sisyphus/evidence/task-10-tree-truncation.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-10-cat-binary.txt`
  - [ ] `.sisyphus/evidence/task-10-tree-truncation.txt`
  - [ ] `.sisyphus/evidence/task-10-ls-sort.txt`
  - [ ] `.sisyphus/evidence/task-10-find-name.txt`

  **Commit**: YES
  - Message: `feat(services): fileService for ls/tree/open/cat/find/download`
  - Files: `src/services/fileService.ts`, `tests/services/fileService.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/services/fileService.test.ts`

- [ ] 11. jobService with persistent state

  **What to do**:
  - Create `src/services/jobService.ts`
  - Backed by `STORAGE_DIR/jobs/{jobId}.json` (one file per job, easier to prune) AND `STORAGE_DIR/jobs/index.json` listing job ids in chronological order
  - Functions:
    - `createJob(input: Omit<JobRecord,'id'|'startedAt'|'status'|'logFile'>): Promise<JobRecord>` — generate id, status `pending`, init log file path under `STORAGE_DIR/logs/{jobId}.log`
    - `markRunning(id, abortHandle: AbortController)` / `markDone(id, exitCode)` / `markFailed(id, error)` / `markTimeout(id)` / `markCancelled(id)` / `markInterrupted(id)`
    - `appendLog(id, kind: 'stdout'|'stderr'|'system', chunk: string)` (delegates to logService)
    - `getJob(id)` / `listJobs(chatId, opts?: { limit?: number; status?: JobStatus })` / `getActiveJobForChat(chatId)`
    - `cancel(id)` — abort via stored AbortController, mark cancelled
    - `recoverOnBoot()` — on bot start, scan jobs with status `running`, mark them `interrupted`, append `[system] bot restarted` to their log
  - In-memory `Map<JobId, AbortController>` for live runs (controllers are NOT persisted)
  - Constraint enforced: per chatId, at most one active CLI job at a time (caller must check `getActiveJobForChat` before `createJob({ type: 'opencode.cli' })`)

  **Must NOT do**:
  - Do not persist AbortController
  - Do not delete log files automatically beyond retention prune
  - Do not block on log writes (use `await` but don't gate the spawn pipe on it)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: state machine + restart recovery + concurrency guard
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: T22, T23
  - **Blocked By**: T5, T6, T7

  **References**:

  **Pattern References**:
  - `src/bot.js:43, 126-158, 194-206` — current runningJobs Map and concurrency guard; replicate semantics with persistence

  **API/Type References**:
  - `src/types/index.ts:JobRecord, JobStatus`

  **WHY Each Reference Matters**:
  - Current bot loses state on restart; the new design must surface stale jobs as `interrupted` so the user understands what happened.

  **Acceptance Criteria**:
  - [ ] vitest covers: createJob persists to disk; markDone updates status; cancel triggers AbortController; recoverOnBoot transitions running→interrupted; concurrency guard rejects second concurrent CLI job for same chat with clear error

  **QA Scenarios**:

  ```
  Scenario: Restart recovery
    Tool: Bash (vitest)
    Steps:
      1. createJob → markRunning
      2. Simulate process restart by clearing in-memory abort map (new service instance pointed at same storage dir)
      3. Call recoverOnBoot()
      4. getJob(id)
    Expected: status === "interrupted", log contains "[system] bot restarted"
    Evidence: .sisyphus/evidence/task-11-recover.txt

  Scenario: Per-chat concurrency
    Tool: Bash (vitest)
    Steps:
      1. createJob({ chatId: 1, type: "opencode.cli" }) → markRunning
      2. Attempt second createJob({ chatId: 1, type: "opencode.cli" }) via guarded helper
    Expected: helper throws or returns { ok: false, reason: "chat_busy" }
    Evidence: .sisyphus/evidence/task-11-concurrency.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-11-recover.txt`
  - [ ] `.sisyphus/evidence/task-11-concurrency.txt`
  - [ ] `.sisyphus/evidence/task-11-statemachine.txt` (transitions covered)

  **Commit**: YES
  - Message: `feat(services): jobService with persistent state + restart recovery`
  - Files: `src/services/jobService.ts`, `tests/services/jobService.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/services/jobService.test.ts`

- [ ] 12. logService

  **What to do**:
  - Create `src/services/logService.ts`
  - `appendLog(jobId, kind, chunk)`: append to `STORAGE_DIR/logs/{jobId}.log` with format `[ISO_TS] [stdout|stderr|system] <chunk>` (one entry per chunk, newline delimited)
  - `readLog(jobId, opts?: { tail?: number; filter?: 'all'|'stderr'|'system' }): Promise<string>` — default tail = entire file but capped at 1MB returned
  - `getLogPath(jobId)`: returns absolute path (used by `/logs <id> download` to call `sendDocument`)
  - `pruneOldLogs(env)`: keep newest `LOG_RETENTION_JOBS` job logs by mtime; delete older. Also remove orphan log files whose job record no longer exists.
  - Use append-only writes (`fs.promises.appendFile`); single in-process write queue per file path

  **Must NOT do**:
  - No log rotation by size (retention is by job count)
  - No buffering across processes
  - No reads above 1MB in `readLog` (use download path for full files)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: T23
  - **Blocked By**: T7

  **References**:

  **Pattern References**:
  - `src/bot.js:349-350 chunks.push` — current in-memory aggregation; replace with file append

  **External References**:
  - Node fs.promises.appendFile: `https://nodejs.org/api/fs.html#fspromisesappendfilepath-data-options`

  **Acceptance Criteria**:
  - [ ] vitest covers append + read tail + filter stderr-only + prune retains top N + prune removes orphans
  - [ ] Concurrent appends to same file produce no interleaved partial lines

  **QA Scenarios**:

  ```
  Scenario: Tail and filter
    Tool: Bash (vitest)
    Steps:
      1. Append 5 stdout, 2 stderr, 1 system lines
      2. readLog(id, { tail: 4, filter: "stderr" })
    Expected: 2 lines, all stderr
    Evidence: .sisyphus/evidence/task-12-tail-filter.txt

  Scenario: Retention prune
    Tool: Bash (vitest)
    Steps:
      1. Create 60 dummy log files
      2. pruneOldLogs({ LOG_RETENTION_JOBS: 50 })
    Expected: 50 files remain (newest 50)
    Evidence: .sisyphus/evidence/task-12-prune.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-12-tail-filter.txt`
  - [ ] `.sisyphus/evidence/task-12-prune.txt`

  **Commit**: YES
  - Message: `feat(services): logService append + retention prune`
  - Files: `src/services/logService.ts`, `tests/services/logService.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/services/logService.test.ts`

- [ ] 13. opencodeCliService

  **What to do**:
  - Create `src/services/opencodeCliService.ts`
  - Functions:
    - `runCli(opts: { prompt: string; cwd: string; env: Env; jobId: JobId; abort: AbortController; onChunk: (kind, chunk) => void; }): Promise<{ code: number | null; signal: NodeJS.Signals | null; timedOut: boolean }>` — uses `processRunner.runProcess` with `command = parsedOpencode.command`, `args = [...parsedOpencode.args, 'run', prompt]`
    - `doctor(env): Promise<{ ok: boolean; command: string; args: string[]; cwd: string; exitCode: number | null; output: string; error?: string }>` — runs `opencode --help` with timeout `DOCTOR_TIMEOUT_MS=15000`
    - `helpText(env): Promise<string>` — runs `opencode --help` and returns stdout
  - Uses `parseCommand(env.OPENCODE_COMMAND)` from processRunner

  **Must NOT do**:
  - Do not interpolate the prompt into a shell string; pass as a single argv element
  - Do not silently log secrets if env contains them; pass through unchanged

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: T22, T24
  - **Blocked By**: T2, T5

  **References**:

  **Pattern References**:
  - `src/bot.js:316-372 runOpencode` — current invocation; preserve env defaults (CI=1, NO_COLOR=1, TERM=dumb), windowsHide, stdio
  - `src/bot.js:172-192 doctor command` — doctor flow (run opencode --help)

  **External References**:
  - opencode CLI: `https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/cli.mdx` — confirmed `opencode run "<prompt>"` interface

  **Acceptance Criteria**:
  - [ ] vitest with stub `tests/fixtures/fake-opencode.cjs` covers: success run, non-zero exit, timeout, doctor success, doctor missing-binary
  - [ ] Confirm OPENCODE_COMMAND can be a quoted full path including spaces (Windows)

  **QA Scenarios**:

  ```
  Scenario: CLI run with stub
    Tool: Bash (vitest with stub fake-opencode.cjs)
    Steps:
      1. Set OPENCODE_COMMAND to `node tests/fixtures/fake-opencode.cjs`
      2. runCli({ prompt: "hello", cwd: tmpDir, ... })
    Expected: code 0, onChunk received "stdout: hello\n"
    Evidence: .sisyphus/evidence/task-13-cli-stub.txt

  Scenario: Doctor reports missing binary clearly
    Tool: Bash (vitest)
    Steps:
      1. Set OPENCODE_COMMAND to `definitely-not-installed-xyz.cmd`
      2. doctor(env)
    Expected: ok false, error contains "ENOENT" or non-zero exit
    Evidence: .sisyphus/evidence/task-13-doctor-missing.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-13-cli-stub.txt`
  - [ ] `.sisyphus/evidence/task-13-doctor-missing.txt`

  **Commit**: YES
  - Message: `feat(services): opencodeCliService spawn wrapper`
  - Files: `src/services/opencodeCliService.ts`, `tests/services/opencodeCliService.test.ts`, `tests/fixtures/fake-opencode.cjs`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/services/opencodeCliService.test.ts`

- [ ] 14. opencodeApiService (SDK + health probe)

  **What to do**:
  - Create `src/services/opencodeApiService.ts`
  - On import, lazy-create the SDK client: `import { createOpencodeClient } from "@opencode-ai/sdk/v2"` with `baseUrl = env.OPENCODE_SERVER_URL`
  - Functions:
    - `probe(env): Promise<{ available: boolean; baseUrl: string; latencyMs?: number; error?: string }>` — quick HEAD/GET against `${baseUrl}` (or `${baseUrl}/v1/health` if exposed) with 1500ms timeout via AbortController
    - `createSession(input: { title: string; agent?: string; model?: { providerID; modelID }; mode?: Mode }): Promise<{ id: string }>` — calls `client.v2.session.create`
    - `prompt(input: { sessionID: string; text: string; async?: boolean }): Promise<{ messageId?: string }>` — calls `client.v2.session.prompt` (or `promptAsync`)
    - `command(input: { sessionID: string; command: string; arguments?: Record<string, unknown> | string }): Promise<unknown>` — calls `client.v2.session.command`
    - `abort(sessionID): Promise<void>`
    - `listSessions(): Promise<{ id: string; title: string; createdAt: string }[]>`
  - Surface a single `OpencodeApiError` class wrapping SDK errors; do not leak SDK types beyond this module
  - All functions check `probe` first when called externally? No — caller decides; service throws `OpencodeApiUnavailableError` on connection refused

  **Must NOT do**:
  - Do not auto-spawn `opencode serve`
  - Do not retry indefinitely; max 1 retry on network errors with 500ms backoff
  - Do not import SDK types into other modules — wrap them

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: T24, T25
  - **Blocked By**: T2, T6

  **References**:

  **External References**:
  - Opencode SDK v2: `https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/server.mdx`
  - SDK npm: `https://www.npmjs.com/package/@opencode-ai/sdk` — confirm `./v2` subpath
  - POST /session/:id/command spec: `https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/server.mdx`

  **WHY Each Reference Matters**:
  - The plan locks in `client.v2.session` (per Metis), and the server endpoints confirm `command` accepts `{ command, arguments, agent?, model? }`. We need to match this exactly to support `/session_command` and `/omo`.

  **Acceptance Criteria**:
  - [ ] vitest stubs an HTTP server on a random port; `probe` returns `available: true` with measured latency
  - [ ] `createSession` + `prompt` round-trip against stub; returns expected message id
  - [ ] When stub is offline, `probe` returns `available: false` within 1500ms; SDK calls throw `OpencodeApiUnavailableError`

  **QA Scenarios**:

  ```
  Scenario: Probe detects live server
    Tool: Bash (vitest with http stub)
    Steps:
      1. Start http stub returning 200 on root
      2. probe({ OPENCODE_SERVER_URL: "http://localhost:<port>" })
    Expected: available true, latencyMs < 1500
    Evidence: .sisyphus/evidence/task-14-probe-up.txt

  Scenario: Probe detects offline server
    Tool: Bash (vitest)
    Steps:
      1. Pick free port without binding
      2. probe(...)
    Expected: available false within 1500ms
    Evidence: .sisyphus/evidence/task-14-probe-down.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-14-probe-up.txt`
  - [ ] `.sisyphus/evidence/task-14-probe-down.txt`
  - [ ] `.sisyphus/evidence/task-14-session-roundtrip.txt`

  **Commit**: YES
  - Message: `feat(services): opencodeApiService sdk wrapper + health probe`
  - Files: `src/services/opencodeApiService.ts`, `tests/services/opencodeApiService.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/services/opencodeApiService.test.ts`

- [ ] 15. settingsService + sessionService

  **What to do**:
  - Create `src/services/settingsService.ts`:
    - `getSettings(chatId): Promise<ChatSettings>` (returns defaults if missing)
    - `setActiveWorkspace(chatId, workspaceName)` / `setCwd(chatId, cwdRel)` / `setActiveSession(chatId, sessionId | null)` / `setDefaultAgent(chatId, agent)` / `setDefaultModel(chatId, { providerID, modelID })` / `setDefaultMode(chatId, mode)`
    - Stored in `STORAGE_DIR/settings.json` keyed by `chatId`
    - Defaults: `{ cwd: "", defaultAgent: "build", defaultMode: "build" }` (no model — use opencode default)
  - Create `src/services/sessionService.ts`:
    - `createSession(chatId, { title, agent?, model?, mode? }): Promise<SessionRecord>` — generates id `sess_<ts>_<rand>`; on success calls `opencodeApiService.createSession` if API available, else stores `opencodeSessionId: undefined` and marks `status: 'pending-api'`
    - `listSessions(chatId): Promise<SessionRecord[]>`
    - `getSession(id) / getActiveSession(chatId)`
    - `setActiveSession(chatId, id)`
    - `abortSession(id)` — calls `opencodeApiService.abort` if linked
  - Both services use `jsonStore` from T7

  **Must NOT do**:
  - Do not embed API tokens in any persisted record
  - Do not couple sessionService to specific commands — it's pure data

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: T20, T24, T25
  - **Blocked By**: T6, T7

  **References**:

  **Pattern References**:
  - `src/bot.js:44 activeProjects` — current per-chat state; replace with persisted ChatSettings

  **API/Type References**:
  - `src/types/index.ts:ChatSettings, SessionRecord`

  **Acceptance Criteria**:
  - [ ] vitest covers settings round-trip per chat; defaults applied; updates persist
  - [ ] sessionService creates record + links opencodeSessionId when API stub returns success; falls back gracefully when API unavailable

  **QA Scenarios**:

  ```
  Scenario: Settings persist across instances
    Tool: Bash (vitest)
    Steps:
      1. settingsA = setActiveWorkspace(1, "alpha"); setDefaultAgent(1, "deep")
      2. Discard service instance, create new one pointing at same storage dir
      3. getSettings(1)
    Expected: { activeWorkspace: "alpha", defaultAgent: "deep" }
    Evidence: .sisyphus/evidence/task-15-settings-persist.txt

  Scenario: sessionService falls back when API down
    Tool: Bash (vitest)
    Steps:
      1. Stub opencodeApiService.createSession to throw OpencodeApiUnavailableError
      2. sessionService.createSession(1, { title: "x" })
    Expected: record created with status "pending-api", opencodeSessionId undefined
    Evidence: .sisyphus/evidence/task-15-session-fallback.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-15-settings-persist.txt`
  - [ ] `.sisyphus/evidence/task-15-session-fallback.txt`

  **Commit**: YES
  - Message: `feat(services): settingsService + sessionService`
  - Files: `src/services/settingsService.ts`, `src/services/sessionService.ts`, `tests/services/settingsService.test.ts`, `tests/services/sessionService.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/services/settingsService.test.ts tests/services/sessionService.test.ts`

- [ ] 16. formatterService

  **What to do**:
  - Create `src/services/formatterService.ts`
  - Functions returning `{ kind: 'text'|'document'; text?: string; filePath?: string; parseMode: 'HTML'; }`:
    - `formatStart(env): { kind: 'text', text }` — HTML help banner
    - `formatHelp(env): { kind: 'text', text }` — list grouped commands
    - `formatWorkspaces(refs): { kind: 'text', text }` — bullet list
    - `formatLs(entries): { kind: 'text', text }` — `<pre>` block with directories first, files second; `📁` and `📄` glyphs disabled by default (use `[d]`/`[f]`)
    - `formatTree(lines, truncated): text-or-document` — if total >3500 chars, return document with text in tmp file
    - `formatFile(content, kind, bytes): text-or-document`
    - `formatJobSummary(job, log: string): { kind: 'text', text }` — title, status badge (✅ done / ❌ failed / ⏱ timeout / 🚫 cancelled / ⚠️ interrupted), duration, last 60 lines of log in `<pre>`, hint about `/logs <id> download`
    - `formatJobList(jobs)`, `formatLogPreview(jobId, log)`, `formatSessions(sessions, activeId?)`, `formatSettings(settings)`, `formatError(error)` — converts Error to user-safe HTML (no stack)
  - All functions delegate string escaping through `htmlEscape`. All `<pre>` blocks must NOT contain unescaped `<` `>` `&`.
  - Output >3500 chars triggers `kind: 'document'` and writes a tmp `.txt` under `STORAGE_DIR/tmp/<rand>.txt` for `sendDocument`

  **Must NOT do**:
  - Do not include MarkdownV2/Markdown — strict HTML only
  - Do not include emojis the user didn't request beyond status badges (single-char)
  - Do not invoke Telegram API; this is a pure formatter

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: many output shapes, must be consistent and safe
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Parallel Group**: Wave 3 with T17, T18
  - **Blocks**: all command tasks (T19–T25)
  - **Blocked By**: T3, T11, T12

  **References**:

  **Pattern References**:
  - `src/bot.js:46-72 start command body` — current help text; port to HTML
  - `src/bot.js:286-296 sendProjectList` — format pattern to mimic for /workspaces

  **External References**:
  - Telegram HTML mode: `https://core.telegram.org/bots/api#html-style`

  **WHY Each Reference Matters**:
  - The current text-only output style is fine semantically; we're just upgrading to safe HTML so code blocks render correctly.

  **Acceptance Criteria**:
  - [ ] vitest snapshot tests for each formatter (small, large, edge cases)
  - [ ] All HTML output passes a manual unit test that confirms no unescaped `<` survives in non-tag positions

  **QA Scenarios**:

  ```
  Scenario: Long output emits document
    Tool: Bash (vitest)
    Steps:
      1. Build a 5000-char fake job log
      2. formatJobSummary(job, longLog)
    Expected: returns { kind: 'document', filePath: <existing tmp .txt> }
    Evidence: .sisyphus/evidence/task-16-format-doc.txt

  Scenario: Filenames with HTML chars are escaped
    Tool: Bash (vitest)
    Steps:
      1. formatLs([{ name: '<script>.ts', kind: 'file', size: 10, mtime: '...' }])
    Expected: returned text contains "&lt;script&gt;.ts" and no raw "<script>"
    Evidence: .sisyphus/evidence/task-16-format-escape.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-16-format-doc.txt`
  - [ ] `.sisyphus/evidence/task-16-format-escape.txt`
  - [ ] vitest snapshot dir under `tests/services/__snapshots__/formatterService.test.ts.snap`

  **Commit**: YES
  - Message: `feat(services): formatterService HTML output + document fallback`
  - Files: `src/services/formatterService.ts`, `tests/services/formatterService.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/services/formatterService.test.ts`

- [ ] 17. createBot + middleware

  **What to do**:
  - Create `src/bot/createBot.ts` exporting `createBot(env: Env): { bot: Bot<Context>; api: Bot['api'] }` — wires middleware order: `logging → auth → errorHandler → command modules`
  - Create `src/bot/middleware/auth.ts`: rejects updates whose `ctx.from?.id` is not in `env.allowedUserIds`. Replies once with HTML "Akses ditolak" (HTML escaped); does not call `next()`
  - Create `src/bot/middleware/errorHandler.ts`: wraps the entire chain; on thrown error logs to stderr + replies to chat with `formatError(error)` (no stack); calls `bot.catch` for global errors
  - Create `src/bot/middleware/logging.ts`: logs `update_id`, `chat_id`, `text` (truncated to 80 chars) to console — used to debug only
  - Configure rate-limit transformer: on Telegram 429, await `retry_after` and try once
  - Set parse mode default to `HTML` via `bot.api.config.use((prev, method, payload) => prev(method, { parse_mode: 'HTML', ...payload }))` for `sendMessage` and `sendDocument` only

  **Must NOT do**:
  - Do not register any commands here (commands tasks own that)
  - Do not log raw bot token
  - Do not catch `bot.start` errors silently

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: all command tasks
  - **Blocked By**: T2, T16

  **References**:

  **Pattern References**:
  - `src/bot.js:42 new Bot(token), 251-253 bot.catch` — current setup; mirror but add middleware separation
  - `src/bot.js:265-271 isAllowed/deny` — auth pattern; centralize as middleware

  **External References**:
  - grammY middleware: `https://grammy.dev/guide/middleware.html`
  - grammY API transformer: `https://grammy.dev/advanced/transformers.html`

  **Acceptance Criteria**:
  - [ ] vitest using `bot.handleUpdate` confirms unauthenticated user receives "Akses ditolak" once and the inner handler is not called
  - [ ] vitest confirms parse_mode HTML is auto-injected into outbound `sendMessage`
  - [ ] On thrown error in handler, captured outbound call is `sendMessage` with safe error text (no stack)

  **QA Scenarios**:

  ```
  Scenario: Auth blocks foreign user
    Tool: Bash (vitest + harness)
    Steps:
      1. Register a no-op `bot.command('ping')` for the test
      2. Send fake update with from.id = 99999 (not allowed) and text "/ping"
    Expected: outbound calls = [{ method: 'sendMessage', payload: { text: includes 'Akses ditolak', parse_mode: 'HTML' } }]; ping handler never invoked
    Evidence: .sisyphus/evidence/task-17-auth.txt

  Scenario: Error handler returns safe HTML
    Tool: Bash (vitest)
    Steps:
      1. Register a command that throws
      2. Send fake update from allowed user
    Expected: outbound sendMessage with text NOT containing "Error:" stack words; contains a generic "Terjadi kesalahan" line
    Evidence: .sisyphus/evidence/task-17-errorHandler.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-17-auth.txt`
  - [ ] `.sisyphus/evidence/task-17-errorHandler.txt`
  - [ ] `.sisyphus/evidence/task-17-parseMode.txt`

  **Commit**: YES
  - Message: `feat(bot): createBot + auth/error/logging middleware`
  - Files: `src/bot/createBot.ts`, `src/bot/middleware/auth.ts`, `src/bot/middleware/errorHandler.ts`, `src/bot/middleware/logging.ts`, `tests/bot/createBot.test.ts`, `tests/bot/middleware.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/bot`

- [ ] 18. grammY test harness helper

  **What to do**:
  - Create `tests/helpers/botHarness.ts` exporting:
    - `makeUpdate({ chatId, fromId, text }): Update` — builds a minimal Telegram Update for command/text messages
    - `attachOutboundCapture(bot): { calls: Array<{ method, payload }>; restore: () => void }` — installs an api transformer that stores calls and returns plausible Telegram API responses (`sendMessage` → `{ ok: true, result: { message_id: <int>, chat: { id: chatId }, date: 0, text: payload.text } }`)
    - `dispatchAndCapture(bot, update): Promise<calls>` — convenience wrapper
  - Document usage in a top-of-file comment

  **Must NOT do**:
  - Do not depend on a real Telegram token
  - Do not import command modules (the harness is generic)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: every command test
  - **Blocked By**: T17

  **References**:

  **External References**:
  - grammY testing: `https://grammy.dev/advanced/deployment.html#tests`
  - grammY Update type: `https://grammy.dev/ref/types/update`

  **Acceptance Criteria**:
  - [ ] vitest sanity test wires a no-op bot, dispatches `/ping`, captures the outbound `sendMessage`

  **QA Scenarios**:

  ```
  Scenario: Harness sanity
    Tool: Bash (vitest)
    Steps:
      1. createBot(testEnv); bot.command('ping', ctx => ctx.reply('pong'))
      2. dispatchAndCapture(bot, makeUpdate({ chatId: 1, fromId: ALLOWED, text: '/ping' }))
    Expected: calls[0].method === 'sendMessage', payload.text === 'pong', parse_mode === 'HTML'
    Evidence: .sisyphus/evidence/task-18-harness.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-18-harness.txt`

  **Commit**: YES
  - Message: `test(bot): grammY handleUpdate harness helper`
  - Files: `tests/helpers/botHarness.ts`, `tests/helpers/botHarness.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/helpers`

- [ ] 19. /start and /help commands

  **What to do**:
  - Create `src/bot/commands/start.ts` registering `/start` → `formatterService.formatStart(env)` then send via `ctx.reply` (HTML). Includes brief getting-started: `/workspaces`, `/workspace use <name>`, `/cd`, `/ls`, `/run`.
  - Create `src/bot/commands/help.ts` registering `/help` and `/?` (alias) → `formatterService.formatHelp(env)` listing every command grouped by section: Workspace & Files, Opencode, Sessions, Jobs & Logs, Settings, OMO. Each line: `<code>/cmd args</code> — short description`.
  - Both export a `register(bot, deps)` function called from `createBot`/`index.ts`.

  **Must NOT do**:
  - Do not include legacy commands (`/folders`, `/use`, `/task`, `/prompt`)
  - Do not embed bot token or PROJECTS_ROOT path leak (PROJECTS_ROOT abbreviated to `<root>` in help)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: T26
  - **Blocked By**: T17

  **References**:

  **Pattern References**:
  - `src/bot.js:46-72` — current /start body; rewrite for new command surface

  **Acceptance Criteria**:
  - [ ] Harness test: `/start` outputs HTML containing `/workspaces` and `/run`
  - [ ] Harness test: `/help` lists all command groups, no legacy commands present

  **QA Scenarios**:

  ```
  Scenario: /help lists every section
    Tool: Bash (vitest harness)
    Steps:
      1. dispatchAndCapture(bot, makeUpdate({ text: '/help' }))
    Expected: outbound text contains 'Workspace', 'Opencode', 'Sessions', 'Jobs', 'Settings', 'OMO'; does NOT contain '/folders' or '/use'
    Evidence: .sisyphus/evidence/task-19-help.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-19-help.txt`
  - [ ] `.sisyphus/evidence/task-19-start.txt`

  **Commit**: YES
  - Message: `feat(commands): /start + /help`
  - Files: `src/bot/commands/start.ts`, `src/bot/commands/help.ts`, `tests/bot/commands/start.test.ts`, `tests/bot/commands/help.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/bot/commands/start.test.ts tests/bot/commands/help.test.ts`

- [ ] 20. Workspace + cwd commands

  **What to do**:
  - Create `src/bot/commands/workspace.ts` registering:
    - `/root` — replies with `<code>${env.projectsRoot}</code>` (HTML escaped)
    - `/workspaces` — calls `workspaceService.listWorkspaces`, formats via `formatterService.formatWorkspaces`
    - `/workspace use <name>` — sets active workspace via `settingsService.setActiveWorkspace` and resets cwd to `""`. Replies confirming or error if workspace not found.
    - `/pwd` — replies with `<code>${activeWorkspace}/${cwd}</code>` or "Tidak ada workspace aktif"
    - `/cd <path>` — uses `workspaceService.joinCwd` + `resolveCwd`. On success, persists cwd via settingsService and replies with new pwd. On failure, formats error reason (`outside_root`, `missing`, `invalid_input`).
  - Special inputs: `/cd ~` resets to `""`; `/cd ..` goes up one level; `/cd /sub/abs` is rejected unless it stays under workspace root.

  **Must NOT do**:
  - Do not allow `/cd` to escape the active workspace
  - Do not allow `/workspace use` with an arg containing `/` or `\` (workspace name is a direct child, by design)
  - Do not write to disk anything outside `STORAGE_DIR`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: T26
  - **Blocked By**: T9, T15, T17

  **References**:

  **Pattern References**:
  - `src/bot.js:74-105` — current /folders + /use behavior to be replaced
  - `src/bot.js:107-124` — current /active behavior; replaced by /pwd

  **Acceptance Criteria**:
  - [ ] Harness covers: list workspaces (sorted, hidden excluded), use valid workspace, use missing workspace, /pwd before/after use, /cd valid nested, /cd `..`, /cd escape rejected with reason
  - [ ] Settings persisted across harness instances

  **QA Scenarios**:

  ```
  Scenario: Use → cd → pwd flow
    Tool: Bash (vitest harness with tmp PROJECTS_ROOT)
    Preconditions: tmpRoot/proj-a/src/lib exists
    Steps:
      1. /workspaces  → output lists "proj-a"
      2. /workspace use proj-a  → "Workspace aktif: proj-a"
      3. /cd src/lib  → "pwd: proj-a/src/lib"
      4. /pwd  → echoes pwd
    Expected: each step's outbound matches; settings.json persists activeWorkspace=proj-a, cwd=src/lib
    Evidence: .sisyphus/evidence/task-20-workspace-flow.txt

  Scenario: Escape attempt rejected
    Tool: Bash (vitest harness)
    Steps:
      1. /workspace use proj-a
      2. /cd ../../etc
    Expected: outbound contains "outside_root" reason; settings.cwd unchanged
    Evidence: .sisyphus/evidence/task-20-cd-escape.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-20-workspace-flow.txt`
  - [ ] `.sisyphus/evidence/task-20-cd-escape.txt`

  **Commit**: YES
  - Message: `feat(commands): workspace + cwd commands`
  - Files: `src/bot/commands/workspace.ts`, `tests/bot/commands/workspace.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/bot/commands/workspace.test.ts`

- [ ] 21. Read-only file browser commands

  **What to do**:
  - Create `src/bot/commands/files.ts` registering:
    - `/ls [path]` — lists current cwd by default; optional path is resolved relative to cwd via pathGuard. Output via `formatterService.formatLs`.
    - `/tree [path]` — recursive listing capped at depth 3 / 200 entries; document fallback if too long
    - `/open <file>` / `/cat <file>` — alias; reads via `fileService.cat`; sends as text if <3500 chars, else as document via `sendDocument`
    - `/find <keyword>` — name-mode search by default. Supports `--content` flag (`/find --content jwt`) for content search. Limited 100 matches; document fallback if long.
    - `/download <file>` — sends file via `bot.api.sendDocument` (`Input.fromLocalFile`); rejects if >`FILE_READ_MAX_BYTES` or not a regular file
  - Every command first resolves active workspace + cwd; replies with friendly error if no workspace selected (`"Pilih workspace dulu dengan /workspace use <nama>"`)

  **Must NOT do**:
  - No write/delete/mkdir
  - No symlink dereferencing in tree (entries showing kind `'other'` for symlinks are listed but not followed)
  - No reading binary files for /open/cat (return summary "(file biner, gunakan /download)")

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: T26
  - **Blocked By**: T9, T10, T17

  **References**:

  **External References**:
  - grammY sendDocument + Input.fromLocalFile: `https://grammy.dev/guide/files`

  **Acceptance Criteria**:
  - [ ] Harness covers: `/ls` (with and without path), `/tree` truncation, `/open` text + binary + missing + too_large, `/find` name + content, `/download` success + reject too large + reject directory

  **QA Scenarios**:

  ```
  Scenario: /open binary returns guidance
    Tool: Bash (vitest harness)
    Preconditions: tmp workspace with bin file containing NUL
    Steps:
      1. /workspace use proj-a; /open assets/logo.png
    Expected: outbound text contains "(file biner, gunakan /download)"; no document sent
    Evidence: .sisyphus/evidence/task-21-open-binary.txt

  Scenario: /download oversized rejected
    Tool: Bash (vitest harness)
    Steps:
      1. Create 2MB file; FILE_READ_MAX_BYTES=1MB
      2. /download big.bin
    Expected: outbound text contains "too_large" message; no sendDocument call
    Evidence: .sisyphus/evidence/task-21-download-toolarge.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-21-open-binary.txt`
  - [ ] `.sisyphus/evidence/task-21-download-toolarge.txt`
  - [ ] `.sisyphus/evidence/task-21-find.txt`
  - [ ] `.sisyphus/evidence/task-21-tree.txt`

  **Commit**: YES
  - Message: `feat(commands): read-only file browser commands`
  - Files: `src/bot/commands/files.ts`, `tests/bot/commands/files.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/bot/commands/files.test.ts`

- [ ] 22. Opencode CLI commands

  **What to do**:
  - Create `src/bot/commands/opencode.ts` registering:
    - `/run <prompt>` — primary CLI invocation. Validates active workspace + cwd, blocks if `jobService.getActiveJobForChat` returns running. Calls `opencodeCliService.runCli` with abort wired to a `jobService.cancel` flow.
    - `/task <prompt>` — alias for `/run` (kept for muscle memory; not a legacy command — explicit alias, documented)
    - `/doctor` — calls `opencodeCliService.doctor`, formats summary via `formatterService`
    - `/opencode_help` — calls `opencodeCliService.helpText`, sends as document if long
  - Each `/run` job writes incremental log via `logService.appendLog`. Telegram receives only summary on completion (last 60 lines + status badge), via `formatterService.formatJobSummary`. Periodic progress message every `PROGRESS_INTERVAL_MS` shows status + last 20 lines (HTML-safe).

  **Must NOT do**:
  - Do not include the prompt verbatim in periodic progress messages — only the first 200 chars
  - Do not let /task pretend to be the legacy `/task` semantics; behavior must match new `/run`
  - Do not call sendMessage with raw stdout — always go through formatter

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: T26
  - **Blocked By**: T11, T13, T17

  **References**:

  **Pattern References**:
  - `src/bot.js:126-158 task command` — current /task; replicate the run+log pattern with new services
  - `src/bot.js:172-192 doctor command` — reuse logic via opencodeCliService.doctor

  **Acceptance Criteria**:
  - [ ] Harness with stub fake-opencode covers: success run produces summary, non-zero exit produces failed badge, timeout produces ⏱ badge, second concurrent /run rejected with "chat_busy" message
  - [ ] /doctor with stub-missing OPENCODE_COMMAND surfaces ENOENT-style error in formatted summary

  **QA Scenarios**:

  ```
  Scenario: /run success summary
    Tool: Bash (vitest harness with fake-opencode)
    Preconditions: workspace active
    Steps:
      1. /run echo hello
    Expected: outbound contains "✅" badge, "exit code 0", and last lines including "hello"
    Evidence: .sisyphus/evidence/task-22-run-success.txt

  Scenario: Concurrent /run rejected
    Tool: Bash (vitest harness)
    Steps:
      1. Begin /run sleep (long-running stub) — do not await completion
      2. Send second /run
    Expected: second outbound contains "Masih ada job berjalan" (or new equivalent in HTML)
    Evidence: .sisyphus/evidence/task-22-concurrent.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-22-run-success.txt`
  - [ ] `.sisyphus/evidence/task-22-concurrent.txt`
  - [ ] `.sisyphus/evidence/task-22-doctor.txt`

  **Commit**: YES
  - Message: `feat(commands): opencode CLI commands`
  - Files: `src/bot/commands/opencode.ts`, `tests/bot/commands/opencode.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/bot/commands/opencode.test.ts`

- [ ] 23. Jobs + logs commands

  **What to do**:
  - Create `src/bot/commands/jobs.ts`:
    - `/status` — convenience: shows active job for chat or "tidak ada job"
    - `/jobs` — paginated list of recent jobs for chat (last 10), formatted by `formatterService.formatJobList`
    - `/job <id>` — detailed job info + last 60 lines of log
    - `/cancel <id?>` — cancels active job; if id supplied, cancels matching job (must belong to chat)
    - `/cancel_all` — cancels all running jobs for chat
  - Create `src/bot/commands/logs.ts`:
    - `/logs latest` — alias to last finished job's log preview
    - `/logs <jobId>` — preview last 60 lines via formatter
    - `/logs <jobId> errors` — filter `stderr` only
    - `/logs <jobId> download` — `sendDocument(getLogPath(jobId))`

  **Must NOT do**:
  - Do not allow access to other chats' jobs/logs (filter by chatId)
  - Do not stream live logs to Telegram — only on demand

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: T26
  - **Blocked By**: T11, T12, T17

  **References**:

  **Pattern References**:
  - `src/bot.js:160-170 status command` — current; replace + extend
  - `src/bot.js:194-206 cancel command` — current; replace + extend with id arg

  **Acceptance Criteria**:
  - [ ] Harness covers: /status with no job, /status with running job, /jobs returns last 10 (sorted desc), /job <id> shows fields, /cancel without id cancels active, /cancel <id> rejects if other-chat, /logs <id> download triggers sendDocument with correct file path

  **QA Scenarios**:

  ```
  Scenario: /logs <id> download triggers sendDocument
    Tool: Bash (vitest harness)
    Preconditions: a finished job exists with log file
    Steps:
      1. /logs <jobId> download
    Expected: outbound calls include sendDocument with document = Input.fromLocalFile(<storage>/logs/<jobId>.log)
    Evidence: .sisyphus/evidence/task-23-logs-download.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-23-logs-download.txt`
  - [ ] `.sisyphus/evidence/task-23-jobs-list.txt`
  - [ ] `.sisyphus/evidence/task-23-cancel.txt`

  **Commit**: YES
  - Message: `feat(commands): jobs + logs commands`
  - Files: `src/bot/commands/jobs.ts`, `src/bot/commands/logs.ts`, `tests/bot/commands/jobs.test.ts`, `tests/bot/commands/logs.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/bot/commands/jobs.test.ts tests/bot/commands/logs.test.ts`

- [ ] 24. Opencode session commands

  **What to do**:
  - Create `src/bot/commands/sessions.ts` registering:
    - `/sessions` — list sessions for chat via `sessionService.listSessions`, format with active id highlighted
    - `/session_new <title>` — calls `sessionService.createSession`. If `opencodeApiService.probe` returns unavailable, replies with explicit "opencode serve tidak terjangkau, sesi disimpan secara lokal dengan status pending-api" and proceeds with local-only record
    - `/session_use <id>` — sets active session via `settingsService.setActiveSession`; rejects if id not owned by chat
    - `/session_current` — shows current active session
    - `/session_prompt <text>` — requires active session; calls `opencodeApiService.prompt({ sessionID, text })`. If session has `pending-api`, attempts to lazy-create via API now (if available) before sending. Output formatted via `formatterService` (the SDK returns parts; flatten text parts and apply HTML escape).
    - `/session_command <command> [args]` — calls `opencodeApiService.command`. **Allowlist not enforced here** (this is the raw session command surface; OMO allowlist applies to `/omo` only). Document this distinction in /help.
    - `/session_abort` — calls `opencodeApiService.abort` for active session
  - Per-session overrides: when active session has `agent`/`model`/`mode` set, those override chat defaults for `/session_prompt`

  **Must NOT do**:
  - Do not auto-spawn `opencode serve`
  - Do not transmit any API key — opencode handles auth on the server side
  - Do not silently accept `/session_prompt` when no active session — surface clear instruction to run `/session_use` or `/session_new`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: spans API + service + state; multiple failure modes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: T26
  - **Blocked By**: T11, T14, T15, T17

  **References**:

  **External References**:
  - SDK session API: `https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/server.mdx`

  **Acceptance Criteria**:
  - [ ] Harness covers: server-up flow (create+prompt+command+abort all hit stub), server-down flow (create stays pending-api, prompt fails with clear message), /session_use rejects foreign-chat session, /session_current with no active session

  **QA Scenarios**:

  ```
  Scenario: Server-up create + prompt
    Tool: Bash (vitest harness + http stub)
    Preconditions: stub returns 200 for /session/create and /session/<id>/prompt
    Steps:
      1. /session_new "demo"
      2. /session_prompt "hello"
    Expected: outbound includes confirmation with session id, then formatted prompt response
    Evidence: .sisyphus/evidence/task-24-session-up.txt

  Scenario: Server-down graceful fallback
    Tool: Bash (vitest harness)
    Preconditions: no http stub bound
    Steps:
      1. /session_new "demo"
      2. /session_prompt "hello"
    Expected: step 1 outbound contains "pending-api" notice; step 2 outbound contains "opencode serve tidak terjangkau"
    Evidence: .sisyphus/evidence/task-24-session-down.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-24-session-up.txt`
  - [ ] `.sisyphus/evidence/task-24-session-down.txt`
  - [ ] `.sisyphus/evidence/task-24-session-foreign.txt`

  **Commit**: YES
  - Message: `feat(commands): opencode session commands`
  - Files: `src/bot/commands/sessions.ts`, `tests/bot/commands/sessions.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/bot/commands/sessions.test.ts`

- [ ] 25. Settings + OMO bridge commands

  **What to do**:
  - Create `src/bot/commands/settings.ts` registering:
    - `/model` — show current default model (chat) and active session model (if set). If `/model list` is invoked, attempt to fetch a known catalog via `opencodeApiService` (if API exposes one); else reply with hint to set model manually like `/model use 9router/cx/gpt-5.5`. Document that the bot does not maintain a hardcoded model catalog.
    - `/model use <providerID/modelID>` — parse `providerID/modelID` (split on first `/`); store via `settingsService.setDefaultModel` (chat scope). If active session exists, reply asking whether to also override session model — provide `/model use <id> --session` flag for explicit override.
    - `/agent` / `/agent use <name>` — same pattern; agent identifier is free-form string (validated against opencode SDK enum if known: build, plan, deep, ultrabrain, oracle, etc.)
    - `/mode <plan|build|deep|ultrawork>` — short alias to set default mode (chat scope)
  - Create `src/bot/commands/omo.ts` registering:
    - `/omo <command> [args...]` — checks command against `env.omoAllowedCommands`; if not allowed, replies with sanitized list of allowed commands and refusal. If allowed AND active session exists, calls `opencodeApiService.command({ sessionID: active, command, arguments: argsString })`. If no active session, replies with instruction to `/session_new` first. The command identifier is the OpenCode slash command (e.g. `review-work`, `handoff`).
  - All settings commands persist via `settingsService`; OMO does not persist anything beyond using existing session

  **Must NOT do**:
  - Do not pass through arbitrary commands not in allowlist
  - Do not strip the `--session` flag silently — if user typed it, honor it; otherwise default to chat-scope
  - Do not echo full env.omoAllowedCommands if it contains anything secret-looking; the env is plain text by contract

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: T26
  - **Blocked By**: T15, T17

  **References**:

  **External References**:
  - Server command endpoint: `https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/server.mdx#post-sessionidcommand`

  **Acceptance Criteria**:
  - [ ] Harness covers: /model use sets chat default, /model use ... --session sets session override, /agent use, /mode plan, /omo allowed (forwards to API), /omo disallowed (returns refusal listing allowed set), /omo with no active session (returns "buat session dulu")

  **QA Scenarios**:

  ```
  Scenario: /omo allowlist enforcement
    Tool: Bash (vitest harness)
    Preconditions: env OMO_ALLOWED_COMMANDS=review-work,handoff
    Steps:
      1. /session_new "x" (with stub up)
      2. /omo review-work
      3. /omo evil-command
    Expected: step 2 forwards to API stub; step 3 outbound contains "tidak diizinkan" and lists "review-work, handoff"
    Evidence: .sisyphus/evidence/task-25-omo-allowlist.txt

  Scenario: /model use --session override
    Tool: Bash (vitest harness)
    Steps:
      1. /session_new "x"
      2. /model use 9router/foo --session
    Expected: sessionService records updated model on session record; chat default unchanged
    Evidence: .sisyphus/evidence/task-25-model-session.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-25-omo-allowlist.txt`
  - [ ] `.sisyphus/evidence/task-25-model-session.txt`
  - [ ] `.sisyphus/evidence/task-25-mode.txt`
  - [ ] `.sisyphus/evidence/task-25-agent.txt`

  **Commit**: YES
  - Message: `feat(commands): settings + omo bridge commands`
  - Files: `src/bot/commands/settings.ts`, `src/bot/commands/omo.ts`, `tests/bot/commands/settings.test.ts`, `tests/bot/commands/omo.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run tests/bot/commands/settings.test.ts tests/bot/commands/omo.test.ts`

- [ ] 26. Wire entry, remove legacy bot.js, finalize scripts

  **What to do**:
  - Create `src/index.ts`:
    - Parse args: `--check-config` exits after env summary
    - Call `loadEnv()`
    - Call `ensureStorageLayout(env)`
    - Build bot via `createBot(env)` and register every command module: start, help, workspace, files, opencode, sessions, jobs, logs, settings, omo
    - Call `jobService.recoverOnBoot()` once before `bot.start()`
    - Long-polling start (`bot.start()` returns when bot stops); set up SIGINT/SIGTERM handlers to call `bot.stop()` and flush in-flight log writes
    - Add fallback message handler for non-command text: `"Ketik /help untuk daftar perintah."`
  - Delete `src/bot.js` (was legacy)
  - Update `package.json`:
    - `main` → `src/index.ts`
    - keep new scripts (`start`, `dev`, `check-config`, `typecheck`, `test`, `test:watch`, `test:coverage`)
    - remove `check` script (replaced by `typecheck`)
  - Verify `npx tsx src/index.ts --check-config` end-to-end after install

  **Must NOT do**:
  - Do not leave `bot.js` in repo
  - Do not register legacy commands (`/folders`, `/projects`, `/use`, `/active`, `/task` legacy semantics, `/prompt`)
  - Do not start bot polling during `--check-config`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (integration node; depends on all command modules)
  - **Parallel Group**: Wave 5
  - **Blocks**: T28, F-wave
  - **Blocked By**: T19–T25

  **References**:

  **Pattern References**:
  - `src/bot.js:255-256 bot.start + log line` — final entry behavior; preserve console message style

  **External References**:
  - grammY graceful stop: `https://grammy.dev/guide/deployment-types.html#graceful-shutdown`

  **Acceptance Criteria**:
  - [ ] `src/bot.js` no longer exists
  - [ ] `npx tsx src/index.ts --check-config` exits 0 and prints summary
  - [ ] `npx tsx src/index.ts` (with stub token) starts long-polling and SIGINT terminates within 2s
  - [ ] vitest integration test instantiates the full bot via `index.ts`'s exported `buildApp(env)` (refactor index.ts to expose this for testability), dispatches `/help`, captures expected output

  **QA Scenarios**:

  ```
  Scenario: Full app /help end-to-end
    Tool: Bash (vitest)
    Steps:
      1. import { buildApp } from "../../src/index"
      2. const { bot } = buildApp(testEnv)
      3. dispatchAndCapture(bot, makeUpdate({ text: "/help" }))
    Expected: outbound contains all command groups
    Evidence: .sisyphus/evidence/task-26-full-help.txt

  Scenario: Legacy command no longer registered
    Tool: Bash (vitest)
    Steps:
      1. dispatchAndCapture(bot, makeUpdate({ text: "/folders" }))
    Expected: outbound either empty or includes only fallback "Ketik /help untuk daftar perintah."
    Evidence: .sisyphus/evidence/task-26-no-legacy.txt

  Scenario: Legacy bot.js removed
    Tool: Bash
    Steps:
      1. node -e "require('fs').existsSync('src/bot.js') && process.exit(1)"
    Expected: exit 0 (file does not exist)
    Evidence: .sisyphus/evidence/task-26-bot-js-removed.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-26-full-help.txt`
  - [ ] `.sisyphus/evidence/task-26-no-legacy.txt`
  - [ ] `.sisyphus/evidence/task-26-bot-js-removed.txt`

  **Commit**: YES
  - Message: `feat(bot): wire entry, remove legacy src/bot.js, finalize npm scripts`
  - Files: `src/index.ts`, deletion of `src/bot.js`, `package.json`, `tests/integration/index.test.ts`
  - Pre-commit: `npx tsc --noEmit && npx vitest run`

- [ ] 27. README + .env.example final pass

  **What to do**:
  - Rewrite `README.md`:
    - Section 1: Overview (Telegram bot → opencode + 9router on laptop)
    - Section 2: Prasyarat (Node 18+, opencode CLI, optional `opencode serve`, BotFather token, allowed user id)
    - Section 3: Install (`npm install`, copy `.env.example`, edit values, `npm run check-config`, `npm start`)
    - Section 4: Command reference, grouped: Workspace, Files, Opencode, Sessions, Jobs, Logs, Settings, OMO
    - Section 5: Storage layout (`storage/settings.json`, `storage/jobs/`, `storage/logs/`, `storage/sessions/`)
    - Section 6: Security model (PROJECTS_ROOT sandbox, allowlists, no shell, no writes)
    - Section 7: Troubleshooting (opencode binary, opencode serve, Telegram 429, restart recovery)
  - Update `.env.example` to include every variable from T2

  **Must NOT do**:
  - Do not include real tokens or paths
  - Do not document any legacy command

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: documentation-focused
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 5 with T28)
  - **Parallel Group**: Wave 5
  - **Blocks**: F-wave
  - **Blocked By**: T26

  **References**:

  **Pattern References**:
  - `README.md:1-100` — current README style; preserve Indonesian-language tone; replace command list

  **Acceptance Criteria**:
  - [ ] README contains every new command and zero legacy command names
  - [ ] `.env.example` lists every env variable used by `loadEnv`

  **QA Scenarios**:

  ```
  Scenario: README has all sections
    Tool: Bash
    Steps:
      1. node -e "const r=require('fs').readFileSync('README.md','utf8'); for (const h of ['Prasyarat','Install','Workspace','Files','Opencode','Sessions','Jobs','Logs','Settings','OMO','Security','Troubleshooting']) if (!r.includes(h)) { console.error('missing',h); process.exit(1) } console.log('ok')"
    Expected: prints `ok`
    Evidence: .sisyphus/evidence/task-27-readme-sections.txt

  Scenario: No legacy command names in README
    Tool: Bash
    Steps:
      1. node -e "const r=require('fs').readFileSync('README.md','utf8'); for (const c of ['/folders','/use ','/active','/task ','/prompt ','/projects']) if (r.includes(c)) { console.error('legacy',c); process.exit(1) } console.log('ok')"
    Expected: prints `ok`
    Evidence: .sisyphus/evidence/task-27-readme-no-legacy.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-27-readme-sections.txt`
  - [ ] `.sisyphus/evidence/task-27-readme-no-legacy.txt`

  **Commit**: YES
  - Message: `docs: refresh README + .env.example for new bot surface`
  - Files: `README.md`, `.env.example`
  - Pre-commit: `node tests/scripts/readme-check.cjs` (the inline scripts above; embed as a tiny check script)

- [ ] 28. Smoke + integration coverage suite

  **What to do**:
  - Create `tests/smoke/full-bot.test.ts` exercising the most-used flows end-to-end via harness:
    - flow A (browse): /workspaces → /workspace use → /cd → /ls → /open → /download
    - flow B (run): /run with stub fake-opencode → /jobs → /logs <id> → /logs <id> download
    - flow C (session): /session_new (api stub up) → /model use --session → /agent use → /session_prompt → /session_abort
    - flow D (omo): /session_new → /omo review-work (allowlist hit) → /omo bad-cmd (allowlist miss)
    - flow E (auth): unauthorized user receives "Akses ditolak" only
    - flow F (restart): jobService.recoverOnBoot transitions a stale running job to interrupted, then /jobs shows "interrupted"
  - Aggregate results into a single coverage report
  - Configure vitest coverage thresholds (utils ≥80%, services ≥60%, bot ≥50%) — fail the run if below

  **Must NOT do**:
  - Do not require a real Telegram token
  - Do not duplicate per-task tests; this file aggregates flows only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 5)
  - **Parallel Group**: Wave 5
  - **Blocks**: F-wave
  - **Blocked By**: T26

  **References**:

  **External References**:
  - vitest coverage thresholds: `https://vitest.dev/guide/coverage.html#changing-the-default-coverage-provider`

  **Acceptance Criteria**:
  - [ ] All 6 flows pass
  - [ ] Coverage thresholds met; the run fails when threshold is artificially bumped (sanity check that thresholds are wired)

  **QA Scenarios**:

  ```
  Scenario: All flows pass
    Tool: Bash (vitest)
    Steps:
      1. npx vitest run tests/smoke/full-bot.test.ts --coverage
    Expected: 0 failures, coverage report meets thresholds
    Evidence: .sisyphus/evidence/task-28-smoke-coverage.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-28-smoke-coverage.txt`
  - [ ] `coverage/coverage-summary.json` archived under `.sisyphus/evidence/task-28-coverage-summary.json`

  **Commit**: YES
  - Message: `test: smoke + integration coverage suite`
  - Files: `tests/smoke/full-bot.test.ts`, `vitest.config.ts` (threshold update)
  - Pre-commit: `npx vitest run --coverage`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read this plan end-to-end. For each "Must Have": verify implementation exists (read file, run command, capture grammY harness output). For each "Must NOT Have": search the codebase for forbidden patterns (e.g. `bot.command('folders'`, `bot.command('use'`, `child_process.exec`, `eval(`, raw shell handlers, `dist/`) — reject with file:line if found. Confirm `src/bot.js` is deleted. Verify evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit`, `npx vitest run --coverage`, and a lint pass (configure `tsc` strict + `noUncheckedIndexedAccess` if not already). Review every file under `src/` for: `as any`, `@ts-ignore`, empty `catch {}`, console.log left in production paths (allowed only in `bin/` entry), TODO/FIXME left over, unused imports, generic names (`data`, `result`, `temp`, `item`), AI slop (excessive comments, defensive code beyond spec, premature abstraction).
  Output: `tsc [PASS/FAIL] | vitest [N pass / N fail] | coverage utils=X% services=Y% | clean files [N/N] | VERDICT`

- [ ] F3. **Real Harness QA** — `unspecified-high`
  Start from clean repo state (`npm install`, no preexisting storage). Execute every QA scenario from every implementation task using the grammY harness. Test cross-task integration: `/workspace use` → `/cd` → `/ls` → `/open`, `/run` → `/jobs` → `/logs <id> download`, `/session_new` → `/session_prompt`, `/model use` + `/agent use` then `/run` (verify settings flow through), `/omo review-work` (allowlist hit), `/omo unknown-command` (allowlist miss). Test edge cases: empty workspace list, missing PROJECTS_ROOT, opencode binary missing, opencode serve unreachable. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Workspace becomes a git repo at T1 (per-task commits). For each task: read "What to do", read the actual diff for that task's commit (`git log --oneline` to find commit, then `git show <sha> --stat` and `git show <sha>` to inspect change). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance per task. Detect cross-task contamination: Task N's commit touching Task M's files. Flag unaccounted changes (files modified outside any planned task's commit).
  Fallback: if the executor disabled per-task commits for any reason, F4 enumerates files via `git status` + `git diff HEAD~N` against the merge base (or against an empty tree if T1 commit is the root). If git is unavailable for any reason, F4 must fail with `VERDICT: REJECT` and surface the missing prerequisite.
  Confirm legacy `src/bot.js` deleted (not edited) — verify via `git log -- src/bot.js` showing the deletion commit (T26).
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

> **Prerequisite**: workspace must be a git repo. T1 initializes git via `git init` if `.git` is absent. All subsequent tasks assume an active repo on branch `main`.

One commit per task using Conventional Commits. Group related infra in T1 (scaffold + tsconfig + scripts) into a single commit. Final integration (T26) gets its own commit. F-wave produces no code commits unless fixes required.

- T1: `chore: scaffold typescript toolchain (tsx, vitest, tsconfig)` — `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- T2: `feat(config): typed env loader with zod schema` — `src/config/env.ts`, `.env.example`
- T3: `feat(utils): html escape + paginate + telegram text helpers`
- T4: `feat(utils): adversarial pathGuard for nested workspace access`
- T5: `feat(utils): cross-platform processRunner with timeout + kill`
- T6: `feat(types): domain types for job/session/settings/workspace`
- T7: `feat(utils): json store + storage tree`
- T8: `test: vitest scaffold + initial pathGuard adversarial suite`
- T9: `feat(services): workspaceService with cwd + nested resolution`
- T10: `feat(services): fileService for ls/tree/open/cat/find/download`
- T11: `feat(services): jobService with persistent state + restart recovery`
- T12: `feat(services): logService append + retention prune`
- T13: `feat(services): opencodeCliService spawn wrapper`
- T14: `feat(services): opencodeApiService sdk wrapper + health probe`
- T15: `feat(services): settingsService + sessionService`
- T16: `feat(services): formatterService HTML output + document fallback`
- T17: `feat(bot): createBot + auth/error/logging middleware`
- T18: `test(bot): grammY handleUpdate harness helper`
- T19: `feat(commands): /start + /help`
- T20: `feat(commands): workspace + cwd commands`
- T21: `feat(commands): read-only file browser commands`
- T22: `feat(commands): opencode CLI commands`
- T23: `feat(commands): jobs + logs commands`
- T24: `feat(commands): opencode session commands`
- T25: `feat(commands): settings + omo bridge commands`
- T26: `feat(bot): wire entry, remove legacy src/bot.js, finalize npm scripts`
- T27: `docs: refresh README + .env.example for new bot surface`
- T28: `test: smoke + integration coverage suite`

Pre-commit on every task: `npx tsc --noEmit && npx vitest run --changed`.

---

## Success Criteria

### Verification Commands
```bash
node -v                                      # Expected: v18+ (project has no engines pin yet — OK)
npm install                                  # Expected: success, no peer warnings on @opencode-ai/sdk
npx tsc --noEmit                             # Expected: 0 errors
npx vitest run --coverage                    # Expected: all green; utils ≥80% lines, services ≥60%
npx tsx src/index.ts --check-config          # Expected: prints typed config summary, exit 0
node --check src/bot.js                      # Expected: ENOENT (file deleted)
ls .sisyphus/evidence/                       # Expected: per-task and final-qa evidence files exist
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (vitest + tsc)
- [ ] Coverage targets met
- [ ] `src/bot.js` deleted, no legacy commands registered
- [ ] grammY harness evidence captured for every command
- [ ] pathGuard adversarial suite ≥30 cases, 100% pass
- [ ] Real Telegram smoke ran (if user provided test token) OR harness-only smoke captured
- [ ] User explicitly approves F1–F4 results
