# 版本与发版规范

本项目使用标准 Semantic Versioning（SemVer）和不可变 Git 标签。版本号、发布提交、标签和安装产物必须一一对应。

## 1. 版本号

正式版本格式为 `MAJOR.MINOR.PATCH`：

- `MAJOR`：不兼容改动，例如数据格式或公共行为发生破坏性变化
- `MINOR`：向后兼容的新功能
- `PATCH`：向后兼容的 Bug、安全或性能修复

数字段允许超过 9，例如 `2.0.9 -> 2.0.10`。只有发生兼容功能更新时才使用 `2.1.0`。

## 2. 测试版本

公开测试包只使用以下预发布格式：

- `MAJOR.MINOR.PATCH-alpha.N`：内部开发测试
- `MAJOR.MINOR.PATCH-beta.N`：功能基本完成的测试版本
- `MAJOR.MINOR.PATCH-rc.N`：正式发布候选版本

序号从 1 开始，每次重新发包必须递增。示例：

```text
2.2.0-alpha.1
2.2.0-beta.1
2.2.0-rc.1
2.2.0
```

临时 CI 构建可以使用 Commit SHA 或构建号识别，不创建公开版本标签。

## 3. 版本来源与同步

`package.json` 是目标版本来源。运行：

```bash
npm run version:set -- 2.2.0-beta.1
```

会由 npm 更新 `package.json` 和 `package-lock.json`，随后通过 `version-bump.mjs` 同步：

- `manifest.json`
- `versions.json`

同步脚本会拒绝非法 SemVer、版本不一致和新增版本倒退。已经存在的当前版本允许重复同步，以支持构建复核。

## 4. 发布前验证

运行：

```bash
npm run release:verify
```

必须同时满足：

- 完整测试通过
- TypeScript 检查和生产构建通过
- `package.json`、`package-lock.json`、`manifest.json`、`dist/manifest.json` 版本一致
- `versions.json` 的兼容版本与 `manifest.minAppVersion` 一致
- `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 与根目录构建文件逐字节一致
- 公开预发布版本只使用 `alpha.N`、`beta.N` 或 `rc.N`

## 5. Commit 与标签

普通开发提交不修改版本号。发版时单独创建发布提交：

```text
chore: release 2.2.0-beta.1
chore: release 2.2.0
```

发布顺序：

```bash
npm run version:set -- <目标版本>
npm run release:verify
git add -A
git commit -m "chore: release <目标版本>"
git tag <目标版本>
```

标签不带 `v`，必须与版本号完全一致，并指向对应发布提交。已发布标签不得移动、覆盖或复用；发布后发现问题必须增加版本号。

## 6. 测试版发版

以 Bug 修复测试版为例：

```bash
npm run version:set -- 2.1.3-beta.1
npm run release:verify
git add -A
git commit -m "chore: release 2.1.3-beta.1"
git tag 2.1.3-beta.1
```

同一目标版本继续测试时使用 `beta.2`、`rc.1`，不能覆盖 `beta.1`。

## 7. 正式版发版

RC 验收通过后去掉预发布后缀，重新执行完整验证：

```bash
npm run version:set -- 2.1.3
npm run release:verify
git add -A
git commit -m "chore: release 2.1.3"
git tag 2.1.3
```

正式安装包必须从正式标签对应的提交构建，不能直接把测试包改名为正式包。

## 8. 安装与数据保护

本项目只安装以下发布文件：

- `dist/main.js`
- `dist/manifest.json`
- `dist/styles.css`

运行数据 `data.json` 不属于发布产物，安装或升级时不得覆盖。安装后必须重新加载插件，并核对运行中的实际版本。

本机正式 Vault 默认为 `/Users/crp/Documents/Obsidian_Vault`。完成正式提交与标签后执行：

```bash
npm run install:prod
```

安装脚本会重新执行完整发布验证，只复制上述三个发布文件，并逐字节核对安装结果。可通过 `OBSIDIAN_VAULT_PATH` 临时覆盖目标 Vault。
