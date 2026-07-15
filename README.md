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

日常检查和本地 CI-equivalent 门禁：

```bash
npm run format
npm run format:check
npm run lint
npm run check
npm run ci
```

`npm run format` 使用 Prettier 写入统一格式；`npm run format:check` 和 ESLint 均已纳入 `npm run check`，因此也会被 `npm run ci` 与标签前候选门禁覆盖。

标签前 production 候选门禁（要求工作区 clean，不创建标签）：

```bash
npm run release:check
```

正式安装只接受显式传入且已验证的版本化 ZIP 和对应 `*.release-provenance.json`，不直接安装当前工作区 `dist/`，也不硬编码默认 Vault。安装器只覆盖 `main.js`、`manifest.json`、`styles.css`，并保留 `data.json` 和其他用户运行数据。完整命令见 [VERSIONING.md](VERSIONING.md)。

使用已注册的官方 Obsidian CLI 进行真实运行冒烟验证：

```bash
npm run smoke:obsidian
```

该命令通过当前活动 Vault 的实际安装 manifest 获取期望插件 ID/版本，依次重载插件、核对启用状态和真实加载版本、验证命令与看板 DOM，并检查新运行时错误。需要指定其他 Vault 时设置 `OBSIDIAN_VAULT_NAME`：

```bash
OBSIDIAN_VAULT_NAME="My Vault" npm run smoke:obsidian
```

Obsidian CLI 仅用于本机开发验证，不属于插件运行时依赖。插件声明支持移动端，因此桌面 smoke 不能替代单元测试、构建和移动端兼容性验证。

## 版本与发版

项目使用 `release-version.json` 作为版本与构建号的唯一权威来源，采用标准 SemVer，支持 `alpha.N`、`beta.N`、`rc.N` 测试版本。新发布使用与版本完全一致的 annotated tag；历史标签保持只读。版本准备、隔离 tag 构建、ZIP/provenance 和测试版/正式版流程见 [VERSIONING.md](VERSIONING.md)。

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
