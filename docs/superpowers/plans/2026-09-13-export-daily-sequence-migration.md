# M04 Export Daily Sequence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the applicable inline test-driven-development workflow to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 按用户要求逐功能执行，不委派并行开发。

**Goal:** 对齐原 `1a36b43` 的主播名称、上海日期与每日共享导出编号，在本地 SQLite 持久保存序号。

**Architecture:** Core 先验证场次并读取导出快照，随后在快照事务外原子分配序号，再编码并写临时文件。文件建议名称由独立纯 TypeScript 函数生成；Main 沿用已有建议名称/保存对话框链路。SQLite 只追加 migration 12，计数不外键绑定房间，删除后重建同一主播也不会重号。

**Tech Stack:** TypeScript、SQLite、Vitest，现有 ExcelJS/fflate。

**Readability:** 无 C/C++/Rust/Java，无新依赖或外部服务。

## Global Constraints

- 原项目只读基线 `fa2faa6`。依据：`BilibiliLiveSessionExportController.java`、`BilibiliLiveExportSequence.java`、`V12__bilibili_live_export_daily_counter.sql`、`BilibiliLiveSessionExportControllerTests.java`。
- 昵称替换 `\\/:*?"<>|` 及 ASCII 控制字符为 `_`，去首尾空白，最多 80 个 Unicode 码点；空昵称回退 `uid-${uid}`。
- 去首尾空白遵循原 `String.strip`：不能用 JS `trim` 额外去除 NBSP/BOM 等字符；此差异加入真实 prepare 回归。
- 上海日期 `YYYY-MM-DD`；同 UID/日期在不同场次和格式共享序号；跨日期/UID 独立。已分配的序号不因未保存、编码或写文件失败而回滚。
- 格式：`${prefix}-${date}-第${number}次导出-${categoryName}.${extension}`。danmaku/弹幕.csv，gifts/礼物.csv，users/用户.csv，xlsx/完整数据.xlsx，all/完整数据.zip。
- 无效 category/不存在场次在分配前失败。只操作临时测试数据库，不清理真实用户历史。
- 编号分配不嵌套在可回滚快照事务中；避免把失败下载编号重用。
- 所有命令先 `. .\scripts\activate-environment.ps1`；D 盘工具、缓存和临时文件。历史 migration 不改；当前 M03 未提交改动保留，不推送远程。

## Task 1: 文件名与持久化编号接入真实导出

**Files:**
- Create: `packages/core-runtime/src/bilibili-live-export-name.ts`；命名/日期函数通过下述真实 prepare 集成测试覆盖，避免只验证字符串而遗漏接入。
- Modify: `packages/storage/src/control-database.ts`；Create/Test: `packages/storage/src/bilibili-live-export-counter.test.ts`。
- Modify: `packages/core-runtime/src/bilibili-live-session-export-service.ts`；Create/Test: `bilibili-live-export-sequence-parity.test.ts`。
- Update current-schema expectations: `packages/storage/src/control-database.test.ts`、`packages/core-runtime/src/local-core-runtime.test.ts`；旧 v8 测试移除新表/版本记录再模拟升级，不能改旧 migration。
- Update filename expectation: `packages/core-runtime/src/bilibili-live-session-export-service.test.ts`。
- Reuse: `packages/core-runtime/src/__fixtures__/live-session.ts` 临时 SQLite；Main `apps/desktop/src/main/index.ts` 保存链路只读复核，不为计数引入新 IPC。

**Interfaces:**
- `bilibiliLiveExportDate(now: Date): string` 使用 `Intl.DateTimeFormat` 的 `Asia/Shanghai` 年月日分量。
- `bilibiliLiveExportFileName(input: { uname: string | null | undefined; uid: string; date: string; number: number; category: BilibiliLiveSessionExportCategory }): string`。
- `ControlDatabase.allocateBilibiliLiveExportNumber(uid: string, date: string): number`。参数来自已验证 summary 和日期 helper，不对外开放 SQL。
- `BilibiliLiveSessionExportService.prepare(input)` 和 Prepared DTO 不变，Main 仍使用 `prepared.suggestedFileName`。

- [ ] Step 1：通过真实 prepare 写命名/日期失败测试：全部 5 种格式；原例 `主播/测试:\r\n` 输出 `主播_测试___`；空白回退 UID；81 个 emoji 只保留 80 个完整码点；`2026-09-13T15:59:59Z` 与 `16:00:00Z` 分别是上海 13、14 日。

```ts
expect(bilibiliLiveExportDate(new Date("2026-09-13T16:00:00Z"))).toBe("2026-09-14")
expect(bilibiliLiveExportFileName({ uname: "主播/测试:\r\n", uid: "22", date: "2026-09-14", number: 1, category: "xlsx" }))
  .toBe("主播_测试___-2026-09-14-第1次导出-完整数据.xlsx")
```

- [ ] Step 2：真实 SQLite 失败测试：不存在的新表/方法导致失败；新库/11 升 12、反复打开、同 UID/日期递增、不同 UID/日期独立，快照事务内调用拒绝，不因无关事务回滚倒退计数。测试升级前后的旧表数据保持一致。

```sql
CREATE TABLE bilibili_live_export_daily_counter (
  uid TEXT NOT NULL,
  export_date TEXT NOT NULL,
  export_count INTEGER NOT NULL CHECK (export_count > 0),
  PRIMARY KEY (uid, export_date)
);
INSERT INTO bilibili_live_export_daily_counter (uid, export_date, export_count)
VALUES (?, ?, 1)
ON CONFLICT(uid, export_date) DO UPDATE SET export_count = export_count + 1
RETURNING export_count;
```

- [ ] Step 3：真实 Core prepare 失败回归：原文件名不同；同 UID 跨场次/5 格式顺序分配，多次 Promise.all 导出无重复，重启仍继续。不存在场次不占号；模拟临时目录为文件造成 IO 失败，随后成功为下一号；只生成未保存也占号。保留原 CSV/XLSX/ZIP 内容验证。

```ts
const first = await exports.prepare({ sessionId, category: "danmaku" })
expect(first.suggestedFileName).toBe("测试主播-2026-09-13-第1次导出-弹幕.csv")
const second = await exports.prepare({ sessionId, category: "all" })
expect(second.suggestedFileName).toBe("测试主播-2026-09-13-第2次导出-完整数据.zip")
```

- [ ] Step 4：实现纯函数、只追加 migration 12 和原子计数，接入 prepare。计数必须在编码/文件 IO 前提交，不放在 `runInTransaction` 内；移除旧场次 ID 命名分支。

```ts
const snapshot = this.options.database.runInTransaction(() => this.snapshot(parsed.sessionId))
const date = bilibiliLiveExportDate(this.options.now())
const number = this.options.database.allocateBilibiliLiveExportNumber(snapshot.summary.uid, date)
const suggestedFileName = bilibiliLiveExportFileName({
  uname: this.options.database.findBilibiliLiveRoomById(snapshot.summary.monitorId)?.uname,
  uid: snapshot.summary.uid, date, number, category: parsed.category
})
```

- [ ] Step 5：针对性测试通过后完整 `check.cmd`，核对所有旧 migration 未改、原仓库干净、生产没有测试数据。记录准确验证和剩余真人保存对话框验收；M12 的全部格式/交互审计不因本项测试绿色而提前完成。

```powershell
pnpm --filter @bmd/storage exec vitest run src/bilibili-live-export-counter.test.ts src/control-database.test.ts
pnpm --filter @bmd/core-runtime exec vitest run src/bilibili-live-export-sequence-parity.test.ts src/bilibili-live-session-export-service.test.ts
.\check.cmd
git diff --check
git -C D:\codex_work\BiliMonitor status --porcelain
```

## 执行结果

- [x] Step 1–3：12 项新增 prepare 用例和原内容测试先因旧命名失败；SQLite 3 项先因无分配方法/仍为 v11 失败。随后 NBSP/BOM 两项先复现多裁剪，再对齐原 strip 行为。新增共 17 项测试。
- [x] Step 4：独立命名函数、migration 12、事务外原子分配和 prepare 接入完成。5 格式与跨场次共享编号，失败/未保存不重号，午夜重置；不同 UID/日期隔离及数据库重开持久化通过。Main 仍沿用 prepare 后显示建议名称的路径，不新增 IPC。
- [x] Step 5：最终完整 `check.cmd` 退出 0，Node 267、Python 23；类型/格式/生产构建通过。旧 migration 没有修改；旧 v8 回填、新 v11 升级和既有 CSV/XLSX/ZIP 内容回归通过；生产包未包含新增 fixture；原 B/S 仓库干净。
- 原生保存对话框实际选择/取消与已安装应用升级仍留在 M12/M18 手工验收，不把生成但未保存的 Core 测试冒充真人保存验收。本轮未提交/推送。
