# Original recent-danmaku retention migration

> For agentic workers: use subagent-driven-development. One business slice, one task. Follow test-driven-development and independent spec/quality review before main's frozen whole check.

**Goal:** Migrate the original `recentMessageLimitPerRoom` configuration and its consumption through real local Core to SQLite, rather than the current constructor-only 1..500 clamp. No UI feature is invented.

**Architecture:** Shared strict TS/JSON primitive schema -> existing Spring-compatible project-local loader -> LocalCoreRuntime assembly -> service effective minimum20 -> existing per-monitor SQLite recent-only trim. Public query limit200 and permanent session facts/metric history remain separate. No DB migration, Worker IPC change or platform call.

**Globals:** Work ONLY `D:/codex_work/bili_reptile/bili-monitor-desktop`, existing branch `codex/follower-monitor-actions`, HEAD4c94959f81033eee544211cfce29a18c84fd602f and empty index. Original `D:/codex_work/BiliMonitor` (fa2faa6) and archive `D:/codex_work/bilibili-API-collect-new` (271b123) read-only. Preserve all earlier changes and concurrent UID/Worker test-only task. No Git mutation, C output, new worktree, install, original startup, credentials, real network or user DB. All temporary data/logs on D; activate project environment for every execution. Use apply_patch. No timeout/concurrency/cache changes. Do not run heavy tests until main explicitly releases the serial test lane. Main owns docs, full check and cumulative review.

## Source evidence read by main

Original `social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/live/danmaku/config/BilibiliLiveDanmakuProperties.java`: Java int raw property/default200. `resources/application.yml` exact historical alias `SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_RECENT_LIMIT`. `service/BilibiliLiveEventIngestionService.java`: permanent eligible session insertion before legacy projection; trim after qualifying new DANMAKU, effective `Math.max(20, raw)`. `repository/BilibiliLiveDanmakuRepository.java`: per-monitor timestamp DESC/id DESC trim, secondary min1/no upper. `service/BilibiliLiveDanmakuService.java` read requests max200, independently. Archive `docs/live/message_stream.md` transport/auth background read; archive is historical, not current protocol proof, and supplies no retention policy. See complete `.tmp/2026-10-06-recent-retention-next-audit.md` for exact current paths and gaps.

## Task 1: configuration -> actual retained rows

Production files (exact six):

- `packages/contracts/src/bilibili-live-danmaku-configuration.ts`: add `recentMessageLimitPerRoom: IntegerSchema.default(200)` retaining strict object and raw signed Java int bounds.
- `packages/contracts/schemas/bilibili-live-danmaku-configuration.v1.schema.json`: optional integer field same bounds/default200.
- `packages/core-runtime/src/bilibili-live-danmaku-config.ts`: add exact original RECENT_LIMIT alias. Existing generic property/placeholder/primitive binding already supports the new key. No guessed long alias; canonical derived `APP_BILIBILI_LIVEMONITOR_DANMAKU_RECENTMESSAGELIMITPERROOM` precedes old alias, then JSON/default. JSON validated before override; errors stay existing safe code/message.
- `packages/core-runtime/src/local-core-runtime.ts`: forward loaded raw option into the existing DanmakuService assembly before any event; primitive validation remains before SQLite even storage=false/scheduler=false.
- `packages/core-runtime/src/bilibili-live-danmaku-service.ts`: `Math.max(20, options.recentMessageLimitPerRoom ?? 200)`, no upper500. Do not change bucket settings, event admission, session routing, scheduler or transport.
- `packages/storage/src/control-database.ts`: retention SQL parameter `Math.max(1, input.recentLimit)` (remove upper500 only). Keep read cap200, timestamp DESC/rowid DESC, transaction and metric/permanent facts untouched. Lower setting must not trim at startup; next qualifying existing event trims per monitor.

Tests/fixtures (exact existing files plus one optional focused new integration file):

- `packages/contracts/fixtures/live-danmaku-configuration.json` shared TS/Python cases; `packages/contracts/src/bilibili-live-danmaku-configuration.test.ts` five-field defaults.
- `packages/core-runtime/src/bilibili-live-danmaku-config.test.ts`: raw integer binding/precedence/placeholders/safe rejection.
- `packages/core-runtime/src/bilibili-live-danmaku-service.test.ts`: service consumer floor20/no upper forwarding coverage, preserve prior assertions.
- `packages/storage/src/control-database.test.ts`: actual retained >500/ties/order/independent monitors/read cap and secondary floor1.
- Create `packages/core-runtime/src/bilibili-danmaku-recent-retention.integration.test.ts` using existing `__fixtures__/danmaku-configuration.ts` and real Core/SQLite. Do not edit the fixture unless existing inspection access truly cannot cover the slice; ask main to expand if needed. Python existing `test_danmaku_configuration.py` consumes same fixtures/schema; no Python source edit needed.

- [x] Main snapshots existing 11 files, confirms new integration absent, copies entire plan to brief. Implementer reads all applicable project rules and complete task/global brief, original source while changing, and API archive relevant chapter before B站 work.
- [x] Meaningful RED against unchanged production: new shared field accepted/default; loader alias; service floor20; actual storage501; real Core25 end-to-end. Failure must be assertion/schema/semantic, not missing file/import/compiler. Baseline tie/history cases need not fail. Capture real exit and filtered counts separately. No production edits before RED.
- [x] Implement exact six production changes. Tests prove raw MIN/MAX/0/19/20/501 accepted, fraction/overflow/string/null rejected; env valid Spring integer text and canonical precedence; malformed JSON not masked; storage=false invalid primitive safely rejected before DB without private value leakage.
- [x] Real Core proof: nondefault25 reaches ingestion; raw low values floor20; raw501 with502 distinct, persistable synthetic messages retains501 recent while permanent facts and metrics retain502; read max200. Seed an actual online/routed live session and assert eligible history, not an offline no-session shortcut. No mocked repository for the assembly proof.
- [x] Independent monitors and equal identical timestamps use insertion-order ties (not UUID lexical), old out-of-order message dropped by event timestamp. Stop/restart lower setting preserves recent/history until next message; heartbeat/other event doesn't trim. Higher restart does not fabricate lost rows. No empty-text admission change (known separate gap), no general different-format timestamp normalization claim.
- [x] Serial final focused unfiltered tests, shared Python fixture tests and workspace typechecks; no whole check by implementer. Report `.tmp/2026-10-06-recent-retention-report.md` with exact RED/GREEN commands/results, source mappings, invariants/limitations; report actual unsuccessful checks too.

```powershell
. .\scripts\activate-environment.ps1
& $env:BMD_PNPM_CMD --filter @bmd/contracts exec vitest run src/bilibili-live-danmaku-configuration.test.ts
& $env:BMD_PNPM_CMD --filter @bmd/core-runtime exec vitest run src/bilibili-live-danmaku-config.test.ts src/bilibili-live-danmaku-service.test.ts src/bilibili-danmaku-configuration.integration.test.ts src/bilibili-danmaku-recent-retention.integration.test.ts
& $env:BMD_PNPM_CMD --filter @bmd/storage exec vitest run src/control-database.test.ts
& $env:BMD_PYTHON_EXE -m pytest workers/python/tests/test_danmaku_configuration.py -q
& $env:BMD_PNPM_CMD typecheck
```

## Main gates

Task review completed on exact12-file snapshot delta: business Spec compliant, quality Needs fixes. Complete findings inventory R1 Important (new service setup/stop/close and new integration afterEach may skip later cleanup/environment restoration), R2 Minor (new storage case relies on activated TEMP without local D/precreate/strict-descendant delete guard). Main accepts both for ONE three-test-file fix wave. Additional snapshots `.tmp/2026-10-06-retention-cleanup-before/`; six production files stay frozen.

Fix boundaries: only the newly added lifecycle/test helpers/cases in `bilibili-live-danmaku-service.test.ts`, `bilibili-danmaku-recent-retention.integration.test.ts`, `control-database.test.ts`. Acquire resources inside an owned cleanup boundary; run all acquired cleanup despite setup/stop/close errors, clear ownership before await and restore env/mock in finally. Preserve sole error identity and expose simultaneous errors rather than silently swallowing or replacing the primary. The new storage case owns a local directory, validates absolute D root before creation, captured strict descendant after creation/before recursive cleanup; do not edit unrelated existing storage lifecycle or import Core into Storage. Meaningful local fault-injection/path RED then GREEN and unfiltered covering tests/typechecks required. No production/fixture/shared global budgets changes or wholecheck by implementer. Re-review complete amended task package plus three-file fix snapshot and logs before main wholecheck.

Final re-review closes R1 and the original R2 path guard, but finds one Important repair regression R3: the new storage case's body-local directory is invisible to legacy afterEach if ControlDatabase.open remains pending after mkdtemp returns and the body times out. Resolve only this one file/new test with a case-owned, guarded teardown fallback, ownership cleared before awaits, and late-acquisition disposal without touching the next case. Preserve legacy afterEach and every existing business assertion. Use synthetic deferred-open tests (no real timeout/budget change), cover all acquired cleanup despite failures and sole/multiple error identities, meaningful RED then final unfiltered storage GREEN plus typecheck. Snapshot `.tmp/2026-10-06-retention-storage-timeout-before/`; six production files remain frozen. Re-review the full task plus exact final storage amendment before one root check.

- [x] Read task report and complete pre-task snapshot delta; fresh independent spec/quality review. Resolve complete findings list in one fix wave with covering tests, re-review amendments, main adjudicates global CannotVerify. No empty HEAD..HEAD substituted for dirty snapshot.
- [x] Both independent tasks freeze/review before ONE unchanged root `check.cmd`; terminal exit/complete current failing and skipped list. Node failure -> one static/Python/build complement, no blind rerun or budget change. Unresolved UID/Worker evidence is retained, not declared non-causal/flaky/fixed merely because retention focused passes.

Execution complete, gate NOT green: session94060 exit1/CHECK_EXIT1, Node2276/2278/2fail/no skips; current pending-add marker and2000point trend body gaps recorded, UID12 completed this run only. Complement session75506 types/Black60/isort/mypy18/Python1037/build each0 but main wrong extra workers/dist path caused command exit1; only actual Electron four bundles/CJS revalidated in separate log exit0, no test/build rerun. Final task v3/R3 review Approved/no findings; cumulative review and final safety below remain separate.
- [x] Main update config example, README, audit, tracker, handoff and ledger. Fresh cumulative broad review includes all dirty paths and both task gates/current checks. D path/bundle/source/archive/head/branch/index/process/listener safety. Full M01–M18, other10 danmaku settings, genuine platform/native/manual acceptance remain open. No commit/push/finishing-branch unless user asks.

Final broad complete: full69path/7494line/693413bytepacket read independently, cumulative implementation Approved/no new production findings, currenttwo whole Important retained; merge/ship NOT READY and fullgoal active/incomplete. Main personally read formal report; only Markdown verdict/safety bookkeeping follows, no source/tests/check retry.
