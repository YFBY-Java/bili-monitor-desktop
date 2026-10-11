# 原规模用例的被动 SQL 测量（2026-10-07）

仅使用 D盘临时 Vitest setup 包装 `DatabaseSync` 的真实 SQL 调用计时，读取 WAL header；不执行 checkpoint、不改变生产 SQL、同步等级、并发、用例工作量或预算。setup 首版仅退出钩子没有生成 worker 报告，修为 afterAll 后才采用 JSON 数据，不把前版当作 SQL 取证成功。

| 既有用例 | 当前测量 | 观察 |
| --- | --- | --- |
| 粉丝2004历史 | 原case单独20.91s通过；6015 COMMIT共18237.61ms | 40次WAL重置对应前置COMMIT合计350.13ms；五次历史SELECT合计9.96ms |
| Subject501对象 | 与弹幕原case同配置一起运行通过；529 COMMIT共2374.24ms | 209次夹具事件autocommit INSERT共634.14ms；8次重置前置COMMIT合计101.91ms |
| 最近弹幕501 | 与Subject原case一起通过；504 COMMIT共2212.28ms | 裁剪DELETE共83.40ms；10次重置前置COMMIT合计118.26ms |

实际所有测量数据库均为 WAL、synchronous=2、page_size4096、wal_autocheckpoint1000。写入提交占主要已测耗时，查询和 prepare 不是本次的主因；没有证据支持以新增索引、全局 prepared cache 或提高自动 checkpoint 阈值解决当前阶段超时。重置前置COMMIT包含其它提交成本，不冒称纯checkpoint耗时。单独通过不证明标准并行阶段稳定，磁盘竞争仍是候选而非已证因果。

证据：`.tools/temp/20261007-business-sql-profile-{64088,57672,62516}.json`，`20261007-follower-business-sql-profile-final.log`、`20261007-subject-danmaku-business-sql-profile.log`；临时脚本 `20261007-business-sql-profile.ts/.config.mts`。最新标准阶段仍有三个规模超时，见平台失败结果审计；不能用本测量关闭性能目标。后续性能改动必须保留原业务独立提交和数据持久性，不先放宽验证预算求绿。
