# 业务页面加载与开发依赖核验（2026-10-07）

## 实际改动

原 B/S 保持只读。客户端七个业务/登录组件使用模块级 React.lazy，保留原导航、props、窄化 IPC 和各页面业务逻辑。页面加载期间显示明确状态；加载失败显示安全提示与重新加载按钮，不暴露原异常。应用外壳不跟随业务模块一起消失。

16 个配置相同的浏览器夹具共用依赖优化缓存，标准 Desktop test 命令先执行真实 Vite 依赖扫描/优化，再运行原 Vitest 用例。各 server、端口、React 状态、上下文和 IPC 仍独立。定制转换的 LiveDataWidget 保留自己的缓存。未修改用例数量、预算、并发或原业务断言。

## 验证与复核

- 复用 Platform 原流程证明进入平台页不加载五个无关业务模块；模拟抖音模块加载失败后实际重新加载，再进入抖音页面验证模块确实恢复。没有只检查返回首页。真实 RED→GREEN，SSR/平台两个文件原七项通过。
- 21 源路径的 true-before 和最终 v2 manifest/diff 位于 `.tools/temp/20261007-workspace-module-review-v2.*`。v1 复核 I1“未验证失败模块恢复”已闭合；最终有限只读复核 C0/I0/Minor0。记录时 21 个 hash/字节均匹配。
- 全 workspace TypeScript 和准备脚本的独立严格类型检查通过；当前生产 build 退出0，Main/Preload/Core/Renderer 真实产物生成。
- 实际生产 Electron 隔离启动：五个业务页切换、schema16、精确桥接、注册表、单 Core 重启、Subject TEXT/JSON 保留、NUL 拒绝、自有密钥 OS 保护、正常退出自有 PID0。日志 `20261007-workspace-module-production-smoke-locked.log`，数据 `.tools/temp/bmd-production-final-xPD7GE`，Core60140→60492。无真实平台/凭据或用户库。

## 开发 Python 环境

旧 `.venv` 残留175个发行包，包含当前 unchanged requirements 未声明的 Logfire/Pydantic 插件。真实 import profile 观察其自动载入；不是凭一次 profile 就认定所有超时根因。

旧环境已 recoverable 移到 `.tools/temp/20261007-python-environment-before/.venv`，同一原 `.venv` 路径按现有 lock、现有 PyInstaller pin 和 editable Worker 重建，pip check 通过，46个发行包、无 Pydantic 插件 entry point。所有缓存/新环境在 D，配置 Python runtime 在 E。没有新增依赖、关闭插件的生产环境变量或修改锁文件；未删除旧环境。移动后旧 launcher 的路径不可直接当作独立运行环境，恢复应回到原路径。

## 阶段真实结果：仍未全量通过

- 标准 check：exit1，Core1038/1039，唯一失败为501最近弹幕/502永久事实原5000ms用例耗时5739ms。Task3/Contracts511/Storage77/Realtime162/Browser12通过；Desktop/后续未由该 check 执行。Subject501本次通过不等于旧间歇性能问题已修。
- 随后冷 Desktop 标准阶段：真实依赖准备791ms、9依赖；exit1，676/686、无跳过，9文件10失败。粉丝添加/删除/手动刷新/趋势/头像和直播 Widget/汇总/趋势/间隔流程出现 hook、交互超时；两个失败在 `browser.newPage` 时 Target crashed。平台完整恢复流程及原 Worker marker 本次通过。
- 日志 `20261007-workspace-module-phase-check.log`、`20261007-workspace-module-desktop-cold-final.log` 和 `-result.json`。没有同时运行其它验证任务，不改并发/预算、不重跑整套求绿。浏览器失败的根因仍待定位，不能全部归因于业务模块/Vite。

本片不是完整 M01–M18 验收、NSIS 或真人平台验收。旧 unsigned 目录包不包含本片与 Subject JSON 最新修改。全量目标继续 active，无提交推送、原项目启动/修改或安装应用操作。下一步已进入最近弹幕裁剪 SQL 的有限定位，不继续盲调缓存参数。
