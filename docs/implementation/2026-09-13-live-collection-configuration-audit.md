# M08 直播自动采集与批次配置审计

## 原依据与已迁移范围

客户端基线 `f100ebc`；原只读仓库 `D:\codex_work\BiliMonitor` 基线 `fa2faa6`。实现计划为 `docs/superpowers/plans/2026-09-13-live-collection-configuration.md`。

原 `social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/live/config/BilibiliLiveMonitorProperties.java`、`service/BilibiliLiveMonitorScheduler.java`、`service/BilibiliLiveMonitorService.java`（145–159行）及 `backend/src/main/resources/application.yml`（74–78行）规定：自动开关默认true、完成后1000ms再扫描、一次取20间到期房、状态请求默认30UID。两个批量参数只在消费点夹到至少1，30不是硬上限。

| 配置 | 缺省 | 本地行为 | 原环境变量（优先于文件） |
| --- | --- | --- | --- |
| enabled | true | 只控制自动REST采集；不暂停房间记录，不禁用手工操作或粉丝/弹幕定时器 | SOCIAL_MONITOR_BILIBILI_LIVE_MONITOR_ENABLED |
| schedulerDelayMs | 1000 | 正整数毫秒，每次完整批次完成后再等待；支持250ms，不绕过原1500ms接口限流 | SOCIAL_MONITOR_BILIBILI_LIVE_SCHEDULER_DELAY_MS |
| dueBatchSize | 20 | 先按原到期顺序查询有效房间；暂停、未到期、退避中排除 | SOCIAL_MONITOR_BILIBILI_LIVE_DUE_BATCH_SIZE |
| statusBatchSize | 30 | 对到期结果依次分批；不再被TS/Python/portable契约或service硬截成30 | SOCIAL_MONITOR_BILIBILI_LIVE_STATUS_BATCH_SIZE |

### 使用方式

将仓库 `config/bilibili-live-collection.example.json` 的内容按需保存为**实际D盘数据目录**下 `config/bilibili-live-collection.json`，重启客户端后读取；不是仓库根配置，也不自动修改已运行实例或用户文件。

```json
{
  "enabled": true,
  "schedulerDelayMs": 1000,
  "dueBatchSize": 20,
  "statusBatchSize": 30
}
```

- Core在打开control.db前只读配置。文件缺失取上述默认值，不创建配置目录；支持UTF-8 BOM，不改写原字节。
- 文件值必须是原生JSON boolean/integer；批量允许有符号32位值，在消费点把零/负值夹到1，delay为1..2147483647。环境变量布尔值接受大小写不敏感true/false，整数接受带可选正负号的十进制文本及首尾空白。不是完整Spring relaxed-binding复制器；没有宣称其所有数字/布尔别名均已迁移。
- 未知字段、null、越界或格式错误不静默忽略；文件本身先完整校验，环境覆盖不能掩盖错误文件。读取失败仅ENOENT表示缺失，其余按配置错误处理。
- 已知配置错误通过既有bootstrap/core.error返回固定 `BILIBILI_LIVE_CONFIG_INVALID` 提示。没有把错误详情写到stderr；宿主按结构化code识别，停止失败Core，不把启动警告或实现路径拼给用户。修正文件后同一Controller可重启成功。
- 保留既有宿主 `schedulerEnabled=false` 全局停调度选项及 `schedulerDelayMs` 显式覆盖；文件只定制直播REST，不侵入其他服务周期。
- Worker不读取该配置或control.db，不增加环境白名单/任意IPC。Core决定UID批次，经既有窄化Worker接口调用，输出校验、证据CAS、单房事务不改变。

## 测试与审查证据

1. TS 75UID输入、Python 75UID输入、真实NDJSON75UID，以及service配置64时实际30/30/15的两项差异先RED。移除四处错误上限后，Core实际以64/11处理75房；一批失败仍继续后一批，逐房快照/失败状态可在真实SQLite验证。旧请求、空/坏UID、负批量夹1与到期过滤保留回归。
2. 配置集成最初12项中11项RED，宿主已有全局停调度行为1项原已通过。实现后验证磁盘/环境传入Core、false不自动采集、手工刷新/修改可用、粉丝/弹幕定时器未关停、250ms fixedDelay、长批不重叠、重启读取、格式错误发生在建库前。
3. 新建75房的测试最初把第一轮采集和seed放在同一秒，原幂等upsert使只有第二批11房产生第二个历史点。按storage的 `(monitor_id,captured_bucket)` 规则把合成时钟推进1秒后验证75房，不修改生产幂等规则。
4. 18项TS共享配置测试、17项Python portable校验、10项只读加载器覆盖及直接service.enabled守卫测试为补覆盖，不冒充新增RED/GREEN。配置是Core专属，不给Worker增加不需要的Pydantic配置读取器。
5. 独立复核发现已知配置错误在Core entry顶层await抛出，宿主拼接退出堆栈。新增真实entry/runtime/controller测试：仅Electron进程替换成隔离Node Worker MessagePort适配器，确实RED后修复。第二次复核指出正常stderr未转发，补 `stderr:true` 和合成启动警告再次RED，再按结构化错误码跳过已知配置错误的stderr追加，GREEN。
6. 测试构建产物使用.mjs消除夹具模块类型警告；Node Worker error事件的unknown经 `instanceof Error` 收窄，不改类型检查或隐藏警告。独立最终只读复核无剩余Critical/Important。

所有测试输入为合成房间/路径/错误，配置和SQLite均在D盘隔离目录。Node Worker适配器不是原生Electron UtilityProcess验收；不运行GUI、原B/S、真人平台，不使用用户数据库/凭据。不自动提交/推送、打包或重启已安装应用。

## 完整验证结果

最终 `. .\scripts\activate-environment.ps1; $env:VITEST_MAX_WORKERS='2'; .\check.cmd` 退出0：Node706（Contracts150、Storage19、Task3、Core270、Browser12、Realtime19、Desktop233），Python200；TypeScript/mypy、Black/isort（25文件）、Electron生产构建、D盘路径检查通过。本轮比基线新增48项Node和17项Python测试；并发限制仅当前进程，全部用例执行。

`git diff --check`、新增文件空白扫描、生产bundle测试标记扫描通过。项目Node/Python/esbuild/Chromium测试进程为0；原仓库仍fa2faa6且干净，客户端HEAD仍f100ebc，本轮未提交。没有变更依赖/数据库schema、用户配置/数据，或启动原项目/已安装客户端。

## 完整目标仍未完成

- M08其余配置：storageEnabled跨直播/榜单/弹幕/场次能力开关；default/min/maxIntervalSeconds、shortIntervalWarningSeconds；failureBackoffSeconds、requestMinIntervalMs、maxAttempts、retryBackoffMs；connect/readTimeoutMs、userAgent、referer及其他直播HTTP消费者。现有部分service选项存在不等于用户可配置链路完成。
- HTTP迁移必须一并核对Core/Worker/宿主请求时限，避免接口配置还未到时便被外层90秒/35秒超时截断；不能仅改HTTP客户端默认值。
- 完整signed Long/未知liveStatus/URL/字符串/非标准数字解析仍待对齐；原配置输入绑定的其他文本写法未声称全集兼容。
- M07真人扫码/原生验收，M09弹幕、M10榜单、M11场次与同刻不同时间拼写，以及M12–M18全量范围保持不变。本子项不代表全部配置或全部迁移完成。
