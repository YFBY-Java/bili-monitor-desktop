# M06 粉丝配置绑定、条件启停与调度原文（2026-10-05）

## 范围与基线

原B/S只读 `D:\codex_work\BiliMonitor`，HEAD `fa2faa6c11c89376cd8e492856bdaf5cc58ac400`，开始及复核仍clean。客户端 `D:\codex_work\bili_reptile\bili-monitor-desktop`，HEAD `b2e5a89c3d08c63e6a811567e69019b80b39bff7`，保留所有既有未提交增量。这是已有粉丝功能的配置消费迁移，不增加新业务或配置入口。

本轮先读取本机API参考 `bilibili-API-collect-new/docs/user/status_number.md`；参考库是历史资料，不作为当前协议或真实平台验收证明。原业务主证据为 `BilibiliFollowerMonitorProperties.java`、`application.yml`、`BilibiliFollowerMonitorScheduler.java`、Service/Repository/Controller条件和服务手工/到期消费位置。

## 原实现及离线证据

原Spring Boot3.3.6、Framework6.1.15；D盘已有依赖与原target/classes属性类，在D盘JBR21.0.10上用现成Groovy内存表达式执行真实Binder、单属性bean的ConfigurationPropertiesBindingPostProcessor和ScheduledAnnotationBeanPostProcessor/ThreadPoolTaskScheduler。没有新增Java源码、启动原SpringApplication、访问生产数据库/平台API。临时、preferences、缓存均D盘；future取消、executor关闭。

- Properties与ApiClient无条件创建，primitive boolean/int绑定无效不能因存储/调度关闭而忽略。
- [原布尔转换器](https://github.com/spring-projects/spring-framework/blob/v6.1.15/spring-core/src/main/java/org/springframework/core/convert/support/StringToBooleanConverter.java)只做Java trim（首尾U+0000..U+0020）+ ROOT小写，八个别名；空输入转null后primitive转换失败。
- [原条件实现](https://github.com/spring-projects/spring-boot/blob/v3.3.6/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/OnPropertyCondition.java)没有havingValue时只排除未trim的equalsIgnoreCase false。storage不在Properties里，不能把它转换成普通布尔。Unicode long-s `falſe`同样关闭条件，但普通enabled绑定它仍失败。
- [原普通数字转换](https://github.com/spring-projects/spring-framework/blob/v6.1.15/spring-core/src/main/java/org/springframework/util/NumberUtils.java)调用trimAllWhitespace后选Integer.decode/valueOf；hex探测只跳过负号。遵守int32与[Character.digit(char,int)](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Character.html#digit(char,int))字符域，不把补充平面数字当UTF16 char接受。
- [调度原文](https://github.com/spring-projects/spring-framework/blob/v6.1.15/spring-context/src/main/java/org/springframework/scheduling/annotation/ScheduledAnnotationBeanPostProcessor.java)读取raw placeholder，而非属性getter；非Duration文本使用不trim的Long.parseLong。原delay先绑定int，Duration输入实际上不能通过。0/负数文本可解析，但[最终执行器](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ScheduledThreadPoolExecutor.html#scheduleWithFixedDelay(java.lang.Runnable,long,long,java.util.concurrent.TimeUnit))拒绝非正delay。
- 真实Binder及属性bean两路径均验证高优先级空字符串覆盖低层值时失败、不回退；YAML环境placeholder遇空字符串也失败。原Java缺失字段初值60000，实际application.yml默认1000；客户端继续使用有效YAML默认1000，不增加第二套入口。

完整原应用未启动，所谓通过只表示不被本切片绑定/调度阻断，不证明其他bean或数据库可启动。字符枚举使用JBR21，原target为Java17；所选37组BMP数字和明确字符边界有Java17文档语义支持，但本轮未现场运行Java17全应用。

## 客户端实现

| 层次 | 实现 | 规则 |
| --- | --- | --- |
| 严格本地文件 | contracts的InputSchema | 文件只读；先校验字段、类型、int32、HTTP限制；不让环境掩盖格式/类型错误 |
| 环境转换 | follower-configuration-values.ts | primitive布尔、原条件开关、普通int分开；显式Java空白/BMP数字、逐位有界累加；不依赖JS宽松trim/Number |
| 最终消费 | follower-collection-config.ts | 原16字段/10别名，规范名优先、空值保留；合并后检查启停，再按raw条件检查调度原文，开库/Worker前稳定安全错误 |
| 共享契约 | TS refine与portable JSON Schema allOf | normalized enabled/storage任一false允许int32非正delay；两者true必须positive；原raw环境语义额外由loader验证 |
| 业务闭环 | 真实Core/SQLite与隔离Host入口 | 存储关8类方法、停止自动仍手工可用、yes自动扫描/暂停、解析后的默认间隔落库、错误后修正/历史保留 |

原enabled=off/no/0或带空白FALSE时会创建空扫描调度，服务返回空结果。客户端延续只在normalized enabled=true时创建timer，避免无业务作用的空轮询；已保留原启动失败规则，不能因为不创建timer就跳过原raw delay校验。此处是本地内部调度适配，不改变平台请求、数据或业务输出。

JSON输入仍不是Spring字符串环境：不开放JSON字符串、null、未知字段，HTTP限制延续既有契约。有效int32 delay字段与启停组合分别校验，因此合法字段可被高优先级环境替换；默认开启delay0仍拒绝。关闭storage也不跳过普通属性绑定、HTTP限制或工作台依赖检查。

## 回归过程

- 第一轮Core定向129项：53项RED（含原存储/布尔/数字/条件延迟和Core消费差异），修正后129 GREEN。
- 共享契约新增9份golden case：TS及Python各5 RED后全部GREEN。更新后的TS配置43项、Python配置42项通过。
- 增补37组BMP数字、25种Java空白、long-s/负零边界；绑定159项通过。实际Core配置26项通过；自动采集新增断言最初误用followerCount，核对共享契约后改为currentFollowerCount，未修改生产采集逻辑。
- 隔离桌面Host配置11项通过（shell fork由Worker替代，真实Core入口/业务协议/SQLite）。新增raw delay错误在开库前返回稳定code；修改enabled精确false后恢复，带空白storage仍启用。

以上网络源只在平台边界合成，没有真实平台调用；SQLite、服务、排程、文件和Host协议为实际实现，不能等同真人/原生Electron验收。

## 收尾验证

冻结实现后的完整 `check.cmd` 退出0：**Node1229、Python505**。Node构成为contracts285、storage19、task-engine3、core-runtime606、node-browser12、node-realtime46、desktop258；TypeScript/Python类型、Black/isort、Electron生产构建、D盘路径测试全部通过。

对比上一轮Node1049/Python496，本轮新增Node180/Python9（共189）份repo回归，其中绑定159、真实Core11、Host1、共享golden TS9/Python9；四份旧存储环境测试改为原条件规则而不是作为新增计数。离线JDK/Spring probe和审查枚举不计入repo测试数量。

`git -c core.autocrlf=false diff --check`通过，原HEAD未变且状态为空；客户端HEAD未变、暂存区为空、所有增量保留。生产目录新测试标记匹配0，项目Node/Python/Electron残留0。没有真实平台或用户库/凭据访问、提交推送、安装包制作、已安装客户端重启。生产构建不是原生人工验收。

独立只读审查确认literal绑定实现，loader/binding173项另跑通过；458787项离线差分比较覆盖BMP字符、条件大小写、Java空白和原NumberUtils边界，无转换差异。该审查不代表未测试的Spring property-source展开或完整原应用通过。

## 未完成范围

本轮验证域为literal环境字符串转换；独立真实原属性bean probe确认，规范环境值enabled=`${SYNTHETIC_FOLLOWER_BOOLEAN:false}`、maxAttempts=`${SYNTHETIC_FOLLOWER_INTEGER:5}`在原Spring里分别解析false/5，而当前loader拒绝。这是明确未完成的嵌套placeholder差异，不是新业务/入口，也没有从全量目标中排除。

原[ConfigurationPropertiesBinder](https://github.com/spring-projects/spring-boot/blob/v3.3.6/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/ConfigurationPropertiesBinder.java#L180)传入[PropertySourcesPlaceholdersResolver](https://github.com/spring-projects/spring-boot/blob/v3.3.6/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/PropertySourcesPlaceholdersResolver.java#L55)做展开；Scheduled处理器也先embeddedValueResolver再toDuration。因此本文对原调度的raw一词指placeholder处理后的literal，客户端本轮尚未实现前一步；不要把本轮literal回归当作所有Spring输入完全等价。

M06完整正常profile昵称/头像、Long64、root JSON、数字message Double.toString和API日志failureMeta（message/biliCode）仍未对齐；M08直播完整响应/配置绑定、M09–M18依然逐功能推进。没有任意新配置入口、真人平台、原生保存/密钥/安装包验收。完整迁移目标继续，不以本子项标完成或暂停；不提交/推送、不重启已安装应用。
