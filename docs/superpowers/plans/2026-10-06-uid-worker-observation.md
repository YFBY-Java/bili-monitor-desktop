# UID / Worker current failed-boundary observation

> For agentic workers: use subagent-driven-development for this one finite task, then independent task and cumulative reviews. This is evidence collection, not a production fix or full migration acceptance.

**Goal:** Supply the missing await boundary in the existing 12-form UID case and the first bound `readline` lookup in the existing real Python cancellation fixtures. Preserve original business operations, assertions and all time budgets.

**Architecture:** Test-only, lazy observers. The UID observer wraps the original operations exactly once; fixed round/phase and assertion-completion flags never retain raw inputs, UIDs, page/fixture data or errors. The Python proxy observes normal first method retrieval after obtaining its real value, without calling it. Lookup is preparation, not dispatch or worker-loop entry.

**Sources and scope:** Client `D:/codex_work/bili_reptile/bili-monitor-desktop`, branch `codex/follower-monitor-actions`, HEAD `4c94959f81033eee544211cfce29a18c84fd602f`. Original `D:/codex_work/BiliMonitor` and archive `D:/codex_work/bilibili-API-collect-new` are read-only. Main has read original BilibiliView submit/load, archive user/card chapter, current exact cases/runtime/proxy, and the complete current-two audit. User authorized exact UID correction rather than browser Number rounding. Preserve the 60 existing dirty paths and empty index. No production changes, Git mutation, installs, original startup, real network, credentials, user databases, prewarming, import/thread/to_thread wrappers, extra RPCs, new timers, concurrency or timeout/cache changes. All generated files, logs, caches and test data stay on D. Source lookup evidence is not current platform protocol proof.

**Files (only these six task source/test files):**

- Create `apps/desktop/src/renderer/src/__fixtures__/uid-input-await-observer.ts` and `.test.ts`.
- Modify `apps/desktop/src/renderer/src/BilibiliFollowerWorkspace.interaction.test.ts` only the existing 12-form case and body-observer teardown/reset.
- Modify `workers/python/tests/fixtures/live_http_wait/first_read_probe.py` and `workers/python/tests/test_live_http_wait_probe.py`.
- Modify `apps/desktop/src/main/follower-long64-worker.integration.test.ts` only the fixed stderr stage allowlist and its pure unit case.

## Task 1: implement and verify both missing observations

- [x] Main snapshots the four existing files before edits and confirms the two new files absent; brief contains this entire plan and globals.
- [x] Add meaningful failing tests against a minimal UID forwarding stub, then implement the helper. Actual RED16/GREEN16 recorded; no missing-file/compiler RED.

UID API: `createUidInputAwaitObserver({ now?, output? } = {})` returns `run<T>(round, phase, operation): Promise<T>`, `snapshot()`, `stop()`, `finish()`. Fixed phases `open|fill|validity|submit|detached|uid|legacy|count`; rounds 1..12 for the first six, round 0 only for final legacy/count. Store 12 fixed numeric completion masks (6 bits), finite elapsed timestamps and at most one active safe round/phase; final two booleans. No payload retention/stringification. At most 80 observed operations; flag truncation and still forward later originals. Invalid runtime arguments flag diagnostics but still forward once without retaining them. Clock/output/serializer exceptions cannot replace the operation value/error. Snapshot copies arrays/objects. Stop freezes active/progress so late completions cannot update it. Finish once, safe primitive fallback independent of JSON serializer, one summary <=4096 UTF-8 bytes including newline. No listeners, timers or extra page calls.

Tests cover exact once and value/error identity (including broken diagnostics), fixed enum/round bounds and payload redaction, deferred active phase, all 12 masks plus final assertions, cap, copied snapshots, stop/late resolve and reject, serializer/output/clock failure, one finish and cleanup surviving observer failure. Minimal stub must make these behavior tests fail before the final implementation.

- [x] Instrument the same 12 input pairs via `inputs.entries()`; every original await remains in the same order with the same selectors/options/messages. Wrap validity+its assertion and UID evaluation+its exact assertion inside the corresponding operation, so completion means the assertion passed. Final legacy and count assertions are round 0. No added evaluate/RPC. BeforeEach clears ownership; afterEach stops before original page close and finishes independently in finally. Success finish idempotent; original teardown preserved.
- [x] Python lookup RED10/GREEN10: normal bound method obtained before local once emission; no explicit read/import/global/runtime changes. Existing first-read behavior, identities, delegation and disabled original covered.
- [x] Node fixed fifth-stage RED1/GREEN1, eleven deliberately filtered cases not counted as passes. Byte/stage/global bounds and unknown rejection unchanged.
- [x] Serial unfiltered original Workspace+Worker37 pass; Desktoptypes/Black/isort0. Silent isort has terminal-only implementer evidence, no raw file. No whole check by implementer.

Every command starts from client root with `. .\scripts\activate-environment.ps1`; use `$env:BMD_PNPM_CMD` / `$env:BMD_PYTHON_EXE`. Save `.tmp/2026-10-06-uid-worker-{red,green,focused}.log` (separate suitable logs allowed), actual terminal exits, filtered exclusions identified. Example commands:

```powershell
& $env:BMD_PNPM_CMD --filter @bmd/desktop exec vitest run src/renderer/src/__fixtures__/uid-input-await-observer.test.ts
& $env:BMD_PYTHON_EXE -m pytest workers/python/tests/test_live_http_wait_probe.py -q
& $env:BMD_PNPM_CMD --filter @bmd/desktop exec vitest run src/renderer/src/BilibiliFollowerWorkspace.interaction.test.ts src/main/follower-long64-worker.integration.test.ts
& $env:BMD_PNPM_CMD --filter @bmd/desktop typecheck
& $env:BMD_PYTHON_EXE -m black --check workers/python/tests/test_live_http_wait_probe.py workers/python/tests/fixtures/live_http_wait/first_read_probe.py
& $env:BMD_PYTHON_EXE -m isort --check-only workers/python/tests/test_live_http_wait_probe.py workers/python/tests/fixtures/live_http_wait/first_read_probe.py
```

Desktop `typecheck` and root `check.cmd` were verified from the current checkout. Report `.tmp/2026-10-06-uid-worker-report.md`: files, RED/GREEN exact commands/exits, task invariants, limitations and remaining full findings. No claims of repaired production, cold startup cause, stability, full parity or native/manual acceptance.

## Main gates after Task 1

- [x] Main read full report, all six source/test deltas and actual focused logs; fresh independent review Spec compliant/Quality Approved/no open issues. Main adjudicated HEAD/branch/empty index/source/archive/D/diff; silent-log report Minor corrected and re-reviewed without rerun. Whole/final safety remain separate below.
- [x] One unchanged frozen `./check.cmd`, terminal exit and full failed/skipped list. If Node stops the chain, one separate static/Python/build complement; no blind Node rerun. UID reports only original await/assert progress; Python lookup is neither run_stdio entry nor thread submission. No event proves upstream cause. Current complete errors replace historical lists; original cancellation/child-exit/SQLite assertions must actually execute.

Execution not green: shared retention whole session94060 exit1/Node2276/2278, current add marker +2000point trend failures/no skips. UID12rounds completes this run, failedadd still no observed first-read and original stop/SQLite assertions not reached; refresh assertions actually pass. Complement steps each0 but main mistaken extra bundle path caused commandexit1, actualfourElectronbundles/CJS separatevalidation0. No Node/static/Python/build rerun; see retention audit for full current evidence.
- [x] Update audit/tracker/handoff/README/ledger honestly. Fresh cumulative broad review covers all dirty code, not HEAD..HEAD alone. Confirm D paths, unchanged source/archive, HEAD/branch/index and zero project processes/listeners. Full M01–M18 remains active unless actually completed; no finishing-branch/Git action.

Final broad full69path Approved implementation/no new production findings; currenttwo whole Important remain and merge/ship NOT READY. Main fullreport read, source/tests frozen, only Markdown final status/safety updates; fullgoal incomplete, noGit.

Main scheduling amendment: the two existing failures have not demonstrated a production retention cause. Main has now personally re-read original retention properties/ingestion/repository/read cap and the client assembly/schema/storage. A separate exact retention plan may proceed with non-overlapping source files; heavy tests stay serialized, each task has its own snapshot/spec/quality gate, and the ONE frozen whole check waits for both. This avoids spending the migration turn only on instrumentation; it does not waive the two failures or authorize claiming a green whole gate.
