# aulyckanban（Obsidian 插件）

`aulyckanban` 是一个面向 Obsidian 的任务看板插件，核心目标是用轻量、清晰的方式管理多个任务类型，并支持归档、筛选与 Markdown 同步。

## 主要功能

- 动态任务类型：除默认的工作任务、个人任务外，可通过顶部 `+` 任意新增，并可右键重命名或删除
- 左侧任务列表 + 右侧分类导航
- 全局共享象限：所有任务类型使用同一套象限，各自保存独立任务内容
- 象限管理：新增、重命名、删除（删除时自动迁移任务）
- 任务操作：快速新增、单击编辑、删除、归档
- 归档视图：筛选、排序、关键词搜索、恢复、批量删除
- 数据持久化：自动保存插件数据
- Markdown 同步：每个任务类型和统一归档可分别配置同步文件路径

## 安装方式（手动）

1. 打开你的 Vault 目录，进入：
   - `.obsidian/plugins/aulyckanban/`
2. 将以下文件复制到该目录：
   - `manifest.json`
   - `main.js`
   - `styles.css`
3. 在 Obsidian 中进入：
   - `设置 -> 第三方插件`
4. 启用 `aulyckanban`

## 开发与构建

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

发布前完整验证：

```bash
npm run release:verify
```

安装到本机正式 Vault：

```bash
npm run install:prod
```

默认安装到 `/Users/crp/Documents/Obsidian Plugin/my_vault`，只覆盖 `main.js`、`manifest.json`、`styles.css`，不会覆盖运行数据 `data.json`。如需临时安装到其他 Vault，可设置 `OBSIDIAN_VAULT_PATH`。

## 版本与发版

项目使用标准 SemVer，支持 `alpha.N`、`beta.N`、`rc.N` 测试版本。版本准备、发布提交、裸版本标签和测试版/正式版流程见 [VERSIONING.md](VERSIONING.md)。

## 可用命令（Command Palette）

- `Open board`：打开看板视图
- `Focus work`：切换到工作任务
- `Focus personal`：切换到个人任务

可在 Obsidian 的 `设置 -> 快捷键` 中为上述命令自行绑定快捷键。

## 数据与文件说明

- 插件元信息：`manifest.json`
- 版本兼容映射：`versions.json`
- 构建产物：`main.js`
- 样式文件：`styles.css`
- 运行数据：`data.json`

> 正常情况下，`data.json` 位于 Vault 的插件目录下：
> `.obsidian/plugins/aulyckanban/data.json`
> 如果你在项目目录中看到它，通常是本地开发映射/软链接导致。

## 当前设计说明

- 顶部任务类型可以动态新增；右键任务类型可重命名或删除；新增任务类型与新增象限均使用 Enter 确认
- 删除任务类型会同时删除其中的普通任务、归档任务和同步配置，但不会删除已经生成的 Markdown 文件；至少保留一个任务类型
- 所有任务类型共享同一套象限定义，每个“任务类型 × 象限”的任务内容相互独立
- 任务列表为当前分类全量渲染（非虚拟列表）
- 同步为“数据变更触发”，纯 UI 切换不触发同步
- 插件优先面向桌面端 Obsidian 使用体验

## 许可证

MIT
