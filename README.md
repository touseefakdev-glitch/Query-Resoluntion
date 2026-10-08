# 🛠️ Query Resolver System with Separate Admin Panel

A comprehensive, responsive web-based support query resolution and administration platform built with **HTML5, CSS3, Vanilla JavaScript, and Supabase**, engineered for a 2-week active triage operations period and deployable directly to **Netlify**.

---

## 🌟 Architecture & Key Features

- **Separate Admin & Support Panels**:
  - **Support Panel (`/app/`)**: Support specialists can log queries, search & filter, maintain chronological append-only notes, update statuses, document temporary workarounds, and export query data.
  - **Admin Panel (`/admin/`)**: Restricted to users with the `admin` role. Features an executive dashboard, user & role management, organization branding & configuration, query & status settings, audit & security logs, and full database export/backup.
- **Strict Role-Based Access Control (RBAC)**:
  - Roles: `admin` and `support`.
  - Enforced both at the client level (route guards) and at the database level via **Supabase Row Level Security (RLS)**.
  - Support users cannot modify organization settings, manage user accounts, or view security audit logs.
- **Organization Data Isolation & Settings**:
  - Every major record (`queries`, `notes`, `audit_logs`, `profiles`) is linked to an `organization_id`.
  - Admin can customize the Organization Name, System Name, Email, Phone, Address, Timezone, Date Format, Default Status, and Default Priority directly from the UI.
- **Zero Note Overwriting & Deletion**:
  - Every note is permanently inserted (`INSERT INTO notes`).
  - No delete or note edit capabilities exist in the UI or in database RLS policies.
- **Safe Administrative Database Page**:
  - Displays record counts, connection status, and last activity without exposing raw database passwords or Supabase service-role keys.
- **End-of-Period Full Backup / Export**:
  - One-click exports for Queries (CSV), Notes (CSV), Audit Logs (CSV), and an **Export Everything Full JSON Backup** to archive all system data before shutting down the temporary instance.

---

## 📁 Project Structure

```text
QUERY RESOLVER/
│
├── index.html            # Session router (redirects to login, admin, or support)
├── login.html            # Authentication portal with dynamic organization branding
│
├── admin/
│   └── index.html        # Complete Admin Panel (Dashboard, Users, Org, System, Data, Audit)
│
├── app/
│   └── index.html        # Support Operations Panel (Intake, Timeline, Workarounds, Search)
│
├── css/
│   ├── styles.css        # Core design system (palette, cards, tables, badges, modals, toasts)
│   └── admin.css         # Admin panel styling (sidebar, data grids, audit logs)
│
├── js/
│   ├── config.js         # Supabase connection manager & organization defaults
│   ├── supabaseClient.js # Supabase SDK initialization & connection testing
│   ├── auth.js           # Supabase Auth, profiles, and role protection guards
│   ├── db.js             # Multi-tenant data layer, permanent notes, audit logging, & export
│   ├── app.js            # Support Panel controller
│   └── admin.js          # Admin Panel controller
│
├── supabase/
│   └── schema.sql        # Supabase database schema, RLS policies, indexes, and triggers
│
├── _redirects            # Netlify SPA rewrite rules
├── netlify.toml          # Netlify configuration & security headers
└── README.md             # Setup and deployment documentation
```

---

## 🚀 Step-by-Step Supabase & Netlify Setup Guide

### Step 1: Create Your Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and click **"New Project"**.
2. Select your organization, set a project name (e.g., `query-resolver`), choose a database password, and select your region.
3. Wait 1-2 minutes for the PostgreSQL instance to provision.

---

### Step 2: Run the SQL Schema
1. Open the Supabase dashboard and click on **SQL Editor** on the left menu.
2. Click **"New query"**.
3. Copy the entire contents of [`supabase/schema.sql`](file:///c:/Users/TIW%20COMPUTER/Desktop/QUERY%20RESOLVER/supabase/schema.sql).
4. Paste the SQL into the editor and click **Run**.
5. This creates:
   - `organizations` table with initial default organization.
   - `profiles` table linked to Supabase Auth (`auth.users`).
   - `queries` table with auto-increment sequence (`QR-1001`...).
   - `notes` table with permanent append-only constraints.
   - `audit_logs` table for administrative tracking.
   - Triggers for auto-updating `updated_at`.
   - Complete Row Level Security (RLS) policies enforcing organization isolation and admin privileges.

---

### Step 3: Configure Supabase Authentication & Create the First Admin
1. In Supabase, go to **Authentication** -> **Users** -> **"Add user"** -> **"Create user"**.
2. Enter an email (e.g. `admin@yourcompany.com`) and password.
3. Copy the newly created user's **User UID**.
4. Go to **SQL Editor** and insert the admin profile linking to that user:
   ```sql
   INSERT INTO public.profiles (id, full_name, email, role, is_active, organization_id)
   VALUES (
       'PASTE_USER_UID_HERE',
       'System Administrator',
       'admin@yourcompany.com',
       'admin',
       true,
       '00000000-0000-0000-0000-000000000001'
   );
   ```

---

### Step 4: Connect the Frontend to Supabase
1. In Supabase, go to **Project Settings** -> **API**.
2. Copy the **Project URL** and the **Project API Keys** -> `anon` / `public` key.
3. Open [`js/config.js`](file:///c:/Users/TIW%20COMPUTER/Desktop/QUERY%20RESOLVER/js/config.js) and configure the defaults:
   ```javascript
   const DEFAULT_SUPABASE_URL = 'https://your-project.supabase.co';
   const DEFAULT_SUPABASE_ANON_KEY = 'your-anon-key-here';
   ```
*(Note: You can also evaluate the system locally without keys; built-in local store with demo accounts is provided out of the box).*

---

### Step 5: Test Locally
Run a local web server from this directory:
```bash
python -m http.server 8080
```
Open `http://localhost:8080` in your browser. You will be greeted by the login screen.

---

### Step 6: Deploy to Netlify
1. Push this project to GitHub.
2. In Netlify ([app.netlify.com](https://app.netlify.com)), click **"Add new site"** -> **"Import an existing project"** -> select your repository.
3. In build settings:
   - **Build command**: *(leave blank)*
   - **Publish directory**: `.`
4. Click **Deploy Site**.
*(Alternatively, drag and drop the folder directly onto [app.netlify.com/drop](https://app.netlify.com/drop)).*

---

## 🧪 Comprehensive Verification Scenarios

| Test Scenario | Verification Status |
| :--- | :--- |
| **Test 1: Admin Login** | Admin logs in -> redirected to Admin Dashboard (`/admin/index.html`). |
| **Test 2: Admin Creates User** | Admin adds user (e.g., Sarah) with role `support` via Users & Roles tab. |
| **Test 3: Support User Login** | Support user logs in -> redirected to Support Dashboard (`/app/index.html`). |
| **Test 4: Add Query & Notes** | Support user logs a query and appends multiple notes sequentially. |
| **Test 5: Note Persistence** | Notes remain in exact chronological order after page reload. |
| **Test 6: Update Query Status** | Status change from `Open` to `Temporarily Resolved` updates stats. |
| **Test 7: Audit Logging** | The status change and workaround automatically appear in the query timeline and audit log. |
| **Test 8: Role Guard** | Support user trying to access `/admin/` is denied and redirected to `/app/`. |
| **Test 9: Org Customization** | Admin updates Organization Name & System Name; updates reflect across all headers. |
| **Test 10: Dynamic Branding** | Login screen, topbars, and exports adopt the configured organization identity. |
| **Test 11: Export Data** | Admin exports Queries (CSV), Notes (CSV), Audit Logs (CSV), and Full System Backup (JSON). |
| **Test 12: Zero Key Exposure** | Only the public anon key is used on frontend; no service-role secrets exist in code. |
