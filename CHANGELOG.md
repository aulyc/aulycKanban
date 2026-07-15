# Changelog

本项目从 `2.2.0` 开始按标准 SemVer、独立发布元数据提交和不可变 annotated tag 记录变更。

## Unreleased

## [2.2.0] - 2026-07-15

- 简化归档选择操作，统一选择状态和批量删除交互。
- 接入 `obsidian-plugin` 通用发版规范、唯一权威版本源和独立递增构建号。
- 增加精确标签隔离构建、版本化 ZIP、release provenance、正式安装和真实加载验证门禁。
- 接入 Prettier 与 ESLint 质量门禁，并升级到 ESLint 9 flat config。
- 修复开发依赖安全公告，最低阈值 `npm audit` 恢复为零漏洞。
