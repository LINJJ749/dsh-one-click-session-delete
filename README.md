# dsh-one-click-session-delete

[中文](#中文) | [English](#english)

A DeepSeek Harness (DSH) plugin that adds **one-click permanent Session deletion** to the Workspace sidebar, plus a lightweight confirmation dialog.

DSH ships archive-only Session management: the persistence layer has no delete API, and the Session list is a core surface that does not expose permanent removal. This plugin adds that operation through the official extension slots — no DOM injection, no patching of shipped UI.

## English

### Features

- **Hover button on every Session row**: a trash icon at the end of the row's action strip, after the shipped archive and pin buttons.
- **The same action in the Session's `...` menu**, after the shipped Session-ID row.
- **One lightweight confirmation**: shows the Session title, the irreversible warning, and Cancel / Delete buttons; an in-flight state and an inline error message on failure.
- **Live-Session protection**: a Session that is open or running is refused (its write handle would otherwise recreate a header-less log after deletion). Switch to another Session first.
- **Derived-Session handling**: when the target has derived Sessions (subagents, or forked Sessions that carry `parentSession`), the first attempt is refused with their count. The confirmation dialog then offers one more explicit step — "Delete all N sessions" — and the subtree is removed children-first. A live descendant refuses the whole operation.
- **Complete, bounded removal**:
  - the Session's own log directory under `<DSH_HOME>/sessions/--<cwd>--/<sessionId>/` (every format generation). The canonical log files are renamed to `*.deleted-<timestamp>` first — the single atomic commit point; a Session without a canonical log is immediately invisible to list/stat/open — then the directory is removed best-effort;
  - the Session's persisted projection-cache record in the `session_projcache` storage domain, through the domain write chain so memory and disk stay consistent;
  - best-effort workspace bookkeeping: the Session is detached from its Workspace accounting slot and removed from the archive/pin sets.
- **No page reload**: the deleted row is removed locally and the Session list is re-aligned with the Host in the background.
- Bilingual zh/en UI, inheriting the host theme tokens and locale.

### Install

```sh
# from GitHub (works today)
dsh plugin --profile <your-profile> add github:LINJJ749/dsh-one-click-session-delete

# or from npm, once published
dsh plugin --profile <your-profile> add dsh-one-click-session-delete
```

Replace `<your-profile>` with your profile name (for example `desktop` or `web`), and `LINJJ749/dsh-one-click-session-delete` with this repository. The package declares the `dsh.bundle` manifest, so `dsh plugin add` installs and mounts it without any manual patch edit.

### Usage

Hover a Session row in the Workspace sidebar and click the trash button, or open the row's `...` menu and choose **Delete session**. Confirm in the dialog. The row disappears; the Session's local records are gone permanently.

To merely hide a Session and keep its records, use the shipped **Archive session** action instead.

### Safety and limits

- Permanent deletion: no trash, no undo. Archived Sessions can be deleted too; they are removed from the archive set as part of the cleanup.
- Open/running Sessions are always refused. Deleting the Session you are currently viewing requires switching to another Session first.
- Attachments are content-addressed and shared across Sessions; the plugin does not delete them.
- If a deployment enables the persistent SQLite content-search index, this plugin does not touch index files (that index reconciles itself).
- The plugin resolves the Session root from the live `sessionPersistence` service, falling back to the launcher-provided home path; nothing is hard-coded.
- The Host half exposes one same-origin JSON route (`POST /session-delete/api/delete`) protected by the Host's connection trust fence; the Client half adds slot registrations only.
- The Host half is not sandboxed by the plugin system: it runs with the Host process's permissions and removes files under the DSH home. Review the code — it only removes the selected Session's own storage paths.

### Compatibility

- DeepSeek Harness `0.2.1-rc.2` (tested). Uses `webServer`, `connection`, `sessionPersistence`, `storageDomain`, `workspaceRegistry`, `sessionQuery`, `agents`, `sessions` Host services and the `sidebar.workspaces.session.row.action` / `sidebar.workspaces.session.menu.item` / `shell.overlay` Client slots.
- Node.js >= 20. No build step, no runtime dependencies.
- Windows, macOS and Linux.

## 中文

DSH（DeepSeek Harness）工作区侧栏增强插件：给侧栏会话行增加**一键永久删除**，并附带一次轻量确认。DSH 官方只支持归档；持久化层没有删除接口。本插件通过官方扩展 Slot 实现该操作，不注入 DOM、不改官方 UI。

### 功能

- **会话行悬停按钮**：归档/置顶按钮之后多一个垃圾桶图标按钮。
- **会话 `...` 菜单项**：与按钮同一操作，位于官方「复制会话 ID」之后。
- **一次轻量确认**：显示会话标题、不可恢复警告，确认/取消；删除中显示进度，失败就地显示原因。
- **运行中保护**：正在打开/运行的会话一律拒绝删除（否则写句柄会在文件删除后重建出无 header 的坏日志），请先切换到其它会话。
- **派生会话**：目标存在派生会话（子代理，或带 `parentSession` 的分叉）时，首次删除被拒绝并返回数量；确认框再给出「一并删除 N 个会话」，按先子后父删除整棵子树；子树内有运行中会话则整体拒绝。
- **完整且边界明确的删除**：
  - `<DSH_HOME>/sessions/--<cwd>--/<sessionId>/` 下该会话自己的日志目录（全部格式代际）：先把 canonical 日志改名为 `*.deleted-<时间戳>`（唯一原子提交点，此后该会话对 list/stat/open 立即不可见），再尽力删除目录；
  - `session_projcache` 存储域中该会话的投影缓存记录（走领域写链，内存与磁盘一致）；
  - 尽力清理工作区记账：从所属工作区的 `sessionIds`、归档集合与置顶集合中摘除。
- **无需刷新页面**：删除成功后本地移除该行，并在后台与 Host 会话基线对齐。
- 中英双语，继承宿主主题 token 与语言设置。

### 安装

```sh
dsh plugin --profile <profile 名> add github:LINJJ749/dsh-one-click-session-delete
```

包内声明了 `dsh.bundle` 清单，`dsh plugin add` 会自动写入 profile 的 bundle 层，无需手工改 `cordis.patch.yml`。

### 使用

在左侧工作区侧栏把鼠标悬停到会话行上，点击垃圾桶按钮；或打开该行的 `...` 菜单选择「删除会话」，在确认框中确认。该行会消失，本地记录永久删除。

只想从侧栏收起、保留记录时，请使用官方「归档会话」。

### 安全与限制

- 永久删除：没有回收站、不可撤销；归档会话也可以删除（会同时从归档集合清理）。
- 正在打开/运行的会话总是被拒绝；删除当前正在查看的会话需要先切换会话。
- 附件是内容寻址且跨会话共享的，本插件不删除附件。
- 若部署启用了持久 SQLite 内容搜索索引，本插件不触碰索引文件（该索引自带 reconcile 自愈）。
- 会话根目录来自运行时 `sessionPersistence` 服务，回退到启动器提供的 home 路径，不硬编码。
- Host 半只注册一个同源 JSON 路由（`POST /session-delete/api/delete`），由 Host 的 connection 信任栅栏保护；Client 半只做 Slot 注册。
- Host 半以宿主进程权限运行（插件不受沙箱约束），会删除 DSH home 下所选会话自己的存储路径；请阅读源码。

### 兼容性

- DeepSeek Harness `0.2.1-rc.2`（已实测）。使用 `webServer`、`connection`、`sessionPersistence`、`storageDomain`、`workspaceRegistry`、`sessionQuery`、`agents`、`sessions` 等 Host 服务与 `sidebar.workspaces.session.row.action` / `sidebar.workspaces.session.menu.item` / `shell.overlay` 三个 Client Slot。
- Node.js >= 20。无构建步骤、无运行时依赖。
- Windows / macOS / Linux。

## License

MIT
