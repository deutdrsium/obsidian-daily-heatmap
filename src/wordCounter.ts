// src/wordCounter.ts
import { TFile } from 'obsidian';
import type WritingHeatmapPlugin from './main';

const DATA_FILE_PATH = 'daliy-heatmap.json';
const LEGACY_DATA_FILE_PATH = '.daily-heatmap.json';

export interface DailyWordCount {
    [date: string]: number;
}

export interface WordCountData {
    dailyCounts: DailyWordCount;
    fileWordCounts: { [filePath: string]: number };
}

export interface WordCountExport {
    exportDate: string;
    dailyCounts: DailyWordCount;
    totalDays: number;
    totalWords: number;
}

export class WordCounter {
    private readonly plugin: WritingHeatmapPlugin;
    private syncPromise: Promise<void> | null = null;
    data: WordCountData;
    initialized: boolean = false;

    constructor(plugin: WritingHeatmapPlugin) {
        this.plugin = plugin;
        this.data = {
            dailyCounts: {},
            fileWordCounts: {}
        };
    }

    async loadData() {
        const fileData = await this.readExternalData();
        if (fileData) {
            this.data = fileData;
        } else {
            const legacyData = await this.plugin.loadData();
            if (legacyData && (legacyData.dailyCounts || legacyData.fileWordCounts)) {
                this.data = this.normalizeData(legacyData);
            }
        }

        // 立即标记初始化完成，允许 updateWordCount 处理后续的变更
        this.initialized = true;

        // 在 workspace ready 后再执行文件同步，避免阻塞插件加载
        this.scheduleBackgroundSync();
    }

    private scheduleBackgroundSync() {
        // 等待 workspace ready 后在后台执行同步
        this.waitForWorkspaceReady().then(() => {
            this.scheduleSyncFileCounts();
        }).catch(error => {
            console.error('Heatmap: 后台同步调度失败', error);
        });
    }

    private scheduleSyncFileCounts() {
        if (this.syncPromise) {
            console.debug('Heatmap: 文件列表同步已在进行中，跳过重复触发');
            return;
        }

        this.syncPromise = (async () => {
            const start = Date.now();
            try {
                await this.syncFileCounts();
                console.debug(`Heatmap: 文件列表同步完成，耗时 ${Date.now() - start}ms`);
            } catch (error) {
                console.error('Heatmap: 文件列表同步失败', error);
            } finally {
                this.syncPromise = null;
            }
        })();
    }

    /**
     * 同步文件列表：
     * 1. 移除 data 中存在但实际文件已删除的条目
     * 2. 为 data 中不存在的新文件计算词数
     * 3. 不会重新计算已存在条目的词数（避免启动时大量IO）
     */
    async syncFileCounts() {
        const files = this.plugin.app.vault.getMarkdownFiles();
        const currentFilePaths = new Set(files.map(f => f.path));
        const storedPaths = Object.keys(this.data.fileWordCounts);
        
        let hasChanges = false;

        // 1. 清理已删除的文件
        for (const path of storedPaths) {
            if (!currentFilePaths.has(path)) {
                delete this.data.fileWordCounts[path];
                hasChanges = true;
                console.debug(`Heatmap: 移除已删除文件记录: ${path}`);
            }
        }

        // 2. 补充缺失的文件 (新文件或上次未保存的文件)
        for (const file of files) {
            if (this.data.fileWordCounts[file.path] === undefined) {
                try {
                    const content = await this.plugin.app.vault.cachedRead(file);
                    const count = this.countWords(content);
                    this.data.fileWordCounts[file.path] = count;
                    hasChanges = true;
                    console.debug(`Heatmap: 同步新文件: ${file.path}, 词数: ${count}`);
                } catch (error) {
                    console.error(`Heatmap: 读取文件失败 ${file.path}`, error);
                }
            }
        }

        if (hasChanges) {
            await this.saveData();
            console.debug('Heatmap: 文件列表同步完成并保存');
        } else {
            console.debug('Heatmap: 文件列表已是最新，无需更新');
        }
    }

    async saveData() {
        await this.writeExternalData(this.data);
    }

    getTodayString(): string {
        return this.formatLocalDate(new Date());
    }

    countWords(text: string): number {
        const cleanText = text
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`]*`/g, '')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/[-#*_~`>]/g, '')
            .trim();

        const chineseChars = (cleanText.match(/[\u4e00-\u9fa5]/g) || []).length;
        const englishWords = cleanText
            .replace(/[\u4e00-\u9fa5]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 0).length;

        return chineseChars + englishWords;
    }

    async updateWordCount(file: TFile) {
        if (!this.initialized) {
            console.debug('Heatmap: 插件未初始化完成，跳过更新');
            return;
        }

        if (file.extension !== 'md') return;

        const content = await this.plugin.app.vault.read(file);
        const currentCount = this.countWords(content);
        const today = this.getTodayString();

        const lastCount = this.data.fileWordCounts[file.path];
        
        if (lastCount === undefined) {
            // 新文件：记录初始词数，不计入今日统计
            this.data.fileWordCounts[file.path] = currentCount;
            console.debug(`Heatmap: 新文件 ${file.basename} | 初始词数: ${currentCount} (不计入今日)`);
        } else {
            const diff = currentCount - lastCount;
            
            if (diff > 0) {
                this.data.dailyCounts[today] = (this.data.dailyCounts[today] || 0) + diff;
                console.debug(`Heatmap: ${file.basename} | 之前: ${lastCount} | 现在: ${currentCount} | 新增: ${diff} | 今日总计: ${this.data.dailyCounts[today]}`);
            } else if (diff < 0) {
                console.debug(`Heatmap: ${file.basename} | 词数减少: ${diff} (不影响今日统计)`);
            }
            this.data.fileWordCounts[file.path] = currentCount;
        }

        await this.saveData();
        this.notifyUpdate();
    }

    notifyUpdate() {
        this.plugin.app.workspace.trigger('heatmap-update');
    }

    getRecentData(days: number = 365): DailyWordCount {
        const result: DailyWordCount = {};
        const today = new Date();

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = this.formatLocalDate(date);
            result[dateStr] = this.data.dailyCounts[dateStr] || 0;
        }

        return result;
    }

    getTodayCount(): number {
        return this.data.dailyCounts[this.getTodayString()] || 0;
    }

    async resetToday() {
        const today = this.getTodayString();
        this.data.dailyCounts[today] = 0;
        await this.saveData();
        this.notifyUpdate();
    }

    exportData(): WordCountExport {
        return {
            exportDate: new Date().toISOString(),
            dailyCounts: this.data.dailyCounts,
            totalDays: Object.keys(this.data.dailyCounts).length,
            totalWords: Object.values(this.data.dailyCounts).reduce((a, b) => a + b, 0)
        };
    }

    // 根据设置计算等级
    getLevel(count: number): number {
        const settings = this.plugin.settings;
        if (count === 0) return 0;
        if (count < settings.level1Threshold) return 1;
        if (count < settings.level2Threshold) return 2;
        if (count < settings.level3Threshold) return 3;
        return 4;
    }

    private normalizeData(source: Partial<WordCountData> | null | undefined): WordCountData {
        const fileWordCounts = source?.fileWordCounts || {};
        return {
            dailyCounts: source?.dailyCounts || {},
            fileWordCounts
        };
    }

    private formatLocalDate(date: Date): string {
        const year = date.getFullYear();
        const month = this.padToTwoDigits(date.getMonth() + 1);
        const day = this.padToTwoDigits(date.getDate());
        return `${year}-${month}-${day}`;
    }

    private padToTwoDigits(value: number): string {
        return value < 10 ? `0${value}` : `${value}`;
    }

    private async waitForWorkspaceReady(): Promise<void> {
        const { workspace } = this.plugin.app;
        if (workspace.layoutReady) {
            return;
        }

        await new Promise<void>((resolve) => {
            workspace.onLayoutReady(() => resolve());
        });
    }

    private async readExternalData(): Promise<WordCountData | null> {
        try {
            const adapter = this.plugin.app.vault.adapter;
            let targetPath: string | null = null;

            if (await adapter.exists(DATA_FILE_PATH)) {
                targetPath = DATA_FILE_PATH;
            } else if (await adapter.exists(LEGACY_DATA_FILE_PATH)) {
                targetPath = LEGACY_DATA_FILE_PATH;
            } else {
                return null;
            }

            const raw = await adapter.read(targetPath);
            const parsed = raw ? JSON.parse(raw) : {};
            const normalized = this.normalizeData(parsed);

            if (targetPath === LEGACY_DATA_FILE_PATH) {
                await this.writeExternalData(normalized);
                await adapter.remove(LEGACY_DATA_FILE_PATH);
            }

            return normalized;
        } catch (error) {
            console.error('Heatmap: 无法读取 daliy-heatmap.json', error);
            return null;
        }
    }

    private async writeExternalData(data: WordCountData) {
        try {
            await this.plugin.app.vault.adapter.write(
                DATA_FILE_PATH,
                JSON.stringify(data, null, 2)
            );
        } catch (error) {
            console.error('Heatmap: 无法写入 daliy-heatmap.json', error);
        }
    }
}