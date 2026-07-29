## MFA Rollout Plan — SecureAuth

A cybersecurity capstone demo app: enterprise-style landing page, real TOTP-based MFA auth, user dashboard, admin console, recovery, logging, and reports. Backed by Lovable Cloud (database, auth, server logic) with seeded demo data.

### Design direction
- Dark-first enterprise security aesthetic: deep navy/slate backgrounds, blue→cyan gradients, glassmorphism cards, subtle glow borders, restrained motion (fade/slide on scroll, animated stat counters).
- Semantic design tokens in `src/styles.css`; light/dark toggle with dark as default.

### Pages / routes
- `/` — landing: hero, MFA value props, rollout-plan timeline, architecture/security highlights, CTA to sign in. Public, SEO metadata.
- `/auth` — multi-step: sign up (email, name, password strength meter with rules) → mandatory TOTP enrollment (QR code + manual secret, verify 6-digit code) → backup codes shown once. Sign in: password → TOTP code (or backup code).
- `/dashboard` — security score gauge, MFA status, recent logins chart (7/30 day), device list, latest auth events.
- `/profile` — update name/details, change password, manage authenticator devices (re-enroll/remove), regenerate backup codes.
- `/admin` — user table (search, filter, MFA status, lockout state), toggle security features (MFA required, lockout threshold, session timeout), failed-login feed, lockout monitor with unlock/reset actions, admin audit log.
- `/reports` — security summary + authentication summary, date range filters, export CSV and printable PDF.

Admin routes are role-gated; non-admins are redirected.

### Backend (Lovable Cloud)
Tables: `profiles`, `user_roles` (separate table, enum admin/user, `has_role()` security-definer), `mfa_factors` (encrypted TOTP secret, confirmed_at), `backup_codes` (hashed, single-use), `auth_events` (type, success, ip, user agent, device, city), `login_attempts` / lockouts, `security_settings` (singleton policy row), `admin_actions`.

- RLS on every table: users read only their own rows; admins via `has_role()`; explicit GRANTs per table.
- TOTP secret generation, QR provisioning URI, code verification, backup-code hashing/consumption, lockout enforcement, and event logging all run in server functions — never client-side.
- Seed migration inserts ~25 mock users, 90 days of auth events, failed attempts, lockouts, and admin logs so every chart and table is populated on first load.

### Security notes
- TOTP verify is server-side with time-window tolerance and replay protection; backup codes stored hashed.
- Lockout after N failed attempts (policy-driven), with admin unlock and audit trail.
- Roles never stored on profiles; all privileged checks server-side.

### Build order
1. Enable Lovable Cloud; schema + RLS + seed migration.
2. Design system tokens + landing page.
3. Auth flow (signup, password rules, TOTP enrollment/verify, backup codes, login).
4. User dashboard + profile.
5. Admin console + policy toggles.
6. Reports and exports.

### Caveat
Demo accounts seeded in the database will have realistic activity history, but their TOTP secrets are demo-only — sign-in as a seeded user requires an admin reset or fresh enrollment. Your own registered account exercises the full real flow.
