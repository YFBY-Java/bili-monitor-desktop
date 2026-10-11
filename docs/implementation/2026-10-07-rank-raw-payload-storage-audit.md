# 榜单原始快照与独立提交链（2026-10-07）

## 原业务与改动

原 `BilibiliLiveRankApiClient` 返回完整解码 String，Repository 在快照 SQL 中转换 JSONB，再删除旧条目、执行 JDBC 条目批次。Service/Repository 没有包住这三步的整体事务；成功 API 日志先于保存，存储异常不属于平台抓取异常，不重试、不切备用接口，也不继续后续页或类型。

客户端实际 Python Worker 使用已有完整原文扫描器，传递可选的窄枚举状态；当前生产者始终提供。Core 在存储点使用它，不改变 CAS 原始字节。Storage 先检查并提交快照，再独立提交删除，再整体提交条目批次；外部已经存在的 SQLite 事务仍统领嵌套步骤。SQL、schema16、排序、限制、同步持久性、并发和 UI 不变。

原 Boot3.3.6 的默认 pgjdbc42.7.4、extended protocol 和此客户端最多200条的无返回 INSERT，属于一次条目批次提交，不是每条独立提交。依据为官方 [PgStatement](https://raw.githubusercontent.com/pgjdbc/pgjdbc/REL42.7.4/pgjdbc/src/main/java/org/postgresql/jdbc/PgStatement.java)、[QueryExecutorImpl](https://raw.githubusercontent.com/pgjdbc/pgjdbc/REL42.7.4/pgjdbc/src/main/java/org/postgresql/core/v3/QueryExecutorImpl.java) 和 [PostgreSQL16协议说明](https://www.postgresql.org/docs/16/protocol-flow.html)。自定义 JDBC 模式和更大原始批次不是本片已验证范围。

## 有限验证与冻结

只有一个新增业务 case，实际 Core→Python stdio→SQLite，HTTP 网络边界回放：先证明重复键覆盖前的 NUL 被错误接受并继续抓取（RED）；再用真实 SQLite 条目失败证明旧整体事务错误保留旧快照（RED）；修复后验证快照与删除已提交、当前批次整体回滚、此前页面保留，成功日志/原文 CAS/数据库重开保持（GREEN）。不伪造时间，同分钟身份只在实际时间确实同分钟时判断。

已有 TS 元数据 case 和 Python String/CAS case 复用同六个原文样例，portable schema 校验真实 Python 输出。收尾记录：Contracts3、代表 Core1、相关 Python35、mypy20、全 workspace TS、生产 build 均通过；生产隔离 Electron 五页/真实 IPC/单 Core 重启/正常退出自有PID0通过，数据 `.tools/temp/bmd-production-final-w2zNqX`。没有真实平台请求、用户数据库、真实凭据或安装验收。

九源真 before、最终 manifest/diff/brief 在 `.tools/temp/20261007-rank-raw-storage-*`，限定只读复核 Critical0/Important0/Minor0；下一片前重新核对九个当前 hash/字节全部匹配。后续共享文件发生新改动时，本冻结只代表本片收尾版本。

## 阶段终态及剩余范围

本片只运行一次标准 `check.cmd`，已终态 exit1，日志 `.tools/temp/20261007-rank-raw-phase-check.log`：Core1041/1043，两个既有失败是粉丝2004刷新原30秒和Subject501创建原5秒超时；Task3/Contracts511/Storage77/Realtime162/Browser12通过。Desktop及后续阶段未由该命令执行，不能宣称整套绿色。

直接 TEXT 截断/编码、条目 JSON 树序列化及完整 JSONB 物理等价、其它数值/配置边界、布局策略、性能/桌面稳定性、真人原生及最新安装包仍开放。未更改历史数据、原 B/S、Git index/HEAD、远程、真实凭据或全局记忆，累积工作区保留，全量目标 active。
