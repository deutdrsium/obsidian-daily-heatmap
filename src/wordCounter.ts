// src/wordCounter.ts
import { TFile } from 'obsidian';

const DATA_FILE_PATH = 'daliy-heatmap.json';
const LEGACY_DATA_FILE_PATH = '.daily-heatmap.json';

export interface DailyWordCount {
    [date: string]: number;
}

export interface WordCountData {
    dailyCounts: DailyWordCount;
    fileWordCounts: { [filePath: string]: number };
}

export class WordCounter {
    plugin: any;
    data: WordCountData;
    initialized: boolean = false;

    constructor(plugin: any) {
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
                await this.saveData();
            }
        }

        await this.initializeFileCounts();
        this.initialized = true;
    }

    async initializeFileCounts() {
        const files = this.plugin.app.vault.getMarkdownFiles();
        
        for (const file of files) {
            const content = await this.plugin.app.vault.cachedRead(file);
            const wordCount = this.countWords(content);
            
            if (!(file.path in this.data.fileWordCounts)) {
                this.data.fileWordCounts[file.path] = wordCount;
            }
        }
        
        const existingPaths = new Set(files.map((f: TFile) => f.path));
        for (const path in this.data.fileWordCounts) {
            if (!existingPaths.has(path)) {
                delete this.data.fileWordCounts[path];
            }
        }
        
        await this.saveData();
        console.log('Heatmap: 初始化完成，已记录', files.length, '个文件');
    }

    async saveData() {
        await this.writeExternalData(this.data);
    }

    getTodayString(): string {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }

    countWords(text: string): number {
        const cleanText = text
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`]*`/g, '')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/[#*_~`>\-]/g, '')
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
            return;
        }

        if (file.extension !== 'md') return;

        const content = await this.plugin.app.vault.read(file);
        const currentCount = this.countWords(content);
        const today = this.getTodayString();

        const lastCount = this.data.fileWordCounts[file.path];
        
        if (lastCount === undefined) {
            this.data.fileWordCounts[file.path] = currentCount;
            if (currentCount > 0) {
                this.data.dailyCounts[today] = (this.data.dailyCounts[today] || 0) + currentCount;
            }
        } else {
            const diff = currentCount - lastCount;
            
            if (diff > 0) {
                this.data.dailyCounts[today] = (this.data.dailyCounts[today] || 0) + diff;
            }
            this.data.fileWordCounts[file.path] = currentCount;
        }

        await this.saveData();
        this.notifyUpdate();
        
        console.log(`Heatmap: ${file.basename} | 之前: ${lastCount ?? '新文件'} | 现在: ${currentCount} | 今日总计: ${this.data.dailyCounts[today] || 0}`);
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
            const dateStr = date.toISOString().split('T')[0];
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

    exportData(): any {
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
        return {
            dailyCounts: source?.dailyCounts || {},
            fileWordCounts: source?.fileWordCounts || {}
        };
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