/**
 * Query Resolver System - Supabase Client
 */
import { AppConfig } from './config.js';

let supabaseInstance = null;

export function getSupabase() {
    if (supabaseInstance) return supabaseInstance;

    const url = AppConfig.getSupabaseUrl();
    const key = AppConfig.getSupabaseAnonKey();

    if (!url || !key) return null;

    if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
        console.warn('Supabase SDK library not loaded on page.');
        return null;
    }

    try {
        supabaseInstance = window.supabase.createClient(url, key, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        return supabaseInstance;
    } catch (err) {
        console.error('Failed to initialize Supabase client:', err);
        return null;
    }
}

export function resetSupabaseInstance() {
    supabaseInstance = null;
}

export async function testConnection(customUrl = null, customKey = null) {
    const url = customUrl || AppConfig.getSupabaseUrl();
    const key = customKey || AppConfig.getSupabaseAnonKey();

    if (!url || !key) {
        return { 
            success: false, 
            message: 'Supabase URL or public anon key is missing. Please provide valid credentials.' 
        };
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return {
            success: false,
            message: 'Invalid URL format. Project URL must begin with https:// or http://'
        };
    }

    if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
        return { 
            success: false, 
            message: 'Supabase JS SDK library not loaded on page. Check network connection.' 
        };
    }

    const startTime = performance.now();
    try {
        const client = (customUrl && customKey)
            ? window.supabase.createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
            : getSupabase();

        if (!client) {
            return { success: false, message: 'Could not create Supabase client with given parameters.' };
        }

        // Test querying the organizations table
        const { data, error } = await client.from('organizations').select('id, name').limit(1);
        const latency = Math.round(performance.now() - startTime);

        if (error) {
            return { 
                success: false, 
                latency, 
                message: `Connection failed: ${error.message} (Code: ${error.code || 'API_ERR'})` 
            };
        }

        return { 
            success: true, 
            latency, 
            data,
            message: `Connected successfully to Supabase cloud in ${latency}ms. Organizations table verified.` 
        };
    } catch (err) {
        const latency = Math.round(performance.now() - startTime);
        return { 
            success: false, 
            latency, 
            message: `Network error: ${err.message || 'Unable to connect to Supabase endpoint.'}` 
        };
    }
}

export function getConnectionInfo() {
    const isConfigured = AppConfig.isConfigured();
    const url = AppConfig.getSupabaseUrl();
    const key = AppConfig.getSupabaseAnonKey();

    return {
        isConfigured,
        url: url || '',
        maskedKey: key ? (key.length > 18 ? `${key.substring(0, 10)}...${key.substring(key.length - 6)}` : '••••••••••••') : '',
        mode: isConfigured ? 'cloud' : 'local'
    };
}
