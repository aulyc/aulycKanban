# 双发布源接入

本项目显式采用中央可选策略 `aulyc-dual-mirror-v1` `1.1.0`，Release Profile
仍是 `obsidian-plugin`。私有 GitHub 仓库 `aulyc/aulycKanban` 是唯一源码
权威；不得向 Gitee 推送源码。

公开分发映射由中央 `projects/release-channels.json` 管理：

- GitHub：`aulyc/aulycKanban-releases`，发布说明简体中文在前、English 在后；
- Gitee：`aulyc/aulycKanban-releases`，发布说明仅简体中文；
- 两端必须发布同一 ZIP、ZIP checksum、最终 provenance、provenance checksum
  和 `latest.json`。

当前插件没有独立的应用内更新下载器，`updater: N/A`。采用策略不会虚构该能力；
未来新增更新器前，必须先实现 GitHub `latest.json` 优先、Gitee fallback，并对
任一来源执行相同的版本、Commit、plugin ID、ZIP 白名单、SHA-256、provenance
与实际加载验证。

正式 ZIP、最终 provenance、Changelog 和真实 Vault 安装验证仍由项目现有流程
负责。源码 branch/tag 已按中央正式 Git gate 推送并回写最终 provenance 后，
准备中英文正文并运行：

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

`prepare` 只在项目目录内生成 sidecar、输入、两端说明、`latest.json` 和不可变
计划；`preflight` 只读；只有明确授权的 `publish` 才会写远端。任何一端失败都
保留无凭据的 partial/failed 状态，重试必须复用同一计划且不得覆盖旧版本。
公开镜像仓库未建好时，正式预检必须失败；不得绕过或临时改用源码仓库。
