/**
 * Query Resolver System - Unified Data Layer
 * Multi-Tenant Organization Isolation, Permanent Notes, User Management,
 * Audit Trail Logging, and Backup Export.
 */

import { getSupabase } from './supabaseClient.js';
import { AppConfig } from './config.js';
import { AuthService } from './auth.js';

const LOCAL_STORAGE_DB_KEY = 'qr_full_database_v3';

// Clean initial data template
const DEFAULT_LOCAL_STORE = {
    organization: {
        id: AppConfig.getOrgId(),
        name: 'ABC Support Services',
        system_name: 'ABC Query Resolver',
        logo_url: '',
        email: 'support@abcservices.com',
        phone: '+1 (555) 019-2831',
        address: '742 Evergreen Terrace, Suite 100',
        timezone: 'UTC',
        date_format: 'DD-MMM-YYYY',
        support_email: 'helpdesk@abcservices.com',
        default_status: 'Open',
        default_priority: 'Medium',
        available_statuses: ['Open', 'In Progress', 'Temporarily Resolved', 'Escalated', 'Closed'],
        available_priorities: ['Low', 'Medium', 'High', 'Critical']
    },
    users: [
        {
            id: 'usr-admin-001',
            full_name: 'Admin Director',
            email: 'admin@abcservices.com',
            role: 'admin',
            is_active: true,
            organization_id: AppConfig.getOrgId(),
            created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
            last_login: new Date().toISOString()
        },
        {
            id: 'usr-support-001',
            full_name: 'Sarah Support',
            email: 'support@abcservices.com',
            role: 'support',
            is_active: true,
            organization_id: AppConfig.getOrgId(),
            created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
            last_login: new Date().toISOString()
        }
    ],
    queries: [],
    notes: [],
    audit_logs: [
        {
            id: 'log-001',
            organization_id: AppConfig.getOrgId(),
            user_id: 'usr-admin-001',
            user_name: 'Admin Director',
            action: 'System Initialized',
            entity_type: 'System',
            entity_id: 'sys-001',
            description: 'Organization ABC Support Services configured for 2-week operations.',
            created_at: new Date(Date.now() - 7 * 86400000).toISOString()
        }
    ]
};

function getLocalStore() {
    try {
        const stored = localStorage.getItem(LOCAL_STORAGE_DB_KEY);
        if (!stored) {
            localStorage.setItem(LOCAL_STORAGE_DB_KEY, JSON.stringify(DEFAULT_LOCAL_STORE));
            return JSON.parse(JSON.stringify(DEFAULT_LOCAL_STORE));
        }
        return JSON.parse(stored);
    } catch (e) {
        return JSON.parse(JSON.stringify(DEFAULT_LOCAL_STORE));
    }
}

function saveLocalStore(store) {
    try {
        localStorage.setItem(LOCAL_STORAGE_DB_KEY, JSON.stringify(store));
    } catch (e) {
        console.error('Failed to save store to localStorage:', e);
    }
}

// ==============================================================================
// 1. AUDIT LOGGING SERVICE
// ==============================================================================
export async function logAudit(action, entityType, entityId, description) {
    const profile = AuthService.getCurrentProfile() || { id: null, full_name: 'System', role: 'system' };
    const timestamp = new Date().toISOString();
    const orgId = AppConfig.getOrgId();

    const supabase = getSupabase();
    if (supabase) {
        try {
            await supabase.from('audit_logs').insert([{
                organization_id: orgId,
                user_id: profile.id,
                user_name: profile.full_name,
                action,
                entity_type: entityType,
                entity_id: String(entityId || ''),
                description,
                created_at: timestamp
            }]);
            return;
        } catch (e) {
            console.warn('Supabase audit log fallback:', e);
        }
    }

    const store = getLocalStore();
    store.audit_logs.unshift({
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        organization_id: orgId,
        user_id: profile.id,
        user_name: profile.full_name,
        action,
        entity_type: entityType,
        entity_id: String(entityId || ''),
        description,
        created_at: timestamp
    });
    saveLocalStore(store);
}

export async function getAuditLogs() {
    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('audit_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(200);

            if (!error && data) return data;
        } catch (e) {
            console.warn('Supabase getAuditLogs fallback:', e);
        }
    }

    const store = getLocalStore();
    return [...store.audit_logs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// ==============================================================================
// 2. ORGANIZATION SETTINGS
// ==============================================================================
export async function getOrganizationSettings() {
    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('organizations')
                .select('*')
                .eq('id', AppConfig.getOrgId())
                .single();

            if (!error && data) return data;
        } catch (e) {
            console.warn('Supabase getOrganizationSettings fallback:', e);
        }
    }

    const store = getLocalStore();
    return store.organization;
}

export async function updateOrganizationSettings(updates) {
    const orgId = AppConfig.getOrgId();
    const timestamp = new Date().toISOString();

    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('organizations')
                .update({ ...updates, updated_at: timestamp })
                .eq('id', orgId)
                .select()
                .single();

            if (error) throw error;

            await logAudit('Organization Updated', 'Organization', orgId, `Organization details and system settings updated.`);
            return data;
        } catch (e) {
            console.warn('Supabase updateOrganizationSettings fallback:', e);
        }
    }

    const store = getLocalStore();
    store.organization = { ...store.organization, ...updates, updated_at: timestamp };
    saveLocalStore(store);

    await logAudit('Organization Updated', 'Organization', orgId, `Organization settings updated in local storage.`);
    return store.organization;
}

// ==============================================================================
// 3. USER MANAGEMENT (ADMIN ONLY)
// ==============================================================================
export async function getUsers() {
    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (!error && data) return data;
        } catch (e) {
            console.warn('Supabase getUsers fallback:', e);
        }
    }

    const store = getLocalStore();
    return store.users;
}

export async function createUser({ full_name, email, role, password }) {
    const cleanEmail = email.trim().toLowerCase();
    const userRole = role === 'admin' ? 'admin' : 'support';
    const timestamp = new Date().toISOString();
    const orgId = AppConfig.getOrgId();

    const supabase = getSupabase();
    if (supabase) {
        try {
            // Sign up user in Supabase Auth
            const { data: authData, error: authErr } = await supabase.auth.signUp({
                email: cleanEmail,
                password: password || 'SupportUser@123',
                options: {
                    data: { full_name, role: userRole }
                }
            });

            if (authErr) throw authErr;

            const newUserId = authData.user ? authData.user.id : ('usr-' + Date.now());

            // Insert into profiles
            const newProfile = {
                id: newUserId,
                full_name: full_name.trim(),
                email: cleanEmail,
                role: userRole,
                is_active: true,
                organization_id: orgId,
                created_at: timestamp,
                updated_at: timestamp
            };

            await supabase.from('profiles').upsert(newProfile);

            await logAudit('User Created', 'User', newUserId, `Admin created user ${full_name} with role "${userRole}".`);
            return newProfile;
        } catch (e) {
            console.warn('Supabase createUser error:', e);
            throw e;
        }
    }

    // Local fallback
    const store = getLocalStore();
    const newProfile = {
        id: 'usr-' + Date.now(),
        full_name: full_name.trim(),
        email: cleanEmail,
        role: userRole,
        is_active: true,
        organization_id: orgId,
        created_at: timestamp,
        updated_at: timestamp
    };
    store.users.unshift(newProfile);
    saveLocalStore(store);

    await logAudit('User Created', 'User', newProfile.id, `Created user ${full_name} with role "${userRole}".`);
    return newProfile;
}

export async function updateUser(userId, updates) {
    const timestamp = new Date().toISOString();

    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .update({ ...updates, updated_at: timestamp })
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;

            await logAudit('User Updated', 'User', userId, `Updated user account details.`);
            return data;
        } catch (e) {
            console.warn('Supabase updateUser error:', e);
        }
    }

    const store = getLocalStore();
    const u = store.users.find(x => x.id === userId);
    if (u) {
        Object.assign(u, updates, { updated_at: timestamp });
        saveLocalStore(store);
        await logAudit('User Updated', 'User', userId, `Updated user ${u.full_name}.`);
        return u;
    }
    throw new Error('User not found');
}

export async function toggleUserActive(userId, isActive) {
    const actionDesc = isActive ? 'Activated' : 'Deactivated';
    return await updateUser(userId, { is_active: isActive });
}

// ==============================================================================
// 4. QUERIES & APPEND-ONLY NOTES
// ==============================================================================
export async function getQueries() {
    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('queries')
                .select('*')
                .order('created_at', { ascending: false });

            if (!error && data) return data;
        } catch (e) {
            console.warn('Supabase getQueries fallback:', e);
        }
    }

    const store = getLocalStore();
    return [...store.queries].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function getQueryById(queryId) {
    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data: qData, error: qErr } = await supabase
                .from('queries')
                .select('*')
                .eq('id', queryId)
                .single();

            if (qErr) throw qErr;

            const { data: notes, error: nErr } = await supabase
                .from('notes')
                .select('*')
                .eq('query_id', queryId)
                .order('created_at', { ascending: true });

            if (nErr) throw nErr;

            return { ...qData, notes: notes || [] };
        } catch (e) {
            console.warn('Supabase getQueryById fallback:', e);
        }
    }

    const store = getLocalStore();
    const query = store.queries.find(q => q.id === queryId || q.query_number === queryId);
    if (!query) throw new Error('Query not found.');

    const notes = store.notes
        .filter(n => n.query_id === query.id)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    return { ...query, notes };
}

function generateLocalQueryNumber(store) {
    const highestNum = store.queries.reduce((max, q) => {
        const match = q.query_number && q.query_number.match(/QR-(\d+)/);
        if (match) {
            const val = parseInt(match[1], 10);
            return val > max ? val : max;
        }
        return max;
    }, 1000);
    return `QR-${highestNum + 1}`;
}

export async function createQuery({ customer_name, contact_reference, problem, initial_notes, status, priority, created_by }) {
    const profile = AuthService.getCurrentProfile();
    const author = (created_by && created_by.trim()) || (profile ? profile.full_name : 'Support Staff');
    const timestamp = new Date().toISOString();
    const orgId = AppConfig.getOrgId();

    const supabase = getSupabase();
    if (supabase) {
        try {
            const payload = {
                organization_id: orgId,
                customer_name: customer_name.trim(),
                contact_reference: (contact_reference || '').trim(),
                problem: problem.trim(),
                temporary_resolution: '',
                status: status || 'Open',
                priority: priority || 'Medium',
                created_by: author,
                created_at: timestamp,
                updated_at: timestamp
            };

            const { data: newQ, error: qErr } = await supabase
                .from('queries')
                .insert([payload])
                .select()
                .single();

            if (qErr) throw qErr;

            // Insert initial note
            const firstNote = initial_notes && initial_notes.trim()
                ? initial_notes.trim()
                : `Query logged with initial status "${status || 'Open'}".`;

            await supabase.from('notes').insert([{
                query_id: newQ.id,
                organization_id: orgId,
                note: firstNote,
                added_by: author,
                created_at: timestamp
            }]);

            await logAudit('Query Created', 'Query', newQ.id, `Created query ${newQ.query_number} for customer "${customer_name}".`);
            return newQ;
        } catch (e) {
            console.error('Supabase createQuery failed:', e);
            throw e;
        }
    }

    // Local fallback
    const store = getLocalStore();
    const queryNum = generateLocalQueryNumber(store);
    const newId = 'q-' + Date.now();

    const newQuery = {
        id: newId,
        query_number: queryNum,
        organization_id: orgId,
        customer_name: customer_name.trim(),
        contact_reference: (contact_reference || '').trim(),
        problem: problem.trim(),
        temporary_resolution: '',
        status: status || 'Open',
        priority: priority || 'Medium',
        created_by: author,
        created_at: timestamp,
        updated_at: timestamp
    };

    store.queries.unshift(newQuery);

    const firstNote = initial_notes && initial_notes.trim()
        ? initial_notes.trim()
        : `Query logged with initial status "${status || 'Open'}".`;

    store.notes.push({
        id: 'n-' + Date.now(),
        query_id: newId,
        organization_id: orgId,
        note: firstNote,
        added_by: author,
        created_at: timestamp
    });

    saveLocalStore(store);

    await logAudit('Query Created', 'Query', newId, `Created query ${queryNum} for customer "${customer_name}".`);
    return newQuery;
}

export async function addNote(queryId, noteText, addedBy) {
    if (!noteText || !noteText.trim()) throw new Error('Note text cannot be empty.');

    const profile = AuthService.getCurrentProfile();
    const author = (addedBy && addedBy.trim()) || (profile ? profile.full_name : 'Support Staff');
    const timestamp = new Date().toISOString();
    const orgId = AppConfig.getOrgId();

    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data: newNote, error: nErr } = await supabase
                .from('notes')
                .insert([{
                    query_id: queryId,
                    organization_id: orgId,
                    note: noteText.trim(),
                    added_by: author,
                    created_at: timestamp
                }])
                .select()
                .single();

            if (nErr) throw nErr;

            await supabase.from('queries').update({ updated_at: timestamp }).eq('id', queryId);

            await logAudit('Note Added', 'Query', queryId, `${author} added a note to Query.`);
            return newNote;
        } catch (e) {
            console.error('Supabase addNote failed:', e);
            throw e;
        }
    }

    const store = getLocalStore();
    const q = store.queries.find(x => x.id === queryId);
    if (!q) throw new Error('Query not found.');

    const newNote = {
        id: 'n-' + Date.now(),
        query_id: queryId,
        organization_id: orgId,
        note: noteText.trim(),
        added_by: author,
        created_at: timestamp
    };

    store.notes.push(newNote);
    q.updated_at = timestamp;
    saveLocalStore(store);

    await logAudit('Note Added', 'Query', queryId, `${author} added a note to Query ${q.query_number}.`);
    return newNote;
}

export async function updateQuery(queryId, updates, changedBy, auditSummary) {
    const profile = AuthService.getCurrentProfile();
    const author = (changedBy && changedBy.trim()) || (profile ? profile.full_name : 'Support Staff');
    const timestamp = new Date().toISOString();
    const orgId = AppConfig.getOrgId();

    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data: updated, error } = await supabase
                .from('queries')
                .update({ ...updates, updated_at: timestamp })
                .eq('id', queryId)
                .select()
                .single();

            if (error) throw error;

            if (auditSummary && auditSummary.trim()) {
                await supabase.from('notes').insert([{
                    query_id: queryId,
                    organization_id: orgId,
                    note: auditSummary.trim(),
                    added_by: author,
                    created_at: timestamp
                }]);
            }

            await logAudit('Query Updated', 'Query', queryId, `${author} updated Query: ${auditSummary || 'Details edited'}.`);
            return updated;
        } catch (e) {
            console.error('Supabase updateQuery failed:', e);
            throw e;
        }
    }

    const store = getLocalStore();
    const q = store.queries.find(x => x.id === queryId);
    if (!q) throw new Error('Query not found.');

    Object.assign(q, updates, { updated_at: timestamp });

    if (auditSummary && auditSummary.trim()) {
        store.notes.push({
            id: 'n-' + Date.now(),
            query_id: queryId,
            organization_id: orgId,
            note: auditSummary.trim(),
            added_by: author,
            created_at: timestamp
        });
    }

    saveLocalStore(store);
    await logAudit('Query Updated', 'Query', queryId, `${author} updated Query ${q.query_number}: ${auditSummary || 'Details edited'}.`);
    return q;
}

// ==============================================================================
// 5. DATABASE STATS & SAFE ADMINISTRATIVE ACTIONS
// ==============================================================================
export async function getDatabaseStats() {
    const queries = await getQueries();
    const users = await getUsers();
    const logs = await getAuditLogs();

    let totalNotes = 0;
    const supabase = getSupabase();
    if (supabase) {
        try {
            const { count } = await supabase.from('notes').select('*', { count: 'exact', head: true });
            totalNotes = count || 0;
        } catch (e) {}
    } else {
        const store = getLocalStore();
        totalNotes = store.notes.length;
    }

    return {
        totalQueries: queries.length,
        totalNotes,
        totalUsers: users.length,
        totalLogs: logs.length,
        lastActivity: logs.length > 0 ? logs[0].created_at : new Date().toISOString()
    };
}

// ==============================================================================
// 6. SAFE EXPORT & BACKUP TOOLS (NO DANGEROUS SECRETS EXPOSED)
// ==============================================================================
function triggerDownload(content, filename, type = 'text/csv;charset=utf-8;') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
};

export async function exportQueriesCsv() {
    const queries = await getQueries();
    const headers = ['Query ID', 'Date', 'Customer', 'Contact', 'Problem', 'Temporary Resolution', 'Status', 'Priority', 'Created By', 'Last Updated'];
    const rows = queries.map(q => [
        q.query_number || q.id,
        new Date(q.created_at).toLocaleString(),
        q.customer_name || '',
        q.contact_reference || '',
        q.problem || '',
        q.temporary_resolution || '',
        q.status || '',
        q.priority || '',
        q.created_by || '',
        new Date(q.updated_at).toLocaleString()
    ]);

    const csv = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map(r => r.map(escapeCsv).join(','))].join('\r\n');
    triggerDownload(csv, `Queries_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    await logAudit('Data Exported', 'Queries', 'export-queries', 'Admin exported queries to CSV.');
    return queries.length;
}

export async function exportNotesCsv() {
    let notes = [];
    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data } = await supabase.from('notes').select('*, queries(query_number)').order('created_at', { ascending: true });
            notes = data || [];
        } catch (e) {}
    } else {
        const store = getLocalStore();
        notes = store.notes.map(n => {
            const q = store.queries.find(x => x.id === n.query_id);
            return { ...n, query_number: q ? q.query_number : n.query_id };
        });
    }

    const headers = ['Query ID', 'Note', 'Added By', 'Date/Time'];
    const rows = notes.map(n => [
        n.query_number || (n.queries?.query_number) || n.query_id,
        n.note || '',
        n.added_by || '',
        new Date(n.created_at).toLocaleString()
    ]);

    const csv = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map(r => r.map(escapeCsv).join(','))].join('\r\n');
    triggerDownload(csv, `Notes_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    await logAudit('Data Exported', 'Notes', 'export-notes', 'Admin exported notes to CSV.');
    return notes.length;
}

export async function exportAuditLogsCsv() {
    const logs = await getAuditLogs();
    const headers = ['User', 'Action', 'Entity', 'Entity ID', 'Description', 'Date/Time'];
    const rows = logs.map(l => [
        l.user_name || 'System',
        l.action || '',
        l.entity_type || '',
        l.entity_id || '',
        l.description || '',
        new Date(l.created_at).toLocaleString()
    ]);

    const csv = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map(r => r.map(escapeCsv).join(','))].join('\r\n');
    triggerDownload(csv, `Audit_Logs_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    await logAudit('Data Exported', 'AuditLogs', 'export-audit', 'Admin exported audit logs to CSV.');
    return logs.length;
}

export async function exportEverythingBackup() {
    const org = await getOrganizationSettings();
    const users = await getUsers();
    const queries = await getQueries();
    const logs = await getAuditLogs();

    let notes = [];
    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data } = await supabase.from('notes').select('*');
            notes = data || [];
        } catch (e) {}
    } else {
        notes = getLocalStore().notes;
    }

    const backupPayload = {
        system: org.system_name || 'Query Resolver',
        organization: org,
        exported_at: new Date().toISOString(),
        total_queries: queries.length,
        total_notes: notes.length,
        total_users: users.length,
        total_audit_logs: logs.length,
        data: {
            organization: org,
            users,
            queries,
            notes,
            audit_logs: logs
        }
    };

    const json = JSON.stringify(backupPayload, null, 2);
    triggerDownload(json, `Query_Resolver_FULL_BACKUP_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    await logAudit('Full Backup Exported', 'System', 'backup-all', 'Admin generated and downloaded complete system JSON backup.');
    return backupPayload;
}
