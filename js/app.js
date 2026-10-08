/**
 * Query Resolver System - Modern SaaS Support Panel Controller
 */

import { AuthService } from './auth.js';
import { AppConfig } from './config.js';
import * as db from './db.js';

const state = {
    profile: null,
    organization: null,
    queries: [],
    currentQuery: null,
    statusFilter: 'All',
    priorityFilter: 'All',
    dateFilter: 'all',
    searchQuery: '',
    currentTab: 'dashboard'
};

// ==============================================================================
// INITIALIZATION
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Guard route: requires active session
    state.profile = await AuthService.requireAuth(null, '../login.html');
    if (!state.profile) return;

    // 2. Load Organization metadata
    await loadOrgDetails();

    // 3. Setup User Profile in UI
    initUserSnippet();

    // 4. Attach Listeners & Load Data
    initEventListeners();
    await loadAllData();

    // 5. Route handling
    handleHashRoute();
    window.addEventListener('hashchange', handleHashRoute);
});

async function loadOrgDetails() {
    try {
        state.organization = await db.getOrganizationSettings();
        if (state.organization) {
            const sysNameEl = document.getElementById('sidebar-system-name');
            const orgNameEl = document.getElementById('sidebar-org-name');
            if (sysNameEl && state.organization.system_name) sysNameEl.textContent = state.organization.system_name;
            if (orgNameEl && state.organization.name) orgNameEl.textContent = state.organization.name;
        }
    } catch (e) {}
}

function initUserSnippet() {
    const profile = state.profile;
    const initial = (profile.full_name[0] || 'U').toUpperCase();

    // Greeting
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const welcomeEl = document.getElementById('welcome-greeting');
    if (welcomeEl) welcomeEl.textContent = `${timeGreeting}, ${profile.full_name}`;

    // Sidebar
    const sideAvatar = document.getElementById('sidebar-avatar');
    const sideName = document.getElementById('sidebar-user-name');
    const sideRole = document.getElementById('sidebar-user-role');
    if (sideAvatar) sideAvatar.textContent = initial;
    if (sideName) sideName.textContent = profile.full_name;
    if (sideRole) sideRole.textContent = profile.role === 'admin' ? 'Administrator' : 'Support User';

    // Topbar
    const topAvatar = document.getElementById('topbar-avatar');
    const topName = document.getElementById('topbar-user-name');
    const topRole = document.getElementById('topbar-user-role');
    if (topAvatar) topAvatar.textContent = initial;
    if (topName) topName.textContent = profile.full_name;
    if (topRole) topRole.textContent = profile.role === 'admin' ? 'Admin' : 'Support';

    // If Admin, show link to Admin Console
    if (profile.role === 'admin') {
        const adminGroup = document.getElementById('admin-nav-group');
        const adminLink = document.getElementById('nav-link-admin');
        if (adminGroup) adminGroup.style.display = 'block';
        if (adminLink) adminLink.style.display = 'flex';
    }
}

async function loadAllData() {
    try {
        state.queries = await db.getQueries();
        updateTileCounts(state.queries);
        renderRecentQueries(state.queries);
        renderRecentActivity();
        renderQueriesTable();
        if (window.lucide) window.lucide.createIcons();
    } catch (err) {
        showToast('Error loading queries: ' + err.message, 'error');
    }
}

// ==============================================================================
// ROUTING & TABS
// ==============================================================================
function handleHashRoute() {
    const hash = window.location.hash || '#dashboard';

    if (hash.startsWith('#query-details')) {
        const params = new URLSearchParams(hash.split('?')[1] || '');
        const queryId = params.get('id');
        if (queryId) {
            showPanel('view-details');
            loadQueryDetailsView(queryId);
            return;
        }
    }

    if (hash === '#queries') {
        switchTab('queries');
        return;
    }

    switchTab('dashboard');
}

function switchTab(tabName) {
    state.currentTab = tabName;

    // Update sidebar active state
    document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
        if (item.getAttribute('data-tab') === tabName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    if (tabName === 'dashboard') {
        document.getElementById('page-title').textContent = 'Dashboard';
        document.getElementById('page-breadcrumb').textContent = 'Overview';
        showPanel('view-dashboard');
    } else if (tabName === 'queries') {
        document.getElementById('page-title').textContent = 'Queries';
        document.getElementById('page-breadcrumb').textContent = 'Manage & Track';
        showPanel('view-queries');
        renderQueriesTable();
    }

    // Close mobile nav if open
    document.getElementById('app-sidebar').classList.remove('open');
}

function showPanel(panelId) {
    document.querySelectorAll('.view-panel').forEach(p => p.style.display = 'none');
    const target = document.getElementById(panelId);
    if (target) {
        target.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ==============================================================================
// 1. DASHBOARD COMPACT STATISTICS & TWO-COLUMN CONTENT
// ==============================================================================
function updateTileCounts(queries) {
    const counts = { total: queries.length, open: 0, progress: 0, resolved: 0, escalated: 0, closed: 0 };
    queries.forEach(q => {
        const s = (q.status || '').trim();
        if (s === 'Open') counts.open++;
        else if (s === 'In Progress') counts.progress++;
        else if (s === 'Temporarily Resolved') counts.resolved++;
        else if (s === 'Escalated') counts.escalated++;
        else if (s === 'Closed') counts.closed++;
    });

    document.getElementById('tile-total').textContent = counts.total;
    document.getElementById('tile-open').textContent = counts.open;
    document.getElementById('tile-progress').textContent = counts.progress;
    document.getElementById('tile-resolved').textContent = counts.resolved;
    document.getElementById('tile-escalated').textContent = counts.escalated;
    document.getElementById('tile-closed').textContent = counts.closed;
}

function renderRecentQueries(queries) {
    const tbody = document.getElementById('dash-recent-queries-body');
    const recent = queries.slice(0, 5);

    if (recent.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">No queries recorded yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = recent.map(q => `
        <tr data-id="${q.id}">
            <td><span class="query-id-pill">${escapeHtml(q.query_number || q.id.slice(0, 8))}</span></td>
            <td><div style="font-weight:600; max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(q.problem)}</div></td>
            <td>${escapeHtml(q.customer_name)}</td>
            <td><span class="badge ${getPriorityBadgeClass(q.priority)}">${escapeHtml(q.priority || 'Medium')}</span></td>
            <td><span class="badge ${getStatusBadgeClass(q.status)}">${escapeHtml(q.status)}</span></td>
            <td style="font-size:0.75rem; color:var(--text-muted);">${formatRelativeTime(q.updated_at)}</td>
        </tr>
    `).join('');

    tbody.querySelectorAll('tr').forEach(row => {
        row.addEventListener('click', () => {
            const id = row.getAttribute('data-id');
            if (id) window.location.hash = `#query-details?id=${id}`;
        });
    });
}

async function renderRecentActivity() {
    const list = document.getElementById('dash-recent-activity-list');
    try {
        const logs = await db.getAuditLogs();
        const recent = logs.slice(0, 5);

        if (recent.length === 0) {
            list.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem; padding:1.5rem 0; text-align:center;">No activity recorded yet.</p>`;
            return;
        }

        list.innerHTML = recent.map(log => `
            <div style="display:flex; align-items:flex-start; gap:0.65rem; padding:0.5rem 0; border-bottom:1px solid var(--border-subtle);">
                <div style="width:7px; height:7px; border-radius:50%; background-color:var(--primary); margin-top:0.4rem; flex-shrink:0;"></div>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:0.825rem; font-weight:600; color:var(--text-primary); line-height:1.3;">
                        ${escapeHtml(log.user_name || 'Staff')} <span style="font-weight:normal; color:var(--text-secondary);">${escapeHtml(log.description)}</span>
                    </div>
                    <div style="font-size:0.725rem; color:var(--text-muted); margin-top:0.15rem;">
                        ${formatRelativeTime(log.created_at)}
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem;">Unable to load activity.</p>`;
    }
}

// ==============================================================================
// 2. QUERIES DIRECTORY VIEW
// ==============================================================================
function getFilteredQueries() {
    const query = state.searchQuery.toLowerCase().trim();
    const status = state.statusFilter;
    const priority = state.priorityFilter;
    const date = state.dateFilter;
    const now = new Date();

    return state.queries.filter(q => {
        if (status !== 'All' && q.status !== status) return false;
        if (priority !== 'All' && (q.priority || 'Medium') !== priority) return false;

        if (date !== 'all') {
            const created = new Date(q.created_at);
            const diffHours = (now - created) / (1000 * 3600);
            if (date === 'today' && diffHours > 24) return false;
            if (date === '7days' && diffHours > 24 * 7) return false;
            if (date === '14days' && diffHours > 24 * 14) return false;
        }

        if (query) {
            const idMatch = (q.query_number || '').toLowerCase().includes(query);
            const nameMatch = (q.customer_name || '').toLowerCase().includes(query);
            const probMatch = (q.problem || '').toLowerCase().includes(query);
            const resMatch = (q.temporary_resolution || '').toLowerCase().includes(query);
            if (!idMatch && !nameMatch && !probMatch && !resMatch) return false;
        }

        return true;
    });
}

function renderQueriesTable() {
    const tbody = document.getElementById('queries-table-body');
    const filtered = getFilteredQueries();

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-box">
                        <div class="empty-box-icon"><i data-lucide="inbox" style="width:36px; height:36px;"></i></div>
                        <h3>No queries yet</h3>
                        <p>Create your first support query to start tracking issues.</p>
                        <button class="btn btn-primary btn-sm" id="btn-empty-create">
                            <i data-lucide="plus"></i> Create Query
                        </button>
                    </div>
                </td>
            </tr>
        `;
        const btn = document.getElementById('btn-empty-create');
        if (btn) btn.addEventListener('click', openCreateModal);
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    tbody.innerHTML = filtered.map(q => `
        <tr data-id="${q.id}">
            <td><span class="query-id-pill">${escapeHtml(q.query_number || q.id.slice(0, 8))}</span></td>
            <td>
                <div style="font-weight:600; max-width:320px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(q.problem)}">
                    ${escapeHtml(q.problem)}
                </div>
                ${q.temporary_resolution ? `<div style="font-size:0.75rem; color:#047857; margin-top:0.15rem; display:flex; align-items:center; gap:0.25rem;"><i data-lucide="check-circle-2" style="width:12px; height:12px;"></i> Workaround active</div>` : ''}
            </td>
            <td>${escapeHtml(q.customer_name)}</td>
            <td><span class="badge ${getPriorityBadgeClass(q.priority)}">${escapeHtml(q.priority || 'Medium')}</span></td>
            <td><span class="badge ${getStatusBadgeClass(q.status)}">${escapeHtml(q.status)}</span></td>
            <td style="font-size:0.8rem; color:var(--text-muted);">${formatRelativeTime(q.updated_at)}</td>
            <td>
                <button class="btn btn-outline btn-sm action-view-btn" data-id="${q.id}">
                    View <i data-lucide="chevron-right" style="width:13px; height:13px;"></i>
                </button>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('tr').forEach(row => {
        row.addEventListener('click', () => {
            const id = row.getAttribute('data-id');
            if (id) window.location.hash = `#query-details?id=${id}`;
        });
    });

    if (window.lucide) window.lucide.createIcons();
}

// ==============================================================================
// 3. QUERY DETAILS VIEW (PROMINENT PROBLEM + WORKAROUND + TIMELINE)
// ==============================================================================
async function loadQueryDetailsView(queryId) {
    const container = document.getElementById('query-details-container');
    container.innerHTML = `
        <div style="padding:3rem; text-align:center; color:var(--text-muted);">
            <div>Loading query details...</div>
        </div>
    `;

    try {
        state.currentQuery = await db.getQueryById(queryId);
        renderQueryDetailsPage(state.currentQuery);
    } catch (e) {
        showToast('Query not found: ' + e.message, 'error');
        window.location.hash = '#queries';
    }
}

function renderQueryDetailsPage(query) {
    const container = document.getElementById('query-details-container');
    document.getElementById('page-title').textContent = query.query_number || 'Query Details';
    document.getElementById('page-breadcrumb').textContent = `Queries / ${query.query_number || ''}`;

    const notes = query.notes || [];
    const notesHtml = notes.length > 0
        ? notes.map(n => {
            const isAudit = n.note.includes('Status changed') || n.note.includes('Temporary resolution') || n.added_by === 'System Audit';
            return `
                <div class="timeline-entry">
                    <div class="timeline-node ${isAudit ? 'audit-node' : ''}"></div>
                    <div class="timeline-card">
                        <div class="timeline-meta-bar">
                            <span class="timeline-author">${escapeHtml(n.added_by || 'Staff')}</span>
                            <span class="timeline-timestamp">${formatDateTime(n.created_at)}</span>
                        </div>
                        <div class="timeline-text">${escapeHtml(n.note)}</div>
                    </div>
                </div>
            `;
        }).join('')
        : `<p style="color:var(--text-muted); font-size:0.85rem; padding:1rem 0;">No notes have been added yet. Add the first investigation note below.</p>`;

    container.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.25rem;">
            <div>
                <a href="#queries" style="font-size:0.825rem; font-weight:600; color:var(--primary); text-decoration:none; display:inline-flex; align-items:center; gap:0.35rem; margin-bottom:0.35rem;">
                    <i data-lucide="arrow-left" style="width:14px; height:14px;"></i> Back to Queries
                </a>
                <div style="display:flex; align-items:center; gap:0.65rem; flex-wrap:wrap;">
                    <h1 style="font-size:1.35rem; font-weight:700; color:var(--text-primary); letter-spacing:-0.02em;">
                        ${escapeHtml(query.query_number || query.id)}
                    </h1>
                    <span class="badge ${getPriorityBadgeClass(query.priority)}">${escapeHtml(query.priority || 'Medium')}</span>
                    <span class="badge ${getStatusBadgeClass(query.status)}">${escapeHtml(query.status)}</span>
                </div>
            </div>

            <button class="btn btn-secondary btn-sm" id="btn-open-edit-modal">
                <i data-lucide="edit-3"></i> Update Query
            </button>
        </div>

        <div style="display:grid; grid-template-columns: 1.15fr 1.35fr; gap:1.25rem;">
            <!-- Left Column: Problem, Workaround, Query Meta -->
            <div>
                <!-- Prominent Problem Card -->
                <div class="card">
                    <div class="card-title" style="margin-bottom:0.5rem;">Problem</div>
                    <div style="font-size:0.9rem; color:var(--text-primary); line-height:1.6; white-space:pre-wrap;">${escapeHtml(query.problem)}</div>
                </div>

                <!-- Highlighted Temporary Resolution Box -->
                <div class="resolution-highlight-box">
                    <div class="resolution-box-title">
                        <span>Temporary Resolution</span>
                        <button class="btn btn-outline btn-sm" id="btn-edit-workaround" style="padding:0.2rem 0.5rem; font-size:0.75rem; background:#ffffff; color:#166534; border-color:#86efac; display:inline-flex; align-items:center; gap:0.25rem;">
                            <i data-lucide="edit-3" style="width:12px; height:12px;"></i> ${query.temporary_resolution ? 'Update' : '+ Add Workaround'}
                        </button>
                    </div>
                    <div class="resolution-box-body">
                        ${query.temporary_resolution 
                            ? escapeHtml(query.temporary_resolution) 
                            : 'No temporary workaround documented yet.'}
                    </div>
                    ${query.temporary_resolution ? `
                        <div class="resolution-note-pending">
                            <i data-lucide="alert-triangle" style="width:13px; height:13px;"></i> <span>Temporary workaround — permanent fix pending.</span>
                        </div>
                    ` : ''}
                </div>

                <!-- Query Information Card -->
                <div class="card">
                    <div class="card-title" style="margin-bottom:0.75rem;">Query Information</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.85rem; font-size:0.825rem;">
                        <div>
                            <div style="color:var(--text-muted); font-size:0.75rem;">Customer</div>
                            <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(query.customer_name)}</div>
                            ${query.contact_reference ? `<div style="color:var(--text-muted); font-size:0.75rem;">${escapeHtml(query.contact_reference)}</div>` : ''}
                        </div>
                        <div>
                            <div style="color:var(--text-muted); font-size:0.75rem;">Created By</div>
                            <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(query.created_by || 'Staff')}</div>
                        </div>
                        <div>
                            <div style="color:var(--text-muted); font-size:0.75rem;">Created Date</div>
                            <div style="color:var(--text-primary);">${formatDateTime(query.created_at)}</div>
                        </div>
                        <div>
                            <div style="color:var(--text-muted); font-size:0.75rem;">Last Updated</div>
                            <div style="color:var(--text-primary);">${formatDateTime(query.updated_at)}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right Column: Notes & History Timeline + Add Note -->
            <div>
                <div class="card">
                    <div class="card-title">Notes & History</div>
                    <p class="card-subtitle">Permanent chronological audit trail of all investigation notes</p>

                    <div class="timeline-list">
                        ${notesHtml}
                    </div>

                    <!-- Add Note Input Section -->
                    <div style="margin-top:1.5rem; padding-top:1.25rem; border-top:1px solid var(--border);">
                        <form id="form-details-add-note">
                            <label class="form-label required" for="details-note-text">Add a note...</label>
                            <textarea id="details-note-text" class="form-control" rows="3" placeholder="Write your investigation note here..." required></textarea>
                            <div style="margin-top:0.65rem; display:flex; justify-content:flex-end;">
                                <button type="submit" class="btn btn-primary btn-sm" id="btn-submit-details-note">
                                    Add Note
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-open-edit-modal').addEventListener('click', () => openEditModal(query));
    document.getElementById('btn-edit-workaround').addEventListener('click', () => openEditModal(query, true));

    if (window.lucide) window.lucide.createIcons();

    // Submit note
    document.getElementById('form-details-add-note').addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = document.getElementById('details-note-text').value.trim();
        if (!text) return;

        const btn = document.getElementById('btn-submit-details-note');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            await db.addNote(query.id, text, state.profile.full_name);
            showToast('Note added permanently.', 'success');
            await loadQueryDetailsView(query.id);
            await loadAllData();
        } catch (err) {
            showToast('Error adding note: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Add Note';
        }
    });
}

// ==============================================================================
// MODALS
// ==============================================================================
function openCreateModal() {
    document.getElementById('form-create-query').reset();
    document.getElementById('create-query-priority').value = 'Medium';
    document.getElementById('create-query-status').value = 'Open';
    document.getElementById('modal-new-query').classList.add('active');
}

function openEditModal(query, focusWorkaround = false) {
    document.getElementById('edit-query-id').value = query.id;
    document.getElementById('edit-query-customer').value = query.customer_name || '';
    document.getElementById('edit-query-contact').value = query.contact_reference || '';
    document.getElementById('edit-query-problem').value = query.problem || '';
    document.getElementById('edit-query-resolution').value = query.temporary_resolution || '';
    document.getElementById('edit-query-status').value = query.status || 'Open';
    document.getElementById('edit-query-priority').value = query.priority || 'Medium';

    document.getElementById('modal-edit-query').classList.add('active');
    if (focusWorkaround) {
        setTimeout(() => document.getElementById('edit-query-resolution').focus(), 100);
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

// ==============================================================================
// EVENT LISTENERS
// ==============================================================================
function initEventListeners() {
    // Navigation
    document.getElementById('nav-link-dashboard').addEventListener('click', () => {
        window.location.hash = '#dashboard';
    });
    document.getElementById('nav-link-queries').addEventListener('click', () => {
        window.location.hash = '#queries';
    });
    document.getElementById('btn-view-all-queries').addEventListener('click', () => {
        window.location.hash = '#queries';
    });

    // Mobile nav toggle
    const mobileBtn = document.getElementById('btn-mobile-nav');
    if (mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            document.getElementById('app-sidebar').classList.toggle('open');
        });
    }

    // Logout
    document.getElementById('btn-sidebar-logout').addEventListener('click', async () => {
        await AuthService.logout();
        window.location.href = '../login.html';
    });

    // New query buttons
    document.getElementById('btn-dash-new-query').addEventListener('click', openCreateModal);
    document.getElementById('btn-open-create-modal').addEventListener('click', openCreateModal);

    // Stat tile filters
    document.querySelectorAll('.stat-tile').forEach(tile => {
        tile.addEventListener('click', () => {
            const status = tile.getAttribute('data-status');
            state.statusFilter = status;
            document.getElementById('filter-status-select').value = status;
            window.location.hash = '#queries';
        });
    });

    // Modals close
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(b => {
        b.addEventListener('click', closeAllModals);
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeAllModals();
        });
    });

    // Filter toolbar
    const searchFilter = document.getElementById('filter-search-queries');
    searchFilter.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderQueriesTable();
    });

    const topSearch = document.getElementById('topbar-search');
    topSearch.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        searchFilter.value = e.target.value;
        if (state.currentTab !== 'queries') {
            window.location.hash = '#queries';
        } else {
            renderQueriesTable();
        }
    });

    document.getElementById('filter-status-select').addEventListener('change', (e) => {
        state.statusFilter = e.target.value;
        renderQueriesTable();
    });

    document.getElementById('filter-priority-select').addEventListener('change', (e) => {
        state.priorityFilter = e.target.value;
        renderQueriesTable();
    });

    document.getElementById('filter-date-select').addEventListener('change', (e) => {
        state.dateFilter = e.target.value;
        renderQueriesTable();
    });

    document.getElementById('btn-reset-filters').addEventListener('click', () => {
        state.searchQuery = '';
        state.statusFilter = 'All';
        state.priorityFilter = 'All';
        state.dateFilter = 'all';
        searchFilter.value = '';
        topSearch.value = '';
        document.getElementById('filter-status-select').value = 'All';
        document.getElementById('filter-priority-select').value = 'All';
        document.getElementById('filter-date-select').value = 'all';
        renderQueriesTable();
    });

    // Export CSV
    document.getElementById('btn-export-csv-queries').addEventListener('click', async () => {
        try {
            const count = await db.exportQueriesCsv();
            showToast(`Exported ${count} queries to CSV.`, 'success');
        } catch (e) {
            showToast('Export failed: ' + e.message, 'error');
        }
    });

    // Create Query Form
    document.getElementById('form-create-query').addEventListener('submit', async (e) => {
        e.preventDefault();
        const customer_name = document.getElementById('create-query-customer').value.trim();
        const contact_reference = document.getElementById('create-query-contact').value.trim();
        const problem = document.getElementById('create-query-problem').value.trim();
        const priority = document.getElementById('create-query-priority').value;
        const status = document.getElementById('create-query-status').value;
        const initial_notes = document.getElementById('create-query-initial-notes').value.trim();

        const btn = document.getElementById('btn-submit-new-query');
        btn.disabled = true;
        btn.textContent = 'Creating...';

        try {
            const newQ = await db.createQuery({
                customer_name,
                contact_reference,
                problem,
                priority,
                status,
                initial_notes,
                created_by: state.profile.full_name
            });

            closeAllModals();
            showToast(`Query ${newQ.query_number} created successfully.`, 'success');
            await loadAllData();
            window.location.hash = `#query-details?id=${newQ.id}`;
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Create Query';
        }
    });

    // Edit Query Form
    document.getElementById('form-edit-query').addEventListener('submit', async (e) => {
        e.preventDefault();
        const queryId = document.getElementById('edit-query-id').value;
        const customer_name = document.getElementById('edit-query-customer').value.trim();
        const contact_reference = document.getElementById('edit-query-contact').value.trim();
        const problem = document.getElementById('edit-query-problem').value.trim();
        const temporary_resolution = document.getElementById('edit-query-resolution').value.trim();
        const status = document.getElementById('edit-query-status').value;
        const priority = document.getElementById('edit-query-priority').value;

        const btn = document.getElementById('btn-submit-edit-query');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            const auditNotes = [];
            const prev = state.currentQuery;
            if (prev) {
                if (prev.status !== status) auditNotes.push(`Status changed from "${prev.status}" to "${status}".`);
                if (prev.temporary_resolution !== temporary_resolution) {
                    auditNotes.push(`Temporary resolution updated: "${temporary_resolution}"`);
                }
                if (prev.problem !== problem) auditNotes.push('Problem statement updated.');
            }

            const auditSummary = auditNotes.length > 0 ? auditNotes.join(' ') : 'Query updated.';

            await db.updateQuery(
                queryId,
                { customer_name, contact_reference, problem, temporary_resolution, status, priority },
                state.profile.full_name,
                auditSummary
            );

            closeAllModals();
            showToast('Query updated successfully.', 'success');
            await loadAllData();
            await loadQueryDetailsView(queryId);
        } catch (err) {
            showToast('Error updating query: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save Changes';
        }
    });
}

// ==============================================================================
// HELPERS
// ==============================================================================
function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = d.getDate().toString().padStart(2, '0');
        const month = months[d.getMonth()];
        const year = d.getFullYear();
        let hours = d.getHours();
        const minutes = d.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
    } catch (e) {
        return dateStr;
    }
}

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
