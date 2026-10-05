# M06 粉丝 JSON 响应与失败链路

原B/S `fa2faa6`只读，桌面`b2e5a89`保留全部147条既有增量；不启动原应用、提交/推送、访问平台或用户运行库，所有测试和工具路径D盘。

先读本地`user/info.md`用户名片段与原`BilibiliApiClient`及测试。现成Jackson2.17.3/compiled client的只读内存探针确认：合法scalar/array/null及直接字符串空输入经过code缺失门为UNKNOWN，不是PARSE；只读首个JSON值但数值/literal的首次词法边界仍验证；重复字段最后值胜出；非标准常量、坏格式及默认读取约束失败为PARSE。HTTP零字节与直接字符串空输入有区别；Spring按Content-Type解码且替换非法字符，不能让UnicodeDecodeError终止Worker。

本轮不将已确认的Long64差异改成safe53bit：该项涉及新共享契约、SQLite迁移/精确读写、Core溢出运算和Renderer/Subject消费，将按完整链路单独迁移。Double文本格式、完整HTTP编码别名/异常分类和其余M01–M18也仍属全量目标。

## 实施与证据

- [x] 原JSON golden与已审计约束回归先RED：根值分类、首值/词法、重复字段、标准拒绝、数字/字段名/字符串/1000层嵌套；默认共享recycler仍追续，不把fresh4000当完整接受域。
- [x] 使用标准库字符串解码和显式容器栈，避免Python递归或全局integer guard改变；限定本接口原读取规则，不新增通用配置/依赖。
- [x] HTTP空体、JSON/文本默认charset与显式UTF8/Latin1、替换无效字节回归先RED，再接安全错误边界；完整charset/MIME异常链仍追续。
- [x] 合成HTTP→真实Python/NDJSON→Core/SQLite，验证UNKNOWN不重试/回退/写快照、PARSE一次后relation、首JSON成功更新、既有资料与历史保留、Worker持续存活。
- [x] 独立复审复现合法UTF16转义Worker退出与临时profile无关联错误；实际同循环两请求与同进程第三次请求先RED，再修复统一ASCII出口和严格非空资料校验。
- [x] 已观察Java20.0.1的两个新增BMP identifier点先RED再修复，BMP65536点离线穷举0差异；pom target17与Java17差异单列，不能冒充全JVM兼容。
- [x] 独立复审、完整check.cmd、D盘/生产fixture/残留进程/原库与index保持；默认recycler Important仍保留，不能宣称全接受域完成。
- [x] 更新审计、台账、交接；不以本轮JSON子项当M06或全量完成。

审计见 `docs/implementation/2026-10-05-follower-json-response-audit.md`。新repo回归Node26/Python170；最终完整check退出0：Node1531/Python714。默认recycler共享执行通道、其它JVM基线、PG/SQLite文本编码和Long64完整链均保留在全量目标。
