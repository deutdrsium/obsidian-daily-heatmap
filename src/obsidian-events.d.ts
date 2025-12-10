import 'obsidian';

declare module 'obsidian' {
    interface WorkspaceEvents {
        'heatmap-update': () => void;
    }
}
