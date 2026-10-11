# 榜单三类响应字段选择（2026-10-07）

## 原业务与实现

先读取本地 API 参考 `docs/live/guard.md` 与 `docs/live/user.md` 对应榜单段落；实际业务以只读原 `BilibiliLiveRankApiClient` 为准，不把历史接口说明当当前协议证明。

原主榜只读取 `item/count/count_text/config`；备用在线榜只读取 `OnlineRankItem/onlineNum/onlineNumText`，固定在线贡献类型、REALTIME、unsigned、贡献值及备用说明。客户端原来交叉回退数组、人数和说明，可能把错误字段当有效记录保存。现按实际端点区分，非数组列表为空，不臆造主榜缺失数据。

原 `firstPresent` 仅跳过 null/missing，空对象、数组及标量都阻止后续候选；它们不存在的子路径保持缺失。现先选该候选，再读取对象子字段，修复此前“第一个非空对象”错误回退。大航海 num_text 缺失时采用已经解析的 num 的字符串，不使用原始小数或布尔标量文本。

只改 Python 解析选择，没有改 HTTP/WBI/cache、API分类、完整CAS字节、三阶段保存、schema16、UI、超时、并发或数字解析 helper。完整 Long64/逗号/有符号整数转换仍为接续项，不能把本片算作精确数值已经实现。

## 少量验证与复核

唯一新增实际 Core→Python stdio→SQLite 流程（只回放 HTTP I/O）：完整四响应共享 fixture 检查空/标量/null/第三候选、主榜错误形状不混备用字段、真实主榜错误→备用榜、固定说明和 parsed guard 人数文本，精确检查存在和缺失字段、落库条目、日志、真实CAS/hash及数据库重开。扩充既有 Python parser case 使用同样四响应并验证 portable schema，没有扩测试矩阵。

实际 Core/Python 先 RED（错误 firstPresent 回退）后 GREEN；Core代表1、Python原rank文件6、mypy20源、全workspace TS、三个相关Python源Black/isort、当前生产build通过。五路径 true-before/final manifest/diff/brief 在 `.tools/temp/20261007-rank-response-fields-*`。限定只读复核 C0/I0/Minor0；收尾五个 hash/字节重新匹配。前 API/TEXT 冻结仅对应各自收尾版本，后续同名源增量不覆盖历史边界。

当前生产隔离 Electron 五业务页/真实IPC/单Core重启/资料文本及JSON保留/退出自有PID0通过：`.tools/temp/bmd-production-final-w3h8a0`，Core70488→66492。自动采集/OAuth关闭，无用户库、真实凭据或平台请求，不是原生保存或安装验收。

## 阶段终态与接续

一次 `check.cmd`（session53732）终态 exit1：Core1043/1046，三个既有超时分别为101弹幕连接、2004粉丝刷新、501工作台创建；原预算/并发/持久性均未修改。Task3/Contracts511/Storage77/Realtime162/Browser12通过，新榜单流程通过；Desktop和后续未由该命令执行，历史冷桌面失败未关闭。

下一项完整榜单数值链：原 parseLong 对文本去逗号但不 trim、数值按 Jackson Long 转换，parseInteger 为 Long.intValue；score/total_count 是 BIGINT。当前 Worker/公开契约/SQLite读出与Renderer还没有完整的签名64位精确链，需要追加版本化出口，保留旧安全出口，不能只修改解析器或四舍五入。榜单条目物理JSONB、布局保存失败策略、性能/桌面稳定性、真人原生/最新安装以及全量目标仍 OPEN。原 B/S 干净只读，累积工作区/空 index 保留，无提交推送。
