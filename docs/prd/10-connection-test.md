# 10. 连接测试

> Index: [docs/PRD.md](../PRD.md)

- **设置 · 网络测试**（§3.8）：在本地或通过 SSH 主机执行 `nc` / `curl` / `ping` / `arp` / `nmap` 一次性命令，输出显示在设置页内嵌的 xterm 终端；校验与命令映射见 §3.8。
- **SSH 的可用性**通过 **SSH 管理 → 探测操作系统** 隐式验证：
  - 步骤：点击探测 → 后台 `ssh2` 连接 → 读取 `uname -s` 与 `/etc/os-release`，识别到具体发行版。
  - 成功判定：连接建立且命令返回可识别系统。
  - 超时：`readyTimeout = 8000ms`；失败归类为 `unknown`。
- **文件管理（SFTP）的可用性**（失败写入当天日志文件）：`sftp:connect` 以 ssh2 建立连接，`code` ∈ `proxyjump`（配置带 -J，ssh2 不支持）、`auth`（认证失败）、`timeout`（`readyTimeout = 12000ms`）、`sftp`（子系统启动失败）、`connect`（其它连接错误）、`no-target`（未提供 ssh 目标）；`sftp:list` 的失败映射 `noDir`（目录不存在 / 无权限）/ `listFailed`；失败在文件面板状态栏红字提示并写入当天日志文件。

---
