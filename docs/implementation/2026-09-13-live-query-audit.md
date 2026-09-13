# M08 直播查询子项审计

## 范围与原依据

- 原 B/S 只读基线：`D:\codex_work\BiliMonitor`，`fa2faa6`；客户端本轮起点 `27c1297`。
- 原源码以下以 `social-data-monitor/` 为根：`backend/src/main/java/com/socialmonitor/bilibili/live/controller/BilibiliLiveMonitorController.java`、`service/BilibiliLiveMonitorService.java`、`repository/BilibiliLiveMonitorRepository.java`（后两项同属 `bilibili/live/`），以及 `frontend/src/views/bilibili-live/BilibiliLiveView.vue` 的列表和趋势加载。
- 本项仅迁移列表、汇总、单房/多房历史和事件查询。没有启动或修改原工程，没有访问用户数据库、凭据或真人平台。

## 原业务到本地实现

| 原语义 | 本地实现与证据 |
| --- | --- |
| 列表不分页；状态、直播状态、热度、插入顺序排序 | `ControlDatabase.listBilibiliLiveRooms(limit?)` 默认无 LIMIT，最终按 rowid；反向 UUID 与 505 房间重开回归 |
| 汇总/缺省全房趋势不截断，暂停不改直播分类 | Core 默认读取全列表；指定 IDs 保留顺序及重复，缺失房间报错 |
| 历史缺省/非正数 500、正数封顶 2000，最近 N 点升序 | 共享 Zod 归一化，真实 SQLite 写入 2005 个秒桶验证数量、顺序、房间隔离与 recentTrend 投影 |
| 起止包含真实时刻，支持偏移；倒置为空 | UTC 秒级索引粗筛加九位小数比较键；覆盖 Z/.000Z/.000000Z、+08:00/-04:00、微秒边界与单边范围；不改历史 migration 或存量数据 |
| 事件默认 20、夹到 1..200、最近在前 | 共享归一化及真实服务生成 205 次状态变化回归；汇总最近事件保持一致 |
| 页面能够读取已有全部房间 | Live 页面及 Subject 绑定查询取消隐含 limit；真实 Connected 浏览器选择第 505 房及绑定候选项 |
| 窄化桥接仍校验输入和结果 | 实际 Preload → JSON 往返 → Core Router → LocalCoreRuntime → 隔离 SQLite；验证归一化、边界、无效输入不进入传输及重开查询 |

共享输入包括 27 个 TS/Python golden fixtures，另覆盖 505 个 IDs；JSON Schema 与当前 Zod 的 UUID、ISO 日期接受域及安全整数范围对齐。Python 仅验证契约输入，不新增本地查询服务。TS 回归额外验证归一化幂等和 Schema 漂移。

## 差异回归与审查

- 实现前已复现隐含截断、数量归一化和时间边界差异；新增 39 项 Node 测试（契约 29、Core 7、桥接 1、浏览器 2）及 28 项 Python 测试。
- 独立只读审查指出跨语言极端日期/UUID/整数接受域不一致，已补共享输入并对齐 Schema，重要问题复查关闭。
- 大列表浏览器测试曾因整页 role 定位遍历约 4 万节点超时；定位缩小到测试导航，不增加动作超时、不强制点击。505 房间初始渲染仍有约半秒长任务，列入 M08 UI 性能待办。
- 提交前复现新桥接测试跨包引用内部 fixture 的 TS6307；改为当前测试内使用公开 `ControlDatabase` API 构造合成数据，不扩大 tsconfig、不导出内部测试文件。桌面类型检查及该集成测试通过。

## 本次验证

- 提交前完整 `check.cmd` 退出 0：Node 493 项（契约 89、存储 17、任务 3、Core 181、Browser 12、Realtime 19、Desktop 172）、Python 105 项；TypeScript/mypy、Black/isort、Electron 生产构建及 D 盘路径检查通过。
- 检查期间另修正新 Python 测试的一处 Black 换行格式后，从头重跑通过。`git diff --check` 通过，生产包没有本轮查询 fixture，未发现测试 Realtime Worker 残留；原项目仍为 `fa2faa6` 且工作区干净。
- 原生 Electron 传输、真人平台、安装包和用户存量库不在本轮自动测试证据内；浏览器为测试夹具，外部采集响应为合成数据。

## 保留的待办

M08 仍需核对/迁移资料回填与重新添加、重试与来源错误、批采集和退出取消、事件时间、Python 解析字段，以及展开详情/倒计时/1–4 房趋势布局与图表等完整 UI。M09–M18 及 M07 真人/原生验收不因本子项通过而完成。具体差异见本轮计划 `docs/superpowers/plans/2026-09-13-live-query-migration.md` 和全量迁移台账。

以上为查询子项交付时的待办。后续Core采集/快照修正见[采集审计](2026-09-13-live-collection-audit.md)；当前未完成范围以全量迁移台账为准，Python/生命周期/完整UI仍待完成。
