# M06 粉丝资料文本与资料保留

原B/S fa2faa6只读，桌面HEAD b2e5a89保留全部既有增量；只处理粉丝已有业务，不启动原项目、安装应用或访问平台/用户数据库。先读本地API参考user/info.md的card段，再对照BilibiliApiClient、FetchedUserSnapshot、Repository和V2数据库迁移。

## 本轮范围

- 原optionalText：null/missing/container为空；字符串按Java isBlank判断，但非空白原样返回；bool为小写，整数十进制。浮点Double.toString精确格式、Long64/rootJSON属于后续完整解析项，不将Python str(float)视为等价。
- Python parser、独立只读profile、TS/portable契约、Core写入/查询不再误trim昵称；头像保存原非空白文本，不以URI验证把成功card当失败。独立profile和抓取结果没有160上限，存储的VARCHAR(160)域另行处理。
- 原VARCHAR(160)按Unicode字符计数；超出的字符全为ASCII空格才截到160，其余在本地存储边界失败，不能标为平台错误或触发relation回退。来源为原SQL及PostgreSQL16 character文档。SQLite既有库不重建，写入路径统一保护，transaction保留原子性。
- relation回退保留当前昵称、头像、主页三字段；正常card会替换昵称、清除缺失头像。原弹幕另有blankToNull.trim消费，不能因为粉丝不trim而全局删除弹幕trim。
- Renderer只把HTTP(S)/协议相对头像送给img，异常文本使用已有fallback；仅显示投影，不改原数据。保持现有布局/主题，不扩张页面。
- 独立复核要求补现有用户工作台消费兼容：默认昵称保留原粉丝值，输出仅按字符计160，原头像文本不因URL限制阻塞创建后读取；手工输入限制不放宽。用户工作台复用安全显示投影，不将本轮扩展为M14全量迁移。

## 测试与收尾

- [x] 共享profile文本golden：TS/Python/JSON Schema一致、原文保持、Java blank/NBSP、超过160的临时资料。
- [x] Python parser RED：首尾空白、空白集合、bool/int、container/null；fetched/profile都复核。
- [x] 真实Python HTTP合成边界→NDJSON→Core→SQLite：add/card更新、relation保留、头像清除、160补充字符、超长nickname在存储失败而非平台回退；补重开库与注入relation资料覆盖测试，共14项GREEN。
- [x] Renderer真实浏览器检查卡片/详情的安全头像fallback和原昵称；安全投影辅助方法单测，补读取真实生产CSP的HTTP头像RED/GREEN。
- [x] 现有工作台5项真实Core/SQLite操作与重启及5项Renderer输出先RED再GREEN，避免恢复原资料域后产生不可查询的已存对象。
- [x] 独立只读审查Critical/未关闭Important均0；最终check.cmd退出0，Node1505/Python544，类型/格式/Electron构建/D盘检查通过。原库clean、HEAD/index保持，生产本轮夹具0/项目残留进程0。
- [x] 更新本轮审计、台账/交接；全量M01–M18继续，不提交推送，不把该切片当整模块完成。
