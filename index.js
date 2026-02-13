const siyuan = require('siyuan');

class Plugin extends siyuan.Plugin {
    // 性能配置常量
    static PERFORMANCE = {
        VISIBLE_TASK_COUNT: 30,      // 每列可见任务数
        TASK_HEIGHT: 70,             // 任务高度（像素）
        SAVE_DEBOUNCE: 500,          // 保存防抖时间（毫秒）
        SYNC_DEBOUNCE: 2000,         // 同步防抖时间（毫秒）
        SCROLL_DEBOUNCE: 50,         // 滚动防抖时间（毫秒）
        MAX_CACHE_SIZE: 50,          // 最大缓存条目数
        CACHE_TRIM_SIZE: 25          // 缓存清理后保留数
    };

    constructor() {
        super(...arguments);
        this.data = this.getDefaultData();
        this.currentView = 'work'; // 当前视图：'work' 或 'personal'
        this.config = {
            work: {
                targetNotebook: '',
                targetPath: '工作任务看板',
                targetDocId: ''
            },
            personal: {
                targetNotebook: '',
                targetPath: '个人任务看板',
                targetDocId: ''
            },
            customIcon: ''
        };
        this.dataLoaded = false;
        this.saveTimeout = null;
        this.syncTimeout = null;
        this.escHandler = null;
        this.dockIcon = null;
        this.dragCleanup = null;
        this.resizeCleanup = null;
        this.isOpening = false;
        
        // 性能优化相关
        this.renderRAF = null;
        this.sortedTasksCache = new Map(); // 缓存排序结果
        this.virtualScrollStates = new Map(); // 虚拟滚动状态
        this.eventDelegationBound = false; // 事件委托标记
        this.containerClickBound = false; // 容器点击事件标记
        this.dragHandlers = null; // 拖拽事件处理器
    }

    async onload() {
        // 加载配置和数据
        await this.loadConfig();
        await this.loadKanbanData();
        this.dataLoaded = true;
        
        // 添加到右侧 Dock
        this.addDockIcon();
        
        // 注册快捷键 (使用 Option+Command+B 避免冲突)
        this.addCommand({
            langKey: "showKanban",
            hotkey: "⌥⌘B",
            callback: () => {
                this.toggle();
            }
        });
    }

    // 添加 Dock 图标
    addDockIcon() {
        this.dockIcon = this.addDock({
            config: {
                position: "RightTop",
                size: { width: 200, height: 0 },
                icon: "iconList",
                title: "X-aulyc 看板",
            },
            data: {
                text: "看板"
            },
            type: "kanban",
            init: (dock) => {
                // 创建 Dock 面板内容
                const container = document.createElement('div');
                container.className = 'fn__flex-1 fn__flex-column';
                container.style.cssText = 'height: 100%; position: relative; z-index: 1;';
                
                // 标题区域
                const header = document.createElement('div');
                header.className = 'block__icons';
                header.style.cssText = 'padding: 8px;';
                header.innerHTML = `
                    <div class="block__logo" style="padding: 8px 16px; display: flex; align-items: center; gap: 8px;">
                        <svg style="width: 20px; height: 20px;"><use xlink:href="#iconList"></use></svg>
                        <span style="font-weight: 600;">X-aulyc 看板</span>
                    </div>
                `;
                
                // 按钮区域
                const content = document.createElement('div');
                content.className = 'fn__flex-1';
                content.style.cssText = 'padding: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; z-index: 2;';
                
                // 创建按钮
                const button = document.createElement('button');
                button.className = 'b3-button b3-button--outline';
                button.style.cssText = `
                    width: 100%;
                    max-width: 150px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 12px;
                    cursor: pointer;
                    pointer-events: auto;
                    position: relative;
                    z-index: 3;
                    background: var(--b3-theme-surface);
                    border: 1px solid var(--b3-border-color);
                    border-radius: 4px;
                    color: var(--b3-theme-on-surface);
                    font-size: 14px;
                    transition: all 0.2s;
                `;
                button.innerHTML = `
                    <svg style="width: 16px; height: 16px;"><use xlink:href="#iconList"></use></svg>
                    <span>打开看板</span>
                `;
                
                // 鼠标悬停效果
                button.onmouseenter = () => {
                    button.style.background = 'var(--b3-theme-primary)';
                    button.style.color = 'white';
                    button.style.borderColor = 'var(--b3-theme-primary)';
                };
                
                button.onmouseleave = () => {
                    button.style.background = 'var(--b3-theme-surface)';
                    button.style.color = 'var(--b3-theme-on-surface)';
                    button.style.borderColor = 'var(--b3-border-color)';
                };
                
                // 绑定点击事件
                button.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.open();
                };
                
                // 提示文字
                const hint = document.createElement('div');
                hint.style.cssText = 'margin-top: 16px; font-size: 12px; color: var(--b3-theme-on-surface-light); text-align: center;';
                hint.textContent = '快捷键 ⌥⌘B';
                
                content.appendChild(button);
                content.appendChild(hint);
                
                container.appendChild(header);
                container.appendChild(content);
                
                dock.element.innerHTML = '';
                dock.element.style.cssText = 'overflow: visible; position: relative;';
                dock.element.appendChild(container);
            }
        });
    }

    onunload() {
        // 强制关闭看板
        this.forceClose();
        
        // 清理所有定时器
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
            this.syncTimeout = null;
        }
        
        // 移除全局类
        document.body.classList.remove('kanban-active');
    }

    showInputDialog(title, placeholder, callback, defaultValue = '') {
        const existingDialog = document.getElementById('kanban-input-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        const dialog = document.createElement('div');
        dialog.id = 'kanban-input-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 1000000002;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: auto;
        `;
        
        const dialogContent = document.createElement('div');
        dialogContent.style.cssText = `
            background: var(--b3-theme-background);
            border-radius: 8px;
            padding: 24px;
            width: 400px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            z-index: 1000000003;
            position: relative;
        `;
        
        dialogContent.innerHTML = `
            <h3 style="margin: 0 0 16px 0; color: var(--b3-theme-on-background);">${title}</h3>
            <textarea id="kanban-dialog-input" 
                   placeholder="${placeholder}"
                   style="width: 100%; min-height: 80px; padding: 10px; border: 1px solid var(--b3-border-color); 
                          border-radius: 4px; background: var(--b3-theme-surface); 
                          color: #C0C0C0; font-size: 16px; box-sizing: border-box; 
                          resize: vertical; font-family: inherit; line-height: 1.5;">${this.escapeHtml(defaultValue)}</textarea>
            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                <button id="kanban-dialog-cancel" 
                        style="padding: 8px 20px; background: var(--b3-theme-surface); 
                               border: 1px solid var(--b3-border-color); border-radius: 4px; 
                               cursor: pointer; color: var(--b3-theme-on-surface);">
                    取消
                </button>
                <button id="kanban-dialog-confirm" 
                        style="padding: 8px 20px; background: var(--b3-theme-primary); 
                               color: white; border: none; border-radius: 4px; cursor: pointer;">
                    确定
                </button>
            </div>
        `;
        
        dialog.appendChild(dialogContent);
        document.body.appendChild(dialog);
        
        const input = document.getElementById('kanban-dialog-input');
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            document.removeEventListener('keydown', keypressHandler);
            dialog.remove();
        };
        
        const handleConfirm = () => {
            const value = input.value.trim();
            cleanup();
            if (value) {
                callback(value);
            }
        };
        
        const handleCancel = () => {
            cleanup();
        };
        
        const keypressHandler = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.stopPropagation();
                handleConfirm();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                handleCancel();
            }
        };
        document.addEventListener('keydown', keypressHandler);
        
        document.getElementById('kanban-dialog-confirm').addEventListener('click', handleConfirm);
        document.getElementById('kanban-dialog-cancel').addEventListener('click', handleCancel);
        
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                handleCancel();
            }
        });
    }

    showConfirmDialog(message, callback) {
        const existingDialog = document.getElementById('kanban-confirm-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        const dialog = document.createElement('div');
        dialog.id = 'kanban-confirm-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 1000000002;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: auto;
        `;
        
        const dialogContent = document.createElement('div');
        dialogContent.style.cssText = `
            background: var(--b3-theme-background);
            border-radius: 8px;
            padding: 24px;
            width: 400px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            z-index: 1000000003;
            position: relative;
        `;
        
        dialogContent.innerHTML = `
            <div style="margin-bottom: 20px; color: var(--b3-theme-on-background); font-size: 16px;">
                ${message}
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="kanban-confirm-cancel" 
                        style="padding: 8px 20px; background: var(--b3-theme-surface); 
                               border: 1px solid var(--b3-border-color); border-radius: 4px; 
                               cursor: pointer; color: var(--b3-theme-on-surface);">
                    取消
                </button>
                <button id="kanban-confirm-ok" 
                        style="padding: 8px 20px; background: var(--b3-theme-error); 
                               color: white; border: none; border-radius: 4px; cursor: pointer;">
                    确定
                </button>
            </div>
        `;
        
        dialog.appendChild(dialogContent);
        document.body.appendChild(dialog);
        
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            document.removeEventListener('keydown', handleEsc);
            dialog.remove();
        };
        
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cleanup();
                callback(false);
            }
        };
        document.addEventListener('keydown', handleEsc);
        
        document.getElementById('kanban-confirm-ok').addEventListener('click', () => {
            cleanup();
            callback(true);
        });
        
        document.getElementById('kanban-confirm-cancel').addEventListener('click', () => {
            cleanup();
            callback(false);
        });
        
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                cleanup();
                callback(false);
            }
        });
    }

    async backupData() {
        try {
            const dataToBackup = {
                work: this.data.work,
                personal: this.data.personal,
                backupTime: new Date().toISOString(),
                version: '1.0'
            };
            
            const jsonStr = JSON.stringify(dataToBackup, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `kanban-backup-${timestamp}.json`;
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            
            URL.revokeObjectURL(url);
            
            this.showMessage('✅ 请选择json文件要备份到的文件夹');
        } catch (error) {
            console.error('[Kanban] 备份失败:', error);
            this.showMessage('❌ 备份失败：' + error.message);
        }
    }

    async importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const importedData = JSON.parse(text);
                
                // 支持新旧格式
                let validData = false;
                if (importedData.work && importedData.personal) {
                    validData = true;
                } else if (importedData.columns && Array.isArray(importedData.columns)) {
                    validData = true;
                }
                
                if (!validData) {
                    throw new Error('无效的备份文件格式');
                }
                
                this.showConfirmDialog(
                    '⚠️ 导入备份将覆盖当前所有看板数据，是否继续？',
                    async (confirmed) => {
                        if (confirmed) {
                            // 处理新格式
                            if (importedData.work && importedData.personal) {
                                this.data = {
                                    work: importedData.work,
                                    personal: importedData.personal
                                };
                            } else {
                                // 转换旧格式（放到工作视图）
                                this.data = {
                                    work: { columns: importedData.columns },
                                    personal: this.getDefaultData().personal
                                };
                            }
                            
                            await this.saveKanbanDataImmediately();
                            
                            if (this.container) {
                                this.render();
                                this.bindEvents();
                            }
                            
                            this.showMessage('✅ 数据导入成功！');
                        }
                    }
                );
            } catch (error) {
                console.error('[Kanban] 导入失败:', error);
                this.showMessage('❌ 导入失败：' + error.message);
            }
        };
        
        input.click();
    }

    async getDocuments(notebookId, path = '/') {
        try {
            const response = await fetch('/api/filetree/listDocsByPath', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    notebook: notebookId,
                    path: path
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            return result.data?.files || [];
        } catch (error) {
            console.error('[Kanban] 获取文档列表失败:', error);
            this.showMessage('⚠️ 无法加载文档列表');
        }
        return [];
    }

    async findDocByName(notebookId, docName) {
        try {
            // 先尝试通过SQL查询精确匹配文档名
            const sqlResponse = await fetch('/api/query/sql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stmt: `SELECT * FROM blocks WHERE type='d' AND box='${notebookId}' AND content='${docName}' LIMIT 1`
                })
            });
            
            if (sqlResponse.ok) {
                const sqlResult = await sqlResponse.json();
                if (sqlResult.data && sqlResult.data.length > 0) {
                    return sqlResult.data[0].id;
                }
            }
            
            // 如果SQL查询没有结果，尝试搜索API
            const response = await fetch('/api/filetree/searchDocs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    k: docName,
                    notebook: notebookId
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                const docs = result.data?.blocks || [];
                const exactMatch = docs.find(doc => doc.content === docName);
                return exactMatch ? exactMatch.id : null;
            }
        } catch (error) {
            console.error('[Kanban] 查找文档失败:', error);
        }
        return null;
    }

    async clearAllData() {
        // 创建带备份提示的确认对话框
        const existingDialog = document.getElementById('kanban-clear-confirm-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        const dialog = document.createElement('div');
        dialog.id = 'kanban-clear-confirm-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            z-index: 1000000004;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: auto;
        `;
        
        const dialogContent = document.createElement('div');
        dialogContent.style.cssText = `
            background: var(--b3-theme-background);
            border-radius: 8px;
            padding: 24px;
            width: 420px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            z-index: 1000000005;
            position: relative;
        `;
        
        dialogContent.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
                <h3 style="margin: 0 0 12px 0; color: var(--b3-theme-on-background); font-size: 18px;">确认清除所有数据？</h3>
                <div style="color: var(--b3-theme-on-surface); font-size: 14px; line-height: 1.6;">
                    此操作将删除<strong>工作任务</strong>和<strong>个人任务</strong>中的所有任务数据，且<strong style="color: var(--b3-theme-error);">无法恢复</strong>！
                </div>
            </div>
            
            <div style="padding: 16px; background: var(--b3-theme-surface); border-radius: 6px; margin-bottom: 20px; border-left: 4px solid var(--b3-theme-primary);">
                <div style="font-size: 13px; color: var(--b3-theme-on-surface); line-height: 1.6;">
                    💡 <strong>建议操作：</strong><br>
                    在清除数据前，请先点击下方的"备份数据"按钮，将当前看板数据备份到本地，以防万一需要恢复。
                </div>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="clear-backup-btn" 
                        style="width: 100%; padding: 12px; background: var(--b3-theme-primary); 
                               color: white; border: none; border-radius: 4px; 
                               cursor: pointer; font-size: 14px; display: flex; 
                               align-items: center; justify-content: center; gap: 8px;">
                    <span style="font-size: 16px;">💾</span>
                    <span>先备份数据</span>
                </button>
                
                <div style="display: flex; gap: 10px;">
                    <button id="clear-cancel-btn" 
                            style="flex: 1; padding: 10px; background: var(--b3-theme-surface); 
                                   border: 1px solid var(--b3-border-color); border-radius: 4px; 
                                   cursor: pointer; color: var(--b3-theme-on-surface); font-size: 14px;">
                        取消
                    </button>
                    <button id="clear-confirm-btn" 
                            style="flex: 1; padding: 10px; background: var(--b3-theme-error); 
                                   color: white; border: none; border-radius: 4px; 
                                   cursor: pointer; font-size: 14px; font-weight: 600;">
                        确认清除
                    </button>
                </div>
            </div>
        `;
        
        dialog.appendChild(dialogContent);
        document.body.appendChild(dialog);
        
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            document.removeEventListener('keydown', handleEsc);
            dialog.remove();
        };
        
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cleanup();
            }
        };
        document.addEventListener('keydown', handleEsc);
        
        // 备份按钮
        document.getElementById('clear-backup-btn').addEventListener('click', async () => {
            await this.backupData();
        });
        
        // 取消按钮
        document.getElementById('clear-cancel-btn').addEventListener('click', () => {
            cleanup();
        });
        
        // 确认清除按钮
        document.getElementById('clear-confirm-btn').addEventListener('click', async () => {
            cleanup();
            
            // 清除所有任务数据
            this.data = this.getDefaultData();
            
            // 立即保存
            await this.saveKanbanDataImmediately();
            
            // 如果看板已打开，重新渲染
            if (this.container) {
                this.render();
                this.bindEvents();
            }
            
            this.showMessage('✅ 所有任务数据已清除！');
        });
        
        // 点击背景关闭
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                cleanup();
            }
        });
    }

    async openConfig() {
        const existing = document.getElementById('kanban-config-dialog');
        if (existing) return;
        
        const dialog = document.createElement('div');
        dialog.id = 'kanban-config-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 1000000000;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: auto;
        `;
        
        const dialogContent = document.createElement('div');
        dialogContent.style.cssText = `
            background: var(--b3-theme-background);
            border-radius: 8px;
            padding: 24px;
            width: 500px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            z-index: 1000000001;
            position: relative;
        `;
        
        const notebooks = await this.getNotebooks();
        
        const iconPreview = this.config.customIcon 
            ? `<img src="${this.config.customIcon}" style="width: 32px; height: 32px; object-fit: contain; vertical-align: middle; margin-left: 10px;">` 
            : '📋';
        
        // 获取工作和个人视图的文档列表
        let workDocuments = [];
        let personalDocuments = [];
        if (this.config.work.targetNotebook) {
            workDocuments = await this.getDocuments(this.config.work.targetNotebook);
        }
        if (this.config.personal.targetNotebook) {
            personalDocuments = await this.getDocuments(this.config.personal.targetNotebook);
        }
        
        dialogContent.innerHTML = `
            <h2 style="margin: 0 0 24px 0; color: var(--b3-theme-on-background); font-size: 20px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 24px;">⚙️</span>
                <span>看板设置</span>
            </h2>
            
            <!-- 外观设置 -->
            <div style="margin-bottom: 24px;">
                <h3 style="margin: 0 0 16px 0; font-size: 15px; font-weight: 600; color: var(--b3-theme-on-background);">
                    外观设置
                </h3>
                
                <!-- 图标预览 -->
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding: 12px; background: var(--b3-theme-surface); border-radius: 6px;">
                    <div style="font-size: 13px; color: var(--b3-theme-on-surface); font-weight: 500; min-width: 80px;">
                        当前图标
                    </div>
                    <div style="display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: var(--b3-theme-background); border: 2px solid var(--b3-border-color); border-radius: 8px;">
                        ${this.config.customIcon 
                            ? `<img src="${this.config.customIcon}" style="width: 40px; height: 40px; object-fit: contain;">` 
                            : `<span style="font-size: 32px; line-height: 1;">📋</span>`
                        }
                    </div>
                    <div style="flex: 1; font-size: 12px; color: var(--b3-theme-on-surface-variant);">
                        ${this.config.customIcon ? '自定义图标' : '默认图标'}
                    </div>
                </div>
                
                <!-- 上传按钮 -->
                <input type="file" id="icon-upload" accept="image/png" style="display: none;">
                <div style="display: flex; gap: 8px;">
                    <button id="icon-upload-btn"
                            style="flex: 1; padding: 10px 16px; background: var(--b3-theme-primary); 
                                   color: white; border: none; border-radius: 6px; 
                                   cursor: pointer; font-size: 13px; font-weight: 500;
                                   display: flex; align-items: center; justify-content: center; gap: 6px;
                                   transition: opacity 0.2s;">
                        <span>选择图标文件</span>
                    </button>
                    ${this.config.customIcon ? `
                    <button id="icon-reset" 
                            style="padding: 10px 16px; background: var(--b3-theme-surface); 
                                   border: 1px solid var(--b3-border-color); border-radius: 6px; 
                                   cursor: pointer; color: var(--b3-theme-on-surface); 
                                   font-size: 13px; white-space: nowrap;
                                   transition: background 0.2s;">
                        恢复默认
                    </button>` : ''}
                </div>
                
                <!-- 提示信息 -->
                <div style="margin-top: 10px; padding: 8px 12px; background: var(--b3-theme-surface); border-left: 3px solid var(--b3-theme-primary); border-radius: 4px;">
                    <div style="font-size: 12px; color: var(--b3-theme-on-surface-variant); line-height: 1.5;">
                        建议使用 128×128 像素的 PNG 格式图标
                    </div>
                </div>
                
                <span id="icon-filename" style="display: none;"></span>
            </div>
            
            <div style="margin-bottom: 20px; padding-top: 20px; border-top: 1px solid var(--b3-border-color);">
                <h3 style="margin: 0 0 10px 0; font-size: 16px; color: var(--b3-theme-on-background);">数据管理</h3>
                
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <button id="backup-data" 
                            style="flex: 1; padding: 10px; background: var(--b3-theme-primary); 
                                   color: white; border: none; border-radius: 4px; 
                                   cursor: pointer; font-size: 14px; display: flex; 
                                   align-items: center; justify-content: center; gap: 8px;">
                        <span style="font-size: 16px;">💾</span>
                        <span>备份数据</span>
                    </button>
                    <button id="import-data" 
                            style="flex: 1; padding: 10px; background: var(--b3-theme-surface); 
                                   color: var(--b3-theme-on-surface); border: 1px solid var(--b3-border-color); 
                                   border-radius: 4px; cursor: pointer; font-size: 14px; 
                                   display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <span style="font-size: 16px;">📥</span>
                        <span>导入数据</span>
                    </button>
                    <button id="clear-data" 
                            style="flex: 1; padding: 10px; background: var(--b3-theme-error); 
                                   color: white; border: none; border-radius: 4px; 
                                   cursor: pointer; font-size: 14px; display: flex; 
                                   align-items: center; justify-content: center; gap: 8px;">
                        <span style="font-size: 16px;">🗑️</span>
                        <span>清除数据</span>
                    </button>
                </div>
                
                <div style="padding: 10px; background: var(--b3-theme-surface); border-radius: 4px; 
                            color: var(--b3-theme-on-surface); font-size: 12px; line-height: 1.5;">
                    💡 <strong>备份</strong>：将看板数据以json文件保存到本地<br>
                    💡 <strong>导入</strong>：从已经备份的json文件恢复至看板中<br>
                    💡 <strong>清除</strong>：删除所有任务数据（不可恢复）
                </div>
            </div>
            
            <div style="margin-bottom: 20px; padding-top: 20px; border-top: 1px solid var(--b3-border-color);">
                <h3 style="margin: 0 0 10px 0; font-size: 16px; color: var(--b3-theme-on-background);">笔记同步</h3>
                
                <!-- 工作任务笔记配置 -->
                <div style="margin-bottom: 16px; padding: 12px; background: var(--b3-theme-surface); border-radius: 6px;">
                    <h4 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: var(--b3-theme-on-background);">💼 工作任务</h4>
                    <label style="display: block; margin-bottom: 10px;">
                        <span style="display: block; margin-bottom: 5px; color: var(--b3-theme-on-surface); font-size: 13px;">笔记本</span>
                        <select id="work-notebook-select" style="width: 100%; padding: 8px; border: 1px solid var(--b3-border-color); border-radius: 4px; background: var(--b3-theme-background); color: var(--b3-theme-on-surface); font-size: 13px;">
                            <option value="">请选择笔记本</option>
                            ${notebooks.map(nb => `<option value="${nb.id}" ${this.config.work.targetNotebook === nb.id ? 'selected' : ''}>${nb.name}</option>`).join('')}
                        </select>
                    </label>
                    
                    <label style="display: block;">
                        <span style="display: block; margin-bottom: 5px; color: var(--b3-theme-on-surface); font-size: 13px;">文档</span>
                        <select id="work-doc-select" style="width: 100%; padding: 8px; border: 1px solid var(--b3-border-color); border-radius: 4px; background: var(--b3-theme-background); color: var(--b3-theme-on-surface); font-size: 13px;" ${!this.config.work.targetNotebook ? 'disabled' : ''}>
                            <option value="">请先选择笔记本</option>
                            ${workDocuments.map(doc => {
                                const docName = doc.name.replace('.sy', '');
                                return `<option value="${doc.path}" ${this.config.work.targetPath === docName ? 'selected' : ''}>${docName}</option>`;
                            }).join('')}
                        </select>
                    </label>
                </div>
                
                <!-- 个人任务笔记配置 -->
                <div style="margin-bottom: 10px; padding: 12px; background: var(--b3-theme-surface); border-radius: 6px;">
                    <h4 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: var(--b3-theme-on-background);">👤 个人任务</h4>
                    <label style="display: block; margin-bottom: 10px;">
                        <span style="display: block; margin-bottom: 5px; color: var(--b3-theme-on-surface); font-size: 13px;">笔记本</span>
                        <select id="personal-notebook-select" style="width: 100%; padding: 8px; border: 1px solid var(--b3-border-color); border-radius: 4px; background: var(--b3-theme-background); color: var(--b3-theme-on-surface); font-size: 13px;">
                            <option value="">请选择笔记本</option>
                            ${notebooks.map(nb => `<option value="${nb.id}" ${this.config.personal.targetNotebook === nb.id ? 'selected' : ''}>${nb.name}</option>`).join('')}
                        </select>
                    </label>
                    
                    <label style="display: block;">
                        <span style="display: block; margin-bottom: 5px; color: var(--b3-theme-on-surface); font-size: 13px;">文档</span>
                        <select id="personal-doc-select" style="width: 100%; padding: 8px; border: 1px solid var(--b3-border-color); border-radius: 4px; background: var(--b3-theme-background); color: var(--b3-theme-on-surface); font-size: 13px;" ${!this.config.personal.targetNotebook ? 'disabled' : ''}>
                            <option value="">请先选择笔记本</option>
                            ${personalDocuments.map(doc => {
                                const docName = doc.name.replace('.sy', '');
                                return `<option value="${doc.path}" ${this.config.personal.targetPath === docName ? 'selected' : ''}>${docName}</option>`;
                            }).join('')}
                        </select>
                    </label>
                </div>
                
                <div style="margin-top: 11px; padding: 10px; background: var(--b3-theme-surface); border-radius: 4px; color: var(--b3-theme-on-surface); font-size: 12px;">
                    💡 看板变动会自动同步到对应视图的笔记
                </div>
            </div>
            
            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px;">
                <button id="config-cancel" style="padding: 8px 20px; background: var(--b3-theme-surface); border: 1px solid var(--b3-border-color); border-radius: 4px; cursor: pointer; color: var(--b3-theme-on-surface); font-size: 14px;">
                    取消
                </button>
                <button id="config-save" style="padding: 8px 20px; background: var(--b3-theme-primary); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                    保存设置
                </button>
            </div>
        `;
        
        dialog.appendChild(dialogContent);
        document.body.appendChild(dialog);
        
        let cleaned = false;
        const cleanupDialog = () => {
            if (cleaned) return;
            cleaned = true;
            document.removeEventListener('keydown', configEscHandler);
            dialog.remove();
        };
        
        const configEscHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cleanupDialog();
            }
        };
        document.addEventListener('keydown', configEscHandler);
        
        // 工作任务笔记本选择器
        document.getElementById('work-notebook-select').addEventListener('change', async (e) => {
            const notebookId = e.target.value;
            const docSelect = document.getElementById('work-doc-select');
            
            if (notebookId) {
                const docs = await this.getDocuments(notebookId);
                docSelect.disabled = false;
                docSelect.innerHTML = `
                    <option value="">选择已有文档</option>
                    ${docs.map(doc => {
                        const docName = doc.name.replace('.sy', '');
                        return `<option value="${doc.path}">${docName}</option>`;
                    }).join('')}
                `;
            } else {
                docSelect.disabled = true;
                docSelect.innerHTML = '<option value="">请先选择笔记本</option>';
            }
        });
        
        // 个人任务笔记本选择器
        document.getElementById('personal-notebook-select').addEventListener('change', async (e) => {
            const notebookId = e.target.value;
            const docSelect = document.getElementById('personal-doc-select');
            
            if (notebookId) {
                const docs = await this.getDocuments(notebookId);
                docSelect.disabled = false;
                docSelect.innerHTML = `
                    <option value="">选择已有文档</option>
                    ${docs.map(doc => {
                        const docName = doc.name.replace('.sy', '');
                        return `<option value="${doc.path}">${docName}</option>`;
                    }).join('')}
                `;
            } else {
                docSelect.disabled = true;
                docSelect.innerHTML = '<option value="">请先选择笔记本</option>';
            }
        });
        
        document.getElementById('backup-data').addEventListener('click', () => {
            this.backupData();
        });
        
        document.getElementById('import-data').addEventListener('click', () => {
            this.importData();
        });
        
        document.getElementById('clear-data').addEventListener('click', () => {
            this.clearAllData();
        });
        
        const iconUpload = document.getElementById('icon-upload');
        const iconUploadBtn = document.getElementById('icon-upload-btn');
        const iconFilename = document.getElementById('icon-filename');
        let newIconData = null;
        
        iconUploadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            iconUpload.click();
        });
        
        iconUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.type !== 'image/png') {
                    this.showMessage('⚠️ 请上传 PNG 格式的图片！');
                    iconUpload.value = '';
                    return;
                }
                
                if (file.size > 500 * 1024) {
                    this.showMessage('⚠️ 图片大小不能超过 500KB！');
                    iconUpload.value = '';
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = (event) => {
                    newIconData = event.target.result;
                    iconFilename.textContent = `✓ ${file.name}`;
                    this.showMessage('✅ 图标已选择，点击保存生效');
                };
                reader.readAsDataURL(file);
            }
        });
        
        const resetBtn = document.getElementById('icon-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showConfirmDialog('确定要恢复默认图标吗？', async (confirmed) => {
                    if (confirmed) {
                        this.config.customIcon = '';
                        newIconData = '';
                        await this.saveConfig();
                        this.showMessage('✅ 已恢复默认图标');
                        cleanupDialog();

                        // 更新看板标题图标
                        if (this.container) {
                            this.updateHeaderIcon();
                        }
                        
                        // 重新打开设置对话框以显示更新后的界面
                        setTimeout(() => {
                            this.openConfig();    
                        }, 100);
                    }
                });
            });
        }
        
        document.getElementById('config-save').addEventListener('click', async (e) => {
            e.stopPropagation();
            
            // 工作任务配置
            const workNotebookId = document.getElementById('work-notebook-select').value;
            const workDocSelect = document.getElementById('work-doc-select');
            const workSelectedDoc = workDocSelect.value;
            
            // 个人任务配置
            const personalNotebookId = document.getElementById('personal-notebook-select').value;
            const personalDocSelect = document.getElementById('personal-doc-select');
            const personalSelectedDoc = personalDocSelect.value;
            
            // 验证：不能选择相同的笔记本和文档组合
            if (workNotebookId && personalNotebookId && 
                workNotebookId === personalNotebookId && 
                workSelectedDoc && personalSelectedDoc &&
                workDocSelect.options[workDocSelect.selectedIndex]?.textContent === 
                personalDocSelect.options[personalDocSelect.selectedIndex]?.textContent) {
                this.showMessage('❌ 工作任务和个人任务不能同步到同一个文档！');
                return;
            }
            
            const previousWorkDocId = this.config.work.targetDocId;
            const previousWorkNotebook = this.config.work.targetNotebook;
            const previousWorkPath = this.config.work.targetPath;
            
            this.config.work.targetNotebook = workNotebookId;
            
            if (workSelectedDoc) {
                const selectedOption = workDocSelect.options[workDocSelect.selectedIndex];
                this.config.work.targetPath = selectedOption.textContent;
                
                if (workNotebookId !== previousWorkNotebook || this.config.work.targetPath !== previousWorkPath) {
                    this.config.work.targetDocId = '';
                } else {
                    this.config.work.targetDocId = previousWorkDocId;
                }
            } else {
                this.config.work.targetPath = '工作任务看板';
                this.config.work.targetDocId = '';
            }
            
            // 个人任务配置（变量已在前面声明）
            const previousPersonalDocId = this.config.personal.targetDocId;
            const previousPersonalNotebook = this.config.personal.targetNotebook;
            const previousPersonalPath = this.config.personal.targetPath;
            
            this.config.personal.targetNotebook = personalNotebookId;
            
            if (personalSelectedDoc) {
                const selectedOption = personalDocSelect.options[personalDocSelect.selectedIndex];
                this.config.personal.targetPath = selectedOption.textContent;
                
                if (personalNotebookId !== previousPersonalNotebook || this.config.personal.targetPath !== previousPersonalPath) {
                    this.config.personal.targetDocId = '';
                } else {
                    this.config.personal.targetDocId = previousPersonalDocId;
                }
            } else {
                this.config.personal.targetPath = '个人任务看板';
                this.config.personal.targetDocId = '';
            }
            
            if (newIconData !== null) {
                this.config.customIcon = newIconData;
            }
            
            await this.saveConfig();
            this.showMessage('✅ 设置已保存');
            cleanupDialog();
            
            if (this.container) {
                this.updateHeaderIcon();
            }
            
            // 同步工作任务笔记（如果配置了笔记本）
            if (this.config.work.targetNotebook) {
                const savedView = this.currentView;
                this.currentView = 'work';
                await this.exportToNote(true);
                this.currentView = savedView;
            }
            
            // 同步个人任务笔记（如果配置了笔记本）
            if (this.config.personal.targetNotebook) {
                const savedView = this.currentView;
                this.currentView = 'personal';
                await this.exportToNote(true);
                this.currentView = savedView;
            }
        });
        
        document.getElementById('config-cancel').addEventListener('click', (e) => {
            e.stopPropagation();
            cleanupDialog();
        });
        
        dialogContent.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                cleanupDialog();
            }
        });
    }

    updateHeaderIcon() {
        if (!this.container) return;
        
        const header = this.container.querySelector('.kanban-header h2');
        if (header) {
            const textSpan = document.createElement('span');
            textSpan.textContent = 'X-aulyc 看板';
            textSpan.style.cssText = 'line-height: 1; display: block;';
            
            header.innerHTML = '';
            
            if (this.config.customIcon) {
                const img = document.createElement('img');
                img.src = this.config.customIcon;
                img.style.cssText = 'width: 24px; height: 24px; object-fit: contain; display: block;';
                header.appendChild(img);
            } else {
                const emoji = document.createElement('span');
                emoji.textContent = '📋';
                emoji.style.cssText = 'line-height: 1; display: block; font-size: 20px;';
                header.appendChild(emoji);
            }
            
            header.appendChild(textSpan);
        }
    }

    showMessage(msg, timeout = 3000) {
        const message = document.createElement('div');
        message.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--b3-theme-background);
            color: var(--b3-theme-on-background);
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 9999999999;
            font-size: 14px;
        `;
        message.textContent = msg;
        document.body.appendChild(message);
        
        setTimeout(() => {
            message.remove();
        }, timeout);
    }

    async getNotebooks() {
        try {
            const response = await fetch('/api/notebook/lsNotebooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            return result.data?.notebooks || [];
        } catch (error) {
            console.error('[Kanban] 获取笔记本列表失败:', error);
            this.showMessage('⚠️ 无法加载笔记本列表');
        }
        return [];
    }

    async exportToNote(silent = false) {
        const viewConfig = this.config[this.currentView];
        if (!viewConfig || !viewConfig.targetNotebook) {
            if (!silent) {
                this.showMessage('⚠️ 请先在设置中选择目标笔记本！');
            }
            return;
        }
        
        const markdown = this.generateMarkdown();
        
        try {
            // 总是尝试查找已存在的文档
            if (viewConfig.targetPath) {
                const docId = await this.findDocByName(viewConfig.targetNotebook, viewConfig.targetPath);
                if (docId) {
                    // 找到已存在的文档，更新它
                    viewConfig.targetDocId = docId;
                    await this.saveConfig();
                    
                    const updateSuccess = await this.updateExistingDoc(docId, markdown);
                    if (updateSuccess) {
                        if (!silent) this.showMessage('✅ 笔记已更新！');
                        return;
                    }
                }
            }
            
            // 如果有保存的docId，尝试更新
            if (viewConfig.targetDocId) {
                const updateSuccess = await this.updateExistingDoc(viewConfig.targetDocId, markdown);
                
                if (updateSuccess) {
                    if (!silent) this.showMessage('✅ 笔记已更新！');
                    return;
                } else {
                    // 更新失败，清空docId
                    viewConfig.targetDocId = '';
                    await this.saveConfig();
                }
            }
            
            // 只有在确实找不到文档时才创建新文档
            const docId = await this.createNewDoc(markdown);
            
            if (docId) {
                viewConfig.targetDocId = docId;
                await this.saveConfig();
                if (!silent) this.showMessage('✅ 已成功导出到新笔记！');
            } else {
                throw new Error('创建文档失败');
            }
            
        } catch (error) {
            console.error('[Kanban] 导出到笔记失败:', error);
            if (!silent) this.showMessage('❌ 导出失败：' + error.message);
        }
    }

    async updateExistingDoc(docId, markdown) {
        try {
            const response = await fetch('/api/block/updateBlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: docId,
                    dataType: 'markdown',
                    data: markdown
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                return result.code === 0;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    async createNewDoc(markdown) {
        try {
            const viewConfig = this.config[this.currentView];
            const viewName = this.currentView === 'work' ? '工作任务' : '个人任务';
            const docTitle = viewConfig.targetPath || `${viewName}看板`;
            
            const response = await fetch('/api/filetree/createDocWithMd', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    notebook: viewConfig.targetNotebook,
                    path: `/${docTitle}`,
                    markdown: markdown
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.code === 0 && result.data) return result.data;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    generateMarkdown() {
        let md = `> 最新同步时间：${new Date().toLocaleString('zh-CN', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            hour12: false 
        })}\n\n`;
        
        let totalTasks = 0;
        let completedTasks = 0;
        
        this.getCurrentColumns().forEach(column => {
            const tasks = column.tasks || [];
            totalTasks += tasks.length;
            completedTasks += tasks.filter(t => t.completed).length;
        });
        
        md += `## 📊 任务统计\n\n`;
        md += `- 总任务数：${totalTasks}\n`;
        md += `- 已完成：${completedTasks}\n`;
        md += `- 完成率：${totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : 0}%\n\n`;
        
        this.getCurrentColumns().forEach(column => {
            const tasks = column.tasks || [];
            const activeTasks = tasks.filter(t => !t.completed);
            const completedTasksList = tasks.filter(t => t.completed);
            
            md += `## ${this.getColumnTitle(column)}\n\n`;
            
            if (activeTasks.length > 0) {
                md += '### 进行中\n\n';
                activeTasks.forEach(task => {
                    md += `- [ ] ${task.content}\n`;
                });
                md += '\n';
            }
            
            if (completedTasksList.length > 0) {
                md += '### 已完成\n\n';
                completedTasksList.forEach(task => {
                    md += `- [x] ${task.content}\n`;
                });
                md += '\n';
            }
            
            if (tasks.length === 0) {
                md += '*暂无任务*\n\n';
            }
        });
        
        return md;
    }

    async loadConfig() {
        try {
            const config = await this.loadData('config.json');
            if (config) {
                // 兼容旧配置格式
                if (config.work && config.personal) {
                    this.config = {
                        work: config.work,
                        personal: config.personal,
                        customIcon: config.customIcon || ''
                    };
                } else {
                    // 转换旧配置为新格式
                    this.config = {
                        work: {
                            targetNotebook: config.targetNotebook || '',
                            targetPath: config.targetPath || '工作任务看板',
                            targetDocId: config.targetDocId || ''
                        },
                        personal: {
                            targetNotebook: '',
                            targetPath: '个人任务看板',
                            targetDocId: ''
                        },
                        customIcon: config.customIcon || ''
                    };
                }
                
                // 加载当前视图
                if (config.currentView) {
                    this.currentView = config.currentView;
                }
            }
        } catch (error) {
            // 使用默认配置
        }
    }

    async saveConfig() {
        const configToSave = {
            work: this.config.work,
            personal: this.config.personal,
            customIcon: this.config.customIcon,
            currentView: this.currentView
        };
        await this.saveData('config.json', configToSave);
    }

    toggle() {
        if (this.container) {
            this.close();
        } else {
            this.open();
        }
    }

    switchView(view) {
        if (view !== 'work' && view !== 'personal') return;
        
        this.currentView = view;
        
        // 保存当前视图设置
        this.saveConfig();
        
        // 更新标签样式
        const tabs = this.container.querySelectorAll('.kanban-view-tab');
        tabs.forEach(tab => {
            const isActive = tab.dataset.view === view;
            tab.style.background = isActive ? 'var(--b3-theme-primary)' : 'var(--b3-theme-surface)';
            tab.style.color = isActive ? 'white' : 'var(--b3-theme-on-background)';
        });
        
        // 清除缓存
        this.sortedTasksCache.clear();
        this.virtualScrollStates.clear();
        this.eventDelegationBound = false;
        
        // 重新渲染
        this.render();
        this.bindEvents();
    }

    setupDraggableBoard(header, board) {
        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;
        
        const dragStart = (e) => {
            if (e.target.closest('.kanban-settings') || e.target.closest('.kanban-close')) {
                return;
            }
            
            isDragging = true;
            
            const transform = window.getComputedStyle(board).transform;
            if (transform && transform !== 'none') {
                const matrix = new DOMMatrix(transform);
                currentX = matrix.m41;
                currentY = matrix.m42;
            }
            
            if (e.type === 'touchstart') {
                initialX = e.touches[0].clientX - currentX;
                initialY = e.touches[0].clientY - currentY;
            } else {
                initialX = e.clientX - currentX;
                initialY = e.clientY - currentY;
            }
            
            header.style.cursor = 'grabbing';
        };
        
        const dragEnd = () => {
            isDragging = false;
            header.style.cursor = 'move';
        };
        
        const drag = (e) => {
            if (!isDragging) return;
            
            e.preventDefault();
            
            let clientX, clientY;
            if (e.type === 'touchmove') {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            
            currentX = clientX - initialX;
            currentY = clientY - initialY;
            
            board.style.transform = `translate(${currentX}px, ${currentY}px)`;
        };
        
        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
        
        header.addEventListener('touchstart', dragStart, { passive: false });
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', dragEnd);
        
        this.dragCleanup = () => {
            header.removeEventListener('mousedown', dragStart);
            header.removeEventListener('touchstart', dragStart);
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', dragEnd);
            document.removeEventListener('touchmove', drag);
            document.removeEventListener('touchend', dragEnd);
        };
    }

    setupResizableBoard(board) {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'kanban-resize-handle';
        resizeHandle.style.cssText = `
            position: absolute;
            right: 0;
            bottom: 0;
            width: 30px;
            height: 30px;
            cursor: nwse-resize;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.6;
            transition: opacity 0.2s;
        `;
        resizeHandle.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" style="pointer-events: none;">
                <path d="M22 18 L18 22 M22 14 L14 22 M22 10 L10 22 M22 6 L6 22" 
                      stroke="currentColor" 
                      stroke-width="2.5" 
                      stroke-linecap="round"
                      fill="none"/>
            </svg>
        `;
        
        resizeHandle.addEventListener('mouseenter', () => {
            resizeHandle.style.opacity = '1';
        });
        
        resizeHandle.addEventListener('mouseleave', () => {
            resizeHandle.style.opacity = '0.6';
        });
        
        board.appendChild(resizeHandle);
        
        let isResizing = false;
        let startX, startY, startWidth, startHeight;
        
        const resizeStart = (e) => {
            isResizing = true;
            startX = e.clientX || e.touches[0].clientX;
            startY = e.clientY || e.touches[0].clientY;
            
            const rect = board.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            
            e.preventDefault();
            e.stopPropagation();
            board.style.transition = 'none';
            resizeHandle.style.opacity = '1';
        };
        
        const resizeEnd = () => {
            if (!isResizing) return;
            isResizing = false;
            board.style.transition = '';
            resizeHandle.style.opacity = '0.6';
        };
        
        const resize = (e) => {
            if (!isResizing) return;
            
            const clientX = e.clientX || e.touches[0].clientX;
            const clientY = e.clientY || e.touches[0].clientY;
            
            const deltaX = clientX - startX;
            const deltaY = clientY - startY;
            
            const newWidth = Math.max(600, Math.min(startWidth + deltaX, window.innerWidth - 40));
            const newHeight = Math.max(400, Math.min(startHeight + deltaY, window.innerHeight - 40));
            
            board.style.width = `${newWidth}px`;
            board.style.height = `${newHeight}px`;
            board.style.maxWidth = 'none';
            board.style.maxHeight = 'none';
            
            e.preventDefault();
        };
        
        resizeHandle.addEventListener('mousedown', resizeStart);
        document.addEventListener('mousemove', resize);
        document.addEventListener('mouseup', resizeEnd);
        
        resizeHandle.addEventListener('touchstart', resizeStart, { passive: false });
        document.addEventListener('touchmove', resize, { passive: false });
        document.addEventListener('touchend', resizeEnd);
        
        this.resizeCleanup = () => {
            resizeHandle.removeEventListener('mousedown', resizeStart);
            resizeHandle.removeEventListener('touchstart', resizeStart);
            document.removeEventListener('mousemove', resize);
            document.removeEventListener('mouseup', resizeEnd);
            document.removeEventListener('touchmove', resize);
            document.removeEventListener('touchend', resizeEnd);
        };
    }

    async open() {
        if (this.isOpening || this.container) {
            return;
        }
        
        this.isOpening = true;
        
        try {
            if (!this.dataLoaded) {
                await this.loadKanbanData();
                this.dataLoaded = true;
            }
            
            this.container = document.createElement('div');
            this.container.id = 'kanban-container';
            this.container.setAttribute('tabindex', '-1'); // 使容器可以接收焦点
            
            this.container.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background: rgba(0, 0, 0, 0.7) !important;
                z-index: 99999999 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                pointer-events: auto !important;
                outline: none !important;
            `;
            
            const board = document.createElement('div');
            board.className = 'kanban-board';
            board.style.zIndex = '100000000';
            
            const header = document.createElement('div');
            header.className = 'kanban-header';
            
            // 左侧标题区域（包含图标+标题+视图切换标签）
            const titleArea = document.createElement('div');
            titleArea.style.cssText = 'display: flex; align-items: center; gap: 16px;';
            
            const title = document.createElement('h2');
            title.style.cssText = 'margin: 0;';
            if (this.config.customIcon) {
                const img = document.createElement('img');
                img.src = this.config.customIcon;
                img.style.cssText = 'width: 24px; height: 24px; object-fit: contain; display: block;';
                title.appendChild(img);
            } else {
                const emoji = document.createElement('span');
                emoji.textContent = '📋';
                emoji.style.cssText = 'line-height: 1; display: block; font-size: 20px;';
                title.appendChild(emoji);
            }
            
            const textSpan = document.createElement('span');
            textSpan.textContent = 'X-aulyc 看板';
            textSpan.style.cssText = 'line-height: 1; display: block;';
            title.appendChild(textSpan);
            
            // 视图切换标签
            const viewTabs = document.createElement('div');
            viewTabs.style.cssText = 'display: flex; gap: 8px;';
            
            const workTab = document.createElement('button');
            workTab.className = `kanban-view-tab ${this.currentView === 'work' ? 'active' : ''}`;
            workTab.textContent = '💼 工作任务';
            workTab.dataset.view = 'work';
            workTab.style.cssText = `
                padding: 6px 12px;
                border: 1px solid var(--b3-border-color);
                border-radius: 4px;
                background: ${this.currentView === 'work' ? 'var(--b3-theme-primary)' : 'var(--b3-theme-surface)'};
                color: ${this.currentView === 'work' ? 'white' : 'var(--b3-theme-on-background)'};
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                transition: all 0.2s;
                white-space: nowrap;
            `;
            
            const personalTab = document.createElement('button');
            personalTab.className = `kanban-view-tab ${this.currentView === 'personal' ? 'active' : ''}`;
            personalTab.textContent = '👤 个人任务';
            personalTab.dataset.view = 'personal';
            personalTab.style.cssText = `
                padding: 6px 12px;
                border: 1px solid var(--b3-border-color);
                border-radius: 4px;
                background: ${this.currentView === 'personal' ? 'var(--b3-theme-primary)' : 'var(--b3-theme-surface)'};
                color: ${this.currentView === 'personal' ? 'white' : 'var(--b3-theme-on-background)'};
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                transition: all 0.2s;
                white-space: nowrap;
            `;
            
            viewTabs.appendChild(workTab);
            viewTabs.appendChild(personalTab);
            
            titleArea.appendChild(title);
            titleArea.appendChild(viewTabs);
            
            // 右侧操作按钮
            const actions = document.createElement('div');
            actions.className = 'kanban-header-actions';
            actions.style.cssText = 'display: flex; align-items: center; gap: 12px;';
            
            const settingsBtn = document.createElement('span');
            settingsBtn.className = 'kanban-settings';
            settingsBtn.textContent = '⚙️';
            settingsBtn.title = '设置';
            settingsBtn.setAttribute('role', 'button');
            
            const closeBtn = document.createElement('span');
            closeBtn.className = 'kanban-close';
            closeBtn.textContent = '✖';
            closeBtn.title = '关闭';
            closeBtn.setAttribute('role', 'button');
            
            actions.appendChild(settingsBtn);
            actions.appendChild(closeBtn);
            
            header.appendChild(titleArea);
            header.appendChild(actions);
            
            const columnsContainer = document.createElement('div');
            columnsContainer.className = 'kanban-columns';
            columnsContainer.id = 'kanban-columns';
            
            board.appendChild(header);
            board.appendChild(columnsContainer);
            
            this.container.appendChild(board);
            document.body.appendChild(this.container);
            
            // 立即设置焦点到容器，确保键盘事件能被捕获
            setTimeout(() => {
                if (this.container) {
                    this.container.focus();
                }
            }, 0);
            
            this.setupDraggableBoard(header, board);
            this.setupResizableBoard(board);
            document.body.classList.add('kanban-active');
            
            this.render();
            this.bindEvents();
            
        } catch (error) {
            console.error('[Kanban] 打开看板失败:', error);
            this.forceClose();
        } finally {
            this.isOpening = false;
        }
    }

    async close() {
        if (!this.container) {
            return;
        }

        if (this.escHandler) {
            document.removeEventListener('keydown', this.escHandler);
            this.escHandler = null;
        }

        if (this.dragCleanup) {
            this.dragCleanup();
            this.dragCleanup = null;
        }

        if (this.resizeCleanup) {
            this.resizeCleanup();
            this.resizeCleanup = null;
        }

        if (this.container) {
            this.container.remove();
            this.container = null;
        }

        this.isOpening = false;
        this.eventDelegationBound = false;
        this.containerClickBound = false;

        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }

        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
            this.syncTimeout = null;
        }

        // 移除 kanban-active 类
        document.body.classList.remove('kanban-active');

        this.saveKanbanDataImmediately().then(() => {
            const viewConfig = this.config[this.currentView];
            if (viewConfig && viewConfig.targetNotebook) {
                this.exportToNote(true).catch(err => {
                    console.error('[Kanban] 后台同步失败:', err);
                });
            }
        }).catch(err => {
            console.error('[Kanban] 后台保存失败:', err);
        });
    }

    forceClose() {
        if (this.escHandler) {
            document.removeEventListener('keydown', this.escHandler);
            this.escHandler = null;
        }

        if (this.dragCleanup) {
            this.dragCleanup();
            this.dragCleanup = null;
        }

        if (this.resizeCleanup) {
            this.resizeCleanup();
            this.resizeCleanup = null;
        }

        if (this.container) {
            this.container.remove();
            this.container = null;
        }

        this.isOpening = false;
        this.eventDelegationBound = false;
        this.containerClickBound = false;

        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }

        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
            this.syncTimeout = null;
        }

        // 移除 kanban-active 类
        document.body.classList.remove('kanban-active');
    }
    render() {
        if (!this.container) {
            console.error('[Kanban] Container not found, cannot render');
            return;
        }
        
        const columnsContainer = this.container.querySelector('#kanban-columns');
        if (!columnsContainer) {
            console.error('[Kanban] Columns container not found');
            return;
        }
        
        // 使用 RAF 优化渲染时机
        this.scheduleRender(() => {
            // 获取当前视图的数据
            const currentData = this.data[this.currentView];
            if (!currentData || !currentData.columns) {
                console.error('[Kanban] Invalid view data');
                return;
            }
            
            // 使用虚拟滚动优化的渲染
            columnsContainer.innerHTML = currentData.columns.map(column => {
                const sortedTasks = this.getSortedTasks(column);
                const state = this.virtualScrollStates.get(column.id) || { startIndex: 0, endIndex: Plugin.PERFORMANCE.VISIBLE_TASK_COUNT };
                
                // 只渲染可见任务
                const visibleTasks = sortedTasks.slice(state.startIndex, Math.min(state.endIndex, sortedTasks.length));
                const totalHeight = sortedTasks.length * Plugin.PERFORMANCE.TASK_HEIGHT;
                const offsetY = state.startIndex * Plugin.PERFORMANCE.TASK_HEIGHT;
                
                const activeTasks = sortedTasks.filter(task => !task.completed).length;
                const completedTasks = sortedTasks.filter(task => task.completed).length;
                
                // 构建虚拟滚动的 HTML
                let tasksHTML = '';
                
                // 顶部占位
                if (offsetY > 0) {
                    tasksHTML += `<div class="virtual-scroll-spacer" style="height: ${offsetY}px;"></div>`;
                }
                
                // 可见任务
                tasksHTML += visibleTasks.map(task => `
                    <div class="kanban-task ${task.completed ? 'completed' : ''}" draggable="true" data-task-id="${task.id}">
                        <div class="kanban-task-checkbox ${task.completed ? 'checked' : ''}" 
                             data-task-id="${task.id}" 
                             data-column-id="${column.id}"></div>
                        <div class="kanban-task-content ${task.completed ? 'completed' : ''}" 
                             data-task-id="${task.id}" 
                             data-column-id="${column.id}">${this.formatTaskContent(task.content)}</div>
                        <span class="kanban-task-delete" data-task-id="${task.id}" data-column-id="${column.id}">✖</span>
                    </div>
                `).join('');
                
                // 底部占位
                const bottomSpacerHeight = totalHeight - offsetY - (visibleTasks.length * Plugin.PERFORMANCE.TASK_HEIGHT);
                if (bottomSpacerHeight > 0) {
                    tasksHTML += `<div class="virtual-scroll-spacer" style="height: ${bottomSpacerHeight}px;"></div>`;
                }
                
                return `
                    <div class="kanban-column" data-column-id="${column.id}">
                        <div class="kanban-column-header">
                            <h3 class="kanban-column-title">${this.getColumnTitle(column)}</h3>
                            <div class="kanban-task-count">
                                <span class="kanban-task-count-active">${activeTasks}</span>
                                <span class="kanban-task-count-completed">${completedTasks}</span>
                            </div>
                        </div>
                        <div class="kanban-tasks" data-column-id="${column.id}" style="overflow-y: auto; max-height: calc(100vh - 300px);">
                            ${tasksHTML}
                        </div>
                        <div class="kanban-add-task" data-column-id="${column.id}">+ 添加任务</div>
                    </div>
                `;
            }).join('');
            
            // 渲染完成后重新设置拖拽（确保 DOM 已更新）
            requestAnimationFrame(() => {
                this.setupDragAndDrop();
            });
        });
    }

    formatTaskContent(content) {
        return this.escapeHtml(content).replace(/\n/g, '<br>');
    }

    // ============ 性能优化方法 ============
    
    // 获取当前视图的列数组
    getCurrentColumns() {
        const currentData = this.data[this.currentView];
        return currentData && currentData.columns ? currentData.columns : [];
    }
    
    // 获取排序后的任务（带缓存）
    getSortedTasks(column) {
        const cacheKey = `${column.id}_${column.tasks?.length || 0}_${column.tasks?.filter(t => t.completed).length || 0}`;
        
        if (this.sortedTasksCache.has(cacheKey)) {
            return this.sortedTasksCache.get(cacheKey);
        }
        
        const sortedTasks = [...(column.tasks || [])].sort((a, b) => {
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }
            if (a.completed && b.completed) {
                const aCompletedTime = new Date(a.completedAt || a.createdAt).getTime();
                const bCompletedTime = new Date(b.completedAt || b.createdAt).getTime();
                return bCompletedTime - aCompletedTime;
            }
            return 0;
        });
        
        this.sortedTasksCache.set(cacheKey, sortedTasks);
        return sortedTasks;
    }
    
    // 清除排序缓存
    clearSortCache(columnId = null) {
        if (columnId) {
            // 清除特定列的缓存
            for (const key of this.sortedTasksCache.keys()) {
                if (key.startsWith(columnId)) {
                    this.sortedTasksCache.delete(key);
                }
            }
        } else {
            // 清除所有缓存
            this.sortedTasksCache.clear();
        }
        
        // 限制缓存大小，防止内存无限增长
        if (this.sortedTasksCache.size > Plugin.PERFORMANCE.MAX_CACHE_SIZE) {
            const entries = Array.from(this.sortedTasksCache.entries());
            this.sortedTasksCache = new Map(
                entries.slice(-Plugin.PERFORMANCE.CACHE_TRIM_SIZE)
            );
        }
    }
    
    // 虚拟滚动：只渲染可见任务
    setupVirtualScroll() {
        if (!this.container) return;
        
        const columnsContainer = this.container.querySelector('#kanban-columns');
        if (!columnsContainer) return;
        
        const taskContainers = columnsContainer.querySelectorAll('.kanban-tasks');
        
        taskContainers.forEach(taskContainer => {
            const columnId = taskContainer.dataset.columnId;
            
            // 初始化虚拟滚动状态
            if (!this.virtualScrollStates.has(columnId)) {
                this.virtualScrollStates.set(columnId, {
                    scrollTop: 0,
                    startIndex: 0,
                    endIndex: Plugin.PERFORMANCE.VISIBLE_TASK_COUNT
                });
            }
            
            // 滚动事件监听（使用防抖）
            let scrollTimeout;
            taskContainer.addEventListener('scroll', () => {
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    this.updateVirtualScroll(columnId, taskContainer);
                }, Plugin.PERFORMANCE.SCROLL_DEBOUNCE);
            });
        });
    }
    
    // 更新虚拟滚动视口
    updateVirtualScroll(columnId, taskContainer) {
        const scrollTop = taskContainer.scrollTop;
        const startIndex = Math.floor(scrollTop / Plugin.PERFORMANCE.TASK_HEIGHT);
        const endIndex = startIndex + Plugin.PERFORMANCE.VISIBLE_TASK_COUNT + 5; // 多渲染几个缓冲
        
        const state = this.virtualScrollStates.get(columnId);
        if (state && (state.startIndex !== startIndex || state.endIndex !== endIndex)) {
            state.scrollTop = scrollTop;
            state.startIndex = startIndex;
            state.endIndex = endIndex;
            
            // 只更新这一列
            this.renderColumn(columnId);
        }
    }
    
    // 渲染单个列（增量更新）
    renderColumn(columnId) {
        if (!this.container) return;
        
        const column = this.getCurrentColumns().find(c => c.id === columnId);
        if (!column) return;
        
        const columnElement = this.container.querySelector(`.kanban-column[data-column-id="${columnId}"]`);
        if (!columnElement) return;
        
        const tasksContainer = columnElement.querySelector('.kanban-tasks');
        if (!tasksContainer) return;
        
        const sortedTasks = this.getSortedTasks(column);
        const state = this.virtualScrollStates.get(columnId) || { startIndex: 0, endIndex: Plugin.PERFORMANCE.VISIBLE_TASK_COUNT };
        
        // 使用虚拟滚动：只渲染可见部分
        const visibleTasks = sortedTasks.slice(state.startIndex, state.endIndex);
        const totalHeight = sortedTasks.length * Plugin.PERFORMANCE.TASK_HEIGHT;
        const offsetY = state.startIndex * Plugin.PERFORMANCE.TASK_HEIGHT;
        
        // 使用 DocumentFragment 批量更新 DOM
        const fragment = document.createDocumentFragment();
        
        // 添加占位空间（顶部）
        if (offsetY > 0) {
            const spacerTop = document.createElement('div');
            spacerTop.style.height = `${offsetY}px`;
            spacerTop.className = 'virtual-scroll-spacer';
            fragment.appendChild(spacerTop);
        }
        
        // 渲染可见任务
        visibleTasks.forEach(task => {
            const taskElement = document.createElement('div');
            taskElement.className = `kanban-task ${task.completed ? 'completed' : ''}`;
            taskElement.draggable = true;
            taskElement.dataset.taskId = task.id;
            taskElement.innerHTML = `
                <div class="kanban-task-checkbox ${task.completed ? 'checked' : ''}" 
                     data-task-id="${task.id}" 
                     data-column-id="${columnId}"></div>
                <div class="kanban-task-content ${task.completed ? 'completed' : ''}" 
                     data-task-id="${task.id}" 
                     data-column-id="${columnId}">${this.formatTaskContent(task.content)}</div>
                <span class="kanban-task-delete" data-task-id="${task.id}" data-column-id="${columnId}">✖</span>
            `;
            fragment.appendChild(taskElement);
        });
        
        // 添加占位空间（底部）
        const bottomSpacerHeight = totalHeight - offsetY - (visibleTasks.length * Plugin.PERFORMANCE.TASK_HEIGHT);
        if (bottomSpacerHeight > 0) {
            const spacerBottom = document.createElement('div');
            spacerBottom.style.height = `${bottomSpacerHeight}px`;
            spacerBottom.className = 'virtual-scroll-spacer';
            fragment.appendChild(spacerBottom);
        }
        
        // 一次性更新 DOM
        tasksContainer.innerHTML = '';
        tasksContainer.appendChild(fragment);
        
        // 更新任务计数
        this.updateTaskCount(columnId);
        
        // DOM 更新后重新绑定拖拽事件（仅针对新渲染的任务）
        requestAnimationFrame(() => {
            this.setupDragAndDrop();
        });
    }
    
    // 使用 RAF 优化渲染
    scheduleRender(callback) {
        if (this.renderRAF) {
            cancelAnimationFrame(this.renderRAF);
        }
        
        this.renderRAF = requestAnimationFrame(() => {
            callback();
            this.renderRAF = null;
        });
    }

    bindEvents() {
        if (!this.container) return;
        
        // 绑定视图切换按钮
        const viewTabs = this.container.querySelectorAll('.kanban-view-tab');
        viewTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const view = tab.dataset.view;
                if (view !== this.currentView) {
                    this.switchView(view);
                }
            });
        });
        
        // 始终重新绑定关闭和设置按钮，确保它们能正常工作
        const closeBtn = this.container.querySelector('.kanban-close');
        if (closeBtn) {
            // 移除旧的监听器
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            newCloseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.close();
            });
        }
        
        const settingsBtn = this.container.querySelector('.kanban-settings');
        if (settingsBtn) {
            // 移除旧的监听器
            const newSettingsBtn = settingsBtn.cloneNode(true);
            settingsBtn.parentNode.replaceChild(newSettingsBtn, settingsBtn);
            newSettingsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openConfig();
            });
        }
        
        // 背景点击关闭（始终绑定，使用标记避免重复）
        if (!this.containerClickBound) {
            this.container.addEventListener('click', (e) => {
                if (e.target === this.container) {
                    this.close();
                }
            });
            this.containerClickBound = true;
        }
        
        // ESC 键关闭
        if (this.escHandler) {
            document.removeEventListener('keydown', this.escHandler);
        }
        
        this.escHandler = (e) => {
            if (e.key === 'Escape' && this.container) {
                const configDialog = document.getElementById('kanban-config-dialog');
                const inputDialog = document.getElementById('kanban-input-dialog');
                const confirmDialog = document.getElementById('kanban-confirm-dialog');
                
                if (!configDialog && !inputDialog && !confirmDialog) {
                    this.close();
                }
            }
        };
        document.addEventListener('keydown', this.escHandler);
        
        // ============ 事件委托优化 ============
        // 使用事件委托，只在容器级别绑定一次事件
        const columnsContainer = this.container.querySelector('#kanban-columns');
        if (columnsContainer && !this.eventDelegationBound) {
            // 点击事件委托
            columnsContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // 添加任务按钮
                if (e.target.classList.contains('kanban-add-task')) {
                    const columnId = e.target.dataset.columnId;
                    this.addTask(columnId);
                    return;
                }
                
                // 删除按钮
                if (e.target.classList.contains('kanban-task-delete')) {
                    this.deleteTask(e.target.dataset.columnId, e.target.dataset.taskId);
                    return;
                }
                
                // 复选框
                if (e.target.classList.contains('kanban-task-checkbox')) {
                    this.toggleTaskComplete(e.target.dataset.columnId, e.target.dataset.taskId);
                    return;
                }
            });
            
            // 双击编辑事件委托
            columnsContainer.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (e.target.classList.contains('kanban-task-content')) {
                    this.editTask(e.target.dataset.columnId, e.target.dataset.taskId);
                }
            });
            
            // 设置虚拟滚动
            this.setupVirtualScroll();
            
            this.eventDelegationBound = true;
        }
        
        this.setupDragAndDrop();
    }

    setupDragAndDrop() {
        if (!this.container) return;
        
        const columnsContainer = this.container.querySelector('#kanban-columns');
        if (!columnsContainer) return;
        
        let draggedTaskId = null;
        let sourceColumnId = null;
        let draggedElement = null;
        
        // 移除旧的监听器
        if (this.dragHandlers) {
            columnsContainer.removeEventListener('dragstart', this.dragHandlers.dragstart);
            columnsContainer.removeEventListener('dragend', this.dragHandlers.dragend);
            columnsContainer.removeEventListener('dragover', this.dragHandlers.dragover);
        }
        
        // 创建新的处理器
        this.dragHandlers = {
            dragstart: (e) => {
                if (e.target.classList.contains('kanban-task')) {
                    draggedElement = e.target;
                    draggedTaskId = e.target.dataset.taskId;
                    const tasksContainer = e.target.closest('.kanban-tasks');
                    sourceColumnId = tasksContainer ? tasksContainer.dataset.columnId : null;
                    e.target.classList.add('dragging');
                    e.target.style.opacity = '0.5';
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', draggedTaskId);
                }
            },
            dragend: (e) => {
                if (e.target.classList.contains('kanban-task')) {
                    e.target.classList.remove('dragging');
                    e.target.style.opacity = '1';
                    // 清除所有 drag-over 类
                    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                    draggedElement = null;
                }
            },
            dragover: (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                // 处理同列内的排序
                const tasksContainer = e.target.closest('.kanban-tasks');
                
                // 只在拖拽到任务列容器内时才处理
                if (tasksContainer && draggedElement) {
                    const afterElement = this.getDragAfterElement(tasksContainer, e.clientY);
                    
                    if (afterElement == null) {
                        tasksContainer.appendChild(draggedElement);
                    } else {
                        tasksContainer.insertBefore(draggedElement, afterElement);
                    }
                }
            }
        };
        
        // 使用事件委托监听拖拽
        columnsContainer.addEventListener('dragstart', this.dragHandlers.dragstart);
        columnsContainer.addEventListener('dragend', this.dragHandlers.dragend);
        columnsContainer.addEventListener('dragover', this.dragHandlers.dragover);
        
        // 为每个任务列容器设置 drop 区域
        this.container.querySelectorAll('.kanban-tasks').forEach(column => {
            // 移除旧的事件监听器
            const newColumn = column.cloneNode(true);
            column.parentNode.replaceChild(newColumn, column);
            
            newColumn.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                newColumn.classList.add('drag-over');
            });
            
            newColumn.addEventListener('dragleave', (e) => {
                if (e.target === newColumn) {
                    newColumn.classList.remove('drag-over');
                }
            });
            
            newColumn.addEventListener('drop', (e) => {
                e.preventDefault();
                newColumn.classList.remove('drag-over');
                
                if (draggedTaskId && sourceColumnId) {
                    const targetColumnId = newColumn.dataset.columnId;
                    
                    // 获取目标位置的索引
                    const targetIndex = this.getDropTargetIndex(newColumn, draggedElement);
                    
                    this.moveTask(draggedTaskId, sourceColumnId, targetColumnId, targetIndex);
                    draggedTaskId = null;
                    sourceColumnId = null;
                }
            });
        });
    }
    
    // 获取拖拽后的元素位置
    getDragAfterElement(container, y) {
        // 添加空值检查
        if (!container) return null;
        
        const draggableElements = [...container.querySelectorAll('.kanban-task:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
    // 获取放置目标的索引
    getDropTargetIndex(container, draggedElement) {
        const tasks = [...container.querySelectorAll('.kanban-task:not(.virtual-scroll-spacer)')];
        return tasks.indexOf(draggedElement);
    }

    async toggleTaskComplete(columnId, taskId) {
        const column = this.getCurrentColumns().find(c => c.id === columnId);
        if (!column || !column.tasks) return;
        
        const task = column.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        task.completed = !task.completed;
        if (task.completed) {
            task.completedAt = new Date().toISOString();
        } else {
            delete task.completedAt;
        }
        
        // 清除该列的排序缓存
        this.clearSortCache(columnId);
        
        // 使用增量更新：只重新渲染这一列
        this.scheduleRender(() => {
            this.renderColumn(columnId);
        });
        
        this.saveKanbanData();
        this.scheduleSyncToNote();
    }

    updateTaskCount(columnId) {
        if (!this.container) return;
        
        const column = this.getCurrentColumns().find(c => c.id === columnId);
        if (!column) return;
        
        const tasks = column.tasks || [];
        const activeTasks = tasks.filter(t => !t.completed).length;
        const completedTasks = tasks.filter(t => t.completed).length;
        
        const columnElement = this.container.querySelector(`.kanban-column[data-column-id="${columnId}"]`);
        if (columnElement) {
            const countContainer = columnElement.querySelector('.kanban-task-count');
            if (countContainer) {
                countContainer.innerHTML = `
                    <span class="kanban-task-count-active">${activeTasks}</span>
                    <span class="kanban-task-count-completed">${completedTasks}</span>
                `;
            }
        }
    }

    scheduleSyncToNote() {
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
        }
        
        this.syncTimeout = setTimeout(async () => {
            const viewConfig = this.config[this.currentView];
            if (viewConfig && viewConfig.targetNotebook) {
                await this.exportToNote(true);
            }
            this.syncTimeout = null;
        }, Plugin.PERFORMANCE.SYNC_DEBOUNCE);
    }

    editTask(columnId, taskId) {
        const column = this.getCurrentColumns().find(c => c.id === columnId);
        if (!column || !column.tasks) return;
        
        const task = column.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        this.showInputDialog(
            '编辑任务', 
            '修改任务内容（支持换行，Ctrl+Enter 提交）', 
            async (newContent) => {
                task.content = newContent;
                
                // 清除该列的排序缓存
                this.clearSortCache(columnId);
                
                // 直接更新 DOM，避免全量渲染
                if (this.container) {
                    const contentElement = this.container.querySelector(
                        `.kanban-task-content[data-task-id="${taskId}"]`
                    );
                    if (contentElement) {
                        contentElement.innerHTML = this.formatTaskContent(newContent);
                    }
                }
                
                await this.saveKanbanDataImmediately();
                this.scheduleSyncToNote();
            },
            task.content
        );
    }

    addTask(columnId) {
        this.showInputDialog('添加任务', '请输入任务内容（支持换行，Ctrl+Enter 提交）', async (content) => {
            const column = this.getCurrentColumns().find(c => c.id === columnId);
            if (!column) return;
            
            if (!column.tasks) column.tasks = [];
            
            const task = {
                id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                content: content,
                completed: false,
                createdAt: new Date().toISOString()
            };
            
            column.tasks.unshift(task);
            
            // 清除该列的排序缓存
            this.clearSortCache(columnId);
            
            await this.saveKanbanDataImmediately();
            this.scheduleSyncToNote();
            
            // 使用增量更新：只重新渲染这一列
            this.scheduleRender(() => {
                this.renderColumn(columnId);
            });
        });
    }

    deleteTask(columnId, taskId) {
        this.showConfirmDialog('确定要删除这个任务吗？', async (confirmed) => {
            if (!confirmed) return;
            
            const column = this.getCurrentColumns().find(c => c.id === columnId);
            if (!column || !column.tasks) return;
            
            const taskIndex = column.tasks.findIndex(t => t.id === taskId);
            if (taskIndex > -1) {
                column.tasks.splice(taskIndex, 1);
                
                // 清除该列的排序缓存
                this.clearSortCache(columnId);
                
                await this.saveKanbanDataImmediately();
                this.scheduleSyncToNote();
                
                // 使用增量更新：只重新渲染这一列
                this.scheduleRender(() => {
                    this.renderColumn(columnId);
                });
            }
        });
    }

    async moveTask(taskId, fromColumnId, toColumnId, targetIndex = 0) {
        const fromColumn = this.getCurrentColumns().find(c => c.id === fromColumnId);
        const toColumn = this.getCurrentColumns().find(c => c.id === toColumnId);
        
        if (!fromColumn || !toColumn) return;
        
        const taskIndex = (fromColumn.tasks || []).findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;
        
        // 检查是否真的需要移动
        if (fromColumnId === toColumnId && taskIndex === targetIndex) {
            return;
        }
        
        const task = fromColumn.tasks[taskIndex];
        fromColumn.tasks.splice(taskIndex, 1);
        
        if (!toColumn.tasks) toColumn.tasks = [];
        
        // 如果是同一列，按照拖拽后的位置插入
        if (fromColumnId === toColumnId) {
            // 同列内移动，保持拖拽后的顺序
            if (targetIndex >= 0 && targetIndex < toColumn.tasks.length) {
                toColumn.tasks.splice(targetIndex, 0, task);
            } else {
                toColumn.tasks.push(task);
            }
        } else {
            // 跨列移动，插入到开头
            toColumn.tasks.unshift(task);
        }
        
        // 清除相关列的排序缓存
        this.clearSortCache(fromColumnId);
        if (fromColumnId !== toColumnId) {
            this.clearSortCache(toColumnId);
        }
        
        await this.saveKanbanDataImmediately();
        this.scheduleSyncToNote();
        
        // 使用增量更新：只重新渲染相关的列
        this.scheduleRender(() => {
            this.renderColumn(fromColumnId);
            if (fromColumnId !== toColumnId) {
                this.renderColumn(toColumnId);
            }
        });
    }

    async loadKanbanData() {
        try {
            const data = await this.loadData('kanban.json');
            if (data) {
                // 兼容旧数据格式
                if (data.work && data.personal) {
                    this.data = data;
                } else if (data.columns && Array.isArray(data.columns)) {
                    // 转换旧数据为新格式（放到work视图）
                    this.data = {
                        work: { columns: data.columns },
                        personal: this.getDefaultData().personal
                    };
                } else {
                    this.data = this.getDefaultData();
                }
            } else {
                this.data = this.getDefaultData();
            }
        } catch (error) {
            console.error('[Kanban] 数据加载失败:', error);
            this.data = this.getDefaultData();
        }
    }

    async saveKanbanDataImmediately() {
        try {
            const dataToSave = {
                work: this.data.work,
                personal: this.data.personal
            };
            
            await this.saveData('kanban.json', dataToSave);
        } catch (error) {
            console.error('[Kanban] 数据保存失败:', error);
        }
    }

    async saveKanbanData() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        this.saveTimeout = setTimeout(async () => {
            await this.saveKanbanDataImmediately();
            this.saveTimeout = null;
        }, Plugin.PERFORMANCE.SAVE_DEBOUNCE);
    }

    getDefaultData() {
        return {
            work: {
                columns: [
                    { id: 'periodic', title: '🔄 周期任务', tasks: [] },
                    { id: 'urgent-important', title: '🔥 重要且紧急', tasks: [] },
                    { id: 'important-not-urgent', title: '🔥 重要不紧急', tasks: [] },
                    { id: 'urgent-not-important', title: '⚡ 紧急不重要', tasks: [] },
                    { id: 'not-urgent-not-important', title: '💤 不紧急不重要', tasks: [] }
                ]
            },
            personal: {
                columns: [
                    { id: 'periodic', title: '🔄 周期任务', tasks: [] },
                    { id: 'urgent-important', title: '🔥 重要且紧急', tasks: [] },
                    { id: 'important-not-urgent', title: '🔥 重要不紧急', tasks: [] },
                    { id: 'urgent-not-important', title: '⚡ 紧急不重要', tasks: [] },
                    { id: 'not-urgent-not-important', title: '💤 不紧急不重要', tasks: [] }
                ]
            }
        };
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getColumnTitle(column) {
        // 直接返回标题，因为标题已包含完整的 emoji
        return column.title;
    }


}

module.exports = {
    default: Plugin
};