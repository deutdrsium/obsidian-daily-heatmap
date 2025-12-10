// src/main.ts
import { Plugin, TFile } from 'obsidian';
import { HeatmapView, VIEW_TYPE_HEATMAP } from './heatmapView';
import { WordCounter } from './wordCounter';
import { WritingHeatmapSettings, DEFAULT_SETTINGS, WritingHeatmapSettingTab } from './settings';

export default class WritingHeatmapPlugin extends Plugin {
    wordCounter: WordCounter;
    settings: WritingHeatmapSettings;

    async onload() {
        console.debug('加载 Writing Heatmap 插件');

        // 加载设置
        await this.loadSettings();

        // 初始化字数统计器
        this.wordCounter = new WordCounter(this);
        await this.wordCounter.loadData();

        // 注册设置面板
        this.addSettingTab(new WritingHeatmapSettingTab(this.app, this));

        // 注册右侧边栏视图
        this.registerView(
            VIEW_TYPE_HEATMAP,
            (leaf) => new HeatmapView(leaf, this)
        );

        // 添加打开热力图的命令
        this.addCommand({
            id: 'open-writing-heatmap',
            name: '打开写作热力图',
            callback: () => {
                void this.activateView();
            }
        });

        // 添加侧边栏图标
        this.addRibbonIcon('calendar-glyph', '写作热力图', () => {
            void this.activateView();
        });

        // 监听文件修改事件
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile) {
                    void this.wordCounter.updateWordCount(file);
                }
            })
        );

        // 启动时激活视图
        this.app.workspace.onLayoutReady(() => {
            void this.activateView();
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData({
            ...this.settings,
            ...this.wordCounter.data  // 同时保存统计数据
        });
        this.refreshView();
    }

    // 刷新视图
    refreshView() {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_HEATMAP);
        leaves.forEach(leaf => {
            if (leaf.view instanceof HeatmapView) {
                leaf.view.render();
            }
        });
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType(VIEW_TYPE_HEATMAP)[0];

        if (!leaf) {
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                await rightLeaf.setViewState({
                    type: VIEW_TYPE_HEATMAP,
                    active: true,
                });
                leaf = rightLeaf;
            }
        }

        if (leaf) {
            await workspace.revealLeaf(leaf);
        }
    }

    onunload() {
        console.debug('卸载 Writing Heatmap 插件');
    }
}