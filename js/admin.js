/**
 * Query Resolver System - Modern SaaS Admin Console Controller
 */

import { AuthService } from './auth.js';
import * as db from './db.js';
import { AppConfig } from './config.js';
import { testConnection, getConnectionInfo, resetSupabaseInstance } from './supabaseClient.js';

const state = {
    profile: null,
    organization: null,
    users: [],
    queries: [],
    auditLogs: [],
    activeSection: 'sec-dashboard'
};

// ==============================================================================
// INITIALIZATION & ROLE GUARD
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Strict Administrator Authorization Guard
    state.profile = await AuthService.requireAuth('admin', '../login.html');
    if (!state.profile) return;

    // 2. Setup Admin Header & Identity
    initAdminHeader();

    // 3. Load Data & Initialize Controls
    await loadInitialData();
    initNavigation();
    initTabs();
    initEventListeners();
});

function initAdminHeader() {
    const nameEl = document.getElementById('admin-name');
    const avatarEl = document.getElementById('admin-avatar');
    const topNameEl = document.getElementById('topbar-admin-name');
    const topAvatarEl = document.getElementById('topbar-admin-avatar');
    const initial = (state.profile.full_name[0] || 'A').toUpperCase();

    if (nameEl) nameEl.textContent = state.profile.full_name;
    if (avatarEl) avatarEl.textContent = initial;
    if (topNameEl) topNameEl.textContent = state.profile.full_name;
    if (topAvatarEl) topAvatarEl.textContent = initial;
}

async function loadInitialData() {
    try {
        state.organization = await db.getOrganizationSettings();
        applyOrgBranding(state.organization);

        state.users = await db.getUsers();
        state.queries = await db.getQueries();
        state.auditLogs = await db.getAuditLogs();

        renderDashboardSummary();
        renderQueries();
        renderUsers();
        populateOrgForm();
        populateSystemForm();
        populateDatabaseConfig();
        renderDatabaseStats();
        renderAuditLogs();

        if (window.lucide) {
            window.lucide.createIcons();
        }
    } catch (e) {
        showToast('Error loading administrative data: ' + e.message, 'error');
    }
}

function applyOrgBranding(org) {
    if (!org) return;
    const sysNameEl = document.getElementById('sidebar-system-name');
    const orgNameEl = document.getElementById('sidebar-org-name');
    if (sysNameEl && org.system_name) sysNameEl.textContent = org.system_name;
    if (orgNameEl && org.name) orgNameEl.textContent = org.name;

    // Live Preview elements
    const previewSys = document.getElementById('preview-sys-name');
    const previewOrg = document.getElementById('preview-org-name');
    if (previewSys && org.system_name) previewSys.textContent = org.system_name;
    if (previewOrg && org.name) previewOrg.textContent = org.name;
}

// ==============================================================================
// NAVIGATION & VIEW SWITCHING
// ==============================================================================
function initNavigation() {
    document.querySelectorAll('.nav-item[data-section]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-section');
            switchSection(target);
        });
    });

    // Shortcuts from overview cards
    document.querySelectorAll('.nav-shortcut').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const target = btn.getAttribute('data-target');
            if (target) switchSection(target);
        });
    });

    // Mobile nav toggle
    const toggleBtn = document.getElementById('btn-mobile-nav');
    const sidebar = document.getElementById('app-sidebar');
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }
}

function switchSection(sectionId) {
    state.activeSection = sectionId;

    document.querySelectorAll('.nav-item[data-section]').forEach(link => {
        if (link.getAttribute('data-section') === sectionId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    document.querySelectorAll('.admin-panel').forEach(sec => sec.style.display = 'none');
    const target = document.getElementById(sectionId);
    if (target) {
        target.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    const titleMap = {
        'sec-dashboard': { title: 'Administration', sub: 'Manage system, users and settings' },
        'sec-queries': { title: 'All Queries', sub: 'Global ticket directory' },
        'sec-users': { title: 'Users', sub: 'Manage support staff and administrators' },
        'sec-organization': { title: 'Organization Settings', sub: 'Company details and system branding' },
        'sec-settings': { title: 'Query Settings', sub: 'Workflow priorities and statuses' },
        'sec-database': { title: 'Database Configuration', sub: 'Configure Supabase cloud backend, connection and data' },
        'sec-audit': { title: 'Audit Logs', sub: 'Track important actions automatically' }
    };

    const header = titleMap[sectionId] || { title: 'Administration', sub: 'Manage system' };
    document.getElementById('admin-page-title').textContent = header.title;
    document.getElementById('admin-page-breadcrumb').textContent = header.sub;

    document.getElementById('app-sidebar').classList.remove('open');

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ==============================================================================
// TABS FOR SETTINGS & DATABASE CONFIGURATION
// ==============================================================================
function initTabs() {
    document.querySelectorAll('.tabs-nav').forEach(nav => {
        const buttons = nav.querySelectorAll('.tab-btn');
        const container = nav.closest('.card') || nav.parentElement;

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                container.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

                btn.classList.add('active');
                const paneId = btn.getAttribute('data-tab-pane');
                const targetPane = document.getElementById(paneId);
                if (targetPane) targetPane.classList.add('active');
                if (window.lucide) window.lucide.createIcons();
            });
        });
    });

    // Live preview sync for branding inputs
    const nameInput = document.getElementById('org-name-input');
    const sysNameInput = document.getElementById('org-sysname-input');

    if (nameInput) {
        nameInput.addEventListener('input', (e) => {
            const preview = document.getElementById('preview-org-name');
            if (preview) preview.textContent = e.target.value || 'Organization Name';
        });
    }

    if (sysNameInput) {
        sysNameInput.addEventListener('input', (e) => {
            const preview = document.getElementById('preview-sys-name');
            if (preview) preview.textContent = e.target.value || 'System Name';
        });
    }
}

// ==============================================================================
// 1. DASHBOARD OVERVIEW SUMMARY
// ==============================================================================
function renderDashboardSummary() {
    const totalUsers = state.users.length;
    const activeUsers = state.users.filter(u => u.is_active).length;
    document.getElementById('stat-total-users').textContent = totalUsers;
    document.getElementById('stat-active-users').textContent = activeUsers;

    const counts = { total: state.queries.length, open: 0, progress: 0, resolved: 0 };
    state.queries.forEach(q => {
        const s = (q.status || '').trim();
        if (s === 'Open') counts.open++;
        else if (s === 'In Progress') counts.progress++;
        else if (s === 'Temporarily Resolved') counts.resolved++;
    });

    document.getElementById('stat-total-queries').textContent = counts.total;
    document.getElementById('stat-open-queries').textContent = counts.open;
    document.getElementById('stat-progress-queries').textContent = counts.progress;
    document.getElementById('stat-resolved-queries').textContent = counts.resolved;
}

// ==============================================================================
// 2. ALL QUERIES
// ==============================================================================
function renderQueries() {
    const tbody = document.getElementById('admin-queries-body');
    if (state.queries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2.5rem; color:var(--text-muted);">No queries recorded in system.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.queries.map(q => `
        <tr>
            <td><span class="query-id-pill">${escapeHtml(q.query_number || q.id.slice(0, 8))}</span></td>
            <td>
                <div style="font-weight:600; max-width:280px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(q.problem)}</div>
            </td>
            <td>${escapeHtml(q.customer_name)}</td>
            <td><span class="badge ${getPriorityBadgeClass(q.priority)}">${escapeHtml(q.priority || 'Medium')}</span></td>
            <td><span class="badge ${getStatusBadgeClass(q.status)}">${escapeHtml(q.status)}</span></td>
            <td style="font-size:0.8rem; color:var(--text-secondary);">${escapeHtml(q.created_by)}</td>
            <td>
                <a href="../app/index.html#query-details?id=${q.id}" class="btn btn-outline btn-sm">
                    View <i data-lucide="arrow-right" style="width: 14px; height: 14px; vertical-align: middle;"></i>
                </a>
            </td>
        </tr>
    `).join('');

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ==============================================================================
// 3. USERS MANAGEMENT
// ==============================================================================
function renderUsers(filterText = '') {
    const tbody = document.getElementById('admin-users-body');
    const query = filterText.toLowerCase().trim();

    const filtered = state.users.filter(u => {
        if (!query) return true;
        return (u.full_name || '').toLowerCase().includes(query) || (u.email || '').toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">No matching users.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(u => {
        const isSelf = state.profile && state.profile.id === u.id;
        const initial = (u.full_name[0] || 'U').toUpperCase();

        return `
            <tr>
                <td>
                    <div style="display:flex; align-items:center;">
                        <span class="user-avatar-sm">${initial}</span>
                        <div>
                            <strong>${escapeHtml(u.full_name)}</strong>
                            ${isSelf ? '<span style="font-size:0.7rem; color:var(--primary); margin-left:0.35rem;">(You)</span>' : ''}
                        </div>
                    </div>
                </td>
                <td style="font-size:0.85rem; color:var(--text-secondary);">${escapeHtml(u.email)}</td>
                <td>
                    <span class="role-badge ${u.role === 'admin' ? 'role-admin' : 'role-support'}">
                        ${u.role === 'admin' ? 'Admin' : 'Support'}
                    </span>
                </td>
                <td>
                    <span class="role-badge ${u.is_active ? 'status-badge-active' : 'status-badge-inactive'}">
                        ${u.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td style="font-size:0.8rem; color:var(--text-muted);">${formatRelativeTime(u.last_login)}</td>
                <td>
                    <div style="display:flex; gap:0.4rem;">
                        <button class="btn btn-outline btn-sm btn-user-role" data-id="${u.id}" ${isSelf ? 'disabled title="Cannot change your own role"' : ''}>
                            Make ${u.role === 'admin' ? 'Support' : 'Admin'}
                        </button>
                        <button class="btn btn-secondary btn-sm btn-user-active" data-id="${u.id}" ${isSelf ? 'disabled title="Cannot deactivate yourself"' : ''}>
                            ${u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-user-role').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.getAttribute('data-id');
            const targetUser = state.users.find(u => u.id === userId);
            if (!targetUser) return;
            const newRole = targetUser.role === 'admin' ? 'support' : 'admin';
            try {
                await db.updateUser(userId, { role: newRole });
                targetUser.role = newRole;
                renderUsers();
                showToast(`User role updated to ${newRole}.`, 'success');
            } catch (err) {
                showToast('Error: ' + err.message, 'error');
            }
        });
    });

    tbody.querySelectorAll('.btn-user-active').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.getAttribute('data-id');
            const targetUser = state.users.find(u => u.id === userId);
            if (!targetUser) return;
            const newActive = !targetUser.is_active;
            try {
                await db.toggleUserActive(userId, newActive);
                targetUser.is_active = newActive;
                renderUsers();
                showToast(`User ${targetUser.full_name} ${newActive ? 'activated' : 'deactivated'}.`, 'success');
            } catch (err) {
                showToast('Error: ' + err.message, 'error');
            }
        });
    });
}

// ==============================================================================
// 4. ORGANIZATION SETTINGS FORM
// ==============================================================================
function populateOrgForm() {
    const org = state.organization;
    if (!org) return;

    document.getElementById('org-name-input').value = org.name || '';
    document.getElementById('org-sysname-input').value = org.system_name || '';
    document.getElementById('org-email-input').value = org.email || '';
    document.getElementById('org-support-email-input').value = org.support_email || '';
    document.getElementById('org-phone-input').value = org.phone || '';
    document.getElementById('org-logo-input').value = org.logo_url || '';
    document.getElementById('org-address-input').value = org.address || '';
    document.getElementById('org-timezone-select').value = org.timezone || 'UTC';
    document.getElementById('org-dateformat-select').value = org.date_format || 'DD-MMM-YYYY';
}

function populateSystemForm() {
    const org = state.organization;
    if (!org) return;

    document.getElementById('sys-default-status').value = org.default_status || 'Open';
    document.getElementById('sys-default-priority').value = org.default_priority || 'Medium';

    if (org.available_statuses) {
        document.getElementById('sys-available-statuses').value = Array.isArray(org.available_statuses)
            ? org.available_statuses.join(', ')
            : org.available_statuses;
    }
    if (org.available_priorities) {
        document.getElementById('sys-available-priorities').value = Array.isArray(org.available_priorities)
            ? org.available_priorities.join(', ')
            : org.available_priorities;
    }
}

// ==============================================================================
// 5. DATABASE CONFIGURATION & DATA MANAGEMENT VIEW
// ==============================================================================
function populateDatabaseConfig() {
    const info = getConnectionInfo();
    const urlInput = document.getElementById('db-config-url');
    const keyInput = document.getElementById('db-config-anon-key');

    if (urlInput && !urlInput.value) urlInput.value = info.url;
    if (keyInput && !keyInput.value) keyInput.value = AppConfig.getSupabaseAnonKey();

    updateDatabaseStatusUI(info);
}

function updateDatabaseStatusUI(info) {
    const headerBadge = document.getElementById('db-header-status-badge');
    const headerDot = document.getElementById('db-header-pulse-dot');
    const headerText = document.getElementById('db-header-status-text');

    const liveDot = document.getElementById('db-live-indicator-dot');
    const liveTitle = document.getElementById('db-live-status-title');
    const liveBadge = document.getElementById('db-live-badge');
    const activeUrl = document.getElementById('db-active-url-display');
    const activeKey = document.getElementById('db-active-key-display');
    const dbStatHealth = document.getElementById('db-stat-health');

    if (info.isConfigured) {
        if (headerBadge) {
            headerBadge.style.background = '#ecfdf5';
            headerBadge.style.color = '#047857';
            headerBadge.style.borderColor = '#a7f3d0';
        }
        if (headerDot) {
            headerDot.className = 'db-pulse-dot dot-online';
        }
        if (headerText) headerText.textContent = 'Supabase Cloud';

        if (liveDot) liveDot.className = 'db-pulse-dot dot-online';
        if (liveTitle) liveTitle.textContent = 'Active Connection: Supabase Cloud';
        if (liveBadge) {
            liveBadge.textContent = 'Cloud Connected';
            liveBadge.style.background = '#ecfdf5';
            liveBadge.style.color = '#047857';
            liveBadge.style.borderColor = '#a7f3d0';
        }
        if (activeUrl) activeUrl.textContent = info.url;
        if (activeKey) activeKey.textContent = info.maskedKey ? `Anon Key (${info.maskedKey})` : 'Public Anon Key';
        if (dbStatHealth) {
            dbStatHealth.textContent = 'Supabase Cloud (Active)';
            dbStatHealth.style.color = '#047857';
        }
    } else {
        if (headerBadge) {
            headerBadge.style.background = '#fef3c7';
            headerBadge.style.color = '#b45309';
            headerBadge.style.borderColor = '#fde68a';
        }
        if (headerDot) {
            headerDot.className = 'db-pulse-dot dot-local';
        }
        if (headerText) headerText.textContent = 'Local Storage Mode';

        if (liveDot) liveDot.className = 'db-pulse-dot dot-local';
        if (liveTitle) liveTitle.textContent = 'Current Storage Mode: Local Fallback';
        if (liveBadge) {
            liveBadge.textContent = 'Offline / Local';
            liveBadge.style.background = '#fef3c7';
            liveBadge.style.color = '#b45309';
            liveBadge.style.borderColor = '#fde68a';
        }
        if (activeUrl) activeUrl.textContent = 'Not configured (Browser LocalStorage)';
        if (activeKey) activeKey.textContent = 'None (Client Local)';
        if (dbStatHealth) {
            dbStatHealth.textContent = 'Local Browser Storage';
            dbStatHealth.style.color = '#b45309';
        }
    }
}

async function renderDatabaseStats() {
    try {
        const stats = await db.getDatabaseStats();
        document.getElementById('db-stat-queries').textContent = stats.totalQueries;
        document.getElementById('db-stat-notes').textContent = stats.totalNotes;
        document.getElementById('db-stat-users').textContent = stats.totalUsers;
        document.getElementById('db-stat-logs').textContent = stats.totalLogs;
    } catch (e) {}
}

// ==============================================================================
// 6. AUDIT LOGS VIEW
// ==============================================================================
function renderAuditLogs() {
    const tbody = document.getElementById('admin-audit-body');
    if (state.auditLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">No audit logs recorded yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.auditLogs.map(l => `
        <tr>
            <td style="font-size:0.775rem; color:var(--text-muted); white-space:nowrap;">${formatRelativeTime(l.created_at)}</td>
            <td><strong>${escapeHtml(l.user_name || 'System')}</strong></td>
            <td><span class="audit-action-pill">${escapeHtml(l.action)}</span></td>
            <td style="font-size:0.8rem; color:var(--text-secondary);">${escapeHtml(l.entity_type)}</td>
            <td style="font-size:0.825rem;">${escapeHtml(l.description)}</td>
        </tr>
    `).join('');
}

// ==============================================================================
// EVENT LISTENERS
// ==============================================================================
function initEventListeners() {
    document.getElementById('btn-admin-logout').addEventListener('click', async () => {
        await AuthService.logout();
        window.location.href = '../login.html';
    });

    const userSearch = document.getElementById('filter-users-input');
    if (userSearch) {
        userSearch.addEventListener('input', (e) => renderUsers(e.target.value));
    }

    document.getElementById('btn-open-add-user-modal').addEventListener('click', () => {
        document.getElementById('form-add-user').reset();
        document.getElementById('modal-add-user').classList.add('active');
    });

    document.querySelectorAll('.modal-close, .modal-cancel').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        });
    });

    // Create User Form
    document.getElementById('form-add-user').addEventListener('submit', async (e) => {
        e.preventDefault();
        const full_name = document.getElementById('new-user-name').value.trim();
        const email = document.getElementById('new-user-email').value.trim();
        const password = document.getElementById('new-user-password').value;
        const role = document.getElementById('new-user-role').value;
        const btn = document.getElementById('btn-submit-new-user');

        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            const newUser = await db.createUser({ full_name, email, password, role });
            state.users.unshift(newUser);
            renderUsers();
            renderDashboardSummary();
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
            showToast(`User ${full_name} created successfully.`, 'success');
        } catch (err) {
            console.error('Create user failed:', err);
            if (err.message && err.message.toLowerCase().includes('rate limit')) {
                showToast('Email rate limit exceeded! In Supabase Dashboard: go to Authentication -> Providers -> Email and turn OFF "Confirm email" or configure custom SMTP.', 'error');
            } else {
                showToast('Error: ' + err.message, 'error');
            }
        } finally {
            btn.disabled = false;
            btn.textContent = 'Create User';
        }
    });

    // Save Organization Settings
    document.getElementById('form-org-settings').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-save-org-settings');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        const payload = {
            name: document.getElementById('org-name-input').value.trim(),
            system_name: document.getElementById('org-sysname-input').value.trim(),
            email: document.getElementById('org-email-input').value.trim(),
            support_email: document.getElementById('org-support-email-input').value.trim(),
            phone: document.getElementById('org-phone-input').value.trim(),
            logo_url: document.getElementById('org-logo-input').value.trim(),
            address: document.getElementById('org-address-input').value.trim(),
            timezone: document.getElementById('org-timezone-select').value,
            date_format: document.getElementById('org-dateformat-select').value
        };

        try {
            const updated = await db.updateOrganizationSettings(payload);
            state.organization = updated;
            applyOrgBranding(updated);
            showToast('Organization settings updated successfully.', 'success');
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save Changes';
        }
    });

    // Save System Settings
    document.getElementById('form-system-settings').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-save-sys-settings');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        const default_status = document.getElementById('sys-default-status').value;
        const default_priority = document.getElementById('sys-default-priority').value;
        const rawStatuses = document.getElementById('sys-available-statuses').value;
        const rawPriorities = document.getElementById('sys-available-priorities').value;

        const available_statuses = rawStatuses.split(',').map(s => s.trim()).filter(Boolean);
        const available_priorities = rawPriorities.split(',').map(s => s.trim()).filter(Boolean);

        try {
            const updated = await db.updateOrganizationSettings({
                default_status,
                default_priority,
                available_statuses,
                available_priorities
            });
            state.organization = updated;
            showToast('Query & status workflow updated.', 'success');
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save System Settings';
        }
    });

    // Exports
    const bindExport = (btnId, exportFn, label) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', async () => {
                try {
                    const count = await exportFn();
                    showToast(`Exported ${label} successfully.`, 'success');
                } catch (e) {
                    showToast('Export failed: ' + e.message, 'error');
                }
            });
        }
    };

    bindExport('btn-admin-export-queries', db.exportQueriesCsv, 'Queries');
    bindExport('btn-export-queries-csv', db.exportQueriesCsv, 'Queries');
    bindExport('btn-export-notes-csv', db.exportNotesCsv, 'Notes');
    bindExport('btn-export-audit-csv', db.exportAuditLogsCsv, 'Audit Logs');
    bindExport('btn-export-audit-table', db.exportAuditLogsCsv, 'Audit Logs');
    bindExport('btn-export-all-backup', db.exportEverythingBackup, 'Full Backup');

    // ==========================================================================
    // DATABASE CONFIGURATION EVENT LISTENERS
    // ==========================================================================
    const btnTest = document.getElementById('btn-test-db-connection');
    if (btnTest) {
        btnTest.addEventListener('click', async () => {
            const url = document.getElementById('db-config-url').value.trim();
            const key = document.getElementById('db-config-anon-key').value.trim();
            const resultBox = document.getElementById('db-connection-result-box');
            const resultMsg = document.getElementById('db-result-message');
            const resultIcon = document.getElementById('db-result-icon');

            if (!url || !key) {
                showToast('Please enter both Supabase Project URL and Anon Key to test.', 'error');
                return;
            }

            const originalHtml = btnTest.innerHTML;
            btnTest.disabled = true;
            btnTest.innerHTML = `<i data-lucide="activity" style="width:14px;height:14px;"></i> Testing...`;
            if (window.lucide) window.lucide.createIcons();

            try {
                const res = await testConnection(url, key);
                resultBox.style.display = 'block';
                if (res.success) {
                    resultBox.style.background = '#ecfdf5';
                    resultBox.style.border = '1px solid #a7f3d0';
                    resultBox.style.color = '#065f46';
                    resultIcon.setAttribute('data-lucide', 'check-circle');
                    resultMsg.innerHTML = `<strong>Connected Successfully:</strong> ${escapeHtml(res.message)}`;
                    showToast(`Supabase ping succeeded (${res.latency}ms).`, 'success');
                } else {
                    resultBox.style.background = '#fef2f2';
                    resultBox.style.border = '1px solid #fecaca';
                    resultBox.style.color = '#991b1b';
                    resultIcon.setAttribute('data-lucide', 'alert-circle');
                    resultMsg.innerHTML = `<strong>Connection Failed:</strong> ${escapeHtml(res.message)}`;
                    showToast('Connection failed: ' + res.message, 'error');
                }
                if (window.lucide) window.lucide.createIcons();
            } catch (err) {
                resultBox.style.display = 'block';
                resultBox.style.background = '#fef2f2';
                resultBox.style.border = '1px solid #fecaca';
                resultBox.style.color = '#991b1b';
                resultMsg.innerHTML = `<strong>Connection Error:</strong> ${escapeHtml(err.message)}`;
                showToast('Test error: ' + err.message, 'error');
            } finally {
                btnTest.disabled = false;
                btnTest.innerHTML = originalHtml;
                if (window.lucide) window.lucide.createIcons();
            }
        });
    }

    const formDb = document.getElementById('form-db-config');
    if (formDb) {
        formDb.addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = document.getElementById('db-config-url').value.trim();
            const key = document.getElementById('db-config-anon-key').value.trim();
            const saveBtn = document.getElementById('btn-save-db-config');

            if (!url || !key) {
                showToast('Project URL and Public Anon Key are required.', 'error');
                return;
            }

            saveBtn.disabled = true;
            saveBtn.innerHTML = `<i data-lucide="activity" style="width:14px;height:14px;"></i> Connecting...`;
            if (window.lucide) window.lucide.createIcons();

            try {
                AppConfig.setCredentials(url, key);
                resetSupabaseInstance();

                const testRes = await testConnection();
                populateDatabaseConfig();
                await loadInitialData();

                await db.logAudit('Database Configured', 'System', 'supabase', `Connected Supabase endpoint: ${url}`);
                renderAuditLogs();

                if (testRes.success) {
                    showToast('Supabase cloud connected and credentials saved.', 'success');
                } else {
                    showToast('Credentials saved, but verification reported: ' + testRes.message, 'error');
                }
            } catch (err) {
                showToast('Failed to save configuration: ' + err.message, 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<i data-lucide="save"></i> Save & Connect`;
                if (window.lucide) window.lucide.createIcons();
            }
        });
    }

    const btnClearDb = document.getElementById('btn-clear-db-config');
    if (btnClearDb) {
        btnClearDb.addEventListener('click', async () => {
            if (!confirm('Disconnect from Supabase cloud and switch to browser local storage fallback?')) {
                return;
            }

            AppConfig.clearCredentials();
            resetSupabaseInstance();

            document.getElementById('db-config-url').value = '';
            document.getElementById('db-config-anon-key').value = '';

            const resultBox = document.getElementById('db-connection-result-box');
            if (resultBox) resultBox.style.display = 'none';

            populateDatabaseConfig();
            await loadInitialData();

            await db.logAudit('Database Disconnected', 'System', 'supabase', 'Administrator cleared cloud database credentials.');
            renderAuditLogs();

            showToast('Database credentials cleared. Running in local fallback mode.', 'info');
        });
    }

    const btnToggleKey = document.getElementById('btn-toggle-key-visibility');
    if (btnToggleKey) {
        btnToggleKey.addEventListener('click', () => {
            const input = document.getElementById('db-config-anon-key');
            if (!input) return;
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btnToggleKey.innerHTML = `<i data-lucide="${isPassword ? 'eye-off' : 'eye'}" style="width:15px;height:15px;"></i>`;
            if (window.lucide) window.lucide.createIcons();
        });
    }

    const btnCopySchema = document.getElementById('btn-copy-schema-sql');
    if (btnCopySchema) {
        btnCopySchema.addEventListener('click', async () => {
            const pre = document.getElementById('sql-schema-preview');
            if (pre) {
                try {
                    await navigator.clipboard.writeText(pre.textContent);
                    showToast('Supabase SQL setup script copied to clipboard.', 'success');
                } catch (e) {
                    showToast('Failed to copy to clipboard.', 'error');
                }
            }
        });
    }
}

// ==============================================================================
// HELPERS
// ==============================================================================
function formatRelativeTime(dateStr) {
    if (!dateStr) return '—';
    try {
        const diffMs = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    } catch (e) {
        return dateStr;
    }
}

function getStatusBadgeClass(status) {
    const s = (status || 'Open').trim();
    if (s === 'In Progress') return 'badge-progress';
    if (s === 'Temporarily Resolved') return 'badge-resolved';
    if (s === 'Escalated') return 'badge-escalated';
    if (s === 'Closed') return 'badge-closed';
    return 'badge-open';
}

function getPriorityBadgeClass(prio) {
    const p = (prio || 'Medium').trim();
    if (p === 'Low') return 'badge-prio-low';
    if (p === 'High') return 'badge-prio-high';
    if (p === 'Critical') return 'badge-prio-crit';
    return 'badge-prio-med';
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';
    toast.innerHTML = `<i data-lucide="${iconName}" style="width: 16px; height: 16px; flex-shrink: 0;"></i> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    if (window.lucide) {
        window.lucide.createIcons();
    }
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 250);
    }, 3500);
}
