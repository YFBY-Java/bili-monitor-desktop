# 弹幕协议选择迁移（2026-10-06）

本功能已实现并通过独立任务复审；仅指协议选择规则，不代表连接认证、M09 或整个迁移完成。按用户要求减少测试量：只新增 3 个代表性业务场景及 8 个小共享契约样例，不再逐小功能重复全量历史回归或累计分支审查。

## 原业务与实现

依据只读原项目 `fa2faa6` 的 `BilibiliLiveDanmakuService` 的 `start`、`resolveProtocolCandidates`、`isAutoProtocol`、登录升级及原配置属性；本地 API 文档仅核对认证 JSON 的 `protover` 与包头版本分离，不作为线上验证。

- 数据目录 `config/bilibili-live-danmaku.json` 新增 `protocolVersion`，默认 3；保持原 signed32 整数绑定，不擅自夹取。兼容 `SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_PROTOCOL_VERSION`，规范名 `APP_BILIBILI_LIVEMONITOR_DANMAKU_PROTOCOLVERSION` 优先。
- 自动模式先尝试合法配置偏好，再按 3、2、1、0 去重。例如偏好 2 得到 `[2,3,1,0]`；配置值不在 0..3 时按默认顺序尝试。
- 手动请求 0..3 只尝试指定协议，覆盖配置偏好。省略协议或请求其他 signed32 值（包括 -2、4）均为自动模式，复用已活动连接；仅不同的合法手动协议替换连接。
- 配置已贯通本地加载→Core→WorkerSource→共享 Worker 契约→SessionManager→实际认证循环，0 不丢失，旧 Worker 请求兼容。成功结果记录实际协议；登录升级继续按实际协议重新连接。认证包头仍为版本 1。

现有界面“自动 / 3 / 2 / 1 / 0”不变。修改配置后重启生效；未修改用户实际配置或数据库。

## 验证结果

三个新增业务场景分别覆盖配置/环境绑定、真实 Core 的自动复用与手动替换、实际认证包的偏好顺序与手动 0；不是新增数百个测试。修改涉及的既有测试定向通过：Contracts 52、Core 95、Worker 9、Python 48；最后清理编辑的 Source 7 / Manager 3 另行通过。相关类型检查、修改的 Python 文件格式检查和一次完整生产构建通过，实际 Electron 四个 bundle 与 CJS 产物存在。

生产编辑前的 RED 和修改后的 GREEN 日志保留在 D 盘 `.tmp/2026-10-06-protocol-*.log`；构建日志为 `.tmp/2026-10-06-danmaku-protocol-selection-build.log`，真实退出码 0。独立复审完整读取 23 路径、59,762 字节的任务前后差量，结果 Spec compliant / Approved，无遗留 finding；没有用空提交差量或此前 77 路径累计审查替代本任务。

本轮未重跑完整 `check.cmd`。此前整套检查的桌面进程异常退出以及旧 pending add / 趋势超时缺口仍保留，不能写成已经修复或全量绿色，详见[此前审计](2026-10-06-danmaku-text-admission-audit.md)。

## 下一功能与未完成边界

下一功能按原源码迁移连接与认证生命周期：原实现仅使用首 host、每候选重新取得连接信息/创建尝试会话、发出认证即返回 AUTHENTICATING，并且只有同步 BusinessException 触发候选回退；异步认证拒绝会关闭会话，不在同轮回退。目前 Node 的多 host、等待认证成功和拒绝后回退尚未对齐，不能把本轮协议规则完成称为连接完全等价。

原 15 项弹幕属性现已接入 6 项，剩余 9 项、其他解析/缓存/覆盖窗口等业务仍在[全量台账](2026-09-13-full-migration-tracker.md)。另需核对 Node SessionManager 额外的 100 连接上限是否违背原配置容量。完整 M01–M18、真人扫码、原生客户端和安装验收继续未完成。

## 工作区边界

原 B/S 与 API 参考仓库只读；保留此前未提交修改，客户端 HEAD 仍为 `4c94959`，暂存区为空。工程命令先激活项目 D 盘环境，临时数据库、日志和构建产物均在 D 盘。未提交、推送、安装、启动原 B/S、访问用户数据库或执行真实平台认证；不以网络回放代替真人验收。

收尾实查：当前90个未提交路径均属于原77路径、本协议任务或交接文档；任务外旧文件哈希及冻结的23个任务文件哈希不变，原项目/API工作区干净，diff与新文件空白检查通过，项目运行进程/监听为0。产物检查第一次误填不存在的 `core-runtime.js`，随后仅按构建日志核对实际 `core-process.js`、其他三个main bundle、preload CJS与renderer，均存在且非空；未因此重跑测试或构建。
