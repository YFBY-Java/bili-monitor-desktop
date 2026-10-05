# 粉丝采集错误响应迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对齐原粉丝 card/relation 的返回码转换、错误分类和重试/回退可观察行为，不将本切片等同于 M06 完成。

**Architecture:** 保留 Electron → TypeScript Core → NDJSON Python Worker → HTTPX 链路。只修改粉丝错误判定，独立辅助模块复刻 Jackson `asInt` 规则；不改共用直播解析器。用网络响应回放驱动实际 Worker、Core 和临时 SQLite。

**Tech Stack:** Python、TypeScript、pytest、Vitest、HTTPX MockTransport、SQLite。

**Readability:** 新代码仅 Python/TypeScript，无 C/C++/Rust。

## Global Constraints

- 原 B/S `D:\codex_work\BiliMonitor`、HEAD `fa2faa6` 只读，不启动。
- 原依据：`BilibiliApiClient.ensureSuccess/get`、`BilibiliFollowerMonitorService.fetchWithRetry/canFallbackToRelationStat`、`collector/service/RetryPolicy.java`；Spring Boot 3.3.6。
- B站参考：`D:\codex_work\bilibili-API-collect-new\docs\user\info.md` card 与 `docs\user\status_number.md` relation；参考不是当前平台协议证明。
- 辅助转换依据：FasterXML jackson-core 2.17 `NumberInput.parseAsInt`、databind `BooleanNode`；Oracle `Double.valueOf` 字符串语法。数字整数转32位、浮点截断并饱和、简单十进制字符串溢出使用 MIN_VALUE；字符串空白只移除 U+0000–U+0020。
- 所有测试、缓存、证据和构建在 D 盘；先激活环境。无真实平台请求/凭据，不读生产库，不新增服务器，不提交/推送。
- 保留已有未提交改动。完整昵称/头像与64位计数传输、根JSON解析域、Spring绑定域继续在 M06 台账中，不能只放宽 Worker 而留下 Core/SQL 拒绝。

### Task 1: 错误判定与真实链路回归

**Files:**
- Create: `workers/python/src/bmd_workers/bilibili_follower_errors.py`
- Modify: `workers/python/src/bmd_workers/bilibili_follower.py`
- Create: `workers/python/tests/test_follower_error_response.py`
- Modify: `workers/python/tests/test_bilibili_follower.py`
- Create: `workers/python/tests/fixtures/follower_error_response/sitecustomize.py`
- Create: `packages/core-runtime/src/bilibili-follower-error-response.integration.test.ts`
- Modify: `packages/core-runtime/src/bilibili-follower-collection-parity.test.ts`

**Interfaces:**
- Consumes: `parse_card_response(raw, fetched_at)`、`parse_relation_stat_response(raw, fetched_at)`、`fetch_follower_endpoint(endpoint, mid, data_directory, http_configuration=None)`。
- Produces: `response_code(value: object) -> int`、`error_message(value: object, code: int) -> str`，错误对象继续为 `BilibiliCrawlerError`，不改 Worker 契约。
- 分类：`-101` AUTH_EXPIRED、`-352/-412` RISK_CONTROL、其余 UNKNOWN；原始 `retryable = code >= 500` 只记录，Core 仍只按限频/网络/服务器类别重试。v_voucher 非 null 优先风险拦截；HTTP429/5xx/其他4xx分别限频/服务器/UNKNOWN。

- [x] 先新增失败参数回归：字符串/布尔/小数/整数溢出/缺失/容器 code，文本错误消息的 Java blank 规则及 bool/容器转换；两端点的相同错误和 voucher 优先；HTTP4xx UNKNOWN。示例：

```python
with pytest.raises(BilibiliCrawlerError) as raised:
    parse_card_response('{"code":" -101 ","message":"  过期  "}', "2026-10-05T00:00:00Z")
assert raised.value.code == "BILIBILI_AUTH_EXPIRED"
assert raised.value.bili_code == -101
assert str(raised.value) == "  过期  "
```

- [x] 回放只替换 HTTPX 网络传输，不替换 Parser/Worker/Core/SQL；初次 card 成功，刷新 card 的 `"500"` 应一次失败、不回退，历史保留且记录 UNKNOWN/retryable；-101 不回退；HTTP503三次后 relation 成功；每个 fixture 在 D 临时目录中隔离。
- [x] 执行 RED：`. .\scripts\activate-environment.ps1; & $env:BMD_PYTHON_EXE -m pytest workers/python/tests/test_follower_error_response.py workers/python/tests/test_bilibili_follower.py -q`；预期新规则断言失败。Core：`& $env:BMD_PNPM_CMD --filter @bmd/core-runtime exec vitest run src/bilibili-follower-error-response.integration.test.ts`，预期原类别差异失败。
- [x] 最小实现：将 `_ensure_success` 的 code/message 读取委托辅助函数，未知错误改 `BILIBILI_UNKNOWN_ERROR`，其他HTTP4xx同类；不修改正常字段解析。辅助模块的完整实现：

```python
import math
import re

MIN_CODE = -(2**31)
MAX_CODE = 2**31 - 1
JAVA_TRIM = "".join(chr(value) for value in range(33))
JAVA_BLANK = re.compile(
    r"[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]*"
)
SIMPLE_INTEGER = re.compile(r"-?[0-9]*")
JAVA_DOUBLE = re.compile(
    r"[+-]?(?:NaN|Infinity|(?:(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?"
    r"|0[xX](?:[0-9a-fA-F]+\.?[0-9a-fA-F]*|\.[0-9a-fA-F]+)[pP][+-]?[0-9]+)[fFdD]?)"
)

def _double_to_int(value: float) -> int:
    if math.isnan(value):
        return 0
    if value >= MAX_CODE:
        return MAX_CODE
    if value <= MIN_CODE:
        return MIN_CODE
    return int(value)

def response_code(value: object) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return (value + 2**31) % 2**32 - 2**31
    if isinstance(value, float):
        return _double_to_int(value)
    if not isinstance(value, str):
        return MIN_CODE
    text = value.strip(JAVA_TRIM)
    if text.startswith("+"):
        text = text[1:]
    if SIMPLE_INTEGER.fullmatch(text):
        digits = text[1:] if text.startswith("-") else text
        if not digits:
            return MIN_CODE
        digits = digits.lstrip("0") or "0"
        if len(digits) > 10:
            return MIN_CODE
        integer = int(digits) * (-1 if text.startswith("-") else 1)
        return integer if MIN_CODE <= integer <= MAX_CODE else MIN_CODE
    text = text.strip(JAVA_TRIM)
    if not JAVA_DOUBLE.fullmatch(text):
        return MIN_CODE
    literal = text[:-1] if text[-1] in "fFdD" else text
    if "x" in literal.lower():
        try:
            number = float.fromhex(literal)
        except OverflowError:
            number = -math.inf if literal.startswith("-") else math.inf
    else:
        number = float(literal)
    return _double_to_int(number)

def error_message(value: object, code: int) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (str, int, float)):
        text = str(value)
        if not JAVA_BLANK.fullmatch(text):
            return text
    return f"Bilibili API error: {code}"
```

这里完整算法以失败参数矩阵为约束，不复用直播的 -500 retryable 规则。数字 message 的完整 Java Double.toString 表示留在完整 scalar 文本域审计中，不宣称本切片覆盖它。

- [x] GREEN：初次针对性 Python112/Core20通过；复核补12项（10 RED、2锁定NBSP）和长前导零10项（8 RED、2锁定溢出），修复后 Python134通过；既有人工合成 API_ERROR 测试更新为原 UNKNOWN 类别。
- [x] 独立只读复核，发现两项P2均补RED后修正并复审关闭；无未关闭的重要问题，冻结源码后重新完整运行 `check.cmd`。
- [x] 更新 audit/tracker/handoff，记录最新检查数量、真实平台/原生验收未进行、原仓库无差异。保留工作区，不提交/推送。

### Task 2: 验证与交接

- [x] 冻结源码后第二轮 `check.cmd` 退出0（Node1049/Python496）；`git -c core.autocrlf=false diff --check` 通过；原库 HEAD/状态与基线一致。
- [x] 检查测试 fixture 不进入生产bundle/src、测试 Worker 正常退出，项目残留Node/Python/Electron进程0。未制作安装包。
- [x] 下一功能仍按台账顺序迁移，不将本切片升级为全量完成；完整配置绑定/parser与M09–M18范围保留。
