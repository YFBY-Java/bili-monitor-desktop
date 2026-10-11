# Python Worker 最终响应归属迁移（2026-10-07）

本项已完成限定实现、定向自动验证、独立任务复查及最终生产构建/隔离启停。只关闭 Python transport 的请求归属缺口，不代表整个客户端迁移或真人业务验收完成。

## 实现范围

`ndjson-python-worker-transport.ts` 在非 alive 最终帧清除 timeout/pending 之前，核对原请求的 traceId、correlationId、成功类型或 worker.error，以及提供时的 causationId。省略 causationId 仍接受；不匹配但合法的帧忽略，不结算、不续期，不影响其他请求。原 alive/队列保活、无效 JSON/Envelope、超时/停止/子进程身份及错误字段映射保持，不新增状态机、RPC、业务或存储逻辑。

变更仅两个既有 TS 文件和两份真实 stdio Python 夹具。任务前486源快照的其他484路径不变；root 生成的真实任务差量及独立审阅均核对四文件冻结 SHA256。已完成数字文本、Live Long64 和导出增量未重派或覆盖。

## 已有证据与本次收尾

- 同 id 错误类型、trace、correlation、显式 causation 的合法 final 后，正确 final 被门控暂缓；原实现提前结算，实际行为 RED。四行守卫后 GREEN，正确结果可省略 causation，匹配 worker.error 字段保留，后续 ping 可用。夹具初次包解析失败不冒充行为 RED。
- 实施者 transport3/3、Core tsc、夹具 Black/isort 均 exit0；root 本次再次限定验证同 transport 文件，3/3、exit0，无未处理错误。未运行包级或阶段完整套件，过滤项不计通过。
- 独立复查 Spec compliant / Task quality Approved，无 Critical/Important。实际检查 shared Envelope、生产 Worker._response/run_stdio 及 Main 关联上下文，未重跑测试或扩大审查。
- root 最终 `pnpm --filter @bmd/desktop build` exit0：Desktop web/node tsc 及 Main/Core/Preload/Renderer 生产构建通过。
- root 当前源码实际生产启停 exit0：新 D 盘 `.tools/temp/bmd-production-final-3Vf4zE`，ready/schema16、精确 Live v2/Subject v3 桥接、真实平台注册表、启动与重启各一 Core，正常退出后记录 PID 残留0。自动平台/OAuth关闭，无用户数据库或真实凭据；不是独立目录包/安装/真人验收。
- 限定 `git diff --check` exit0；Git 的 LF→CRLF 提示是工作区换行策略提示，不是测试失败。源和 API 参考库干净只读，HEAD4c/分支/空暂存区保持；无提交推送、新依赖或安装包。

## 保留项与恢复材料

非阻断 Minor：新测试的文件标记证明 Python 已发送错误帧，但50ms等待假设 Node 已消费管道。确定性消费屏障可增强回归证明；现有真实行为 RED 和直接守卫不因此变成未实现。此建议记入阶段/最终审查，不静默丢弃，也不新增协议/测试专用生产 API。

完整命令、RED/GREEN、冻结 hash 在 D 盘 `.tools/temp/20261007-python-final-association-report.md`；同前缀 brief/before、review-v1.txt 及 review.md 保存要求、任务前快照、差量与复查。临时材料不随 Git 提交，本审计保留可交接结论。

继续原 Follower 新直接资料/错误字段 TEXT 边界，再逐项处理有限解析/HTTP编码/配置差异。阶段全量回归及历史失败、同步 SQL/性能、最新独立目录包、真人扫码/获准目标与原生保存/安装仍未完成；全量 M01–M18 目标保持 active。
