# M06 正常粉丝资料文本与资料保留审计

## 基线与来源

原B/S `D:\codex_work\BiliMonitor` HEAD `fa2faa6c11c89376cd8e492856bdaf5cc58ac400`，只读、未启动；桌面 `D:\codex_work\bili_reptile\bili-monitor-desktop` HEAD `b2e5a89c3d08c63e6a811567e69019b80b39bff7`，全部既有增量保留。

先读取本机历史API参考 `bilibili-API-collect-new/docs/user/info.md` 的用户名片段（518–715）。此参考并非当下协议证明，响应宽容规则以原代码为准：

- `BilibiliApiClient.java:67–85,202–211`：name必需，face可选；null/missing/container视为无值，非空白scalar文本不trim。
- `BilibiliFetchedUserSnapshot.java:17`：relation回退无条件保留已存昵称、头像、主页，更新计数。
- `BilibiliFollowerMonitorRepository.java:64–130` 和 `V2__bilibili_follower_monitor.sql:4–6`：昵称参数直接写VARCHAR(160)，头像TEXT；未显式cast，不在parser限制长度或URI格式。
- 原 `BilibiliLiveDanmakuService.java:585,600–605` 有独立Java trim消费；不能借粉丝原文保留删除弹幕自己的trim规则。

独立只读审计调用现成D盘compiled client/Jackson2.17.3与Groovy，在内存中验证optionalText/requiredText和parseCardResponse；未新增Java源码/编译工具链，未启动原应用、平台请求或数据库。JBR21探针的浮点输出不能代替原target17全部Double语义。

## 本轮实现

1. Python与共享TS/portable Schema保留非Java-blank原文；布尔值小写、整数十进制；object/array不再转Python repr，NBSP/figure-space/narrow-NBSP/NEL/BOM/零宽空格不再误当空值。
2. 临时profile和FetchedSnapshot不再套用存储160上限；Monitor按Unicode codepoint计数，不按JS UTF-16单元拒绝合法160个emoji。三层文本golden同时由TS、Python/Pydantic和JSON Schema验证，仍strict且不增加字段。
3. `follower-profile-storage-text.ts` 在Core唯一写入的存储事务里适配原VARCHAR(160)：保留160字符内原文；仅超出的字符全为ASCII空格时截取，其余本地写入失败，不能被改成远端失败、重试或relation回退。规则依据[PostgreSQL16字符类型](https://www.postgresql.org/docs/16/datatype-character.html)。SQLite schema不变、不重建既有库；写入错误原子回滚监控/快照/事务outbox，已成功的API日志和关联证据保留。
4. card正常更新原文，并清除缺失/空白/容器头像；relation按端点明确保留当前三个资料字段，即使注入源意外夹带新资料，也不覆盖旧资料。
5. 卡片和展开详情共享`safeFollowerAvatar`，仅显示HTTP(S)/协议相对图片，危险协议/无效文本/带userinfo地址使用已有fallback。保存字段不变；显示时规范化URL，当前生产CSP白名单的i0/i1/i2.hdslb.com及archive.biliimg.com HTTP升级HTTPS。生产CSP本身不放宽，其他不在白名单的外部图片仍可能回退。
6. 独立复审又定位现有用户工作台的消费不兼容：Subject输出仍URL/UTF-16校验，创建先落库后get时失败，可能产生不可查询的对象。已对照原`SubjectService.java:324–361`（判断有值后返回用户原昵称/头像）、`V5__subject_monitor.sql:3–4`与Workbench user投影；仅调整Subject输出和绑定粉丝头像输出，默认昵称直接复用已合法保存的粉丝原名。手工Create/Update、主页和直播字段限制保持；工作台头像复用安全投影。此兼容修复并非M14整模块完成；M16是独立的平台适配器与run-once项。

共享v1包的请求、方法、字段和序列化形状未改变；已有正常golden仍验证。响应域按原parser恢复（无额外长度/URI变换），Monitor只在持久化域检查160字符；模型判断Java blank拒绝的是生产parser本来也不会产生的空值，不把Parser输入scalar直接当typed字符串接收。Core/Worker/Renderer同仓更新，无独立HTTP服务端或额外依赖。

## RED/GREEN 与复核

- 共享TS39项中15项先RED；Python新增39项中13项先RED。其余是原已通过域或补覆盖，不把整个测试数都称为新RED。
- 实际HTTP合成边界→生产Python parser/runtime→NDJSON→Core→真实D盘SQLite：首12项RED后GREEN；存储连入前再单独确认2项RED（超空格写入后投影失败、超长刷新误成功）；新增关系源夹带资料用撤回自身一行修复确认RED，再恢复GREEN。补重开SQLite覆盖，共14项GREEN。
- storage纯模块14项RED→GREEN，按字符计数/ASCII空格例外/固定安全错误。
- Renderer4项真实浏览器RED→GREEN，验证卡片与详情都不创建危险img且昵称textContent原文保持。
- 独立复审发现生产HTTP头像被CSP拦截；使用systematic-debugging，读取真实生产HTML的CSP注入浏览器，完整拦截图像请求：2个HTTP浏览器案例及4个辅助案例先RED，协议相对案例本来通过；仅显示投影升级白名单HTTPS后3个CSP案例通过。浏览器完整20项+辅助18项共38项通过；未访问真实CDN，不把此测试当原生安装验收。
- 独立最终只读复审：Critical 0、未关闭Important 0；上述CSP与工作台两项Important均关闭。独立定向143项通过，不与主线程全量数量重复相加。
- 工作台兼容补丁：5项实际Core/SQLite创建/get/list/workbench/重启RED→GREEN，5项Renderer静态输出RED→GREEN；NBSP、160补充字符、首尾空白、协议相对/异常/布尔头像均覆盖。原工作台Service2项与Renderer2项既有用例保留。

## 验证与剩余

首轮完整check退出0：Node1495/Python544。工作台兼容修复后重新执行最终完整`check.cmd`，终端退出0：**Node1505/Python544**（contracts315、storage33、task3、Core806、browser12、realtime46、desktop290）。TS类型、Python格式/类型、Electron生产构建与D盘路径检查均通过。相较上一切片Node1412/Python505，本轮新增Node93/Python39；不将全部新增覆盖都称为先RED。

最终生产bundle本轮fixture标记0、项目Node/Python/Electron/Java/Groovy残留0，`git diff --check`通过，新文件尾空白0。原B/S仍`fa2faa6`且clean；历史API参考仍`271b123`且clean。桌面HEAD仍`b2e5a89`、暂存区空，既有和本轮增量全部保留。

已核验的普通String/bool/int资料切片不等于全部解析：Double.toString（正常资料及message）、Long64/rootJSON/完整属性源、NUL/编码/孤立surrogate的数据库域、弹幕Java trim与JS trim的Unicode边界、API日志failureMeta继续保留。M08剩余与M09–M18、真人平台/OS密钥/安装包验收全部仍属于全量目标。

没有提交、推送、打包、重启安装客户端或访问用户运行库；工具、缓存、临时数据库/截图、测试及构建产物全部在D盘。下一项按台账继续完整数值/JSON解析，不把本轮当整模块或全量迁移完成。
