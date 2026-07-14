# AGENTS.md

## Obsidian CLI

- 本机已注册官方 Obsidian CLI，预期命令路径为 `/usr/local/bin/obsidian`。
- CLI 属于本机开发工具，不得加入插件运行时依赖，也不得作为普通用户使用插件的前置条件。
- 进行真实 Obsidian 验证前，先运行 `command -v obsidian`。如果 CLI 无法连接，确认 Obsidian 已启动后重试。
- 默认连接当前活动 Vault；需要指定其他 Vault 时设置 `OBSIDIAN_VAULT_NAME`，不要在自动化脚本中写死易变的 Vault 路径或名称。
- 插件构建并复制到 Vault 后，运行 `npm run smoke:obsidian`。该命令必须完成插件重载、版本与启用状态核对、插件命令执行、DOM 渲染断言和运行时错误检查。
- 排查真实 UI 问题时，优先使用 `dev:errors`、`dev:console`、`dev:dom`、`dev:css` 和 `dev:screenshot` 获取证据。
- CLI 冒烟验证不能替代单元测试、TypeScript 检查、生产构建或移动端验证。
