# 原粉丝添加监控成功链迁移（2026-10-05）

## 原依据与范围

原 B/S `fa2faa6` 只读；`BilibiliView.vue:470–527,688–735`：POST成功→清UID/保留间隔→await共享loadUsers（复用在途读，不保证fresh）→成功读先清理失效选择→去重/<4追加返回ID→排队raw-ID趋势→提示成功/释放adding。读/趋势失败不撤销POST成功；POST失败保留草稿。`selectedTrendUsers:419–423`只过滤展示，原选择和请求仍用raw IDs。Service64–78/repository81–97重复添加获取资料并upsert，返回已有ID而非必新建。

历史本地card参考已先读，仅作材料，不代表平台验收。UID精确输入按上一轮已获用户确认的方案保留，v2共享契约/采集/存储不改。新UI抽屉是既有布局适配：可以关闭，但A请求只能影响A的表单清空/关闭/错误；成功业务同步仍完成，不能污染新开的B。不新增tombstone、全局串行、强制fresh屏障或退出/关闭导致的Core写操作取消。

## 实施与验收

- [x] 原Vue真实函数纯内存6场景和实际TanStack依赖核验；新fixture opt-in真正新增/重复upsert、list调用时捕获快照、按index控制add/list等待及错误；不改变旧默认夹具。
- [x] 新12项真实浏览器回归先RED：9业务断言失败/3正向控制通过，无pageerror或外部请求；生产仍未改时验证RED。
- [x] 恢复单次列表读取（显式retry:false）、在途读合并、同步成功时先prune，await读结束后再检查raw选择上限/追加。失败读保留已有列表与raw选择，绝不自动重试add/回滚成功。
- [x] 趋势请求使用raw选择，展示名单过滤；保留既有有界缓存/同key在途合并/迟到数据过滤，不等待趋势完成才确认add。
- [x] 草稿升至仍挂载的workspace层；commit时清UID、保留间隔，pending持续到read结束；旧表单归属保护清空/错误/关闭，新表单不展示旧mutation错误。第14项提交后新草稿先RED再修复，避免completion二次清UID。
- [x] 补第13项成功确认RED与源通知等价的可见状态，再实现；最终新14项和既有失败草稿/重试、大数输入、监控/趋势交互共265项定向回归及web TypeScript通过。
- [x] 独立复审发现fixture removed-ID请求在try外抛错漏减计数，第15项浏览器回归先RED再只修夹具；新15+原趋势13共28项通过，初始共享读调用数明确锁为1。
- [x] 两次fullcheck首次启动超时后定向测量、失败阶段日志/真实Vite cache核验；新suite共享cache隔离断言先RED再设独立D盘缓存GREEN，预算/并发不变。第三次完整check待验，前两次失败不抹掉、根因未确定不当作全部修复。
- [x] 独立实现/测试复审均无未关闭重要问题；完整check.cmd共四次，最后Node1978过/5旧beforeEach超时失败（1983总数），不是GREEN。最终全TS/Python1003/生产build另通过；生产fixture/残留进程/监听0、D盘/源库只读/空index/尾空白核验通过，记录台账和交接。
- [x] 先为五个旧suite补有界setup/资源/迟到创建诊断；第五次完整检查通过后，补审发现三Live原操作receiver被改为setupPage的Important，三文件guard先RED再恢复page/原参数GREEN，独立复查关闭。再次冻结后第六次完整`check.cmd`退出0：Node1983/Python1003，Desktop546及新15项全过，类型/格式/mypy/生产构建/D盘检查通过；最终原测试体、等待归属、预算、并发及生产业务不变。本项完整自动检查通过，不标M06或全量完成。
- [ ] 保留旧suite间歇性超时诊断：本次未复现，不能说根因已定位或稳定性已修复。共享cache不能统一解释独立cache的Live失败；Vitest/Playwright取消与迟到赋值风险仅源码/carrier已证明，真人浏览器因果未证实。沿用有限阶段观测，不盲改预算、并发或真实点击。

## 范围边界

只完成粉丝页这条添加交互链，不将M06全部parser/配置/运行时或M01–M18标完成。Browser使用窄化bridge合成响应，不宣称真人采集或原生Electron/安装包验收。源库、API参考、既有dirty工作区/用户运行数据保留；不提交推送或安装工具，所有新产物D盘。
