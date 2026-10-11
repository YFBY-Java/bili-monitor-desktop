# 最新平台采集目录版与内置 Worker 验收（2026-10-07）

## 交付内容

当前 unsigned 独立目录版为 `release/migration-20261007-platform-account/win-unpacked/BiliMonitor Desktop.exe`，包含截至[平台 account 输入](2026-10-07-platform-account-input-audit.md)收尾的源码：SQLite schema18、榜单精确数值及条目归档、平台失败结果/失败响应证据和独立 signed64 account 请求。旧目录包保留，不覆盖为新版本。

Python 打包 session22257 已确认终态 exit0；使用现有 PyInstaller6.22.2及预编译 bootloader，依赖均已存在，没有新增 C/C++/Rust 源码或编译链。Electron 目录打包 session59233 终态 exit0，使用现有 Electron43.4.1，显式关闭 npm rebuild 与签名资源编辑，不生成或安装 NSIS。

## 实际独立运行

目录版 smoke session91268 终态 exit0，隔离数据位于 D盘 `.tools/temp/bmd-standalone-schema18-dEZRg6`。启动环境移除项目 Python/Worker 配置及开发 Renderer 配置，PATH 只含 Windows System32；应用自身确认 `isPackaged=true` 和 `resources/app.asar`。

- 包内 `resources/python-worker/bmd-python-worker.exe` 实际标准流握手与 capability 查询成功，包含新平台 account、Rank v2 和 Live v2 请求。
- 对包内 account 模型发送唯一超出 signed64 的合成请求，确认实际模型校验拒绝、无缺字段/额外字段错误；随后 ping 仍 ready。没有发送合法账号请求或访问平台。
- 实际 Main/Preload/Core IPC 返回 ready/schema18、精确 Live v2 零值和真实 Adapter 注册表。
- 五个实际业务模块依次加载：平台采集、抖音登录态、直播间监控、粉丝监控、用户监控，没有页面加载失败。平台页面输入带前导空白的 UID，显示原 PARSE_ERROR 消息且不发平台请求。
- 本地合成 Subject 资料/标签/空资源绑定通过实际 IPC 创建，Core68956→64244重启后保持，随后删除并确认列表为空；正常退出时所跟踪自有 Main/Core PID 残留为0。

这证明独立目录包的内置 Worker、页面、IPC 和本地重启路径；合法 signed account 的实际 HTTPS 回放/失败证据已由前一源码生产流程验证，本次不将 capability 或非法输入验证冒称真实平台成功。

## 产物及证据

| 产物 | 字节 | SHA256 |
| --- | --- | --- |
| `resources/app.asar` | 88017526 | `020D1B063015DDE946357B74A791927A916A972EF8267E3275F4BB7FE7122784` |
| `resources/python-worker/bmd-python-worker.exe` | 6788813 | `B3B01CACA8ECF234DD9AF3B3412EE655A4A7A76560BDDEA56005B1BBAFA9FAD5` |

D盘日志：`.tools/temp/20261007-platform-account-python-package.log`、`20261007-platform-account-directory-package.log`、`20261007-platform-account-standalone-smoke.log`；复用并更新的验收脚本为 `.tools/temp/standalone-platform-account-smoke.mjs`。

## 保留边界

没有接触用户数据库、真实凭据或真实平台，没有启动/修改原 B/S，没有提交推送或更新全局记忆。原四个规模超时、桌面冷启动不稳定、工作台布局失败策略、其他未关闭兼容域及真人扫码/OAuth/获准房间、原生保存复制、安装验收仍 OPEN。本次是当前目录版的限定交付，不是全量 M01–M18 已完成或全量检查绿色；继续逐功能迁移。
