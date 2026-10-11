# 阶段回归对齐与 schema16 独立目录版（2026-10-07）

## 范围

原 B/S `fa2faa6` 只读；客户端 HEAD `4c94959`、累积未提交改动保留。这里区分已有生产业务、陈旧测试依赖及实际目录版验收，不把有页面或定点通过当全量完成。没有新增测试名称、生产功能、契约、数据库迁移或工具链；全部新文件及数据在 D 盘。

## 本轮核定并关闭的夹具失配

- 直播删除：原 `BilibiliLiveView.vue:808–836` 在删除确认后先清趋势/详情，再 `loadAll`。真实 Preload 的旧/新版 `remove` 都调用 `bilibili-live:rooms-delete`；夹具仅覆盖新版，旧入口仍抛只读错误。只让旧夹具入口复用同一个删除实现，不改生产逻辑、断言或预算。原三个 overview 删除流程先实际失败，再与 workspace 删除确认流程共四项通过，41 项未选运行；Desktop 类型通过。单文件限定复查 C0/I0/Minor0。
- 共享直播数据：生产使用 Subject v3/Live v2，旧夹具只提供 v2 工作台及 v1 房间；页面加载完成却一直等标题。单代表实际 RED 后同步夹具方法、共享类型及字符串汇总计数，榜单/弹幕继续在原分组。第505房间选择、60条弹幕、榜单切换、离线启停四项定向通过，11 项当时未选运行；Desktop 类型通过，单文件限定复查 C0/I0/Minor0。随后下面的一次桌面阶段检查实际执行该文件15项，全部通过；保留定向与阶段证据各自范围。
- Worker 等待/退出：现行 Worker 在 HTTP 前通过 `credential-request` 获取当前身份，真实 Core 会回应；直接启动的旧夹具没有回应，故没有 HTTP 标记文件。复用共享请求/响应 Schema 回应未登录 `credential:null`，不关闭鉴权、不伪造 HTTP 标记。一个原流程先 RED，原文件七项随后通过：两种 Core 配置、keepAlive 三种输入、stdin/stdout 失联。Desktop 类型通过；单文件限定复查 C0/I0/Minor0。
- 抖音扫码重开原流程单独通过，五项未选运行；没有改生产代码。仅证明当前定向流程，不能用它关闭此前并行超时或真人扫码。

前三片分别有真实任务前494源快照与限定差量：`.tools/temp/20261007-{live-delete-bridge,widget-bridge,realtime-credential-fixture}-{before,review-v1.txt}`，各仅一个源路径变化。测试主体、并发和原超时不改，没有为了测试通过修改实际采集行为。

## 本轮之前的阶段事实

- 完整 `check.cmd` 终态 exit1，日志 `20261007-subject-binding-phase-check.log`：Task3、Contracts511、Storage77、Realtime162、Browser12通过；Core1036通过/1失败，Subject501对象流程8098ms超过原5000ms。没有由这个命令执行 Desktop 及后续阶段。
- 桌面补验 `20261007-subject-binding-desktop-check.log` 为629通过/38失败/19跳过。上述夹具修正和定向通过不能直接从这个历史总数减去失败项，必须看新阶段结果。
- Python 补验当时1074通过/1失败；原能力列表少四个真实 Live v2 路由。仅修原断言后该项通过。连同导航列表和双轴曲线两处原断言，三测试文件限定复查 C0/I0/Minor0；Desktop16项/Python1项通过，不改生产逻辑。旧 Python fixture 只有 Black 机械换行。
- 本次桌面阶段回归只执行一次，日志 `.tools/temp/20261007-desktop-after-fixture-alignment.log`，终态exit1：664通过/3失败/19跳过，55文件通过/4文件失败。Follower Delete/Status的beforeAll及afterAll超时，ProjectionPolling两项beforeEach超时，PlatformCollection一个测试体15秒超时；前两套未执行19项。根因未核定，不将其统一归为生产缺陷或夹具陈旧，也不盲目重跑/放宽预算求绿。共享Widget15项、Realtime等待/退出7项与直播删除在此次完整桌面阶段实际执行通过。

## 独立目录版实际验收

当前生产构建 exit0；使用现有 Electron43.4.1、electron-builder26.15.3、最新 PyInstaller6.22.2 内置 Worker，生成新的 unsigned 目录版：

`release/migration-20261007-schema16/win-unpacked/BiliMonitor Desktop.exe`

没有 native rebuild、签名或 NSIS 安装，也没有覆盖旧目录版和安装包。`resources/app.asar` 为87,828,115字节，SHA256 `F238D96B43BAE914877EF16EBD8D5285EE20D10AB2F43EB4D77ACE073F78B912`。

实际 exe 验收清除开发 BMD/Python/Node/Renderer 环境，PATH 仅 Windows 系统目录。内置 Python 握手和 Live v2 能力通过；Electron确认 `isPackaged=true` 并从该 `app.asar` 运行。实际 Main/Preload/Core 为 ready/schema16，精确 Live 汇总和平台注册表读取通过；本地对象创建、原文绑定保存、Core重启保留、删除及列表为空通过。Core PID23400→66972，正常退出自有PID残留0。隔离数据 `.tools/temp/bmd-standalone-schema16-r8M97W`，自动采集/OAuth关闭，未触碰用户库或真实凭据。

日志：`20261007-directory-{production-build,package,standalone-smoke}.log`。临时脚本启动前对照实际 Preload 将误写的 `Subjects.delete` 改为 `remove`，未运行错误版本或修改业务方法来迁就脚本。

## 未完成边界

全量M01–M18仍未验收完成：阶段失败/性能、其他已明确兼容差异、真人扫码/获准采集目标、原生保存与剪贴板、NSIS安装及大数据/强杀恢复继续保留。目录版通过不是这些能力已验收，更不是真人送礼/正式OAuth授权证据。随后[直播添加输入](2026-10-07-live-add-identifier-audit.md)已修改Renderer并单独验证/构建；此目录版不包含该后续修改。未提交或推送代码。
