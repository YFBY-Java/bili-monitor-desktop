# 粉丝 UID 文本输入迁移（2026-10-05）

## 原业务、确认的修正与范围

- 原 B/S 只读基线 `fa2faa6`。粉丝页 `frontend/src/views/bilibili/BilibiliView.vue:13–22,506–522` 用 text input 接收 UID，`Number()` 后仅检查正整数，再由安装的 Axios 默认转换器 JSON.stringify。普通空白、正号、前导零、`.0`、科学记数法和进制输入可通过；不安全整数会被舍入。
- 原 DTO/Controller、实际 Jackson/Spring 绑定与真实原 UI→wire 区别见[HTTP 只读审计](2026-10-05-follower-http-binding-audit.md)。尤其 `BigInt(Number(raw))` 不等于原实际 JSON token，不能作为原请求兼容 oracle。
- 用户在本轮明确选择“保留精确 UID，兼容前导零、空白等原输入形式；拒绝真正的小数和越界值（推荐）”。所以本轮有意修正 Number 舍入缺陷，而不是偷偷缩小为 safe53，也不是宣称原舍入输入全部等价。
- 本轮仅是 M06 粉丝页添加 UID 文本；Subject 原入口有不同的 safe-integer 检查，本轮不合并、不改写。共享 v2/Worker/Core/SQLite/Main/Preload 契约不变，仍接收 canonical positive Long 字符串，不新增 HTTP 兼容服务。
- 历史本地 API 参考 `docs/user/info.md:518–715` 已先读；其 card/MID 材料不作为当前平台成功证据。

## 实现

- `follower-uid-input.ts` 是 renderer 纯函数：ECMAScript `trim`、ASCII decimal/scientific 和 unsigned `0x/0b/0o` 语法；按数学精确结果验证 `1..9223372036854775807`，返回已有共享 schema 接受的 canonical 字符串。
- UID 本身不经过 Number。十进制系数/小数位/尾零由字符运算归一化；指数计数先按字符长度和字典序限制到安全界限，才转 Number。进制去前导零并限制有效位数后才转 BigInt。最终最多追加18个零，不对巨大指数扩展内存，不增加任意输入长度限制。
- 表单去除原生 UID `pattern/required` 的提前阻断，保留 numeric 键盘提示及 aria-required；非法文本统一显示“请输入有效 UID”，不会进入 v2 add。用户可修正输入继续提交。
- 失败后保留原始 UID 文本和间隔，重试仍发同一精确 canonical UID。新一轮本地校验错误优先于上次 mutation 错误，不被旧失败提示遮住。未更改采集间隔范围、自动选择和抽屉生命周期。

## 测试与修复证据

- Helper TDD：缺少模块 RED；identity stub 行为 RED（152失败/5通过）；实际归一化 GREEN，157/157。覆盖25种 ECMAScript 空白、非空白反例、safe53两侧、LongMAX多种表示、真实小数/零/负数/越界/非法语法及5000字符前导零、系数尾零和指数反例。
- 真实 Chromium 表单新增3项回归：12种合法输入、12种非法输入、失败后草稿/本地校验/重试及 legacy namespace 零调用。首次3项 RED 均为原生输入约束提前拦截；接入后2过/1失败，证明旧 mutationError 遮住当前本地错误；最小优先级修复后全部通过。
- 主代理定向命令 `pnpm --filter @bmd/desktop exec vitest run src/renderer/src/follower-uid-input.test.ts src/renderer/src/BilibiliFollowerWorkspace.interaction.test.ts src/renderer/src/BilibiliFollowerWorkspace.test.tsx`：exit0，3文件186项通过；此为性能修复前的结果。
- 独立复审发现系数尾零正则对50KB内部零串平方回溯，在Renderer同步提交线程阻塞。新增性能回归先RED（1365.6ms，要求<500ms），改用线性后向计零/slice后158/158 GREEN（全部helper14ms）；不增加文本长度限制。含此项共新增Node161项，Python本轮无新增。
- 性能修复前第一次完整 `check.cmd` 退出0（Node1967/Python1003），不作为修复后验收；代码冻结后第二次完整 `check.cmd` 退出0：**Node1968/Python1003**。其中Contracts461、Storage53、Task3、Core862、NodeBrowser12、NodeRealtime46、Desktop531（46文件）；全部TS类型检查、Black57文件、isort、mypy18源文件、Electron生产构建及D盘检查通过。
- 限定本轮实现独立复验无未关闭Critical/Important；同一实现hash的2672精确BigInt oracle零差异，11种5000padding仍精确；两类50KB反例耗时0.026/0.034ms。原生Electron、真实平台或安装验收未执行，模拟bridge不能冒充这些验收。
- 最终检查后（2026-10-05 21:47:55 +08:00）安全核验：项目Node/Python/Electron/Chromium进程残留0、相关监听0、production本轮fixture匹配0、diff检查通过；137个新增文件文本尾空白问题0、index空、222项工作区增量全部保留，`CLAUDE.md`精确为`@AGENTS.md`。原B/S `fa2faa6` 和历史API `271b123` 均clean，客户端HEAD仍 `b2e5a89`。

## 已发现但本轮未修复的独立添加流程差异

本节为UID切片完成时的历史发现；后续已单独接[添加成功链迁移](2026-10-05-follower-add-flow-audit.md)，当前实现与验收状态请看该审计及全量台账，不沿用下文的旧客户端状态。

原源码顺序为添加成功 → 清空 UID → await loadUsers（清理失效选择）→ 检查4人上限并追加返回 ID → queueTrendRefresh。列表失败被 loadUsers 捕获，不能撤销已经成功的添加。原 adding 维持到同步结束，成功后原采集间隔继续保留。

客户端当前先追加/检查旧上限、关闭抽屉，再 invalidate；列表 effect 随后剪除选择。只读源码/实际 TanStack 依赖探针已确定：

1. 选满4人后，同步列表剔除其中1人且包含新增用户时，当前最终只剩3人，而原项目会补选新增用户。
2. 无缓存的初始列表在途时，invalidate复用旧 promise，旧快照可能剪掉新增选择；后续刷新不会恢复。
3. 添加 A 请求未结束，关闭重开 B 后，A 的 hook-level onSuccess 仍可能关闭 B；失败也可能使新抽屉显示旧 mutation 错误。
4. 原 trend 请求使用 raw selected IDs，显示名单才过滤；客户端用 effective IDs 请求，列表失败/旧结果缺新增用户时不立即查询该用户趋势。
5. 成功后原间隔保留，当前抽屉重开恢复3600；这是下一次提交参数差异，不能称纯样式适配。

下一切片以可控制真正新增用户、按调用捕获 list 快照、分别 hold/release add/list 的 fixture 先做 RED，再恢复读/选择顺序并保护请求归属。成功写入后读失败不回滚、不自动重试 add。此处不是浏览器竞态回归已通过声明。

M06和全量M01–M18仍进行中；其它既有解析/运行时/编码差异及真人/原生/安装验收继续保留。禁止提交推送、源库修改、平台/凭据/用户运行库访问；工具和产物继续D盘。
