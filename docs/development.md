# 本地开发环境

## 硬约束

- 仓库和所有可变运行数据固定在 D 盘。
- Node、pnpm、缓存、临时文件、Playwright 浏览器、Python venv、构建物、运行数据和导出只接受 `D:\`；C、E 与 UNC 路径均拒绝。
- 项目不安装 Cargo、Rustup、LLVM、MSVC 或其他本地原生编译工具链。
- 不直接调用全局 `node`、`pnpm`、`python`；统一通过仓库脚本激活环境。

## 首次准备

```bat
bootstrap.cmd
```

脚本执行以下动作：

1. 校验仓库不在 C 盘，并设置全部项目路径变量。
2. 下载并校验 Node 24 LTS 到 `.tools/node-v*-win-x64`。
3. 安装 pnpm 到 `.tools/pnpm-runtime`。
4. 使用 E 盘 Python 创建 D 盘 `.venv`，拒绝 C 盘 base runtime。
5. 从 `workers/python/requirements.lock` 安装当前 B站 HTTP、抖音 OAuth 与测试所需依赖，只接受预编译 wheel；未实现的 AI、Agent 和分析依赖不安装。
6. 根据 `pnpm-lock.yaml` 安装 Electron、React、Crawlee、Playwright 等依赖。
7. 下载 Chromium、Headless Shell、FFmpeg 和 Winldd 到 `.tools/playwright-browsers`。

更新依赖锁只在维护依赖时使用：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap.ps1 -UpdateLock
```

## 常用入口

- `dev.cmd`：启动 Electron 开发模式。
- `check.cmd`：路径门禁、Node 测试/类型检查、Python 格式/类型/测试、Electron 构建。
- `build.cmd`：生成 Electron 生产构建。
- `build.cmd -Package`：在构建后生成 Windows 安装包。

## 路径布局

```text
.tools/                 Node、pnpm、缓存、浏览器、模型缓存、临时文件
.venv/                  Python 项目环境；base runtime 在 E 盘
.local-data/            control.db、Electron userData/session、Worker 数据
apps/desktop/out/       Electron 构建
release/                安装包
```

安装版的可变数据位于 `D:\BiliMonitor Desktop Data`。抖音 OAuth 配置模板在其 `config` 子目录；填入一次明文配置并重启后，应用会使用 Electron `safeStorage` 迁移为本机加密文件并移除明文。

`scripts/activate-environment.ps1` 会设置 `BMD_DATA_DIR`、`PLAYWRIGHT_BROWSERS_PATH`、`PIP_CACHE_DIR`、`ELECTRON_CACHE`、`HF_HOME`、`TEMP` 等变量。路径测试会逐项验证。

## 故障定位

- “Project Node.js is missing”：运行 `bootstrap.cmd`，不要回退到全局 Node。
- Python base runtime 指向 C 盘：移走 `.venv` 后重新运行 `bootstrap.cmd`。
- Chromium 缺失：在已激活环境中运行 `pnpm --filter @bmd/browser-worker exec playwright install chromium`。
- Local Core 启动失败：检查 `apps/desktop/out/main/core-process.js` 和 `.local-data/logs`。
- SQLite 无法打开：确认没有另一个应用实例占用同一个数据目录，并检查 D 盘剩余空间。

应用不需要也不应该监听业务 HTTP 端口；调试 Worker 使用 stdio Envelope 和 Trace ID。
