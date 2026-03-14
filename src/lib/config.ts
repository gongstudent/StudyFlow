const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, '');

const isBrowser = typeof window !== 'undefined';
export const isGitHubPages =
  isBrowser && window.location.hostname.endsWith('github.io');

const envBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();

const inferDefaultBaseUrl = (): string => {
  if (!isBrowser) return 'http://localhost:3000';
  if (window.location.protocol === 'file:') return 'http://localhost:3000';
  if (isGitHubPages) return '';
  return 'http://localhost:3000';
};

export const API_BASE_URL = envBaseUrl
  ? normalizeBaseUrl(envBaseUrl)
  : inferDefaultBaseUrl();

export const apiUrl = (path: string): string => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalized}` : normalized;
};

export const ensureApiAvailable = (feature: string): void => {
  if (isGitHubPages && !envBaseUrl) {
    throw new Error(
      `Online demo does not include backend for ${feature}. ` +
        'Run locally or set VITE_API_BASE_URL to a deployed API.'
    );
  }
};
