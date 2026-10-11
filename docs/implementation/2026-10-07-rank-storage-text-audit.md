# 榜单直接文本保存（2026-10-07）

## 原业务与实现

对照只读原 `BilibiliLiveRankApiClient.optionalText`、`BilibiliLiveRankRepository` 和 V8：抓取保留完整非空白文本，保存时提醒/昵称截512个UTF16单元，勋章/到期文本截128个，之后由既有UTF8编码适配处理孤立单元；完整emoji不变，截断产生的孤立单元变`?`。头像文本不截断、null保留。人数/数值说明不是Java截断字段，而是VARCHAR64的隐式赋值。

新增 `rank-storage-text.ts` 复用既有编码器；人数/数值说明按编码后的Unicode字符计数，只有超出64的ASCII空格可裁掉，否则在快照保存点失败。规则依据为 [PostgreSQL16字符类型](https://www.postgresql.org/docs/16/datatype-character.html) 和原驱动 [Encoding](https://raw.githubusercontent.com/pgjdbc/pgjdbc/REL42.7.4/pgjdbc/src/main/java/org/postgresql/core/Encoding.java)。fetched TS及portable定义不提前拒绝这些长文本，stored Snapshot/Summary容纳64个Unicode字符，而不是错误地限制64个JS单元；条目公开长度约束保持。

转换在已迁移的相应SQLite阶段内部，成功请求日志/CAS先保留，快照字段失败不会删除旧条目，条目转换仍属于条目批次事务。未修改普通解析、JSON原文、三阶段提交、schema16、历史、并发、同步持久性或UI。

## 少量验证与复核

仅新增一个实际 Core→Python stdio→SQLite 流程，HTTP I/O回放：两个榜单、四处astral边界截断、完整emoji/头像、原始CAS/hash、超长人数说明失败后的旧快照/条目/成功日志保留，以及停止后重开。已有TS和Python case复用同一完整 `rank-storage-text.json`。初始网络夹具缺UTF8 header，已在生产修改前纠正；明确UTF8的实际RED→GREEN记录保留，不把夹具错误冒充业务修复。

收尾Core代表1、Contracts3、Python既有1、全workspace TS、机械Black/isort与当前生产build通过。十源真before/最终manifest/diff/brief在D盘 `.tools/temp/20261007-rank-storage-text-*`，有限只读复核C0/I0/Minor0，结束hash/字节无漂移。本冻结只对应本片版本，后续同名共享源修改独立记录。

当前生产隔离Electron五页/真实IPC/单Core重启/文本JSON保留/退出自有PID0通过，目录 `.tools/temp/bmd-production-final-dax3Wg`，Core69540→70444。没有用户库、真实凭据或平台请求，不是原生保存/安装验收。

## 阶段结果与下一项

一次 `check.cmd` 已终态exit1（session26459）：Core1042/1044，剩粉丝2004刷新30秒和Subject501创建5秒既有超时；Task3/Contracts511/Storage77/Realtime162/Browser12通过，新增文本和既有原文/提交链流程通过。Desktop及后续未由该命令执行，旧桌面冷回归失败未关闭，不放宽预算/并发求绿。

下一个已查实差异是普通榜单API错误：原接受`code`数值文本、把-101归AUTH_EXPIRED、-500标可重试并保存原错误信息；客户端尚未全部对齐。数值Long64/其它字段、完整JSONB物理兼容、布局策略、性能/桌面稳定性、真人原生及最新安装仍OPEN。原B/S只读、累积工作区/空index保持，无提交推送或全局记忆写入，全量目标active。
