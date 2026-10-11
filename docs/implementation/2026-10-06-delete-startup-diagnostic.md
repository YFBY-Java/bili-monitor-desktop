# 粉丝删除 suite 启动诊断与整轮执行记录

## 范围和结论

这是验证诊断，不是删除业务或生产性能修复。上次完整 check 的新增删除 suite 在 beforeAll 10 秒预算超时、9 项跳过。现在只给该测试的初始化加有界阶段探针，原 Vite 配置、页面操作、业务断言、poll、hook/test 预算和并发均未改变。

独立 task review：Spec compliant / Task quality Approved，无 Critical/Important。Minor：`finished` 名字其实表示 setup settled；日志 reason 区分成功/失败，命名尚未修改。watchdog/迟到清理故障分支未强制触发，不能称这些路径已动态验收。

## 探针与定向证据

文件 `apps/desktop/src/renderer/src/BilibiliFollowerDelete.interaction.test.ts`：阶段最多30，pending 路径最多50且每项256字符；只输出同源 pathname/时间/计数，不含 query、响应、凭据或 UI 数据。9500ms 一次性 unref watchdog 只诊断，不延长预算、取消、等待或重试。finally 保留 readyPage.close、清理 timer/三个监听；出现并发 setup/close 错误时保留原 setup 错误。unfinished/teardown/late completion 分别记录，不能把 hook timeout 当作已取消初始化。

定向日志 `.tmp/2026-10-06-delete-startup-focused.log`：首次9通过但 console trace未显示；改stderr输出后，第二次9通过，11.71秒总测试、startup1669ms、pending/failure0、cleanup完成。该重复是诊断输出修正，不是盲目重复求绿；没有 cache删除/预热或生产改动。

## 新的一次 instrumented whole check（11:22–11:24 +08:00）

日志 `.tmp/2026-10-06-delete-startup-instrumented-check.log`；原配置执行，`BMD_TEST_STARTUP_TRACE=1` 只让成功setup也输出时间线。check 内部退出1；外层 PowerShell Tee 捕获 pipeline 的 shell exit0不等于check成功，以日志的 Node tests failed with exit code1 为准。

- Node **2087通过、2失败 /2089**，无跳过；Desktop628通过/2失败，Core884、Contracts461、Storage53、Task3、Browser12、Realtime46全部通过。
- 删除初始化 **4274ms**：createServer0–84、listen84–107、launch107–582、newPage582–839、goto850–1079、visible4256、page关闭4257–4273、cleanup4274；pending/failure0、watchdog=false、unfinished=false、teardownStarted=false，监听已移除。
- 新增删除9项本轮整套确实执行并通过。上轮9跳过的验证缺口获得本轮执行证据，但未复现同一超时，**没有证实根因、冷启动稳定性或已修复**。
- 两项旧失败保留：趋势2000点测试体5秒超时；Main Long64 pending v2 add 等待 `http-started` 文件后 ENOENT（本轮10700ms测试时长，不等于marker等待预算）。趋势页面ready801ms/pending0，point:focused4423ms、key:end4535ms；不能继续归类为初始化hook问题或推断CPU根因。
- Node失败截断后续types/Python/build，本次未另行重复这些检查；此前补充检查通过仍只是历史结果。下一生产切片完成后重新做整轮验收。

所有实际命令先激活D盘环境；本项无真实平台/用户库/凭据、原B/S启动、提交/推送或安装更新。原预算和风险保留；完整M01–M18目标继续，下一项是四字段弹幕启动控制及完成后调度，不将诊断当新业务完成。
