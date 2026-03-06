export type AIProvider = 'ollama' | 'github';

export interface AppSettings {
    aiProvider: AIProvider;
    githubToken: string;
}

const DEFAULT_SETTINGS: AppSettings = {
    aiProvider: 'ollama',
    githubToken: '',
};

const SETTINGS_KEY = 'studyflow-settings';

export function getSettings(): AppSettings {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return DEFAULT_SETTINGS;
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (err) {
        console.error('Failed to parse settings:', err);
        return DEFAULT_SETTINGS;
    }
}

export function saveSettings(settings: AppSettings): void {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
        console.error('Failed to save settings:', err);
    }
}
