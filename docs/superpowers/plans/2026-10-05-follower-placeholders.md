# M06 配置占位符迁移计划

目标是把原粉丝监控已有配置的 `${NAME:default}` 展开迁移到本地Core，不增加配置文件类型、设置入口、服务端或执行表达式。

原基线fa2faa6，客户端b2e5a89，所有既有增量保留；原B/S只读、不启动、不使用用户运行库或真实平台。工具、缓存、测试和产物仍在D盘。

## 依据与模型

Spring Boot3.3.6/Framework6.1.15有三种消费：Properties Binder允许保留无法解析的占位符（随后primitive转换可能失败）；Condition对enabled/storage分别严格展开，不能短路跳过失败；Scheduled先严格embedded展开再消费delay字符串。外层Scheduled与Environment并非所有人工String域都相同，但拼接出的placeholder不是int，已有delay先在Binder失败。嵌套键/default先解析，default不是惰性；查完整键后才按第一个colon拆默认值。循环引用失败，重复独立引用合法，未闭合原样保留，反斜杠不是6.1版本的escape。

Core只读JSON保持类型/字段/HTTP限制；合并环境后建立未转换值，再展开并转换。原YAML的10个默认属性可被引用；仅Java初值而非属性source的HTTP/maxAttempts等缺省值不能被冒充成可引用source。本地JSON显式设置作为对应本地source。解析结果只进入现有typed契约，Worker不读取环境或处理占位符。

## 文件与接口

- 新增 `packages/core-runtime/src/follower-configuration-placeholders.ts`：纯字符串处理，无文件/数据库/Electron/网络依赖。`resolveFollowerPlaceholders(value, lookup, strict)`共享语法、两种失败模式；`lookupFollowerEnvironment(environment, name)`保持SystemEnvironment原候选顺序。
- 新增 `packages/core-runtime/src/follower-configuration-property-source.ts`：已知16字段的逐来源/查询适配，第三参数显式限定名称，未知引用只查raw环境；不拍平属性来源，不模拟JVM/systemProperties/cache与同层多等价enumerable冲突，剩余域留在全量台账。
- 修改 `packages/core-runtime/src/bilibili-follower-collection-config.ts`：保留显式输入字段，建立既有字段的effective raw source及canonical引用；Binder、Condition、Scheduled分别调用解析器。
- 新增 `packages/core-runtime/src/bilibili-follower-placeholders.test.ts`：只读loader/合成环境，覆盖实际配置输出，而非mock函数计数。
- 新增 `packages/core-runtime/src/bilibili-follower-placeholders.integration.test.ts`：现有平台边界合成fixture，真实Core/SQLite；验证存储关闭、手工与自动采集、间隔落库、错误前不开库与修正后保留历史。
- 修改 `apps/desktop/src/main/core-startup-configuration.test.ts`：真实隔离Core入口/Host的安全错误与修正恢复。
- 更新development、全量台账、交接和本轮audit，区分已验证项与完整解析/M08–M18/真人原生验收。

## 执行

- [x] 先写loader/业务/Host失败测试，并分别确认RED来自未展开值，而不是拼错契约字段。
- [x] 实现独立解析器和raw property来源，再同步三个消费语境；不把所有值强制成同一种模式。
- [x] 定向GREEN并只读独立复审；发现差异先补失败回归后修。（来源bracket差异先RED后修，最终复审6项及真实JAR一致）
- [x] 冻结代码运行完整check.cmd，核对原库clean、HEAD/index不变、D盘路径、生产无fixture与无残留进程。（第二轮Node1412/Python505退出0）
- [x] 更新进度，不提交推送，不把此配置功能当整个迁移完成。（bounded来源与完整Spring边界仍区分；M01–M18目标继续）

运行命令：

```powershell
. .\scripts\activate-environment.ps1
$env:VITEST_MAX_WORKERS = '2'
& $env:BMD_PNPM_CMD --filter @bmd/core-runtime exec vitest run src/bilibili-follower-placeholders.test.ts src/bilibili-follower-placeholders.integration.test.ts
& $env:BMD_PNPM_CMD --filter @bmd/desktop exec vitest run src/main/core-startup-configuration.test.ts
.\check.cmd
```
