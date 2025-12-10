// src/heatmapView.ts
import { ItemView, WorkspaceLeaf } from 'obsidian';
import WritingHeatmapPlugin from './main';

export const VIEW_TYPE_HEATMAP = 'writing-heatmap-view';

export class HeatmapView extends ItemView {
    plugin: WritingHeatmapPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: WritingHeatmapPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_HEATMAP;
    }

    getDisplayText(): string {
        return '写作热力图';
    }

    getIcon(): string {
        return 'calendar-glyph';
    }

    async onOpen() {
        await this.render();

        this.registerEvent(
            this.app.workspace.on('heatmap-update' as any, () => {
                this.render();
            })
        );
    }

    async render() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('heatmap-container');

        const settings = this.plugin.settings;
        const year = new Date().getFullYear();

        // 添加动态样式
        this.addStyles();

        // ===== 标题区域 =====
        const header = container.createEl('div', { cls: 'heatmap-header' });
        header.createEl('h4', { text: `📊 ${year} 写作热力图` });

        // ===== 今日统计 =====
        const todayCount = this.plugin.wordCounter.getTodayCount();
        const goalPercent = Math.min(100, Math.round((todayCount / settings.dailyGoal) * 100));
        
        const statsEl = container.createEl('div', { cls: 'heatmap-stats' });
        
        const todayEl = statsEl.createEl('div', { cls: 'today-stats' });
        todayEl.createEl('span', { 
            text: `今日: ${todayCount} 字`,
            cls: 'today-count'
        });
        todayEl.createEl('span', { 
            text: ` / ${settings.dailyGoal} 字目标`,
            cls: 'today-goal'
        });

        // ===== 进度条 =====
        if (settings.showProgressBar) {
            const progressContainer = container.createEl('div', { cls: 'progress-container' });
            
            const progressBar = progressContainer.createEl('div', { cls: 'progress-bar' });
            const progressFill = progressBar.createEl('div', { cls: 'progress-fill' });
            progressFill.style.width = `${goalPercent}%`;
            
            if (goalPercent >= 100) {
                progressFill.addClass('complete');
            } else if (goalPercent >= 50) {
                progressFill.addClass('half');
            }
            
            const progressText = progressContainer.createEl('div', { cls: 'progress-text' });
            if (goalPercent >= 100) {
                progressText.setText(`🎉 已完成 ${goalPercent}%！`);
            } else {
                progressText.setText(`${goalPercent}% - 还差 ${settings.dailyGoal - todayCount} 字`);
            }
        }

        // ===== 热力图 =====
        const heatmapEl = container.createEl('div', { cls: 'heatmap-vertical' });
        
        // 星期标签（横向，在顶部）
        const weekLabels = heatmapEl.createEl('div', { cls: 'week-labels' });
        weekLabels.createEl('span', { cls: 'month-label-spacer' }); // 留出月份标签的空间
        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        dayNames.forEach(day => {
            const label = weekLabels.createEl('span', { text: day, cls: 'week-label' });
            label.style.width = `${settings.cellSize}px`;
        });

        // 获取年度数据
        const yearWeeks = this.getYearWeeks(year);
        const data = this.plugin.wordCounter.getRecentData(400);
        const todayStr = this.toLocalDateStr(new Date());

        // 热力图格子（纵向排列：每行是一周，从上到下是1月到12月）
        const gridEl = heatmapEl.createEl('div', { cls: 'heatmap-grid' });

        // 月份名称
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        yearWeeks.forEach((week, weekIndex) => {
            const weekRowEl = gridEl.createEl('div', { cls: 'heatmap-week-row' });
            
            // 检查是否是当月第一周（显示月份标签）
            const firstValidDay = week.find(d => d !== null);
            let showMonthLabel = false;
            let monthLabel = '';
            
            if (firstValidDay) {
                const currentMonth = new Date(firstValidDay.dateStr).getMonth();
                
                // 如果是第一周，或者是月初的第一周
                if (weekIndex === 0 || new Date(firstValidDay.dateStr).getDate() <= 7) {
                    // 检查前一周是否是不同月份
                    if (weekIndex === 0) {
                        showMonthLabel = true;
                        monthLabel = monthNames[currentMonth];
                    } else {
                        const prevWeek = yearWeeks[weekIndex - 1];
                        const prevValidDay = prevWeek.find(d => d !== null);
                        if (prevValidDay) {
                            const prevMonth = new Date(prevValidDay.dateStr).getMonth();
                            if (prevMonth !== currentMonth) {
                                showMonthLabel = true;
                                monthLabel = monthNames[currentMonth];
                            }
                        }
                    }
                }
            }
            
            // 月份标签
            const monthLabelEl = weekRowEl.createEl('div', { cls: 'month-side-label' });
            if (showMonthLabel) {
                monthLabelEl.setText(monthLabel);
            }

            // 一周的格子
            const weekEl = weekRowEl.createEl('div', { cls: 'heatmap-week' });
            week.forEach((dayInfo, dayIndex) => {
                if (dayInfo === null) {
                    // 空格子
                    const emptyEl = weekEl.createEl('div', { cls: 'heatmap-day empty' });
                    emptyEl.style.width = `${settings.cellSize}px`;
                    emptyEl.style.height = `${settings.cellSize}px`;
                } else {
                    const count = data[dayInfo.dateStr] || 0;
                    const level = this.plugin.wordCounter.getLevel(count);
                    const dayEl = weekEl.createEl('div', { cls: 'heatmap-day' });
                    
                    dayEl.style.width = `${settings.cellSize}px`;
                    dayEl.style.height = `${settings.cellSize}px`;
                    
                    // 判断日期状态
                    if (dayInfo.dateStr > todayStr) {
                        // 未来日期
                        dayEl.addClass('future');
                    } else {
                        // 过去或今天
                        dayEl.style.backgroundColor = this.getLevelColor(level);
                        dayEl.addClass(`level-${level}`);
                    }
                    
                    // 今天高亮
                    if (dayInfo.dateStr === todayStr) {
                        dayEl.addClass('today');
                    }
                    
                    dayEl.setAttribute('title', `${dayInfo.dateStr} (${dayNames[dayInfo.dayOfWeek]}): ${count} 字`);
                }
            });
        });

        // ===== 图例 =====
        const legendEl = container.createEl('div', { cls: 'heatmap-legend' });
        legendEl.createEl('span', { text: '少' });
        for (let i = 0; i <= 4; i++) {
            const item = legendEl.createEl('div', { cls: 'legend-item' });
            item.style.backgroundColor = this.getLevelColor(i);
            item.style.width = `${settings.cellSize}px`;
            item.style.height = `${settings.cellSize}px`;
        }
        legendEl.createEl('span', { text: '多' });

        // ===== 年度统计 =====
        const yearStats = this.getYearStats(year, data);
        const statsInfoEl = container.createEl('div', { cls: 'year-stats' });
        statsInfoEl.createEl('div', { 
            text: `📝 今年共写作 ${yearStats.totalWords.toLocaleString()} 字`,
            cls: 'stats-item'
        });
        statsInfoEl.createEl('div', { 
            text: `📅 活跃 ${yearStats.activeDays} 天`,
            cls: 'stats-item'
        });
        if (yearStats.currentStreak > 0) {
            statsInfoEl.createEl('div', { 
                text: `🔥 连续 ${yearStats.currentStreak} 天`,
                cls: 'stats-item streak'
            });
        }
        if (yearStats.longestStreak > yearStats.currentStreak) {
            statsInfoEl.createEl('div', { 
                text: `🏆 最长连续 ${yearStats.longestStreak} 天`,
                cls: 'stats-item'
            });
        }
    }

    // 获取年度周数据：纵向排列
    getYearWeeks(year: number): (null | { dateStr: string; dayOfWeek: number })[][] {
        const weeks: (null | { dateStr: string; dayOfWeek: number })[][] = [];
        
        const firstDay = new Date(year, 0, 1);
        const lastDay = new Date(year, 11, 31);
        
        let currentWeek: (null | { dateStr: string; dayOfWeek: number })[] = [];
        const firstDayOfWeek = firstDay.getDay();
        
        // 填充第一周开头的空白
        for (let i = 0; i < firstDayOfWeek; i++) {
            currentWeek.push(null);
        }
        
        // 遍历一年中的每一天
        const currentDate = new Date(year, 0, 1); // 从1月1日开始
        while (currentDate.getFullYear() === year) { // 只要还在当年就继续
            const dateStr = this.toLocalDateStr(currentDate);
            const dayOfWeek = currentDate.getDay();
            
            currentWeek.push({ dateStr, dayOfWeek });
            
            // 周六结束一周
            if (dayOfWeek === 6) {
                weeks.push(currentWeek);
                currentWeek = [];
            }
            
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        // 处理最后一周
        if (currentWeek.length > 0) {
            while (currentWeek.length < 7) {
                currentWeek.push(null);
            }
            weeks.push(currentWeek);
        }
        
        return weeks;
    }

    // 获取年度统计
    getYearStats(year: number, data: { [date: string]: number }): { 
        totalWords: number; 
        activeDays: number; 
        currentStreak: number;
        longestStreak: number;
    } {
        let totalWords = 0;
        let activeDays = 0;
        let currentStreak = 0;
        let longestStreak = 0;
        let tempStreak = 0;
        
        // 获取今年所有日期，按顺序检查
        const today = new Date();
        const startOfYear = new Date(year, 0, 1);
        
        // 计算当前连续天数（从今天往回数）
        const checkDate = new Date(today);
        while (checkDate.getFullYear() === year) {
            const dateStr = this.toLocalDateStr(checkDate);
            if (data[dateStr] && data[dateStr] > 0) {
                currentStreak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
        
        // 计算总字数、活跃天数、最长连续
        const yearDates: string[] = [];
        const iterDate = new Date(startOfYear);
        while (iterDate <= today && iterDate.getFullYear() === year) {
            yearDates.push(this.toLocalDateStr(iterDate));
            iterDate.setDate(iterDate.getDate() + 1);
        }
        
        yearDates.forEach(dateStr => {
            const count = data[dateStr] || 0;
            if (count > 0) {
                totalWords += count;
                activeDays++;
                tempStreak++;
                longestStreak = Math.max(longestStreak, tempStreak);
            } else {
                tempStreak = 0;
            }
        });
        
        return { totalWords, activeDays, currentStreak, longestStreak };
    }

    getLevelColor(level: number): string {
        const settings = this.plugin.settings;
        switch (level) {
            case 0: return settings.colorEmpty;
            case 1: return settings.colorLevel1;
            case 2: return settings.colorLevel2;
            case 3: return settings.colorLevel3;
            case 4: return settings.colorLevel4;
            default: return settings.colorEmpty;
        }
    }

    addStyles() {
        const styleId = 'heatmap-styles';
        let styleEl = document.getElementById(styleId);
        
        if (styleEl) {
            styleEl.remove();
        }

        const settings = this.plugin.settings;
        
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `
            .heatmap-container {
                padding: 12px;
                font-family: var(--font-interface);
            }

            .heatmap-header h4 {
                margin: 0 0 10px 0;
                font-size: 14px;
            }

            .heatmap-stats {
                margin-bottom: 12px;
            }

            .today-stats {
                font-size: 13px;
            }

            .today-count {
                font-weight: 600;
                color: var(--text-normal);
            }

            .today-goal {
                color: var(--text-muted);
            }

            /* 进度条 */
            .progress-container {
                margin-bottom: 15px;
            }

            .progress-bar {
                width: 100%;
                height: 8px;
                background-color: var(--background-secondary);
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 5px;
            }

            .progress-fill {
                height: 100%;
                background-color: ${settings.colorLevel2};
                border-radius: 4px;
                transition: width 0.3s ease;
            }

            .progress-fill.half {
                background-color: ${settings.colorLevel3};
            }

            .progress-fill.complete {
                background-color: ${settings.colorLevel4};
            }

            .progress-text {
                font-size: 11px;
                color: var(--text-muted);
            }

            /* 热力图纵向布局 */
            .heatmap-vertical {
                display: flex;
                flex-direction: column;
                gap: ${settings.cellGap}px;
            }

            .week-labels {
                display: flex;
                gap: ${settings.cellGap}px;
                margin-bottom: 4px;
            }

            .month-label-spacer {
                width: 30px;
                min-width: 30px;
            }

            .week-label {
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 9px;
                color: var(--text-muted);
                height: ${settings.cellSize}px;
            }

            .heatmap-grid {
                display: flex;
                flex-direction: column;
                gap: ${settings.cellGap}px;
            }

            .heatmap-week-row {
                display: flex;
                gap: ${settings.cellGap}px;
                align-items: center;
            }

            .month-side-label {
                width: 30px;
                min-width: 30px;
                font-size: 10px;
                font-weight: 500;
                color: var(--text-muted);
                text-align: left;
            }

            .heatmap-week {
                display: flex;
                gap: ${settings.cellGap}px;
            }

            .heatmap-day {
                border-radius: 2px;
                cursor: pointer;
                transition: transform 0.1s, box-shadow 0.1s;
            }

            .heatmap-day:hover {
                transform: scale(1.2);
                box-shadow: 0 0 4px rgba(0,0,0,0.3);
                z-index: 10;
            }

            .heatmap-day.empty {
                background-color: transparent !important;
                cursor: default;
            }

            .heatmap-day.today {
                outline: 2px solid var(--text-accent);
                outline-offset: 1px;
            }

            .heatmap-day.future {
                background-color: transparent !important;
                border: 1px dashed var(--text-faint);
                opacity: 0.3;
            }

            /* 图例 */
            .heatmap-legend {
                display: flex;
                align-items: center;
                gap: 4px;
                margin-top: 15px;
                font-size: 10px;
                color: var(--text-muted);
            }

            .legend-item {
                border-radius: 2px;
            }

            /* 年度统计 */
            .year-stats {
                margin-top: 15px;
                padding-top: 12px;
                border-top: 1px solid var(--background-modifier-border);
            }

            .stats-item {
                font-size: 12px;
                color: var(--text-muted);
                margin-bottom: 4px;
            }

            .stats-item.streak {
                color: var(--text-accent);
                font-weight: 500;
            }
        `;
        document.head.appendChild(styleEl);
    }

    async onClose() {}

    private toLocalDateStr(date: Date): string {
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().split('T')[0];
    }
}