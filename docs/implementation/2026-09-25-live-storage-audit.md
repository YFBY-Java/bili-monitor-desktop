# 直播存储开关与工作台依赖审计（2026-09-25）

## 范围与状态

延续 M08，按原 B/S 迁移 storageEnabled，涵盖直播 REST、弹幕、榜单、场次、分析和导出，以及原工作台的必要启用依赖。客户端 HEAD b2e5a89；保留既有 Rank/弹幕 HTTP 未提交增量。原 B/S HEAD fa2faa6，只读、工作区干净，本轮未启动。

本子项实现、独立只读复核和最终 check.cmd 已完成。未提交、推送、打包或重启已安装客户端；全量 M01–M18 仍未完成。本轮在此收尾，不把配置子项完成写成整模块迁移完成。

## 原业务依据

原根目录为 `D:\codex_work\BiliMonitor\social-data-monitor`：

| 原源码 | 已确认的语义 | 本地适配 |
| --- | --- | --- |
| LiveMonitorProperties、application.yml | storageEnabled 缺省 true，环境别名 SOCIAL_MONITOR_BILIBILI_LIVE_STORAGE_ENABLED | 扩展既有只读配置、共享 TS/portable 校验 |
| live 下 Monitor/Danmaku/Rank/Session/Export/Insight 的 Controller、Service、Repository | storage-enabled=false 不创建这些组件，不是仍采集但不保存 | Core 不实例化对应业务服务或默认 Worker 源，24个公开业务方法返回 BILIBILI_LIVE_STORAGE_DISABLED |
| MonitorScheduler | storage-enabled 与 enabled 均为 true 才自动 REST | enabled=false 保留手工操作；storage=false 关闭直播调度和手工入口 |
| DanmakuScheduler、CredentialActivatedListener | 依赖 storage-enabled | 不建弹幕调度、不注册登录后的匿名连接升级 |
| SubjectService、SubjectWorkbenchService | subject-monitor.enabled 缺省 true，构造器必须注入 LiveService/Repository；不存在直播关闭后的半功能工作台降级 | 单独迁移工作台开关；冲突配置在打开数据库前报错，不静默关掉工作台 |
| SocialDataMonitorApplicationTests | 关闭直播存储的测试也显式设置 subject-monitor.enabled=false | 支持同样的合法组合；工作台关闭时其9个方法明确返回 SUBJECT_MONITOR_DISABLED |

原应用在不兼容组合下缺失依赖是基于构造器和条件注解的源码推导，本轮没有启动 Spring 来实测；客户端对该组合改为固定、可操作的配置错误，不复制 Java 堆栈或 HTTP 状态码。原 `rank.enabled` 等独立模块配置仍在后续清单中，不因本次存储总开关完成而视为全部迁移。

## 配置用法

配置放在实际 D 盘数据目录（不是源码目录），只在启动读取，不写回文件。

- `config/bilibili-live-collection.json` 新增 `storageEnabled`，缺省 true；原 `enabled` 仍只控制自动 REST，两者不混用。支持原环境变量 `SOCIAL_MONITOR_BILIBILI_LIVE_STORAGE_ENABLED` 覆盖。
- `config/subject-monitor.json` 使用 `{"enabled":false}` 关闭 B站用户工作台；缺省 true。`APP_SUBJECTMONITOR_ENABLED` 可覆盖文件，其名称按 [Spring 官方映射规则](https://docs.spring.io/spring-boot/reference/features/external-config.html#features.external-config.typesafe-configuration-properties.relaxed-binding.environment-variables) 由原属性推导。
- 关闭直播业务时必须同时显式关闭工作台，否则返回 `BILIBILI_LIVE_STORAGE_DEPENDENCY_INVALID`。单独关闭工作台不禁用直播。示例分别见 `config/bilibili-live-collection.example.json` 和 `config/subject-monitor.example.json`。
- 文件值必须是 JSON boolean；环境值接受不区分大小写、去首尾空白的 true/false。坏文件不能被环境覆盖掩盖；只有 ENOENT 使用默认，其他 IO/JSON 错误固定报错。完整 Spring 宽松绑定域仍未逐项移植。
- 禁用不删除表、历史、监控状态、绑定或导出序号；本地 SQLite 继续供粉丝、凭据和其他模块使用。配置改变后重启，不能在运行中动态开关。

## 验证证据

- 共享直播 fixture 的 TS 3项/Python 2项首先失败，确认旧实现拒绝 storageEnabled 且缺少默认字段；接入契约/loader 后 Core 又明确复现仍执行新增房间、工作台开关被忽略、10秒中仍11次直播扫描、非法工作台配置被忽略。
- Core 回归覆盖24个直播与9个工作台方法；原文件和 env 两条关闭路径，依赖冲突先于建库；粉丝调度和合成登录成功仍可用，抖音合成 health 可用，关闭时不调用直播源 stop、不运行孤儿连接恢复。
- 真实 SQLite 的启用→禁用→再启用覆盖房间/快照、Rank、场次事件、END_PENDING、工作台绑定/布局、模拟中断的连接和导出日序号。禁用跨4小时后所有直播/工作台表逐行不变；恢复后历史可读，导出序号从1续到2。该用例是补覆盖，不宣称它首次通过代表又发现一次原业务差异。
- 实际 Core entry + Main host 的两类配置错误先复现为启动成功，再复现为进程退出附带内部路径/堆栈；共享固定错误映射后安全返回，修改文件可恢复。正常 Core 的14类消息调用都保留禁用错误，不返回成功空数据或重启 Core。
- TS/Python 共用 subject-monitor fixture。Main 的进程替身用独立 Node Worker 执行真实 Core entry，不等同于原生 Electron/安装包手工验收。
- 测试隔离纠正：首轮工作台测试漏注入 followerSource，沿用了默认 Python 源，触发公开 UID 9 资料请求；未使用真实登录凭据，数据位于测试临时目录并由 afterEach 清理。随后注入明确的合成粉丝/榜单/直播/认证边界并重跑同一失败测试。不能据此声称本轮从未发出平台请求，也不把该意外请求作为功能实网验收。

## 收尾验证

- 2026-09-25 最终完整 `check.cmd` 退出 0：Node **893**（Contracts215 / Storage19 / Task3 / Core347 / Browser12 / Realtime46 / Desktop251），Python **308**。相较上一弹幕 HTTP 子项新增40项 Node、14项 Python，包含后补覆盖，不全部宣称为 RED/GREEN。
- TypeScript、Python mypy、Black/isort、Electron Main/Core/Preload/Renderer 生产构建、D盘工具/缓存/临时/数据路径检查均通过。没有生成安装包，也没有重启已安装应用。
- 独立只读复核无 Critical/Important。唯一 Minor 是 Main 测试继承宿主的 `APP_SUBJECTMONITOR_ENABLED=false` 后，依赖冲突用例会误报失败；已实际复现，再在 setup 清理两个开关，并单列真实 host 环境覆盖且配置文件字节不变的测试。最终完整检查包含该修正。
- 已有改动的 `git diff --check`、新增文本文件行尾空白检查通过；生产输出未检出本轮合成数据/测试入口标记；完成后项目 Node/Python 进程数为0。
- 原 B/S 仍为 `fa2faa6` 且工作区干净，客户端 HEAD 仍为 `b2e5a89`、暂存区为空；既有 Rank/弹幕 HTTP 与本轮增量均保留在未提交工作区。未访问用户真实数据库或使用真实平台凭据；首轮测试意外公开资料请求的边界见上，不隐去此事。
- 使用方法与故障定位已同步到 [本地开发环境](../development.md)，执行计划和全量迁移台账同步记录已完成/待完成边界。

## 后续范围

- M08仍有原完整数值域/标识符/时间/URL边缘解析、Spring宽松绑定、严格并发限流（共享锁等待与预约模型差异）、API耗时统计含限流的差异。
- M09完整弹幕规则、M10独立Rank配置和业务、M11场次、M12导出格式、M13分析、M14工作台其余配置/业务、M15抖音、M16适配器、M17真假能力分类、M18真人/原生发布验收全部保留。
- 本轮只迁移直播存储总开关及其直接依赖；粉丝独立 storage-enabled 与 enabled 配置仍应在全量台账明确核对，不能因粉丝已有业务闭环测试而遗漏配置维度。
