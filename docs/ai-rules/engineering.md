# Engineering Rules

- 使用仓库内固定的 Node、pnpm 和 Python 环境；先执行 `scripts/activate-environment.ps1`。
- TypeScript 使用 pnpm workspace、strict TypeScript、ESLint、Prettier、Vitest。
- Python 使用项目 `.venv`、pip-tools、Black、isort、mypy、pytest；安装依赖必须加 `--only-binary=:all:`。
- 不使用 Cargo、Rustup、CMake、MSBuild、uv、Ruff 或 Biome。
- `bootstrap.cmd` 只下载到 `.tools/`，缓存和 TEMP/TMP 只指向 D 盘。
- 根脚本必须提供 `bootstrap`、`dev`、`test`、`typecheck`、`lint`、`build` 和 `check`。
