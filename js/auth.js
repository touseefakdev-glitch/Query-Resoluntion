/**
 * Query Resolver System - Authentication & Role-Based Access Control
 * Manages Supabase Auth, Profile fetching, Role Guards, and Audit Events
 */

import { getSupabase } from './supabaseClient.js';
import { AppConfig } from './config.js';

const STORAGE_SESSION_PROFILE = 'qr_auth_profile_v2';

// Built-in test accounts for immediate evaluation before connecting Supabase
const TEST_ACCOUNTS = [
    {
        id: 'usr-admin-tauseef',
        email: 'tauseef@jandtsupplies.ca',
        password: 'passord@123',
        alternatePassword: 'password@123',
        full_name: 'Tauseef',
        role: 'admin',
        is_active: true,
        organization_id: AppConfig.getOrgId(),
        created_at: new Date().toISOString()
    },
    {
        id: 'usr-admin-001',
        email: 'admin@abcservices.com',
        password: 'admin',
        full_name: 'Admin Director',
        role: 'admin',
        is_active: true,
        organization_id: AppConfig.getOrgId(),
        created_at: new Date().toISOString()
    },
    {
        id: 'usr-support-001',
        email: 'support@abcservices.com',
        password: 'support',
        full_name: 'Sarah Support',
        role: 'support',
        is_active: true,
        organization_id: AppConfig.getOrgId(),
        created_at: new Date().toISOString()
    }
];

export const AuthService = {
    /**
     * Get currently cached user profile
     */
    getCurrentProfile() {
        try {
            const raw = localStorage.getItem(STORAGE_SESSION_PROFILE);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    setProfile(profile) {
        if (profile) {
            localStorage.setItem(STORAGE_SESSION_PROFILE, JSON.stringify(profile));
        } else {
            localStorage.removeItem(STORAGE_SESSION_PROFILE);
        }
    },

    /**
     * Authenticate user with Email & Password
     */
    async login(email, password) {
        const cleanEmail = (email || '').trim().toLowerCase();
        const supabase = getSupabase();

        // 1. If Supabase is active, authenticate via Supabase Auth
        if (supabase) {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password
            });

            if (authError) {
                throw new Error(authError.message);
            }

            const user = authData.user;
            if (!user) throw new Error('Authentication failed.');

            // Fetch user profile from database
            const { data: profile, error: profError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (profError || !profile) {
                // If profile record doesn't exist yet, build initial profile
                const newProfile = {
                    id: user.id,
                    full_name: user.user_metadata?.full_name || cleanEmail.split('@')[0],
                    email: cleanEmail,
                    role: user.user_metadata?.role || 'support',
                    is_active: true,
                    organization_id: AppConfig.getOrgId(),
                    last_login: new Date().toISOString()
                };

                await supabase.from('profiles').upsert(newProfile);
                this.setProfile(newProfile);
                return newProfile;
            }

            if (!profile.is_active) {
                await supabase.auth.signOut();
                throw new Error('Your user account has been deactivated by an administrator.');
            }

            // Update last_login timestamp
            await supabase
                .from('profiles')
                .update({ last_login: new Date().toISOString() })
                .eq('id', profile.id);

            profile.last_login = new Date().toISOString();
            this.setProfile(profile);
            return profile;
        }

        // 2. Fallback local / demo authentication
        const match = TEST_ACCOUNTS.find(a => a.email.toLowerCase() === cleanEmail);
        if (match && (match.password === password || match.alternatePassword === password)) {
            if (!match.is_active) throw new Error('Account deactivated.');
            const profile = { ...match, last_login: new Date().toISOString() };
            delete profile.password;
            delete profile.alternatePassword;
            this.setProfile(profile);
            return profile;
        }

        // If credentials don't match test accounts, allow simple login in demo mode
        if (password && password.length >= 4) {
            const isAdm = cleanEmail.includes('admin');
            const demoProfile = {
                id: 'usr-' + Date.now(),
                email: cleanEmail,
                full_name: cleanEmail.split('@')[0].toUpperCase(),
                role: isAdm ? 'admin' : 'support',
                is_active: true,
                organization_id: AppConfig.getOrgId(),
                created_at: new Date().toISOString(),
                last_login: new Date().toISOString()
            };
            this.setProfile(demoProfile);
            return demoProfile;
        }

        throw new Error('Invalid email or password.');
    },

    /**
     * Sign out current user
     */
    async logout() {
        const supabase = getSupabase();
        if (supabase) {
            try {
                await supabase.auth.signOut();
            } catch (e) {
                console.warn('Signout warning:', e);
            }
        }
        this.setProfile(null);
    },

    /**
     * Route protection guard
     * Checks login and role permissions. Redirects if unauthorized.
     */
    async requireAuth(requiredRole = null, loginRedirect = '../login.html') {
        const profile = this.getCurrentProfile();

        if (!profile) {
            window.location.href = loginRedirect;
            return null;
        }

        if (requiredRole === 'admin' && profile.role !== 'admin') {
            alert('Access Denied: Admin privileges required.');
            window.location.href = '../app/index.html';
            return null;
        }

        return profile;
    }
};
