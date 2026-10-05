# M06 粉丝配置占位符与属性来源（2026-10-05）

## 范围与基线

继续原Web业务逐项迁移，本轮只接已有粉丝监控配置中的 `${NAME:default}`，不增加业务页面、AI功能、配置文件类型、表达式执行或服务端。原库 `D:\codex_work\BiliMonitor`，HEAD `fa2faa6c11c89376cd8e492856bdaf5cc58ac400`，只读且未启动；客户端 `D:\codex_work\bili_reptile\bili-monitor-desktop`，HEAD `b2e5a89c3d08c63e6a811567e69019b80b39bff7`，保留全部既有增量。

先读本机历史API资料 `bilibili-API-collect-new/docs/user/status_number.md`，它不是实时协议证明。业务依据是原 `BilibiliFollowerMonitorProperties.java`、`application.yml` 和 `BilibiliFollowerMonitorScheduler.java`：16项有效设置、10个YAML别名；Properties无storage字段；enabled/storage条件分别取Environment；Scheduled消费展开后的原文，而不是int getter。

## 原实现证据

原依赖为Boot3.3.6 / Framework6.1.15。独立审计使用D盘现成JAR与编译属性类，通过现成Groovy内存表达式调用真实Binder、Environment、条件和embedded resolver；没有新增Java源码、运行完整原应用、访问平台或业务数据库。

- [PropertyPlaceholderHelper](https://github.com/spring-projects/spring-framework/blob/v6.1.15/spring-core/src/main/java/org/springframework/util/PropertyPlaceholderHelper.java)先递归整段键和default，再查完整键，找不到才按第一个冒号拆默认值。default不是惰性的；空值存在时不回退；普通 `{` 参与嵌套匹配。循环失败、独立重复引用允许；未闭合保留且停止扫描该段。6.1不把反斜杠当escape，也不重扫替换拼接出来的新placeholder。
- [Binder resolver](https://github.com/spring-projects/spring-boot/blob/v3.3.6/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/PropertySourcesPlaceholdersResolver.java)允许未解析字符串保留原始外层token，普通bool/int转换随后仍会拒绝它；Header String可以保留合法未解析文本。[Environment](https://github.com/spring-projects/spring-framework/blob/v6.1.15/spring-core/src/main/java/org/springframework/core/env/AbstractPropertyResolver.java)默认严格。条件不能因enabled=false就跳过storage解析。
- Scheduled的[Configurer](https://github.com/spring-projects/spring-framework/blob/v6.1.15/spring-context/src/main/java/org/springframework/context/support/PropertySourcesPlaceholderConfigurer.java)有严格外层embedded解析，和直接Environment不是所有人工String输入都恒等；例如拼接成`${C}`后外层还会解析。但原delay先绑定int，这类文本已在Binder失败。本地已有delay有效域仍保持严格展开和原literal正十进制校验，不宣称任意embedded表达式等价。
- [SystemEnvironment](https://github.com/spring-projects/spring-framework/blob/v6.1.15/spring-core/src/main/java/org/springframework/core/env/SystemEnvironmentPropertySource.java)按原名、dots替换、hyphens替换、两者替换，再大写原名及同四候选取值。空串也是已存在的值。Boot attached来源另有modern/legacy/raw和enumerable适配；查询名自身不能无条件camel/snake正规化。Java初值不是属性来源：缺省maxAttempts为3，但`${app.bilibili.follower-monitor.max-attempts:2}`取2；YAML的default-interval-seconds可以引用到3600。

原JAR还证明canonical与去dash查询会因来源和mapper内部缓存产生不同结果，因此没有把所有来源提前拍平成一个converted对象。详见下面的桌面边界，不能把局部来源模型当完整StandardEnvironment。

## 实现与业务消费

| 层次 | 实现 | 本轮作用 |
| --- | --- | --- |
| 字符串语法 | `follower-configuration-placeholders.ts` | 纯TS共享语法、宽松/严格模式；无文件、数据库、网络、eval |
| 有界来源 | `follower-configuration-property-source.ts` | 仅已知16项做canonical适配；逐来源/查询取值，非本模块引用只走raw环境查找 |
| 启动loader | `bilibili-follower-collection-config.ts` | JSON先严格校验，保留原JSON显式字段；10项YAML文本与显式JSON是局部source，Java-only初值只作绑定缺省 |
| 消费校验 | 同一loader | 普通字段Binder宽松后转换；enabled/storage各自严格展开；storage仍是未trim条件而非普通bool；调度条件开启才严格校验delay原文 |
| 业务闭环 | 实际Core/SQLite、隔离Host、实际Python | 自动/手工/暂停、关闭8类方法、间隔落库、错误前不开库、修正后历史与文件不变；HTTP值通过现有契约传Worker |

文件类型/未知字段/null/int32/HTTP限制不放宽；JSONbool/int不接受占位符字符串，合法String字段可展开。未知字段/格式/类型错误不能靠环境覆盖掩盖。Worker不展开环境，不新增共享契约字段或另一套配置来源。加载失败仍返回稳定 `BILIBILI_FOLLOWER_CONFIG_INVALID`，不泄漏变量名、值或路径。

## 回归过程与复核

- Loader初始50项：38 RED / 12已有通过；补12项来源差异后62项为48 RED / 14已有通过。
- Core初始6项：5 RED / 1已有通过；Host新增2项均RED，原11项通过。
- 纯语法53项noop为49 RED / 4已有通过；来源51项noop为42 RED / 9已有通过，随后3项JAR证实边界先RED再修，来源共54项。
- 显式字段验证曾使用Zod `.partial()`；实际Zod4会给缺失字段补default，导致引用错误返回`3600/3`。已有回归再次RED后，改用经严格schema校验的原JSON own keys，恢复`3600/2`，没有伪造Java-only source。
- Core首个HTTP断言原本针对注入的合成Source，它不经过WorkerSource设置注入；改为已有固定httpx回放，验证真实Core→Python配置消费。趋势在refresh前断言1点，refresh后断言末点30，不假设不同实际时刻仍处于同一秒桶；未因此改生产采集逻辑。
- 第一轮冻结后Core定向7文件374项退出0；Host13项此前退出0，独立复审Core175/Host2通过。
- 收尾原JAR证实3种bracket来源并非等价：underscore纯`[DUEBATCHSIZE]`被System mapper转为scalar并接受；dotted的`[due-batch-size]`保留indexed类型而忽略；`DUE[BATCH]SIZE`拆额外层而忽略。客户端曾把后两者删标点拼成scalar。新增直接3项与loader3项均先RED（各2失败/1已有通过）后修结构区分，不作统一拒绝。来源直接测试57项，loader65项；最终Core定向4文件181项退出0。
- 实际网络仅在平台边界固定回放，不能算真人或原生Electron验收。

第一轮完整`check.cmd`退出0：Node1406/Python505；随后上述bracket差异已修，第二轮检查和最终复审结果见下一节。没有用第一轮绿色测试覆盖后来发现的差异。

## 最终收尾验证

修复后再次冻结，第二轮完整`check.cmd`退出0：**Node1412 / Python505**。Node为contracts285、storage19、task-engine3、core-runtime787、node-browser12、node-realtime46、desktop260；TS/Python类型、Black/isort、Electron生产构建、D盘路径检查全部通过。本轮比上一切片新增183份Node回归：helper53、来源57、loader65、实际Core6、Host2。Python业务/契约未改，仍505项；离线JAR探针不是repo测试数。

独立第一轮Core175/Host2通过；bracket修复后独立新增6项通过并再次用正确 `systemEnvironment` JAR入口确认原映射，无遗留可行动Critical/Important/Minor。额外dotted `[duebatchsize]`能匹配原scalar，说明不能把所有bracket统一拒绝；这项离线证据不冒充完整indexed语法覆盖。

最后`git -c core.autocrlf=false diff --check`通过，原库clean/HEAD不变；客户端HEAD不变、暂存区空、全部增量保留。生产新fixture标记0，项目Node/Python/Electron/Groovy残留进程0。没有访问真实平台/用户数据库/凭据、提交推送、安装包制作或已安装应用重启。构建成功不等于真人/原生验收。

## 保留在全量目标中的边界

本轮完成域是已有16字段的嵌套字符串语法、局部env/JSON/YAML来源及实际业务消费，不是实现完整Spring配置系统。没有新增YAML/CLI/JVM systemProperties入口；任意跨模块属性源、Boot Default mapper缓存的查询顺序效应，仅enumerable同层多等价来源冲突，以及完整indexed/bracket查询语法仍待专门核对，不以测试通过排除它们。原System mapper已知名称形式及上述3个indexed/scalar来源边界已补，不能笼统声称任意宽松名称全部等价。

M06正常profile昵称/头像、Long64、rootJSON、数字message和API日志failureMeta，M08完整响应/配置域，M09–M18仍未全部迁移。真人平台、原生密钥/保存、安装包验收也未完成。完整目标继续，原库不改不启动；未提交推送、不访问真实用户库/凭据、不重启已安装客户端，工具/缓存/测试/构建仍在D盘。
