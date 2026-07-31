# 版本与发版规范

本项目采用 `obsidian-plugin` Release Profile、标准 SemVer、严格递增构建号、不可变 annotated tag、精确 tag 隔离构建和独立 release provenance。Distribution 为 `local-vault`。

## 1. 迁移边界

- 已发布正式版本仍是 `2.1.19`，本次规范接入不创建新发布身份。
- `release-version.json` 中的 `buildNumber: 0` 只表示未发布的规范迁移态，不是历史 `2.1.19` 的追溯构建号。
- 第一个未来测试或正式发布必须使用正整数构建号；此后构建号跨测试/正式渠道严格递增，不得重复或倒退。
- 新规则从 `2.1.19` 之后的第一个版本开始执行。

## 2. SemVer 与发布渠道

正式版本格式为 `MAJOR.MINOR.PATCH`。数字段允许超过 9，例如 `2.0.9 -> 2.0.10`；只有兼容功能更新才增加 MINOR。

测试版本只允许：

- `MAJOR.MINOR.PATCH-alpha.N`
- `MAJOR.MINOR.PATCH-beta.N`
- `MAJOR.MINOR.PATCH-rc.N`

序号从 1 开始。同一内容变化必须使用新版本和新构建号，不能覆盖旧产物。正式渠道只接受无预发布后缀的稳定 SemVer。

## 3. 唯一权威版本源

`release-version.json` 是 `version` 和 `buildNumber` 的唯一权威来源。以下均为派生文件：

- `package.json`
- `package-lock.json` 顶层和根 package 版本
- `manifest.json`
- `versions.json`
- `dist/manifest.json`

准备未来版本时运行：

```bash
npm run version:set -- 2.1.20-beta.1 1
```

只同步现有权威值时运行 `npm run version:sync`。禁止手工多点修改派生版本；`npm run version:check` 发现任一漂移或非法构建号时 fail closed。

`manifest.json#minAppVersion` 是兼容性声明，`versions.json` 必须包含当前权威版本到该值的映射。Obsidian `manifest.json` 不是 release provenance。

## 4. Changelog 与发布元数据提交

本次规范迁移只写入 `CHANGELOG.md` 的 `Unreleased`，不属于已发布 `2.1.19`。

未来发布必须把 `Unreleased` 内容整理到精确标题：

```text
## [2.1.20-beta.1] - 2026-07-15
```

功能代码先独立提交并保持工作区 clean。随后创建 `chore: release <version>` 发布元数据提交；该提交只能包含：

- `release-version.json`
- 派生版本文件
- `CHANGELOG.md`
- 其他确有必要且受脚本允许的发布元数据

不得把功能代码、构建产物或用户数据混入发布元数据提交。

## 5. 标签规则

历史中同时存在 lightweight 和 annotated tags，全部作为只读遗留记录保留。验证工具不得仅因历史 lightweight tag 存在而失败。

新发布标签必须：

- 名称与权威版本完全一致且不带 `v`；
- 为 annotated tag；
- 指向对应的独立发布元数据提交；
- 在 `npm run release:check` 全部通过后才创建；
- 已创建后不得移动、覆盖、删除后复用或重建。

`npm run release:tag` 只创建缺失的合规标签，或验证已存在标签仍指向同一发布提交。它不生成或安装最终产物。

## 6. 标签前 production 候选

工作区 clean 后运行：

```bash
npm run release:check
```

该命令运行本地 CI-equivalent 门禁、production bundle 和三文件候选白名单验证，并在前后检查工作区 clean。候选构建使用与最终 ZIP 相同的 `npm run build:production` 配置和文件集合。它绝不创建标签、安装插件、执行 smoke 或发布文件。

仓库当前没有远端 CI 配置；`npm run ci` 是本地 CI-equivalent 聚合门禁。

## 7. 精确标签隔离构建与产物

未来 `release:test` 和 `release:formal` 只接受当前权威版本对应的 annotated tag，并执行：

1. 验证 tag 名称、类型、版本、构建号和目标 Commit。
2. 在系统临时目录创建 exact-tag detached worktree。
3. 构建前检查 worktree clean，运行 `npm ci --ignore-scripts`、版本检查和 production 构建。
4. 验证 `dist/` 只含 `main.js`、`manifest.json`、`styles.css`，且与构建目录逐文件一致。
5. 构建后再次检查 worktree clean。
6. 生成 `aulycKanban-<version>.zip` 和 `aulycKanban-<version>.release-provenance.json`。
7. 安全移除临时 worktree。

ZIP 根目录只允许：

- `main.js`
- `manifest.json`
- `styles.css`

验证器拒绝额外/缺失/重复路径、目录、绝对路径、路径穿越、反斜杠路径、符号链接、`data.json`、用户数据和开发文件。已存在的同版本产物不会被覆盖。

provenance 从真实 Git、tag 和 ZIP 提取并交叉验证：Profile、渠道、版本、构建号、tag、Commit、`dirty:false`、插件 ID、最低 Obsidian 版本、`isDesktopOnly`、Distribution、ZIP 文件名/SHA-256，以及三个文件的 SHA-256。它不得包含 Vault 路径、用户数据、Token、凭据或本机身份。

新构建只能生成 `aulycKanban-<version>` 前缀的 ZIP 和 provenance。当前验证器为只读历史兼容，可继续验证 `2.3.5` 及以前使用 `aulyckanban-<version>` 前缀的既有产物；该兼容分支不能用于生成新产物，也不能重写历史文件。

## 8. 测试与正式发版命令

测试版必须使用 `alpha.N`、`beta.N` 或 `rc.N`：

```bash
npm run release:test
```

正式版必须使用稳定 SemVer：

```bash
npm run release:formal
```

两条命令都要求已有精确合规标签，从隔离 tag 重新构建并验证独立产物，但不写入
Vault、不重载插件。测试 ZIP 不能改名冒充正式 ZIP。本项目正式发版将 `main` 和
annotated tag 原子推送到中央绑定的 `aulyc/aulycKanban`，回读远端两个 ref，
并把远端源码身份写入最终 provenance；测试发版不推送。纯发版安装状态为
`not-requested`。

只有明确要求“测试发版安装”或“正式发版安装”时，分别运行：

```bash
npm run release:test:install -- --vault <test-vault-path>
npm run release:formal:install -- --vault <vault-path>
```

这两个入口在对应发布完成后安装本次精确 ZIP 并执行真实加载 smoke。

`npm run version:set` 在改动权威版本源前执行中央 GitHub preflight；认证、仓库访问、remote fetch/push URL、正式分支或工作区状态无法验证时不会修改版本文件。

中央受控发版脚本所在仓库通过 `AULYC_STANDARDS_ROOT` 配置；当前主机默认 `/Users/crp/Projects/Codex 开发规范`。在其他主机或全新克隆环境执行 `version:set`、`formal-git:preflight` 或 `release:formal` 前，必须先交付中央规范仓库并设置该变量。路径缺失时流程 fail closed，不允许以分步 push 替代原子发布与远端回读。

## 9. 正式安装与数据保护

本节只在用户明确要求安装时执行。“安装测试版”或“安装正式版”只消费既有
ZIP/provenance，不创建新版本、标签或远端 Release。

正式安装器不接受当前工作区 `dist/`，也没有静默 fallback。必须显式提供版本化 ZIP 和对应 provenance：

```bash
npm run install:formal -- \
	--zip <aulycKanban-version.zip> \
	--provenance <aulycKanban-version.release-provenance.json> \
	--vault <vault-path>
```

目标 Vault 的优先级为显式 `--vault`、`OBSIDIAN_VAULT_PATH`、Obsidian CLI 当前/指定 Vault 发现；不硬编码默认 Vault。
通过 `OBSIDIAN_VAULT_NAME` 指定 Vault 时，CLI 调用必须使用 `obsidian <command> [arguments] vault=<name>` 的参数顺序。

安装前验证 ZIP、provenance、tag、Commit、版本、构建号、渠道、插件 ID、文件集合和所有 SHA-256。安装时只覆盖三个发布文件，保留 `data.json` 及其他用户运行数据；安装后逐文件复算 SHA-256，并核对目标 `manifest.json` 的 ID 和版本。

产品显示名为 `aulycKanban`，但插件 ID、npm package name 和目标目录 `.obsidian/plugins/aulyckanban/` 保持不变。安装器不得把该兼容目录当作旧品牌残留删除，也不得迁移或覆盖其中的 `data.json`。

## 10. 安装后 Obsidian smoke

```bash
npm run smoke:obsidian -- --manifest <目标插件目录/manifest.json>
```

未显式传 manifest 时，脚本通过 Obsidian CLI 发现当前或 `OBSIDIAN_VAULT_NAME` 指定的 Vault，再读取实际安装 manifest；不使用仓库根 manifest 作为期望身份。smoke 验证插件重载、启用状态、真实加载版本、命令注册、看板 DOM 和新运行时错误。

由于插件声明 `isDesktopOnly: false`，桌面端 smoke 不能替代移动端兼容性验证。

## 11. 禁止事项

- 不得从 dirty 工作区、可变分支或调用者伪造 Git 字段生成测试/正式 provenance。
- 不得创建 lightweight 新发布标签，或移动、删除、重建任何历史标签。
- 不得把 `manifest.json` 称为 release provenance。
- 不得把 macOS App 的签名、公证、Gatekeeper、架构或 Apple 构建号规则用于本插件。
- 不得在 ZIP、provenance、日志或测试 fixture 中写入真实 Vault 数据、凭据或本机身份。
