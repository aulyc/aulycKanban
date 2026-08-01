# 双发布源接入

本项目显式采用中央可选策略 `aulyc-dual-mirror-v1` `1.2.0`，Release Profile
仍是 `obsidian-plugin`。私有 GitHub 仓库 `aulyc/aulycKanban` 是唯一源码
权威；不得向 Gitee 推送源码。

公开分发映射由中央 `projects/release-channels.json` 管理：

- GitHub：`aulyc/aulycKanban-releases`，发布说明简体中文在前、English 在后；
- Gitee：`aulyc/aulycKanban-releases`，发布说明仅简体中文；
- 两端必须发布同一 ZIP、ZIP checksum、最终 provenance、provenance checksum
  和 `latest.json`。

插件已内置项目级更新检查：GitHub `latest.json` 优先、Gitee fallback，并校验
正式渠道、版本、Commit、plugin ID 和官方下载页身份。自动检查默认关闭；发现
新版本后仅由用户明确点击打开官方下载页，插件不下载 ZIP/provenance、不安装、
不重载，也不替换 `main.js`、`manifest.json`、`styles.css` 或 `data.json`。

数字签名登记为未来应用内下载/安装能力的安全增强方向。它不属于当前“检查更新并
打开下载页面”功能，也不是当前测试或正式发版的前置条件、门禁或阻断项；当前发版
继续执行既有 Profile、双镜像一致性、checksum、provenance 和产物验证规则。

正式 ZIP、最终 provenance、Changelog 和发布产物验证仍由项目现有流程
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

纯正式发版不写入 Vault、不重载插件，完成时报告
`installationStatus: not-requested`。只有“正式发版安装”才在双端发布完整成功
后执行安装与真实加载验证。
