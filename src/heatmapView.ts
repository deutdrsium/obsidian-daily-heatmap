// src/heatmapView.ts
import { ItemView, WorkspaceLeaf, Events } from 'obsidian';
import WritingHeatmapPlugin from './main';
import 'obsidian';

export const VIEW_TYPE_HEATMAP = 'writing-heatmap-view';

declare module 'obsidian' {
    interface WorkspaceEventMap {
        'heatmap-update': void;
    }
}

const setCssProps = (element: HTMLElement, props: Record<string, string>) => {
    Object.entries(props).forEach(([property, value]) => {
        element.style.setProperty(property, value);
    });
};

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
        await this.waitForFrame();
        this.render();

        this.registerEvent(
            (this.app.workspace as Events).on('heatmap-update', () => {
                this.render();
            })
        );
    }

    render() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('heatmap-container');

        const settings = this.plugin.settings;
        const year = new Date().getFullYear();

        this.applyDynamicStyles(container);

        // ===== 标题区域 =====
        const header = container.createEl('div', { cls: 'heatmap-header' });
        header.createEl('h4', { text: `📊 ${year} 写作热力图` });

        // ===== 今日统计 =====
        const safeDailyGoal = Math.max(1, settings.dailyGoal || 0);
        const todayCount = this.plugin.wordCounter.getTodayCount();
        const goalPercent = Math.min(100, Math.round((todayCount / safeDailyGoal) * 100));
        const remainingWords = Math.max(0, safeDailyGoal - todayCount);
        
        const statsEl = container.createEl('div', { cls: 'heatmap-stats' });
        
        const todayEl = statsEl.createEl('div', { cls: 'today-stats' });
        todayEl.createEl('span', { 
            text: `今日: ${todayCount} 字`,
            cls: 'today-count'
        });
        todayEl.createEl('span', { 
            text: ` / ${safeDailyGoal} 字目标`,
            cls: 'today-goal'
        });

        // ===== 进度条 =====
        if (settings.showProgressBar) {
            const isSprintMode = this.plugin.isSprintModeActive();
            const currentGoal = isSprintMode ? settings.sprintGoal : safeDailyGoal;
            const currentGoalPercent = Math.min(100, Math.round((todayCount / currentGoal) * 100));
            const currentRemainingWords = Math.max(0, currentGoal - todayCount);
            
            const progressContainer = container.createEl('div', { cls: 'progress-container' });
            
            // 进度条
            const progressBar = progressContainer.createEl('div', { cls: 'dh-progress-bar' });
            const progressFill = progressBar.createEl('div', { cls: 'progress-fill' });
            
            if (isSprintMode) {
                progressFill.addClass('sprint-mode');
            }
            
            setCssProps(progressFill, { width: `${currentGoalPercent}%` });
            
            if (currentGoalPercent >= 100) {
                progressFill.addClass('complete');
            } else if (currentGoalPercent >= 50) {
                progressFill.addClass('half');
            }
            
            // 进度文字
            const progressText = progressContainer.createEl('div', { cls: 'progress-text' });
            if (isSprintMode) {
                // 冲刺模式的文字
                if (currentGoalPercent >= 100) {
                    progressText.setText(`🎉 冲刺完成 ${currentGoalPercent}%！`);
                } else {
                    progressText.setText(`🚀 冲刺中 ${currentGoalPercent}% - 还差 ${currentRemainingWords} 字`);
                }
            } else {
                // 常规模式的文字
                if (goalPercent >= 100) {
                    progressText.setText(`🎉 已完成 ${goalPercent}%！`);
                } else {
                    progressText.setText(`${goalPercent}% - 还差 ${remainingWords} 字`);
                }
            }
            
            // 如果完成了常规目标但未开启冲刺模式，显示"开启冲刺"按钮
            if (goalPercent >= 100 && !isSprintMode) {
                const sprintButtonContainer = progressContainer.createEl('div', { 
                    cls: 'sprint-button-container' 
                });
                const sprintButton = sprintButtonContainer.createEl('button', {
                    text: '🚀 开启冲刺目标',
                    cls: 'sprint-activate-button'
                });
                
                sprintButton.addEventListener('click', () => {
                    this.plugin.activateSprintMode();
                });
            }
        }

        // ===== 热力图 =====
        const heatmapEl = container.createEl('div', { cls: 'heatmap-vertical' });
        
        // 星期标签（横向，在顶部）
        const weekLabels = heatmapEl.createEl('div', { cls: 'week-labels' });
        weekLabels.createEl('span', { cls: 'month-label-spacer' }); // 留出月份标签的空间
        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        dayNames.forEach(day => {
            weekLabels.createEl('span', { text: day, cls: 'week-label' });
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
                    weekEl.createEl('div', { cls: 'heatmap-day empty' });
                } else {
                    const count = data[dayInfo.dateStr] || 0;
                    const level = this.plugin.wordCounter.getLevel(count);
                    const dayEl = weekEl.createEl('div', { cls: 'heatmap-day' });
                    
                    if (dayInfo.dateStr > todayStr) {
                        dayEl.addClass('future');
                    } else {
                        dayEl.addClass(`level-${level}`);
                    }
                    
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
        for (let i = 0; i <= 5; i++) {
            legendEl.createEl('div', { cls: `legend-item level-${i}` });
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

    private applyDynamicStyles(container: HTMLElement) {
        const settings = this.plugin.settings;
        const isSprintMode = this.plugin.isSprintModeActive();
        
        setCssProps(container, {
            '--heatmap-cell-size': `${settings.cellSize}px`,
            '--heatmap-cell-gap': `${settings.cellGap}px`,
            '--heatmap-color-level-0': settings.colorEmpty,
            '--heatmap-color-level-1': settings.colorLevel1,
            '--heatmap-color-level-2': settings.colorLevel2,
            '--heatmap-color-level-3': settings.colorLevel3,
            '--heatmap-color-level-4': settings.colorLevel4,
            '--heatmap-color-level-5': settings.colorLevel5,
            '--heatmap-progress-fill': isSprintMode ? settings.sprintColorFill : settings.progressColorFill,
            '--heatmap-progress-half': isSprintMode ? settings.sprintColorHalf : settings.progressColorHalf,
            '--heatmap-progress-complete': isSprintMode ? settings.sprintColorComplete : settings.progressColorComplete,
        });
    }

    async onClose() {}

    private toLocalDateStr(date: Date): string {
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().split('T')[0];
    }

    private waitForFrame(): Promise<void> {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
    }
}