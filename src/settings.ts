// src/settings.ts
import { App, PluginSettingTab, Setting } from 'obsidian';
import WritingHeatmapPlugin from './main';

// 插件设置接口
export interface WritingHeatmapSettings {
    // 颜色设置
    colorEmpty: string;      // 无写作的颜色
    colorLevel1: string;     // 等级1颜色
    colorLevel2: string;     // 等级2颜色
    colorLevel3: string;     // 等级3颜色
    colorLevel4: string;     // 等级4颜色（最大）
    
    // 阈值设置
    level1Threshold: number;  // 等级1阈值
    level2Threshold: number;  // 等级2阈值
    level3Threshold: number;  // 等级3阈值
    maxThreshold: number;     // 最大阈值（等级4）
    
    // 每日目标
    dailyGoal: number;        // 每日写作目标
    showProgressBar: boolean; // 是否显示进度条
    
    // 显示设置
    cellSize: number;         // 格子大小 (px)
    cellGap: number;          // 格子间距 (px)
}

// 默认设置
export const DEFAULT_SETTINGS: WritingHeatmapSettings = {
    colorEmpty: '#ebedf0',
    colorLevel1: '#9be9a8',
    colorLevel2: '#40c463',
    colorLevel3: '#30a14e',
    colorLevel4: '#216e39',
    
    level1Threshold: 100,
    level2Threshold: 300,
    level3Threshold: 600,
    maxThreshold: 1000,
    
    dailyGoal: 1000,
    showProgressBar: true,
    
    cellSize: 12,
    cellGap: 2
};

// 深色模式默认颜色
export const DARK_MODE_COLORS = {
    colorEmpty: '#161b22',
    colorLevel1: '#0e4429',
    colorLevel2: '#006d32',
    colorLevel3: '#26a641',
    colorLevel4: '#39d353'
};

// 颜色预设方案
const COLOR_PRESETS = {
    github: {
        light: {
            colorEmpty: '#ebedf0',
            colorLevel1: '#9be9a8',
            colorLevel2: '#40c463',
            colorLevel3: '#30a14e',
            colorLevel4: '#216e39'
        },
        dark: {
            colorEmpty: '#161b22',
            colorLevel1: '#0e4429',
            colorLevel2: '#006d32',
            colorLevel3: '#26a641',
            colorLevel4: '#39d353'
        }
    },
    blue: {
        light: {
            colorEmpty: '#ebedf0',
            colorLevel1: '#c6e6ff',
            colorLevel2: '#79c0ff',
            colorLevel3: '#388bfd',
            colorLevel4: '#1f6feb'
        },
        dark: {
            colorEmpty: '#161b22',
            colorLevel1: '#1f3a5f',
            colorLevel2: '#1f6feb',
            colorLevel3: '#388bfd',
            colorLevel4: '#79c0ff'
        }
    },
    purple: {
        light: {
            colorEmpty: '#ebedf0',
            colorLevel1: '#e2c6ff',
            colorLevel2: '#bc8cff',
            colorLevel3: '#a371f7',
            colorLevel4: '#8957e5'
        },
        dark: {
            colorEmpty: '#161b22',
            colorLevel1: '#3d2b5f',
            colorLevel2: '#8957e5',
            colorLevel3: '#a371f7',
            colorLevel4: '#bc8cff'
        }
    },
    orange: {
        light: {
            colorEmpty: '#ebedf0',
            colorLevel1: '#ffe5cc',
            colorLevel2: '#ffb366',
            colorLevel3: '#ff8c00',
            colorLevel4: '#e06600'
        },
        dark: {
            colorEmpty: '#161b22',
            colorLevel1: '#5f3d1f',
            colorLevel2: '#e06600',
            colorLevel3: '#ff8c00',
            colorLevel4: '#ffb366'
        }
    }
};

export class WritingHeatmapSettingTab extends PluginSettingTab {
    plugin: WritingHeatmapPlugin;

    constructor(app: App, plugin: WritingHeatmapPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    // 检测当前是否为深色模式
    private isDarkMode(): boolean {
        return document.body.classList.contains('theme-dark');
    }

    // 应用颜色预设
    private async applyColorPreset(presetKey: keyof typeof COLOR_PRESETS): Promise<void> {
        const mode = this.isDarkMode() ? 'dark' : 'light';
        const preset = COLOR_PRESETS[presetKey][mode];
        
        this.plugin.settings.colorEmpty = preset.colorEmpty;
        this.plugin.settings.colorLevel1 = preset.colorLevel1;
        this.plugin.settings.colorLevel2 = preset.colorLevel2;
        this.plugin.settings.colorLevel3 = preset.colorLevel3;
        this.plugin.settings.colorLevel4 = preset.colorLevel4;
        
        await this.plugin.saveSettings();
        this.display();
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // 标题
        containerEl.createEl('h2', { text: '写作热力图设置' });

        // ===== 每日目标设置 =====
        containerEl.createEl('h3', { text: '📎 每日目标' });

        new Setting(containerEl)
            .setName('每日写作目标')
            .setDesc('设置每天的写作字数目标')
            .addText(text => text
                .setPlaceholder('1000')
                .setValue(this.plugin.settings.dailyGoal.toString())
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.dailyGoal = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('显示进度条')
            .setDesc('在热力图下方显示今日写作进度')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showProgressBar)
                .onChange(async (value) => {
                    this.plugin.settings.showProgressBar = value;
                    await this.plugin.saveSettings();
                }));

        // ===== 阈值设置 =====
        containerEl.createEl('h3', { text: '📊 字数阈值' });

        new Setting(containerEl)
            .setName('等级1阈值')
            .setDesc('达到此字数显示等级1颜色')
            .addText(text => text
                .setPlaceholder('100')
                .setValue(this.plugin.settings.level1Threshold.toString())
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.level1Threshold = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('等级2阈值')
            .setDesc('达到此字数显示等级2颜色')
            .addText(text => text
                .setPlaceholder('300')
                .setValue(this.plugin.settings.level2Threshold.toString())
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.level2Threshold = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('等级3阈值')
            .setDesc('达到此字数显示等级3颜色')
            .addText(text => text
                .setPlaceholder('600')
                .setValue(this.plugin.settings.level3Threshold.toString())
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.level3Threshold = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('最大阈值（等级4）')
            .setDesc('达到此字数显示最深颜色')
            .addText(text => text
                .setPlaceholder('1000')
                .setValue(this.plugin.settings.maxThreshold.toString())
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.maxThreshold = num;
                        await this.plugin.saveSettings();
                    }
                }));

        // ===== 颜色设置 =====
        containerEl.createEl('h3', { text: '🎨 颜色设置' });

        new Setting(containerEl)
            .setName('无写作颜色')
            .setDesc('当天没有写作时的格子颜色')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.colorEmpty)
                .onChange(async (value) => {
                    this.plugin.settings.colorEmpty = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('等级1颜色')
            .setDesc('最浅的写作颜色')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.colorLevel1)
                .onChange(async (value) => {
                    this.plugin.settings.colorLevel1 = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('等级2颜色')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.colorLevel2)
                .onChange(async (value) => {
                    this.plugin.settings.colorLevel2 = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('等级3颜色')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.colorLevel3)
                .onChange(async (value) => {
                    this.plugin.settings.colorLevel3 = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('等级4颜色（最深）')
            .setDesc('达到最大阈值时的颜色')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.colorLevel4)
                .onChange(async (value) => {
                    this.plugin.settings.colorLevel4 = value;
                    await this.plugin.saveSettings();
                }));

        // 预设颜色按钮
        const modeText = this.isDarkMode() ? '深色' : '浅色';
        new Setting(containerEl)
            .setName('颜色预设')
            .setDesc(`快速应用预设配色方案（当前：${modeText}模式）`)
            .addButton(button => button
                .setButtonText('GitHub 绿色')
                .onClick(async () => {
                    await this.applyColorPreset('github');
                }))
            .addButton(button => button
                .setButtonText('蓝色')
                .onClick(async () => {
                    await this.applyColorPreset('blue');
                }))
            .addButton(button => button
                .setButtonText('紫色')
                .onClick(async () => {
                    await this.applyColorPreset('purple');
                }))
            .addButton(button => button
                .setButtonText('橙色')
                .onClick(async () => {
                    await this.applyColorPreset('orange');
                }));

        // ===== 显示设置 =====
        containerEl.createEl('h3', { text: '📐 显示设置' });

        new Setting(containerEl)
            .setName('格子大小')
            .setDesc('热力图每个格子的大小（像素）')
            .addSlider(slider => slider
                .setLimits(8, 24, 2)
                .setValue(this.plugin.settings.cellSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.cellSize = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('格子间距')
            .setDesc('格子之间的间距（像素）')
            .addSlider(slider => slider
                .setLimits(1, 6, 1)
                .setValue(this.plugin.settings.cellGap)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.cellGap = value;
                    await this.plugin.saveSettings();
                }));

        // ===== 数据管理 =====
        containerEl.createEl('h3', { text: '🗃️ 数据管理' });

        new Setting(containerEl)
            .setName('重置今日统计')
            .setDesc('将今日的写作字数清零')
            .addButton(button => button
                .setButtonText('重置')
                .setWarning()
                .onClick(async () => {
                    await this.plugin.wordCounter.resetToday();
                    this.plugin.refreshView();
                }));

        new Setting(containerEl)
            .setName('导出数据')
            .setDesc('导出所有写作统计数据为 JSON 文件')
            .addButton(button => button
                .setButtonText('导出')
                .onClick(async () => {
                    const data = this.plugin.wordCounter.exportData();
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `writing-heatmap-${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                }));
    }
}