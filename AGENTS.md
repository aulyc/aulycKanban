# AGENTS.md

## Repository purpose

本仓库构建 Obsidian 看板插件 `aulyckanban`。首要保证是插件数据兼容、用户运行数据不进入发布产物且安装升级不覆盖 `data.json`。

## Stack and platform

- TypeScript、Obsidian API、esbuild、Node.js ESM 脚本、npm。
- 支持目标：Obsidian 桌面端和移动端；`manifest.json` 声明 `isDesktopOnly: false`。
- 当前自动化构建与真实加载 smoke 覆盖桌面端；移动端兼容性必须单独验证。

## Repository map

- `src/`：插件业务、数据、服务和 UI 源码。
- `tests/`：Node 单元测试及只使用临时 Git 仓库、ZIP、Vault 的发布集成测试。
- `scripts/`：production 构建、发布门禁、隔离标签构建、产物验证、安装和 Obsidian smoke。
- `release-version.json`：当前版本和构建号的唯一权威来源。
- `manifest.json`、`versions.json`：Obsidian 产品元数据和兼容性映射；均不是 release provenance。
- `dist/`：由 `npm run build:production` 生成并检查的三文件发布目录；禁止手工编辑。

## Architecture boundaries

1. `src/` 拥有运行时行为，不得依赖发布脚本、Obsidian CLI、Vault 绝对路径或发布凭据。
2. `scripts/` 只处理仓库元数据和发布文件；正式产物不得包含 Vault 内容、用户数据、`data.json`、开发文件或本机身份。
3. `release-version.json` 到派生版本文件只能单向同步；变更后运行 `npm run version:sync`，检查生成 diff，并提交必要派生文件。

## Command mapping

- Development: `npm run dev`
- Generate derived version files: `npm run version:sync`
- Local production build: `npm run build:production`
- Formatter write: `npm run format`
- Formatter check: `npm run format:check`
- Lint gate: `npm run lint`
- Language gate: `npm run typecheck`
- Shared development gate: `npm run check`
- Full CI-equivalent gate: `npm run ci`
- Local development installation: N/A；正式安装只接受已验证发布 ZIP 和 provenance

除非用户明确要求，不得安装、发版、创建标签或执行 `release:test`、`release:formal`。本仓库当前没有远端 CI 配置；`npm run ci` 是本地 CI-equivalent 门禁，不得自行添加远端发布服务。

## Quality gates by change scope

- TypeScript、UI、数据或样式行为：最少运行 `npm run format:check`、`npm run lint`、相关测试和 `npm run typecheck`。
- 构建、依赖、版本或发布脚本：运行 `npm run ci`。
- 标签前候选：工作区 clean 后运行 `npm run release:check`。
- 文档：核对命令、文件和合同与真实脚本一致；若命令或合同变化，运行对应自动化测试。

报告所有未运行门禁和原因。除排错外，不重复运行已被成功聚合命令覆盖的检查。

## Generated files and build outputs

- Authoritative version source: `release-version.json`
- Derived tracked version files: `package.json`、`package-lock.json`、`manifest.json`、`versions.json`、`dist/manifest.json`；禁止手工多点改版本。
- Generated release directory: `dist/main.js`、`dist/manifest.json`、`dist/styles.css`，由 `npm run build:production` 生成并由 `npm run artifact:verify` 复核。
- Never commit: `node_modules/`、根 `main.js`、`release-artifacts/`、`data.json`、Vault 数据、临时 worktree、ZIP、release provenance、缓存和凭据。

## Data, credentials, and sensitive information

- 数据结构变化必须保持现有 Vault 数据兼容，并补迁移/回归测试。
- 测试只使用合成数据和系统临时目录。
- 不得把用户数据、密码、Token、密钥、本机路径、Vault 内容或私有配置写入 fixture、ZIP、provenance、截图、日志或 Git 历史。
- 安装只能覆盖 `main.js`、`manifest.json`、`styles.css`，必须保留 `data.json` 和其他用户运行数据。

## Documentation

- 行为、命令、架构、派生文件或发布合同变化时同步更新文档。
- 保持 `README.md`、`VERSIONING.md`、`CHANGELOG.md` 与真实脚本一致。
- 脚本和现有配置是实现事实；高风险操作前必须先解决文档漂移。

## Versioning and Release Profile

- Baseline: 必须加载并遵循 `general-release-versioning` Skill。
- Standards adoption: `.codex/standards.json`；采用状态由中央扫描器计算，项目不得自行声明 `compatible`。
- Release profile: `obsidian-plugin`
- Project type: Obsidian plugin
- Supported release targets: Obsidian 桌面端和移动端兼容插件文件
- Distribution identity: `local-vault`
- Authoritative version source: `release-version.json`
- Build-number source: `release-version.json#buildNumber`
- Product/package metadata: `manifest.json`、`package.json`、`package-lock.json`、`versions.json`
- Derived version files: `package.json`、`package-lock.json`、`manifest.json`、`versions.json`、`dist/manifest.json`
- Release provenance: `release-artifacts/aulyckanban-<version>.release-provenance.json`，由精确 annotated tag 的隔离构建生成

只读取公共核心和 `obsidian-plugin` Profile。不得应用 `macos-arm64-app` 的 Apple 构建号、架构、Developer ID、签名、公证、Staple 或 Gatekeeper 规则。

### Release command mapping

- Non-blocking standards check: `python3 "/Users/crp/Projects/Codex 开发规范/scripts/standards_check.py" project --path "/Users/crp/Projects/aulyckanban"`
- Strict standards release gate: `python3 "/Users/crp/Projects/Codex 开发规范/scripts/standards_check.py" project --path "/Users/crp/Projects/aulyckanban" --strict`
- Local development build: `npm run build:production`
- Local development installation: N/A
- Version consistency check: `npm run version:check`
- Version logic tests: `npm run version:test`
- Pre-tag production candidate gate: `npm run release:check`
- Create or verify release tag: `npm run release:tag`
- Test release: `npm run release:test -- --vault <test-vault-path>`
- Formal release: `npm run release:formal -- --vault <vault-path>`
- Verify candidate files: `npm run artifact:verify`
- Install an explicit formal artifact: `npm run install:formal -- --zip <zip> --provenance <file> --vault <vault-path>`
- Post-install live verification: `npm run smoke:obsidian -- --manifest <installed-manifest-path>`

### Required release gates

- `npm run version:check`、`npm run format:check`、`npm run lint`、`npm run typecheck`、全部测试、production bundle 和三文件白名单验证。
- `release:check` 使用与最终 ZIP 相同的 `build:production` 和文件白名单，并在前后验证调用工作区 clean；它不得创建标签。
- 新发布只接受名称等于权威版本、指向独立发布元数据提交的 annotated tag。
- 最终测试/正式 ZIP 从精确 tag 的 detached worktree 构建，构建前后均须 clean。
- provenance 的 profile、channel、version、buildNumber、tag、commit、`dirty:false`、插件元数据、distribution 和所有 SHA-256 必须与真实 Git、ZIP 和文件交叉验证。
- 安装后逐文件复算 SHA-256，再用实际安装 manifest 驱动 Obsidian CLI smoke。

### Project-specific adaptations

- Build number: 本项目显式使用独立 `buildNumber`。规范迁移保持 `2.1.19` 和 `buildNumber: 0`，不为历史版本伪造构建号；第一个未来测试或正式发布必须使用正整数，之后跨测试/正式渠道严格递增、不得重复或倒退。
- Distribution: `local-vault`，没有仓库发布或社区插件渠道上传步骤；以版本化 ZIP、独立 provenance、目标 Vault 安装哈希和实际加载身份作为补偿验证。
- Historical tags: 历史 lightweight 与 annotated tags 均为只读遗留记录；不得移动、删除或重建。新规则从 `2.1.19` 之后的第一个版本开始执行。
- CI: 当前没有远端 CI 配置；以 `npm run ci` 作为本地等价门禁。
- macOS trust fields: N/A；本仓库不发布原生 macOS artifact。

### Standards evidence and feedback

- Version-source signals: `release-version.json`。
- Release-document and script signals: `AGENTS.md`、`CHANGELOG.md`、`VERSIONING.md`、`package.json`、`version-bump.mjs` 和 `scripts/` 下的发布、构建、安装、ZIP、provenance、tag 与 smoke 脚本。
- CI signals: `package.json`；仓库当前没有远端 CI workflow。
- Tracked drift evidence: `AGENTS.md`、`VERSIONING.md`、`version-bump.mjs` 和稳定发布控制脚本；复核后的 SHA-256 记录在 `.codex/standards.json`。
- Active exceptions: none。
- Release-process feedback classification: `project-only`；本次只补齐项目采用映射和中央登记，不修改公共核心或 `obsidian-plugin` Profile。

### Release documentation and invariants

- 发版前完整读取 `VERSIONING.md`、`CHANGELOG.md` 和实际脚本。
- 发布元数据提交只能包含权威版本、构建号、派生版本文件和 Changelog 等发布元数据。
- 先通过同配置候选构建，再创建/验证标签；最终产物必须从精确标签隔离重建。
- `manifest.json` 是 Obsidian 产品元数据，不能替代 `*.release-provenance.json`。
- 若项目现状与公共不变量冲突，停止发版并说明冲突、影响和建议方案。

## Obsidian CLI

- 本机已注册官方 Obsidian CLI，预期命令路径为 `/usr/local/bin/obsidian`。
- CLI 属于本机开发工具，不得加入插件运行时依赖，也不得作为普通用户使用插件的前置条件。
- 进行真实 Obsidian 验证前，先运行 `command -v obsidian`。如果 CLI 无法连接，确认 Obsidian 已启动后重试。
- 默认连接当前活动 Vault；需要指定其他 Vault 时设置 `OBSIDIAN_VAULT_NAME`，不要在自动化脚本中写死易变的 Vault 路径或名称。
- 插件构建并复制到 Vault 后，运行 `npm run smoke:obsidian`。该命令必须完成插件重载、版本与启用状态核对、插件命令执行、DOM 渲染断言和运行时错误检查。
- 排查真实 UI 问题时，优先使用 `dev:errors`、`dev:console`、`dev:dom`、`dev:css` 和 `dev:screenshot` 获取证据。
- CLI 冒烟验证不能替代单元测试、TypeScript 检查、生产构建或移动端验证。
