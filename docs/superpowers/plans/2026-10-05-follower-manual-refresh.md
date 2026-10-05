# 原粉丝手动立即刷新迁移

## 范围与原依据

原 B/S `fa2faa6` 只读；客户端 `b2e5a89`，开始时234项增量/147新增、暂存区空，既有工作全部保留。新文件/缓存/临时库/产物D盘，不启动原项目或安装客户端，不访问平台/凭据/用户运行库，不提交推送。

先读历史本地card资料，再读 `BilibiliView.vue:470–504,548–558,1206–1254`。原手动路径：清apiError → await refresh → await共享loadUsers → 提示“已刷新”；refresh异常只显示错误、不主动重读。loadUsers吞读取失败，仍提示刷新成功；复用旧在途读，成功读照常同步dirty草稿/清失效选择/排队趋势。手动不设置busy/autoCollecting，不锁刷新、状态、删除或间隔编辑；自动采集标记不是手动标记。后台具体语义由独立只读核验补充，不先假设需要修改。

## 执行核对

- [x] 独立原页面交互/后台链与现有覆盖核验，不委托解读主代理的技能指令。
- [x] 扩共享fixture opt-in refresh-flow：按调用index控制refresh等待/失败/用户结果、list调用时捕获旧快照；默认旧夹具保持。
- [x] 写真实React/Query/Chromium RED：失败不重读；开始清旧读/写错；成功同步/通知、不等趋势；读失败仍成功；复用旧list/不乐观写；保存草稿；同/不同用户并发与重复点击、不新增busy锁/手动autoCollecting。
- [x] 用最小专用refresh流程替代generic finally invalidate；只对该功能修改，不跨入状态/删除或新的调度设计。必要交叉修补：generic失败不重读，读/写错误按原单一apiError最后写入展示；四项追加RED后修，不冒称状态/删除完整迁移。
- [x] 真实Core/V2/SQLite补9项：在途interval/PAUSED保留但next按开始interval，relation按开始profile，失败退避/恢复清错/重叠调用/在途删除分类与不复活/初始missing。先RED后修persistSnapshot；保持ensureRunning/退出取消和Long64。
- [x] 修正与原手动语义相悖的旧断言，保持其时钟/请求顺序/预算/并发；其它添加与保存回归全保留。
- [x] 独立复审；定向、类型及运行完整check.cmd；保留真实失败，不调大预算或降并发掩盖旧稳定性问题。两轮fullcheck失败，新增回归均过，不能将本勾选解读为完整自动验收通过。
- [x] 产物fixture/进程/监听、源库clean、空index/diff/新增文本/CLAUDE/D盘核验，更新审计/台账/交接。完整M06/M01–M18不标完成，原生/实网/安装验收单列。
- [ ] 完整check.cmd全绿：当前旧容量键盘/Worker启动标记全量超时未解决，按用户要求暂停，不扩大当前功能。

具体业务矩阵在读取原实现后写进新回归；仅模拟窄bridge，不模拟整个客户端或冒充后台验收。

最终结果：17新browser + workspace25/add15/interval15/Main carrier6＝78通过；Core9+settings4/parity6＝19通过；独立前端2个Important补4项RED后修并复核关闭，Core无未闭问题。两轮fullcheck失败日志保留，第二轮Node2045/2047、新17全过；旧5suite原预算复验46过但全量旧键盘/Worker等待仍超时，不宣称根因修复或完整绿色。其余全部类型/Black/isort/mypy/Python1003/生产构建独立通过，进程/监听/生产fixture0与源码只读/增量/空index/CLAUDE/D盘安全检查通过。用户明确本功能完成后先停止，交接后暂停全量目标，后续业务不继续执行；审计详见../../implementation/2026-10-05-follower-manual-refresh-audit.md。
