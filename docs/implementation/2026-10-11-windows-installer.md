# Windows 独立安装包（2026-10-11）

## 成品

- `release/friend-package/BiliMonitor-Setup-20261011-x64.exe`，355136930 字节（约 339 MiB），版本 0.1.0，当前迁移体验版。
- 同目录 `使用说明.txt` 可随安装包发送。朋友只需这两个文件，不需要源码或 `win-unpacked`。
- SHA256：`5133DA20C735AE8617DDD9F24B73E06C335A10D73DA9E22F25820D3E1F467783`。
- 自包含 Electron 43.4.1 / Node 24.18.1、Python 3.11 Worker、Chromium revision 1234、SQLite；无需安装开发环境。网络采集仍需要互联网及用户自己的登录态。
- Windows x64；本次实测主机为 Windows 11。保留项目的 D 盘限制：程序 `D:\BiliMonitor Desktop`，数据 `D:\BiliMonitor Desktop Data`，建议 D 盘至少预留 5 GB；不支持仅 C 盘的电脑。
- 未配置代码签名证书，最终 EXE 的 Authenticode 状态为 `NotSigned`。不是已签名的正式发行版。

## 本次打包调整

- 根 `package:win` 先构建最新 Electron 输出，再打独立 Python 和 NSIS；`build.ps1 -Package` 不再重复构建。
- 中文向导、当前用户安装、桌面/开始菜单入口；固定程序目录，不接受危险的 `/D=盘根/数据目录`。遇到非应用的已有目录或全局安装则提示并停止，不覆盖。
- 通过 pnpm 固定补丁给 electron-builder 增加 `customCacheInstaller` / `customUnPreInit` 钩子，并将 `preInit` 提前到 `SetOutPath` 前。安装、升级、卸载的大文件临时目录使用 D 盘，子进程继承 D 盘 TEMP/TMP；不向 C 盘 AppData 冗余复制一整份安装器。没有自动更新器，未来接入更新器时应重新审视缓存策略。
- Windows 快捷方式、注册表安装登记仍使用系统标准位置；不承诺 Windows 自身的安全扫描/启动日志完全不使用系统盘。
- Playwright `.links` 开发机路径不打包；`.env`、用户数据库、工具环境、浏览器 Profile 不进入应用归档。

## 验证和边界

- Desktop 类型检查及生产构建通过；独立 Python PyInstaller 构建、清空环境后的 ping/capabilities（17 项）通过。
- 安装器配置回归 1 项，先失败后修复通过；`node --check scripts/smoke-packaged.mjs`、`git diff --check` 通过。
- `scripts/smoke-packaged.mjs` 在解包目录和真实安装目录分别通过：运行 PATH 仅 Windows System32，不依赖项目 Node/Python；包内 SQLite/ws/Playwright、Chromium about:blank、Core schema18、7 页导航、空监控对象保存→Core重启保留→删除通过，所记录自有进程退出后无残留。测试使用独立 D 盘数据，不访问用户数据库、不请求真实平台。
- 实际 NSIS 静默安装、最终成品覆盖升级、最终卸载器卸载均 exit0，三个阶段均观察到 D 盘临时目录，完成后临时子目录清空；应用归档与解包目录 SHA256 均为 `B54F2D6951CE08352E8BE80A7752C059170168EA79AB34A79A6A35515CDDEE91`。测试安装及注册信息已移除，既有 `D:\BiliMonitor Desktop Data` 保留，用户开发运行与真实数据库未纳入测试。
- 归档检查：8378 个条目，无禁止的运行数据路径，四个主进程/Worker 构建入口齐全；浏览器 `.links` 已排除。
- 一次完整 `check.cmd` 未通过：Core 1046/1050，通过之前的 Task3、Contracts514、Storage78、Browser12、Realtime162；Core 2 项超时、1 项 SQLite rollback 异常、1 项开发 Python sitecustomize 进程崩溃，后续 Desktop/类型/Python阶段未执行。不将安装冒烟成功说成全业务验收或干净虚拟机验收。
- 原 B/S 业务完整迁移仍未完成，本次不迁移新业务、不自动提交或推送。

证据：`.tools/temp/20261011-{installer-build,package-python,installer-final-package,installer-check,unpacked-smoke,installed-smoke}.log`。目录与安装包均被 Git 忽略，源码改动和 pnpm 补丁可正常提交。

参考：NSIS 官方[脚本变量说明](https://nsis.sourceforge.io/Docs/Chapter4.html)与[UnsafeStrCpy 更新说明](https://nsis.sourceforge.io/Docs/AppendixF.html)。
