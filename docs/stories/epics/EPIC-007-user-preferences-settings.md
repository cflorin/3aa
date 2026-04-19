# EPIC-007 — User Preferences & Settings

## Purpose
Enable users to configure alert preferences, UI display settings, and account settings via Settings screen. This epic delivers the final user-facing capability, completing the V1 feature set with personalized configuration options.

## Outcome
Users can:
- Configure alert preferences (enable/disable alert types: classification change, zone change, threshold breach)
- Configure UI preferences (default filters, sort orders, pagination size, theme)
- Manage account settings (change password, view account info)
- Save preferences persistently (preferences survive sign-out/sign-in)

**UI Delivered:** Screen 5 (Settings)

## Scope In
- User preferences table (user_preferences: default_filters JSONB, default_sort JSONB, pagination_size INTEGER, theme VARCHAR)
- User alert preferences management (user_alert_preferences: classification_change_enabled, zone_change_enabled, threshold_breach_enabled - already created in EPIC-006, UI added here)
- **Screen 5: Settings UI** (tabbed interface: Alert Preferences tab, UI Preferences tab, Account tab)
- Alert preferences form (checkboxes: classification change, zone change, threshold breach alerts)
- UI preferences form (dropdowns: default stock filter, default sort order, pagination size, theme)
- Account settings form (change password, display email, last login timestamp)
- Password change validation (current password verification, new password strength requirements)
- Settings API endpoints (`GET /api/settings`, `PUT /api/settings/alert-preferences`, `PUT /api/settings/ui-preferences`, `POST /api/settings/change-password`)
- Settings persistence (preferences saved to database, applied on next session)
- Default preference initialization (new users get sensible defaults: all alerts enabled, 50 rows/page, default sort by market cap desc)

## Scope Out
- Email notification settings (V2+, requires email infrastructure)
- Custom alert rules editor (V2+, user-defined thresholds)
- Multi-factor authentication settings (V2+)
- API key management (V2+)
- Data export settings (V2+)
- Theme customization beyond light/dark (V2+)
- Notification digest frequency (daily/weekly email digests, V2+)
- Alert sound/visual preferences (V2+)
- Account deletion (admin-assisted for V1)

## Dependencies
- **PRD:** Section 9B Screen 5 (Settings), Section 4 (Monitoring & Alerts - preferences)
- **RFCs:** RFC-002 (Data Model - user_preferences, user_alert_preferences)
- **ADRs:** ADR-007 (Multi-User Architecture - per-user preferences), ADR-010 (Next.js)
- **Upstream epics:** EPIC-006 (user_alert_preferences table created), EPIC-002 (authentication, password hashing)

## Inputs
- Current user session (user_id from session cookie)
- User preferences from database (user_preferences, user_alert_preferences rows)
- Settings form submissions (alert preferences, UI preferences, password change)
- Current password (for password change verification)

## Outputs
- user_preferences table populated (per-user UI preferences)
- user_alert_preferences updated (alert type toggles)
- Settings screen UI (Screen 5: tabbed interface with forms)
- Updated password_hash (if password changed)
- Settings API endpoints functional (GET, PUT for preferences, POST for password change)
- Preferences applied in UI (Universe screen uses default_filters, Alerts Feed uses pagination_size)

## Flows Covered
- **View Settings (UI):** User navigates to /settings → GET /api/settings → render Settings screen with 3 tabs (Alert Preferences, UI Preferences, Account) → populate forms with current values
- **Update alert preferences (UI):** User toggles "Classification Change Alerts" checkbox → clicks Save → PUT /api/settings/alert-preferences {classification_change_enabled: false} → UPDATE user_alert_preferences → success message → form stays on screen
- **Update UI preferences (UI):** User selects "100 rows per page" → selects "Sort by Zone (ascending)" → clicks Save → PUT /api/settings/ui-preferences {pagination_size: 100, default_sort: {field: 'zone', order: 'asc'}} → UPDATE user_preferences → success message
- **Change password (UI):** User enters current password → enters new password (min 8 chars, complexity requirements) → confirms new password → clicks Change Password → POST /api/settings/change-password → verify current password (bcrypt.compare) → hash new password (bcrypt.hash) → UPDATE users.password_hash → success message → redirect to /settings
- **Apply preferences on Universe screen:** User loads /universe → GET /api/settings → read default_filters, default_sort, pagination_size → apply as initial UI state (filter dropdowns pre-selected, sort order applied, pagination size set)
- **Apply preferences on Alerts Feed:** User loads /alerts → GET /api/settings → read pagination_size → apply to alert list pagination
- **Default preference initialization:** New user created → INSERT user_preferences with defaults (pagination_size=50, default_sort={field: 'market_cap', order: 'desc'}, theme='light') → INSERT user_alert_preferences with defaults (all alert types enabled)
- **Preference persistence:** User changes pagination to 100 → saves → signs out → signs in → loads /universe → pagination still 100 (preference persisted)

## Acceptance Criteria
- [ ] user_preferences table created (user_id PK FK, default_filters JSONB, default_sort JSONB, pagination_size INTEGER DEFAULT 50, theme VARCHAR DEFAULT 'light')
- [ ] user_alert_preferences table functional (already created in EPIC-006, UI integration added here)
- [ ] Settings screen UI functional (Screen 5: 3 tabs render correctly, forms populated with current values)
- [ ] Alert Preferences tab functional (checkboxes for 3 alert types, Save button updates database)
- [ ] UI Preferences tab functional (dropdowns for filters/sort/pagination/theme, Save button updates database)
- [ ] Account tab functional (displays email, last_login_at, change password form)
- [ ] Change password functional (current password verified, new password validated, password_hash updated)
- [ ] Password validation enforced (min 8 chars, at least 1 uppercase, 1 lowercase, 1 number, complexity requirements)
- [ ] Current password verification required (cannot change password without correct current password)
- [ ] Default preferences initialized for new users (INSERT user_preferences + user_alert_preferences on account creation)
- [ ] Preferences applied in Universe screen (default_filters, default_sort, pagination_size used as initial state)
- [ ] Preferences applied in Alerts Feed (pagination_size respected)
- [ ] Preferences persist across sessions (sign out → sign in → preferences retained)
- [ ] Settings API endpoints functional (GET /api/settings returns all preferences, PUT updates work, POST password change works)
- [ ] Invalid password change rejected (wrong current password → error, weak new password → validation error)

## Test Strategy Expectations

**Unit tests:**
- Password validation logic (min 8 chars, complexity requirements pass/fail)
- Default preference values (new user → defaults: pagination_size=50, all alerts enabled)
- Preference merge logic (user_preferences + user_alert_preferences → combined settings object)
- Password change validation (current password mismatch → error)

**Integration tests:**
- Settings GET endpoint (GET /api/settings → returns user_preferences + user_alert_preferences merged)
- Alert preferences update (PUT /api/settings/alert-preferences → user_alert_preferences updated)
- UI preferences update (PUT /api/settings/ui-preferences → user_preferences updated)
- Password change (POST /api/settings/change-password → password_hash updated, bcrypt verify succeeds with new password)
- Password change with wrong current password (POST with incorrect current_password → 401 Unauthorized)
- Password change with weak new password (POST with password='abc' → 400 Bad Request, validation error)
- Default preference initialization (create new user → user_preferences + user_alert_preferences rows exist with defaults)
- Preference persistence (update pagination_size → sign out → sign in → GET /api/settings → pagination_size retained)

**Contract/schema tests:**
- user_preferences table schema (default_filters JSONB, default_sort JSONB, pagination_size INTEGER, theme VARCHAR)
- Settings API response schema (GET /api/settings returns {alert_preferences: {...}, ui_preferences: {...}, account: {...}})
- Alert preferences request schema (PUT /api/settings/alert-preferences body: {classification_change_enabled: boolean, zone_change_enabled: boolean, threshold_breach_enabled: boolean})
- UI preferences request schema (PUT /api/settings/ui-preferences body: {pagination_size: number, default_sort: {field: string, order: 'asc'|'desc'}, theme: 'light'|'dark'})
- Password change request schema (POST /api/settings/change-password body: {current_password: string, new_password: string})

**BDD acceptance tests:**
- "Given user on Settings screen, when user disables zone change alerts and saves, then zone_change_enabled=FALSE in database"
- "Given user on Settings screen, when user changes pagination to 100 and saves, then pagination_size=100 in database"
- "Given user with pagination_size=100, when user loads Universe screen, then table shows 100 rows per page"
- "Given user on Account tab, when user changes password with correct current password, then password_hash updated and new password works for sign-in"
- "Given user on Account tab, when user changes password with wrong current password, then error message shown and password_hash unchanged"
- "Given new user account created, when user loads Settings screen, then default preferences populated (50 rows/page, all alerts enabled)"

**E2E tests:**
- Full settings workflow (navigate to /settings → change alert preferences → save → verify success → sign out → sign in → verify preferences retained)
- Password change workflow (Settings → Account tab → change password → sign out → sign in with new password → success)
- UI preferences application (Settings → change default sort to Zone ascending → save → navigate to Universe → verify sort applied)
- Alert preferences effect (Settings → disable classification change alerts → save → monitored stock classification changes → no alert generated)

## Regression / Invariant Risks

**Preference overwrite:**
- Risk: Partial update overwrites unrelated preferences
- Protection: PUT endpoints only update specified fields, tests verify other fields unchanged

**Password change bypass:**
- Risk: User changes password without current password verification
- Protection: Current password verification enforced, integration tests verify rejection

**Weak password accepted:**
- Risk: Validation bypassed, weak password stored
- Protection: Server-side validation enforced (not just client-side), tests verify weak passwords rejected

**Cross-user preference leakage:**
- Risk: User A updates preferences, User B's preferences affected
- Protection: All updates filter by user_id from session, tests verify user isolation

**Preference application failure:**
- Risk: Preferences saved but not applied in UI
- Protection: UI reads preferences from GET /api/settings on load, E2E tests verify application

**Default preference missing:**
- Risk: New user has NULL preferences, UI breaks
- Protection: Default preference initialization on account creation, tests verify defaults exist

**Invariants to protect:**
- User preferences always scoped to user_id (no cross-user access or updates)
- Password change requires current password verification (no bypass)
- New password strength enforced (min 8 chars, complexity requirements)
- Default preferences initialized for new users (user_preferences + user_alert_preferences rows exist)
- Preferences persist across sessions (sign out/sign in does not reset preferences)
- Partial preference updates preserve other fields (PUT alert preferences does not affect UI preferences)
- Preferences applied in UI (Universe, Alerts Feed respect pagination_size, default_sort, default_filters)
- Alert preferences respected by alert generation (disabled alert types not generated)

## Key Risks / Edge Cases

**Password change edge cases:**
- User forgets current password (cannot change password, admin reset required)
- User changes password while multiple sessions active (other sessions remain valid with old password? Or invalidated?)
- New password same as current password (allowed or rejected?)
- Password change during active session (session remains valid or requires re-login?)

**UI preference edge cases:**
- User sets pagination_size=1000 (performance issue, need max limit?)
- User sets invalid default_sort field (field doesn't exist, graceful fallback?)
- User sets default_filters for sector that doesn't exist anymore (stale filter, cleared on next load?)
- Theme preference 'dark' but dark theme not implemented yet (fallback to 'light'?)

**Alert preference edge cases:**
- User disables all alert types (no alerts generated, is this intentional or error?)
- User changes alert preferences while alert generation batch running (batch uses stale preferences?)
- Alert preference change retroactive? (disable zone change alerts → existing zone change alerts deleted? Or only affects new alerts?)

**Settings screen edge cases:**
- Settings screen accessed before user_preferences initialized (NULL row, form shows empty?)
- User clicks Save multiple times rapidly (race condition, duplicate UPDATEs?)
- User changes password to previous password (allowed? Password history checking out of scope for V1)
- Account tab shows last_login_at but user never logged in (last_login_at NULL, show "Never"?)

**Preference persistence edge cases:**
- User updates preferences in one browser tab, loads Universe in another tab (stale preferences cached?)
- User preferences database row deleted (graceful fallback to defaults?)
- Preference migration (V1 schema changes in V2, how to migrate user_preferences JSONB?)

## Likely Stories

- **STORY-062:** Create user_preferences table (Prisma migration)
- **STORY-063:** Implement default preference initialization (INSERT defaults on user creation)
- **STORY-064:** Implement Settings GET endpoint (merge user_preferences + user_alert_preferences)
- **STORY-065:** Implement alert preferences update endpoint (PUT /api/settings/alert-preferences)
- **STORY-066:** Implement UI preferences update endpoint (PUT /api/settings/ui-preferences)
- **STORY-067:** Implement password change endpoint (POST /api/settings/change-password with validation)
- **STORY-068:** Implement password validation logic (min 8 chars, complexity requirements)
- **STORY-069:** Build Settings screen UI (Screen 5: tabbed interface with 3 tabs)
- **STORY-070:** Build Alert Preferences tab (checkboxes for 3 alert types, Save button)
- **STORY-071:** Build UI Preferences tab (dropdowns for filters/sort/pagination/theme, Save button)
- **STORY-072:** Build Account tab (display email, last_login_at, change password form)
- **STORY-073:** Integrate preferences into Universe screen (apply default_filters, default_sort, pagination_size on load)
- **STORY-074:** Integrate preferences into Alerts Feed (apply pagination_size)
- **STORY-075:** Add settings integration tests (GET, PUT, POST endpoints, preference persistence)
- **STORY-076:** Add Settings screen E2E tests (update preferences, verify application, password change workflow)

## Definition of Done

- [ ] Implementation complete (user_preferences table, Settings API endpoints, Settings screen UI, preference application in Universe/Alerts)
- [ ] Tests added and passing (unit, integration, contract, BDD, E2E for settings and preferences)
- [ ] Regression coverage added (preference isolation, password validation, persistence, application)
- [ ] Docs updated (README settings section, Settings screen screenshot, password requirements documented)
- [ ] Telemetry/logging added (preference update events, password change events)
- [ ] Migrations included (user_preferences table committed)
- [ ] Traceability links recorded (code comments reference PRD Section 9B Screen 5)
- [ ] Default preferences validated (new user has sensible defaults: 50 rows/page, all alerts enabled, light theme)
- [ ] Preferences persist across sessions (sign out/sign in test passes)
- [ ] Preferences applied correctly (Universe screen uses default_sort, Alerts Feed uses pagination_size)
- [ ] Password change functional (validates current password, enforces strength requirements, updates password_hash)
- [ ] Settings screen accessible at /settings (renders correctly, all 3 tabs functional)

## Traceability

- **PRD:** Section 9B Screen 5 (Settings), Section 4 (Monitoring & Alerts - preferences)
- **RFC:** RFC-002 (Data Model - user_preferences, user_alert_preferences)
- **ADR:** ADR-007 (Multi-User Architecture - per-user preferences), ADR-010 (Next.js)

---

**END EPIC-007**
