# Vessel FAQ

本文记录**已实际发生并验证过**的问题、原理与排查流程。功能与接口的权威描述仍以 `docs/PRD.md`（索引）+ `docs/prd/*.md`（按章节拆分）为准。

---

## 1. 安装 PKG 后无法访问内网（SSH / ping 报 `No route to host`）

### 1.1 症状

- 同一个地址在 **Terminal / iTerm** 里 `ping`、`nc`、`ssh` 都正常。
- Vessel 的内置终端、SSH 探测（`ssh2`）、IP 工具里的 `ping` / `nc` 全部失败：
  - 终端里显示 `ping: sendto: No route to host` / `ssh: connect ... No route to host`；
  - 日志里是 `connect EHOSTUNREACH <目标>:22 - Local (<本机IP>:端口)`。
- 「系统设置 → 隐私与安全性 → 本地网络」里可能**看不到 Vessel**，或者看到的条目与实际运行的 app id 对不上。
- 换成 `192.168.x` / `10.x` / 同网段的 `172.16.x` 都会复现；访问公网正常。

### 1.2 原理

macOS 15（Sequoia）起引入 **Local Network 隐私**：应用访问「本地网络」地址时需要用户授权。

- **什么算本地网络**：与某个具备广播能力的网卡同网段的地址（例如本机 `172.16.2.40/22`，则 `172.16.0.0/22` 都算），以及组播 / 广播地址。判断依据是**路由是否直连**，不是 RFC1918 字面值。
- **需要授权的操作**：向本地网络发起 TCP 连接、UDP 单播 / 组播 / 广播、解析 `.local` 名称、Bonjour 等。
- **例外**：Terminal / SSH 里启动的命令行工具（含其子进程）**自动放行**；root 进程、launchd 守护进程也放行。所以「Terminal 能通、App 不能通」是典型现象。
- **授权按 bundle id 记录**：记录在 `/Library/Preferences/com.apple.networkextension.plist` 的 `PathController.Rules` 里，规则字段包括 `SigningIdentifier`（bundle id）、`Path`、`DenyMulticast`（是否拒绝）、`MulticastPreferenceSet`（用户是否已做决定）。
- **系统只会在「未决定」状态弹窗**：`Decided=False` 表示还没记录用户选择。弹窗由系统展示，**App 无法控制弹窗时长，也没有 API 强制再次弹出**；弹窗被忽略 / 自动消失后，同一个 bundle id 往往不会再弹（`Decided` 仍为 `False`）。
- **ad-hoc 签名的局限**：Apple TN3179 明确说明，本地网络权限依赖代码签名来跟踪身份；**ad-hoc / 未签名构建的跟踪不可靠**，正式分发应使用 Developer ID 签名。
- **Electron 的额外坑**：macOS 会把部分 Electron 网络流量归属到 Helper 进程。**主 app 与所有 Helper 的 `Info.plist` 都需要 `NSLocalNetworkUsageDescription`**；缺这个 key 的 bundle 会被静默默认拒绝，且不会出现在授权流程里。
- **`tccutil` 管不到**：`sudo tccutil reset LocalNetwork ...` 对 Local Network 无效（设置里 `All` 也一样）；这些 plist 受 SIP 保护，正常启动下 `sudo rm` / `PlistBuddy` 都会 `Operation not permitted`。

### 1.3 常见原因（本项目实际踩过的）

1. **bundle id 改名导致旧授权失效**
   - 旧名 Ships 的 `com.ships.app` 已经授权；改名后 `cn.com.stdout.vessel` 是一条全新的、未授权的记录。
   - 系统里仍能看到旧的 `com.ships.app` 授权（甚至路径指向 `/Applications/Vessel.app`），但它不会作用到新 bundle id。
2. **Helper 缺少 `NSLocalNetworkUsageDescription`**
   - 主 app 有 key，4 个 Helper 没有；系统为 Helper 建了 `DenyMulticast=True` 的默认拒绝规则，且永不弹窗。
3. **安装器因 appId 不匹配而重定位**
   - 例如把 appId 临时改成 `cn.com.stdout.vesselapp` 后，`/Applications/Vessel.app` 仍是旧 id；再用 `cn.com.stdout.vessel` 的 pkg 安装时，Installer 会：
     - 忽略 `/Applications/Vessel.app`（id 不匹配）；
     - 把新 app 装到 `/Applications/Vessel-1.localized/Vessel.app`；
     - `postinstall` 仍然 `open /Applications/Vessel.app`，于是**一直运行旧的、未授权的 app**。
4. **pkg 的 postinstall 后台自动启动**
   - 安装器在前台、app 在后台启动，首次本地网络访问可能不在适合弹窗的上下文里，导致「从未弹窗、也从未授权」。
5. **弹窗被忽略后不再出现**
   - 系统展示过一次后，即使没有记录决定，同一 bundle id 也可能不再弹出；此时只能重置系统授权状态或更换身份。

> 结论：**Proxy 不是本问题的原因**。`ping` 不使用代理；`ssh` / `ssh2` 默认也不走系统 PAC / HTTP 代理；PTY 桥（`python3`）只负责起 shell，不做网络代理。系统设置里的 Clash PAC 只会影响 CFNetwork / 浏览器类请求。Vessel 另有一个**默认关闭**的「遵循系统代理」开关（§3.10）；只有手动开启时，终端 / SSH / SFTP / 更新才会使用系统代理。

### 1.4 解决方案

**A. 保持 bundle id 稳定（最重要）**

- 正式 appId 固定为 `cn.com.stdout.vessel`，不要随意修改。
- 每次修改 appId 都等于换了一个新的权限身份，系统会新增一条未授权记录。
- 如果曾经改过 appId：
  1. 先退出所有 Vessel；
  2. 删除所有旧 bundle 与重定位残留：
     ```bash
     killall Vessel 2>/dev/null
     sudo rm -rf "/Applications/Vessel.app" "/Applications/Vessel-1.localized" "/Applications/Vessel.localized"
     ```
  3. 重新安装当前 pkg，确认 `/Applications/Vessel.app` 的 `CFBundleIdentifier` 与包一致。

**B. 打包时给所有 Helper 写入 key（已实现）**

`scripts/after-pack.cjs` 会把 `package.json` 里 `build.mac.extendInfo.NSLocalNetworkUsageDescription` 的文案写入 4 个 Helper 的 `Info.plist`，且发生在签名之前。

**C. 主动请求 + 重试（已实现）**

`src/main/services/local-network-service.js`：

- 请求前 `app.focus({ steal: true })`，避免菜单栏应用不在前台时系统不展示授权框；
- 向各网卡广播地址与 mDNS 组播发送空 UDP 包；
- 每个 socket 保持 `30000ms`；
- 每次请求在 `0 / 2500 / 5000ms` 重试 3 次；
- `2000ms` 内的重复请求合并；
- 启动、窗口聚焦（`browser-window-focus` / `activate`）、SSH 连接 / 系统探测 / 网络测试时都会再次请求。

**D. 首次启动后尽快在系统设置里允许**

「系统设置 → 隐私与安全性 → 本地网络」→ 打开 Vessel 的开关。若列表里没有 Vessel 或其开关无效，见下方「测试流程」第 4 步。

**E. 已经卡死时的两种重置方式**

- **系统级白名单（推荐，无需恢复模式）**：把内网网段从「本地网络」定义中排除，所有 App 直接放行。需要 **重启**：
  ```bash
  sudo defaults write com.apple.network.local-network AllowedWiFiLocalNetworkAddresses -array "172.16.0.0/22"
  sudo defaults write com.apple.network.local-network AllowedEthernetLocalNetworkAddresses -array "172.16.0.0/22"
  ```
  把 `172.16.0.0/22` 换成你的实际内网网段；Wi-Fi 与 Ethernet 按需设置。
- **Recovery 模式重置**：关机 → 长按电源进入恢复模式 → 磁盘工具挂载 Data 卷 → 实用工具 → 终端。先确认 Data 卷挂载点（常见为 `/Volumes/Data` 或 `/Volumes/Macintosh HD - Data`）：
  ```bash
  ls /Volumes
  cd "/Volumes/Data/Library/Preferences"          # 按实际卷名替换
  mv com.apple.networkextension*.plist "/Volumes/Data/Users/<你的用户名>/Desktop/"
  ```
  重启后会清空所有 App 的本地网络授权（VPN / 网络过滤配置也可能被清），首次访问时重新弹窗。

### 1.5 测试流程（按顺序做，能快速定位）

**第 1 步：确认不是网络本身的问题**

在 Terminal 里执行（换成你的目标）：
```bash
ping -c 2 172.16.3.155
nc -vz -w 3 172.16.3.155 22
```
- 都通 → 进入第 2 步（App 权限问题）。
- 都不通 → 先排查路由 / 防火墙 / VPN，不要改 Vessel。

**第 2 步：确认运行的 app id 与安装包一致**

```bash
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' /Applications/Vessel.app/Contents/Info.plist
pgrep -fl "/Applications/Vessel.app/Contents/MacOS/Vessel"
ls -ld /Applications/Vessel*.app /Applications/Vessel*.localized 2>/dev/null
```
- 期望看到 `cn.com.stdout.vessel`，且只有一个 `/Applications/Vessel.app`。
- 如果出现 `/Applications/Vessel-1.localized/` 或 id 不是 `cn.com.stdout.vessel`，按「1.4 A」清理后重装。

**第 3 步：看 Vessel 日志里的真实错误**

```bash
tail -50 ~/Library/Logs/Vessel/vessel-$(date +%F).log
```
- `[net] requested macOS local network access`：请求已发出。
- `connect EHOSTUNREACH ...`：被本地网络策略拦截。
- `connect ECONNREFUSED / ETIMEDOUT`：已经放行，是目标服务 / 路由问题。

**第 4 步：读取本地网络授权规则**

先导出（只读）：
```bash
sudo plutil -convert xml1 -o /tmp/ne.xml "/Library/Preferences/com.apple.networkextension.plist"
```

列出当前 app 的规则：
```bash
python3 - <<'PY'
import plistlib
p = plistlib.load(open('/tmp/ne.xml', 'rb'))
objs = p['$objects']
def d(x):
    return objs[x['CF$UID']] if isinstance(x, dict) and set(x) == {'CF$UID'} else x
root = next(o for o in objs if isinstance(o, dict) and 'Rules' in o and 'PayloadAppRules' in o)
for i, u in enumerate(d(root['Rules'])['NS.objects']):
    r = d(u)
    sid = d(r.get('SigningIdentifier'))
    if sid and ('vessel' in str(sid).lower() or 'ships' in str(sid).lower()):
        print(i, 'Deny=', r.get('DenyMulticast'), 'Decided=', r.get('MulticastPreferenceSet'), 'sid=', sid)
PY
```

判定：
| 状态 | 含义 | 处理 |
| --- | --- | --- |
| 没有 `cn.com.stdout.vessel` 的规则 | 系统还没评估过 | 打开 Vessel 窗口触发请求；或按 1.4 E 重置 |
| `Deny=True, Decided=False` | 默认拒绝、未弹过窗 / 未决定 | 触发请求；仍不弹就走 1.4 E |
| `Deny=False, Decided=True` | 已允许 | 若仍失败，回到第 2 步核对运行中的 id |
| `Deny=True, Decided=True` | 已明确拒绝 | 在系统设置里打开开关，或走 1.4 E |

> `tccutil reset LocalNetwork ...` 不会改变这些规则，不要指望它。

**第 5 步：在 App 内验证**

```bash
# 在 Vessel 内置终端里执行
ping -c 2 172.16.3.155
ssh root@172.16.3.155
```
- 通了 → 完成。
- 仍报 `No route to host` → 回到第 2 / 4 步；必要时按 1.4 E 重启后再试。

**第 6 步：确认弹窗行为（仅首次安装 / 新身份）**

- 新身份第一次发起本地网络访问时，系统应弹出「允许 Vessel 查找本地网络中的设备？」。
- 弹窗出现后请立即点「允许」；如果被忽略 / 自动消失，同一身份通常不会再弹。
- 弹窗时长与是否再次弹出由 macOS 决定，App 无法延长。

### 1.6 相关文件与常量

| 项目 | 位置 / 值 |
| --- | --- |
| appId | `package.json` → `build.appId` = `cn.com.stdout.vessel` |
| 主 app 描述 | `build.mac.extendInfo.NSLocalNetworkUsageDescription` |
| Helper 描述写入 | `scripts/after-pack.cjs` → `declareLocalNetworkUsage()` |
| 请求逻辑 | `src/main/services/local-network-service.js` |
| 请求触发点 | `src/main/main.js`、`src/main/ipc/ssh-ipc.js`、`src/main/ipc/net-test-ipc.js` |
| socket 保持 | `SOCKET_HOLD_MS = 30000` |
| 重试 | `RETRY_ATTEMPTS = 3`、`RETRY_DELAY_MS = 2500` |
| 请求合并窗口 | `MIN_REQUEST_INTERVAL_MS = 2000` |
| 授权规则存储 | `/Library/Preferences/com.apple.networkextension.plist`（SIP 保护） |
| 日志 | `~/Library/Logs/Vessel/vessel-YYYY-MM-DD.log` |
