# aulycKanban（Obsidian 插件）

## English

`aulycKanban` is a lightweight task board for Obsidian. It organizes tasks by
custom task types and a shared set of quadrants, while keeping the data inside
your current vault. You can create, rename, and remove task types or quadrants;
search across the current scope; edit, archive, restore, sort, and batch-delete
tasks; and navigate the board with the keyboard.

### Key features

- Custom task types with independent task collections.
- Shared quadrants that keep the same structure across every task type.
- Search, archive filtering, restore, sorting, and batch deletion.
- Right-click move actions, desktop drag-and-drop, and atomic multi-select moves
  across task types and quadrants.
- Desktop task-type and quadrant reordering with full-size insertion slots and
  compact drag previews that stay above the pointer.
- A fixed board footer for selection counts and future status messages.
- Automatic Markdown mirrors for each task type and the archive.
- Local persistence through Obsidian's plugin data API.
- Interface language selection: Follow Obsidian, Simplified Chinese, or English.
- Desktop and mobile-compatible plugin metadata.

### Installation and updates

After Community review, install and update `aulycKanban` from Obsidian's
Community plugins directory. For manual installation, download `main.js`,
`manifest.json`, and `styles.css` from the matching GitHub Release and place
them in `.obsidian/plugins/aulyckanban/` inside your vault.

The plugin does not contain its own update checker, downloader, installer, or
telemetry. It does not contact GitHub, Gitee, or another publishing service at
runtime. Board data and generated Markdown notes remain in the current vault.
GitHub is the canonical source and Community release channel; Gitee is retained
only as a public manual-download and release-audit mirror.

## 中文说明

`aulycKanban` 是一个面向 Obsidian 的任务看板插件，核心目标是用轻量、清晰的方式管理多个任务类型，并支持归档、筛选与 Markdown 同步。

## 主要功能

- 动态任务类型：除默认的工作任务、个人任务外，可通过顶部 `+` 任意新增，可右键重命名或删除；桌面端可通过明显的横向占位槽拖拽排序
- 四区导航：工具区统一搜索与归档，任务类型区保留“全部任务”、真实任务类型及新增入口，象限区只展示真实象限及新增入口
- 左侧任务列表 + 右侧分类导航
- 全局共享象限：所有任务类型使用同一套象限，各自保存独立任务内容
- 象限管理：新增、重命名、删除（删除时自动迁移任务），桌面端可通过明显的纵向占位槽拖拽排序
- 任务操作：共享搜索框提交可移除的搜索标签，下方 `+` 展开一次性新增任务；单击选择任务，双击任务内容或选中后按 Enter 编辑，并支持删除、归档
- 任务移动：右键任务卡可选择目标任务类型和象限；桌面端可直接拖到任务类型或象限，悬停锁定任务类型后再拖到象限可一次更换两项
- 多选移动：使用任务列表上方的多选按钮，或在桌面端按 Command/Ctrl、Shift 选择多张卡片，再统一移动；选择数量显示在固定的底部提示区
- 归档视图：复用任务搜索与象限筛选，并支持排序、恢复、批量删除
- 数据持久化：自动保存插件数据
- 界面语言：支持跟随 Obsidian、简体中文和 English，切换语言不会改名已有数据或同步目录
- Markdown 同步：在统一目录内自动创建并管理每个任务类型和归档任务的独立笔记
- 社区渠道就绪：GitHub 主仓同时提供源码、正式 Release 和 Obsidian Community
  所需附件，Gitee 保留同版本公开分发镜像
- 关于信息：在插件设置页查看当前版本、Obsidian 版本要求、应用说明、官网与致谢

## 安装方式

项目完成 Obsidian Community 审核后，推荐直接在 Obsidian 的社区插件市场搜索
`aulycKanban` 安装和更新。上架完成前，或需要从 Gitee 备用源获取时，可继续手动
安装已验证的正式发布文件。

### 手动安装

1. 打开你的 Vault 目录，进入：
   - `.obsidian/plugins/aulyckanban/`
2. 将以下文件复制到该目录：
   - `manifest.json`
   - `main.js`
   - `styles.css`
3. 在 Obsidian 中进入：
   - `设置 -> 第三方插件`
4. 启用 `aulycKanban`

> 插件 ID 仍为 `aulyckanban`，所以安装目录保留旧的小写名称。这样升级时 Obsidian 会继续读取原有 `data.json`、启用状态和工作区布局，不会把改名后的插件识别为另一个新插件。

## 开发与构建

开发环境需要 Node.js 20.19+、22.13+ 或 24+。

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

运行数据 schema、历史数据迁移、JSON 备份版本矩阵和 Store 状态所有权合同见
[DATA_COMPATIBILITY.md](DATA_COMPATIBILITY.md)。`schemaVersion` 与备份格式版本均不是
产品版本或发布版本。

> 正常情况下，`data.json` 位于 Vault 的插件目录下：
> `.obsidian/plugins/aulyckanban/data.json`
> 如果你在项目目录中看到它，通常是本地开发映射/软链接导致。

## 当前设计说明

- 顶部任务类型可以动态新增；右键任务类型可重命名或删除；桌面端的任务类型与象限均使用完整占位槽拖拽排序；新增任务类型与新增象限均使用 Enter 确认
- 顶部工具区统一放置搜索与归档；任务类型区保留“全部任务”、已有任务类型和新增入口，象限区只显示已有象限及新增入口
- 搜索仅匹配当前“任务类型 × 象限”的交集；Enter 提交为搜索标签，`x`、Escape、Backspace 或 Delete 可清除
- 任务区的 `+` 展开一次性输入，并把任务加入当前任务类型和象限
- 看板底部固定提示区显示当前多选数量，并为后续筛选、同步等状态信息预留统一位置
- 右键任务卡可移动单项；进入多选后可全选当前筛选结果并批量移动。批量移动会先校验全部来源和目标，任一项无效时整批不变
- 桌面端拖动任务卡到顶部任务类型或右侧象限可只更换对应维度；在任务类型上悬停锁定后继续拖到象限，可一次同时更换任务类型和象限
- 删除任务类型会同时删除其中的普通任务、归档任务和同步配置；对应 Markdown 会移入同步目录下的“已删除任务类型”恢复目录；至少保留一个任务类型
- 所有任务类型共享同一套象限定义，每个“任务类型 × 象限”的任务内容相互独立
- Tab / Shift+Tab 在工具、任务类型、任务内容、象限四个区域间移动焦点；归档按钮获得焦点时显示当前“任务类型（或全部任务）× 象限”的归档内容，按向下键可保留归档范围并进入任务类型，其他跨区 Tab 或切回搜索时恢复普通任务列表
- 工具区在空搜索框（或搜索标签）与归档间使用左右键移动焦点；已有搜索文字时左右键仍用于移动输入光标；搜索或归档按向下键进入当前任务类型，任务类型按向上键返回原工具控件
- 看板内按 `Command+F`（`⌘F`）可直接聚焦搜索框；已有搜索标签时聚焦该标签，不提交或清除搜索条件
- 任务类型区使用左右键选择并刷新任务列表，向下键进入任务区；任务区顶部新增入口按向上键返回当前任务类型，任务卡按向右键进入当前象限，象限按向左键返回最后聚焦的任务目标
- 象限区使用上下键移动；顶部“🌐 全部象限”按向上键、底部新增入口按向下键时停在原位，不首尾循环
- 任务列表为当前交叉范围全量渲染（非虚拟列表）
- 同步为“数据变更触发”，纯 UI 切换不触发同步；默认目录为 `X-aulyc看板`，设置页只需配置统一同步目录
- 插件加载及新增任务类型时自动创建对应 Markdown；重命名任务类型会同步改名，删除任务类型会把插件拥有的笔记移入恢复目录
- 旧的分文件配置会迁移到统一目录；旧汇总笔记只用于推导迁移目录并原样保留，不再作为运行时同步目标
- 每个任务类型笔记使用隐藏的稳定 ID 标记身份；同名普通笔记不会被覆盖，冲突时自动使用带序号的新文件名
- Markdown 是由插件 `data.json` 生成的单向完整镜像；自动管理的主笔记只保留当前看板内容，检测到旧版标记区外内容时会先把原笔记移入“历史同步内容”目录，再生成干净主笔记
- 设置页提供一次性的“强制刷新同步”：先保存当前看板，再重建全部任务类型和归档笔记；“历史同步内容”仅用于保留旧文件，不会被清空
- 插件不包含项目自有更新检查器、下载器或安装器；Community 收录后由 Obsidian
  官方机制从 GitHub Release 管理更新，Gitee 仅作为人工下载和发布审计备用源
- 插件运行时不主动访问 GitHub、Gitee 或其他发布服务；看板数据与 Markdown 同步
  均在当前 Vault 内处理
- 数字签名对当前 Community/仓库 Release 流程为 `N/A`；若未来新增项目自有
  下载或安装能力，再单独建立签名安全门禁
- 插件优先面向桌面端 Obsidian 使用体验

## 许可证

MIT
