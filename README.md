# KBtask（Obsidian 插件）

`KBtask` 是一个面向 Obsidian 的任务看板插件，核心目标是用轻量、清晰的方式管理工作任务与个人任务，并支持归档、筛选与 Markdown 同步。

## 主要功能

- 双视图：工作任务 / 个人任务
- 左侧任务列表 + 右侧分类导航
- 分类管理：新增、重命名、删除（删除时自动迁移任务）
- 任务操作：快速新增、单击编辑、删除、归档
- 归档视图：筛选、排序、关键词搜索、恢复、批量删除
- 数据持久化：自动保存插件数据
- Markdown 同步：支持工作、个人、归档分别配置同步文件路径

## 安装方式（手动）

1. 打开你的 Vault 目录，进入：
   - `.obsidian/plugins/KBtask/`
2. 将以下文件复制到该目录：
   - `manifest.json`
   - `main.js`
   - `styles.css`
3. 在 Obsidian 中进入：
   - `设置 -> 第三方插件`
4. 启用 `KBtask`

## 开发与构建

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

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
> `.obsidian/plugins/KBtask/data.json`  
> 如果你在项目目录中看到它，通常是本地开发映射/软链接导致。

## 当前设计说明

- 当前以单看板结构为主（工作/个人双视图）
- 任务列表为当前分类全量渲染（非虚拟列表）
- 同步为“数据变更触发”，纯 UI 切换不触发同步
- 插件优先面向桌面端 Obsidian 使用体验

## 许可证

MIT
