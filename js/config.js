/**
 * Query Resolver System - Configuration Manager
 */

const CONFIG_STORAGE_KEY_URL = 'qr_supabase_url';
const CONFIG_STORAGE_KEY_KEY = 'qr_supabase_anon_key';
const ACTIVE_ORG_ID = '00000000-0000-0000-0000-000000000001';

// Default Supabase credentials (can be prefilled here or entered via Settings in browser)
const DEFAULT_SUPABASE_URL = '';
const DEFAULT_SUPABASE_ANON_KEY = '';

export const AppConfig = {
    getSupabaseUrl() {
        return localStorage.getItem(CONFIG_STORAGE_KEY_URL) || DEFAULT_SUPABASE_URL || '';
    },

    getSupabaseAnonKey() {
        return localStorage.getItem(CONFIG_STORAGE_KEY_KEY) || DEFAULT_SUPABASE_ANON_KEY || '';
    },

    setCredentials(url, anonKey) {
        if (url) localStorage.setItem(CONFIG_STORAGE_KEY_URL, url.trim().replace(/\/$/, ''));
        if (anonKey) localStorage.setItem(CONFIG_STORAGE_KEY_KEY, anonKey.trim());
    },

    clearCredentials() {
        localStorage.removeItem(CONFIG_STORAGE_KEY_URL);
        localStorage.removeItem(CONFIG_STORAGE_KEY_KEY);
    },

    isConfigured() {
        const url = this.getSupabaseUrl();
        const key = this.getSupabaseAnonKey();
        return Boolean(url && key && url.startsWith('http') && !url.includes('YOUR_SUPABASE_URL'));
    },

    getOrgId() {
        return ACTIVE_ORG_ID;
    }
};
