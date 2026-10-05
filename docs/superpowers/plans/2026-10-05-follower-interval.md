# 粉丝采集间隔保存执行核对表

本表记录本轮执行与剩余验收，不替代全量迁移台账。原 B/S `fa2faa6` 只读，客户端 `b2e5a89` 既有未提交增量保留，D 盘约束不变。

- [x] 先读本地 card API 参考、原 Vue save/load/draft/IntervalEditor、实际 ElementPlus 2.14.1 与后台 settings 更新语义。
- [x] 真实 fixture opt-in interval-flow：settings/list indexed 延迟和失败、调用时旧 list snapshot、返回不同有效间隔，默认旧夹具保持。
- [x] 新 13 条浏览器用例先失败再实现；专用保存顺序、显式 dirty、共享旧读、成功通知、失败不重读与逐用户独立草稿。
- [x] 输入 raw/model 分离、整数夹取/动态相对步长；复审鼠标原生 spinner 的第 14 条 RED→scoped CSS→GREEN。
- [x] 保存清旧列表错误第 15 条 RED→UI 可见性状态→GREEN；保留 Query 数据/error 为唯一业务真相。
- [x] 修正原本错误的旧 0 输入禁用断言；预算、并发、其他测试流程不改。原失败草稿/切换、添加流程和新测试联合通过。
- [x] 19 条纯 helper +4 条真实 V2 SQLite 后台测试补覆盖；后台生产代码不变。
- [x] 最终独立复查无未闭Critical/Important；首轮完整check保留旧容量超时，原预算隔离通过后第二轮完整退出0（Node2021/Python1003、Desktop580、类型/格式/mypy/生产构建/D盘）。最终fixture/进程/监听0，diff/新增空白/原库只读clean/index/CLAUDE核验通过，更新审计/台账/交接；不把单条GREEN当作整个M06完成。
- [ ] 旧图表容量并发超时稳定性待办保留；第二轮没有复现不代表根因已修复。本项不改图表、预算、并发或真实操作。

下一独立项原 refreshUser，不在本项执行。详见 `docs/implementation/2026-10-05-follower-interval-audit.md`。
