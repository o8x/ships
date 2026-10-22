# 12. 其余要点

> Index: [docs/PRD.md](../PRD.md)

- **数据位置**：应用数据在 `app.getPath('userData')`；日志在 **macOS：`~/Library/Logs/Vessel`**（其它平台：`userData` 的 `logs/` 子目录），按天 `vessel-YYYY-MM-DD.log`，保留天数由设置 `logRetentionDays` 决定，默认 7 天；SSH 配置在 `~/.ssh/config`。
- **调试开关**：**未打包运行（`pnpm start` / `pnpm dev` / `electron .`）自动进入开发模式**，详细日志同时输出到文件与控制台；打包安装后为生产模式仅写文件。`VESSEL_DEBUG=1`（兼容旧 `SHIPS_DEBUG`）或 `--debug` 可手动覆盖；`VESSEL_SSH_CONFIG`（兼容旧 `SHIPS_SSH_CONFIG`） 可覆盖 SSH 配置文件路径（测试用）。
- **开发辅助**：`scripts/capture.cjs` 可在 Electron 中加载真实界面、执行点击/输入并截图（环境变量 `OUT` / `SETTINGS_OUT` / `TAB` / `INPUT` / `PATCH` 等），不参与打包。
- **协议与端口提示**：应用不监听端口；SSH 默认端口 22。
