# 单一 GitHub 主仓、Obsidian Community 与 Gitee 双发布源

本项目采用中央可选策略 `aulyc-dual-mirror-v1` `1.6.0`，Release Profile 仍为
`obsidian-plugin`。目标分发拓扑只有两个仓库：

- GitHub `aulyc/aulycKanban`：唯一源码权威、正式 annotated tag 权威、GitHub
  Release 仓库和 Obsidian Community canonical repository；
- Gitee `aulyc/aulycKanban`：公开 Release、人工下载和渠道审计的第二
  分发源，不接收业务源码 Git push。

GitHub 主仓必须在首次 Community 发布前由仓库所有者明确授权改为 Public。当前
文档和本地代码变更不会自动修改仓库可见性，也不会删除旧 GitHub 发布专仓。

## 正式远端附件集合

每个新正式版本在 GitHub 和 Gitee 发布且仅发布三个同名、逐字节一致
的 Obsidian Community 文件：

1. `main.js`
2. `manifest.json`
3. `styles.css`

中央工具从精确标签构建的正式 ZIP 中只读提取这三个文件，并与
provenance 的逐文件 SHA-256 交叉验证。发现缺失文件、额外 ZIP 运行时
文件、远端额外附件或同名不同字节时 fail closed。

`aulycKanban-<version>.zip`、ZIP checksum sidecar、最终 release provenance
和 provenance checksum sidecar 仍是必须的本地 `verificationEvidence`，但不
上传到 GitHub/Gitee Release。`latest.json` 与 GitHub `release-channel`
分支对本模式均为 `N/A`；两端状态的 manifest 阶段必须是
`not-applicable`。

## 更新职责

项目运行时 `updater: N/A`。设置页不提供启动检查或手动检查，插件也不请求
`latest.json`、不下载、不安装、不重载、不替换任何插件文件。Community 收录后，
更新由 Obsidian 官方机制管理。

Gitee 仍保留同版本三文件 Release，用于公开人工下载、网络可达性备用
和发布审计；它不是第二个 Obsidian 官方自动更新源。数字签名只在未来新增项目
自有下载/安装器时重新评估，不阻断当前 Community/GitHub/Gitee 发版。

## 双源发布命令

正式 ZIP、最终 provenance、Changelog 和精确 tag 验证仍由现有项目流程负责。
源码 `main` 与 annotated tag 已通过中央正式 Git gate 原子推送、远端回读并写入
最终 provenance 后，准备中英文正文并运行：

```bash
bash scripts/dual-mirror-release.sh prepare \
  --provenance release-artifacts/aulycKanban-<version>.release-provenance.json \
  --notes-zh-cn release-artifacts/release-notes.zh-CN.md \
  --notes-en release-artifacts/release-notes.en.md \
  --output-dir release-artifacts/dual-mirror-<version>

bash scripts/dual-mirror-release.sh preflight \
  --plan release-artifacts/dual-mirror-<version>/dual-mirror-plan.json
bash scripts/dual-mirror-release.sh publish \
  --plan release-artifacts/dual-mirror-<version>/dual-mirror-plan.json \
  --state release-artifacts/dual-mirror-<version>/dual-mirror-state.json
bash scripts/dual-mirror-release.sh verify \
  --plan release-artifacts/dual-mirror-<version>/dual-mirror-plan.json \
  --state release-artifacts/dual-mirror-<version>/dual-mirror-state.json
```

`prepare` 只执行本地校验与 staging；`preflight` 只读。只有用户单独明确授权
`publish` 才会创建 GitHub/Gitee Release 并上传三个附件；本模式不生成或
推进 `latest.json`。
任何一端失败都保留不含凭据的 `partial` / `failed` 状态；重试必须复用同一计划，
不得覆盖同版本附件、移动标签或修改不可变计划。

纯正式发版不写入 Vault、不重载插件，报告
`installationStatus: not-requested`。只有“正式发版安装”才消费已验证的精确 ZIP，
只覆盖 `main.js`、`manifest.json`、`styles.css`，保留 `data.json`，并完成真实加载
验证。

## Community 上架与旧仓迁移

首次提交前必须同时满足：

- `aulyc/aulycKanban` 已公开，默认分支根目录包含当前 `manifest.json`、README 和
  LICENSE；
- 新版本 tag 与 `manifest.json#version` 完全一致；
- 同版本 GitHub Release 已单独附带 `main.js`、`manifest.json`、`styles.css`；
- Release 不是 draft 或 prerelease，三个文件与精确 tag ZIP/provenance 一致；
- GitHub/Gitee 同版本 Release 没有 ZIP、sidecar、provenance、
  `latest.json` 或其他额外附件；
- 插件运行时不包含自更新机制，网络访问和数据行为在 README 中准确披露；
- 通过 Obsidian 官方提交入口登记 `aulyc/aulycKanban`。

历史 GitHub `aulyc/aulycKanban-releases` 已通过 `2.9.2` 兼容桥接完成迁移，随后
按单独授权删除。Gitee Release 镜像已从 `aulyc/aulycKanban-releases` 重命名为
`aulyc/aulycKanban`；后续发布只使用本文件顶部声明的两个同名仓库，且仍禁止向
Gitee 推送业务源码。
