# 工作台三个直接文本字段的新写入规则（2026-10-07）

## 原依据与范围

原只读 B/S `fa2faa6` 的 `SubjectRepository.insertSubject/updateSubject`：姓名是 VARCHAR(160)，头像和备注是 TEXT，三者直接绑定 SQL 字符串；标签和能力/布局的 JSONB 不属于相同存储入口。完整 V5 建表已核对。复用此前已经核定的 pgjdbc UTF8 直接文本编码观察，不新增 PG/JVM 实验或平台请求。

仅把现有 Follower 直接文本算法抽成内部 `postgres-storage-text.ts`：孤立 UTF16 单元存为 ASCII `?`，配对 emoji、字面替换字符和正常文本不改，实际 NUL 抛固定安全存储错误。Follower wrapper 保留原文案及昵称长度规则；Subject 的三个新写入参数复用该算法。null/undefined、COALESCE、事务/Outbox、版本/时间、历史数据、schema16与所有 JSON 字段均不改，不新增业务端点或接口。

## 证据

- 真任务前 `.tools/temp/20261007-subject-direct-text-before`：494源/3,999,510字节。冻结差量 `20261007-subject-direct-text-review-v1.txt`：4路径/13,461字节（三修改、一新内部helper），当前hash/字节与manifest一致。限定只读复查 C0/I0/Minor0。
- 只扩原既有“UID无直播间”的Core主流程，没有新增名称/测试文件/矩阵。真实 RED：SQLite原先存为字面替换字符而非原 `?`。GREEN检查实际创建/修改的三字段、配对emoji、NUL创建后的Subject/Outbox不变，以及NUL修改后的对象不变。
- 该既有Core流程1通过/1过滤；旧Follower真实SQLite流程2通过/17过滤，包含既有重开/事务断言；Storage/Core types exit0。当前Desktop类型和全部生产bundle构建exit0。
- 最终生产bundle实际运行于新D盘 `.tools/temp/bmd-production-final-nQrBbk`，Main/Preload/Core ready/schema16。真实IPC创建编码后的工作台资料，单Core重启61096→53132后资料保持，删除/空列表及正常退出记录PID残留0。
- 同一个生产补验使用该新隔离目录的自有 `credential-key.bin`，实际Electron `safeStorage`解密得到32字节密钥，磁盘密文不包含该base64明文，OS加密可用。只返回布尔/字节数，不输出任何密钥；这证明本机保护原语和本片Main初始化，不证明真人凭据、剪贴板、跨机器迁移或完整安装验收。

日志同前缀 `{before,after,follower-regression,types,build,production-smoke}.log`，旧失败不改写。未新增依赖、schema、契约或Worker变动；原项目/API档案只读，无用户库/真实平台/真实凭据、提交推送或新安装包。

## 继续保留

这里只关闭Subject三个新写入TEXT边界；本片尚未验证Subject独立Main重启，现有Follower重开不能冒充该验收。跨资源创建事务/失败部分提交、原JSONB接受域、其他TEXT/标量/配置、阶段启动超时、501对象性能、同步SQL/大数据和真人/原生保存/剪贴板/安装仍OPEN。旧schema16目录版在直播表单和本片之前生成，不包含这些后续修复；当前生产bundle已经更新。完整M01–M18仍active，不能标全部迁移完成。
