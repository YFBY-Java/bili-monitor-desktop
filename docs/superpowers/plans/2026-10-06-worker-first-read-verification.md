# Worker 首次读取与测试目录保护 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收窄真实 Worker 首次采集未进入 HTTP 回调的验证缺口，并在创建弹幕测试目录之前阻止 C 盘写入。

**Architecture:** 仅修改隔离测试夹具。Python stdin 代理由真实 runtime 的第一次 readline 调用触发，原读取参数、结果和异常原样透传；Node 只观察固定 stderr 阶段。弹幕测试先验证 D 盘 TEMP，再创建 SQLite，清理前检查已捕获 TEMP 的严格子目录。

**Tech Stack:** TypeScript、Python、Vitest、pytest、现有 Electron/Core/SQLite 和 HTTPX MockTransport。

**Readability:** 新代码只用 TypeScript/Python；不新增 C、C++、Rust 或 Java。

## Global Constraints

- 原项目 D:\codex_work\BiliMonitor 和 API 资料 D:\codex_work\bilibili-API-collect-new 只读；不访问真实平台、用户数据库或凭据。
- 所有新增文件、日志、测试目录和工具缓存位于 D 盘；不安装依赖或启动原应用。
- 保留 HEAD 4c94959f81033eee544211cfce29a18c84fd602f、codex/follower-monitor-actions 分支、空 index 和全部既有未提交变化；不 commit、push、merge、reset 或创建 worktree。
- 不改变生产 Worker/Core/UI、协议、业务断言、并发、重试、预热或缓存；不提前读取 stdin、import runtime、ping 或发出请求。
- 首次读取代理只在现有 bmd-long64-worker-bridge- 目录前缀启用。最多记录两条固定阶段：stdin:first-read-enter，然后 stdin:first-read-line / stdin:first-read-eof / stdin:first-read-error 之一；其余读取直接透传。
- 原 readline(*args, **kwargs) 每次恰好调用一次；原参数、返回对象和异常对象原样透传；其他属性委托原 stdin。诊断输出失败不得替换原读取结果/异常。
- 不输出、复制、解析或保留 protocol line、payload、原始错误、URL、环境值或平台数据；stdout 仍只有原 NDJSON。
- 现有 Python/Node stderr 上限 10 stages / 4096 bytes、全局 40 stages、stdout 8 frames / 65536 bytes 均不改变；Node allowlist 只新增上述四个固定阶段。
- pending add/refresh 的 marker 10000ms、测试 25000ms、transport watchdog 35000ms、stop grace 1500ms 和强制终止语义不变。
- 新诊断只验证 H2：marker 截止之前 Python 尚未实际进入首次 stdin.readline。出现 enter 可证伪 H2；缺失仅收窄边界，不证明 import、CPU、线程或 pipe 根因。
- 本任务是一次完整最终审查待办波次，覆盖首次读取诊断与自动目标 TEMP 保护。focused pass 不替代全量 pending-add stop/exit/SQLite 断言，不能称全迁移完成。

## Task 1: 实施两项测试侧待办

**Files:**

- Create: workers/python/tests/fixtures/live_http_wait/first_read_probe.py（纯代理，无全局安装或业务导入）
- Create: workers/python/tests/test_live_http_wait_probe.py（代理真实读入/EOF/异常透传测试）
- Modify: workers/python/tests/fixtures/live_http_wait/sitecustomize.py（启用条件下安装代理）
- Modify: apps/desktop/src/main/follower-long64-worker.integration.test.ts（四阶段 allowlist 与拒绝未知阶段测试）
- Modify: packages/core-runtime/src/bilibili-danmaku-auto-targets.integration.test.ts（创建前与清理前纯路径检查）
- Controller only: 本计划、implementation audit、README、全迁移 tracker、handoff、SDD ledger。

**Interfaces:**

- Consumes: 当前 probe(stage)、probe_enabled、sys.stdin；原 runtime 的 asyncio.to_thread(stdin.readline) 保持不动。
- Produces: observe_first_read(stdin, enabled, record)，disabled 返回原对象；enabled 返回 FirstReadProbe。代理只保存原 stdin、record 和 first-read 布尔状态，不保存读取内容。
- TS helpers: assertTemporaryRoot(path: string): void；assertTemporaryDescendant(root: string, directory: string): void。使用 node:path isAbsolute/parse/resolve/relative，与既有 Worker/Host 夹具模式一致。

- [ ] **Step 1: 添加并运行失败测试（不创建禁用目录）。**

纯 Python 用 io.StringIO("synthetic-private-line\nsecond\n") 验证同一读取内容、参数转发、连续读取最多两阶段、空字符串 EOF、同一 OSError 实例重新抛出、属性委托、disabled 对象身份、诊断回调失败不改变读取。测试通过 importlib 从 helper 文件加载，禁止 import sitecustomize 以免污染 HTTPX/sys.stdin。初次缺失 helper 的 collection failure 仅算准备；应提供最小直通实现后运行得到缺失阶段/代理的断言 RED。

```python
events = []
original = io.StringIO("synthetic-private-line\nsecond\n")
proxy = observe_first_read(original, True, events.append)
assert events == []
assert proxy.readline() == "synthetic-private-line\n"
assert events == ["stdin:first-read-enter", "stdin:first-read-line"]
assert proxy.readline() == "second\n"
assert len(events) == 2
assert observe_first_read(original, False, events.append) is original
```

TS 路径纯测试放在 describe 的 SQLite hooks 外，拒绝 C:\\synthetic-temp、relative-temp、UNC，以及 root自身、sibling、同前缀 sibling、.. escape、C盘 cleanup；接受 D:\\synthetic-temp\\child。禁止用这些输入创建/删除目录。先最小直通 helpers 运行纯断言 RED，再实现检查。

```typescript
expect(() => assertTemporaryRoot("C:\\synthetic-temp")).toThrow()
expect(() => assertTemporaryRoot("relative-temp")).toThrow()
expect(() => assertTemporaryDescendant("D:\\synthetic-temp", "D:\\synthetic-temp-other")).toThrow()
expect(() => assertTemporaryDescendant("D:\\synthetic-temp", "D:\\synthetic-temp\\child")).not.toThrow()
```

- [ ] **Step 2: 最小代理与路径保护实现。**

```python
class FirstReadProbe:
    def __init__(self, stdin, record):
        self._stdin = stdin
        self._record = record
        self._first = True

    def __getattr__(self, name):
        return getattr(self._stdin, name)

    def _emit(self, stage):
        try:
            self._record(stage)
        except Exception:
            pass  # Test diagnostics cannot replace a real read result/error.

    def readline(self, *args, **kwargs):
        if not self._first:
            return self._stdin.readline(*args, **kwargs)
        self._first = False
        self._emit("stdin:first-read-enter")
        try:
            line = self._stdin.readline(*args, **kwargs)
        except BaseException:
            self._emit("stdin:first-read-error")
            raise
        self._emit("stdin:first-read-line" if line else "stdin:first-read-eof")
        return line

def observe_first_read(stdin, enabled, record):
    return FirstReadProbe(stdin, record) if enabled else stdin
```

sitecustomize 导入该 helper，实际赋值 sys.stdin = observe_first_read(sys.stdin, probe_enabled, probe)，在 patch-ready 之前完成；不会主动读入或预先加载 runtime。Node regex 增加固定四阶段，并用正常/unknown 行验证识别和拒绝，无任何新增限额。

```typescript
function assertTemporaryRoot(path: string): void {
  if (!isAbsolute(path) || parse(resolve(path)).root.toLowerCase() !== "d:\\")
    throw new Error("Fixture TEMP must be absolute on D")
}
function assertTemporaryDescendant(root: string, directory: string): void {
  assertTemporaryRoot(root)
  const child = relative(resolve(root), resolve(directory))
  if (!child || child.startsWith("..") || isAbsolute(child))
    throw new Error("Fixture cleanup must stay below TEMP")
}
```

beforeEach 先重置本次 setup 状态，验证原始 tmpdir()，捕获 resolve(tmpdir()) 后 mkdtemp；打开 SQLite 前验证 child。afterEach 仅对本次已创建 directory 清理，先 stopAll 和 close，再 strict-descendant check 后 rm；不因 setup 未创建而 resolve(undefined)，不使用清理时重新读取的 TEMP。原 9 个业务测试不变。

- [ ] **Step 3: 串行 focused GREEN 和报告。**

每个命令先激活 scripts/activate-environment.ps1，记录实际命令、退出码、RED/GREEN 摘要到 report；静默 isort 不虚构日志。只运行相应新 Python 文件、Core auto-target 文件、Desktop Worker 文件和相应 typecheck，Black/isort 覆盖改动 Python 文件。原真实 Worker 测试无预热且不扩大预算。

```powershell
. .\scripts\activate-environment.ps1
& $env:BMD_PYTHON_EXE -m pytest workers/python/tests/test_live_http_wait_probe.py
& $env:BMD_PNPM_CMD --filter @bmd/core-runtime exec vitest run src/bilibili-danmaku-auto-targets.integration.test.ts
& $env:BMD_PNPM_CMD --filter @bmd/desktop exec vitest run src/main/follower-long64-worker.integration.test.ts
& $env:BMD_PNPM_CMD --filter @bmd/core-runtime typecheck
& $env:BMD_PNPM_CMD --filter @bmd/desktop typecheck
```

不 commit：保留用户要求的当前工作树；完成后写指定 .tmp report 并返回简短状态。主代理负责独立 task review、代码冻结后一次 unchanged check.cmd；若 Node 失败，补跑被截断类型/Python/build，保留真实失败而不盲目重跑。主代理负责 H2 裁定、完整累计 diff 审查、进度与安全核对。

## 主代理执行账本

- [x] Task 1 RED/GREEN、独立 spec/quality gate：Python6/Core11/Desktop12通过，Spec compliant / Quality Approved，无task待修。
- [x] 单次冻结全量检查与真实失败边界裁定：check退出1，Node2151过/4失败/19跳过（2174）；本次首次add/refresh实际执行stop/exit/SQLite断言，H2本次证伪，未称生产根因修复。全类型/Python1022/build另行通过；6处浏览器setup/导航仍开放。
- [x] 更新 audit/tracker/handoff/README/ledger；完整55路径审查slice Approved / merge With fixes / ship No，当前6浏览器验收Important保留。源码/HEAD/index/D盘/封装/进程0核对通过；审查后仅Markdown结论，代码冻结。
