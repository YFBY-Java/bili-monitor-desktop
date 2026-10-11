# 直播 HTTP 响应文本与错误域迁移（2026-10-07）

## 原业务与实现范围

只读对照原 `fa2faa6` 的 `BilibiliLiveApiClient` 构造器/get方法和 `BilibiliLiveMonitorService` 采集、重试与失败记录；先读取本地API资料 `docs/live/info.md`。原项目没有新增修改或启动，客户端仍是完全本地架构。

原 Boot3.3.6 使用 Framework6.1.15；RestClient先验证Content-Type，再执行HTTP状态处理，成功后才转换String。显式charset优先，JSON兼容类型默认UTF-8，其它/缺失类型默认ISO-8859-1。依据为 [Boot版本声明](https://raw.githubusercontent.com/spring-projects/spring-boot/v3.3.6/gradle.properties)、[DefaultRestClient](https://raw.githubusercontent.com/spring-projects/spring-framework/v6.1.15/spring-web/src/main/java/org/springframework/web/client/DefaultRestClient.java) 和 [String转换器](https://raw.githubusercontent.com/spring-projects/spring-framework/v6.1.15/spring-web/src/main/java/org/springframework/http/converter/StringHttpMessageConverter.java)。这是对应版本源码核对，不宣称新做了原服务/JVM运行实验。

- 抽出已有Follower转换器的头验证与正文解码，Follower调用顺序和行为保持；直播四端点接入同一规则，不再一律严格UTF-8。
- 字符替换仅作用于解析文本；证据仍保存原始响应字节。成功空体仍为PARSE；解析及原共享业务校验均成功后才归档。
- 非法MIME/charset安全返回现有 `BILIBILI_RESPONSE_CONVERSION_ERROR`，Worker继续存活，不输出上游头/正文/堆栈。Core在失败API日志与重试之前映射INTERNAL_ERROR；外层不进入监控失败/退避更新。之前已成功的API调用和CAS保留。
- 普通HTTP失败使用原 `Bilibili live HTTP <status> from <endpoint>` 文案，原分类与重试规则保持。没有新增契约、schema、UI、配置、身份/计数/日期规则或业务服务端。
- 正常UTF-8 JSON回放显式声明application/json；不以缺失响应头夹具掩盖原Latin-1默认值。测试删除只作用于校验过的D盘专属目录。

## 定向验证

仅新增两个Python分组场景和一个实际Worker/Core/SQLite流程；复用现有用例，不铺端点×编码矩阵，不运行阶段整套check。

1. 初始Python选择5项均失败：原HTTP文案、Latin-1正文与非法charset503优先级均揭示真实差异。实际Core流程先因严格UTF-8失败。
2. Python修复后5项通过；同一实际Core流程明确失败于转换错误被当成平台失败。随后Core加内部错误分支，最终3个实际流程通过、5项过滤；Python最终24项通过（含已有共享Follower解码17项），过滤项不计通过。
3. 实际流程验证指定编码资料落库、完整监控/快照/状态事件/outbox不变；刷新前成功日志保留，仅前置成功status日志增加，没有失败日志、回退或重试。CAS原始字节、Worker后续ping、SQLite重开均验证。测试表名及既有错误文案前缀两处预期已按实际结构纠正，未删除断言。
4. Core类型、三个生产Python源mypy和五文件Black/isort均exit0。最终Desktop web/node类型与生产构建exit0。
5. 新D盘 `.tools/temp/bmd-production-final-6UIb6c` 实际Main/Preload/Renderer/Core ready/schema16、精确Live/Subject桥接、平台注册表、单Core启动/重启和正常退出通过，记录PID残留0。自动采集/OAuth关闭，无真实平台、用户库或凭据；不是目录包、安装或真人验收。

任务前488个源路径仅7个声明文件变化，直播收尾时最终review-v1（38,637字节）与当时hash一致，其余481个源保持；限定空白检查exit0。LF→CRLF仅Git换行提示。材料在D盘 `.tools/temp/20261007-live-response-text-{brief,review-v1}.md/txt` 及同前缀before/manifest.json，不能用整个未提交工作区替代本项差量。

## 收尾与剩余范围

独立限定复查已结束：切片质量可接受，无Critical/Important/Minor；直播任务收尾时7文件hash与冻结manifest一致，Follower提取、Live状态/转换次序、Worker错误帧以及Core外层失败处理均已逐处核对。复查未重复运行测试/构建/进程，执行证据由root提供；本记录不宣称全量验收。后续Rank响应转换已独立完成，见[榜单审计](2026-10-07-rank-response-text-audit.md)；Rank继续修改共享runtime.py，因此上述7文件hash是直播收尾时记录，不冒称仍为全部当前hash。完整Java编码别名、共享nav、其它解析字段/配置、JSONB/原部分提交、阶段全量回归/历史问题、性能、最新独立目录包及真人/原生验收仍未完成。

直播实施阶段用户已恢复完整迁移目标；该段只记录当时状态。最新用户要求在本功能收尾后暂停并记录进度，权威状态见[交接快照](2026-09-13-migration-handoff.md#当前进度快照2026-10-07)。不重派已完成存储/响应归属/数字文本/Live计数/导出任务。原库只读、项目工具和数据在D盘、未提交推送。
