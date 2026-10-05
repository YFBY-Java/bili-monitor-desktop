# M06 粉丝 Long64 全链迁移

原B/S `fa2faa6`只读；桌面HEAD `b2e5a89`，157条既有增量全部保留、index空。前一JSON子项是已验证进度；本轮不缩减完整Long64链路或M01–M18，亦不把完成基础组件冒充完整业务。无提交/推送、原应用启动、平台/凭据/用户运行库访问或安装工具，所有新产物D盘。

## 权威要求

先读本机card/关系API参考和原client/service/repository/DTO/SQL。原 `parseLong` 数值node.asLong：整数低64位回绕，Double先binary64后截断/饱和；字符串Long.parseLong不trim，允许ASCII符号/任意前导零/BMP十进制混写，越界无值。零/负计数有效，按原follower/following字段顺序回退。请求UID是正Long，响应UID是signedLong；不能把响应解析和持久化规则混为一谈。

原monitor.mid和Subject binding.mid必须正值，添加按响应MID upsert、返回已有行ID。刷新仅按monitor ID更新且保留monitor.mid；snapshot存响应MID，同秒冲突保留原snapshot MID/ID。原四个计数列均无非负CHECK。relation仅保留资料，不保留缺失following。delta用signed64回绕，growth按已回绕delta转Double除previous；Subject24h同规则。

## 表示与兼容

- 内部计数统一BigInt，SQLite INTEGER精确绑定/读取；小的interval/version仍number。所有JSON/outbox/Worker/Core/IPC精度字段转canonical十进制字符串，禁止先Number后字符串。
- 通用RuntimeEnvelope仍v1，新增业务`*.v2`请求/响应和共享v2 schemas；旧v1 schemas/方法保留为显式safe numeric适配器。v1无法表达的值明确失败，不截断、不把safe53限制施加到新生产链。
- 新生产Core/Worker/Main/Preload/Renderer以及Subject消费走v2；内部Subject add/bind不能绕回v1数值检查。图表仅在绘制坐标的展示边界转Number，提示/文本/排序/领域运算保留精确值；不可回流显示近似值。
- SQLite追加v14，只删除多加的四个计数非负CHECK，保留历史migration。monitor/binding正MID规则不放宽；child snapshot MID本来无正CHECK，无需重建Subject binding。保留rowid/所有列/索引/trigger/FK/证据/outbox，失败原子回滚，重开幂等。

## 执行和证明

- [x] 新鲜核对仓库、台账、原源码和Long64/身份/派生算术证据；现成Groovy/Jackson2.17.3/JDK20内存golden，不写Java源码。
- [x] Shared Long string值域/v2 follower+Subject DTO/portable Schema/legacy adapter；TS/Python同golden先RED。
- [x] Python原数值转换和v2输出实际验证，旧v1路径不静默舍入；错误/成功后的Worker持续存活。
- [x] v14迁移及五类精确reader/BigInt写入、MID身份；真实稀疏rowid旧库升级/索引triggerFK/绑定/回滚/重开先RED。复审跨表trigger/view及原PRAGMA设置已追加RED/GREEN。
- [x] Core精确共同业务与v1出口适配、原delta/growth和Subject24h；添加响应MID复用/刷新signedMID/同秒冲突/失败历史保留；补latest2000基线和六个JVM算术golden。
- [x] v2路由、Main/Preload桥接契约及Renderer文本/排序/合计/趋势/提示和Subject消费者回归。原生Electron/安装客户端手工验收继续保留，不以carrier代替。
- [x] 实际合成HTTP→生产Python→NDJSON→Core→D盘SQLite→typed Preload链路，值大于safe53、Long两端、负数、相邻大数及回绕差分验证。Controller carrier单独验证，非原生Electron全链。
- [x] 独立只读复审、完整check、D盘/生产fixture/进程/原库/index保护，更新审计/台账/交接。最终 Node1807/Python1003，全检查退出0；首次两轮失败和测试隔离缺口如实记录，原生/真人及整模块剩余项不勾完成。

未完成项必须明确记录；默认recycler/JVM/charset异常/TEXT编码/Double文本等既有差异和M08–M18仍保留，不因本轮Long64缩减目标。
