# 直播采集启动配置迁移与停止交接（2026-10-07）

## 本功能

对照原只读 B/S `fa2faa6` 的 `BilibiliLiveMonitorProperties`、`application.yml`、`BilibiliLiveMonitorScheduler` 和 Service/Repository 条件装配，补齐直播采集17个配置字段的标准环境变量与既有别名优先关系、占位符、原布尔/整数转换及调度条件。用户要求完成本功能后停止，未进入下一项。

- 标准 `APP_BILIBILI_LIVEMONITOR_*` 优先于旧 `SOCIAL_MONITOR_BILIBILI_LIVE_*` 别名，再到项目内 typed JSON/default；复用既有粉丝/弹幕配置 helper，没有新解析器或依赖。
- 两个 primitive 布尔均校验；服务是否装配按原 raw `@ConditionalOnProperty` 判断，不用转换后的 storage boolean 代替。仅不带外围空白的 `false`（不区分大小写）关闭服务，`0`/`off` 与带空白的 `false` 不关闭条件。
- 类型化文件允许 int32 调度值；最终 TS/portable 契约只在自动采集与存储启用时要求正数。原调度条件命中时仍对 raw delay 做十进制正数校验，不能把整数属性能绑定的 hex/空白误当作可调度值。
- 文件先验证、配置加载在 SQLite/Worker 前、不改文件字节；失败保持固定安全文案。默认值、HTTP协议、数据库版本及普通采集消费者不改。

原基线为 Boot3.3.6/Framework6.1.15，条件与转换规则同时核对[原版本 OnPropertyCondition](https://github.com/spring-projects/spring-boot/blob/v3.3.6/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/OnPropertyCondition.java)和[StringToBooleanConverter](https://github.com/spring-projects/spring-framework/blob/v6.1.15/spring-core/src/main/java/org/springframework/core/convert/support/StringToBooleanConverter.java)。本地 API 资料 `docs/live/info.md` 已只读核对，本片不改变平台接口或声称真人协议验收。

## 验证证据

仅新增1个 loader 命名流程及2个共享配置样例，其余复用旧流程。真实 RED：loader3、TS契约2、真实Runtime1、Python portable2；Runtime失败确实多采集了房间，不是模拟函数调用数。修复后最终三个Core既有文件35项、两个契约文件52项、两个Python文件62项通过；全部workspace类型与Desktop生产构建通过。

七路径限定独立只读复核 Critical/Important/Minor 均0；旧存储夹具两输入单独补审，前六路径没有漂移。复核仅接受本功能，不代表整分支/完整Spring属性源或全量迁移完成。

一次标准 `check.cmd` session30969已终态exit1：Task3、Contracts513、Storage78、Realtime162、Browser12通过；Core1045/1048，三失败为Subject501对象6269ms超过5s、粉丝历史32788ms超过30s，以及旧存储夹具把 `" FALSE "` 当作条件关闭。后者违反原不trim条件，改为 `"FALSE"`/`"false"`，所有24类业务操作及原断言保持；最终三个Core文件35项已覆盖该修正。未重跑完整套件求绿，旧规模失败未关闭；Desktop及后续阶段未由该check执行。

生产bundle实际 Electron Main/Preload/Core 验证：隔离D盘 `.tools/temp/bmd-live-binding-production-daYj6A`、schema18；标准环境覆盖相反旧别名，首次关闭存储明确返回禁用错误，Main环境重读后Core16916→68048重新启用存储。自动采集关闭时文件delay0可启动，真实查询返回空库/精确零值，配置文件字节不变；正常退出自有PID残留0。没有真实平台调用、用户库、凭据或原生保存/安装操作。

日志均位于D盘 `.tools/temp/20261007-live-startup-binding-*.log`，包含red、contract-red、runtime-red、python-red、core-green、core-final、contract-green、python-green、types、build、phase-check、production。真实before为同前缀 `before/`：六路径在第一次修改前保存，第七旧存储测试在修改其输入前保存；未覆盖早期失败记录。

## 停止与剩余项

本功能的标准环境配置及条件装配切片收尾；完整Spring属性源/跨模块引用等未扩大验收。完整迁移仍未完成：布局失败策略等待用户选择，规模性能与桌面冷启动、其他未核定行为差异、真人B站/抖音授权及获准直播场景、原生复制保存和安装验收继续保留。

最新源码生产bundle包含本功能；独立目录包未重打，不声称安装包已同步。原B/S只读干净，客户端HEAD仍 `4c94959`、暂存区空、累积改动保留；没有提交推送、安装、全局记忆写入。按用户要求停止后续迁移，恢复时先读本记录，不重做已完成的工作台创建事务、JSON保存、平台输入或WBI修复。
