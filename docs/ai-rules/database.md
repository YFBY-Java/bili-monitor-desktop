# Data Rules

- SQLite schema 变化必须有单调递增 migration 和测试，禁止修改已发布 migration。
- 控制数据写入 SQLite WAL；大对象进入 CAS；事实明细进入 Parquet；分析由单一 Data Worker 使用 DuckDB。
- UI 和 Agent 不得执行任意 SQL，只能调用带扫描预算的查询模板。
- Parser、Dataset、Agent 和索引均版本化；派生数据必须可由原始证据重建。
- 备份必须包含 SQLite、Agent DB、CAS/Parquet manifest，并在隔离目录验证后标记 VERIFIED。
