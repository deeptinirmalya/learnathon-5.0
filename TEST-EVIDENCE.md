# Test Evidence & Verification Record

This document provides technical proof for all security controls and hardening changes recorded in [`HARDENING.md`](HARDENING.md), alongside a full functional regression verification checklist.

---

## Part A — Security Control Verification

### HG-AUTHZ-001: Object-Level Authorization (IDOR) on Grievance Access

```
Finding:        HG-AUTHZ-001 — IDOR on GET /api/grievances/:id
Before:         GET /api/grievances/GRV-0003 (as Student A, author is Student B) → 200 OK with full grievance body
After:          GET /api/grievances/GRV-0003 (as Student A) → 403 Forbidden, {"error":"You are not authorized to view this grievance.","code":"unauthorized"}
Method:         Automated test execution in Vitest test suite (`src/server/app.test.ts`)
Evidence File:  evidence/HG-AUTHZ-001-idor.txt
Result:         ✅ Verified Fixed
```

---

### HG-AUTHZ-002: Unauthorized Grievance Status Tampering

```
Finding:        HG-AUTHZ-002 — Unauthorized Status Modification on PATCH /api/grievances/:id
Before:         PATCH /api/grievances/GRV-0001 (as Student A) body: {"status":"Resolved"} → 200 OK
After:          PATCH /api/grievances/GRV-0001 (as Student A) → 403 Forbidden, {"error":"Students may not modify grievance status.","code":"unauthorized"}
Method:         Automated test execution (`src/server/app.test.ts: status changes work for wardens and are forbidden for students`)
Evidence File:  evidence/HG-AUTHZ-002-status-patch.txt
Result:         ✅ Verified Fixed
```

---

### HG-AUTHZ-003: Insecure Direct Object Reference on Attachment Download

```
Finding:        HG-AUTHZ-003 — IDOR on GET /api/attachments/:id
Before:         GET /api/attachments/att-1 (as Student B, owner is Student A) → 200 OK with binary payload
After:          GET /api/attachments/att-1 (as Student B) → 403 Forbidden, {"error":"You are not authorized to view this grievance.","code":"unauthorized"}
Method:         Automated test execution (`src/server/app.test.ts: attachment metadata and storage work`)
Evidence File:  evidence/HG-AUTHZ-003-attachment-idor.txt
Result:         ✅ Verified Fixed
```

---

### HG-AUTH-001: Password Hashing & Secret Leakage Prevention

```
Finding:        HG-AUTH-001 — Scrypt Password Hashing & API Hash Stripping
Before:         Unsalted / plain hash storage; potential password hash reflection on admin user list
After:          Scrypt-hashed passwords in database; GET /api/admin/users returns user entities with no password fields
Method:         Automated test execution (`src/server/admin.test.ts: lets the admin list users without leaking password hashes`)
Evidence File:  evidence/HG-AUTH-001-password-hashing.txt
Result:         ✅ Verified Fixed
```

---

### HG-AUTH-002: Session Revocation Following Logout / Credential Reset

```
Finding:        HG-AUTH-002 — JWT Invalidation on Logout & Token Version Invalidation
Before:         GET /api/me using logged-out JWT → 200 OK
After:          GET /api/me using logged-out JWT → 401 Unauthorized, {"error":"Token has been revoked/logged out","code":"unauthenticated"}
Method:         Automated test execution (`src/server/app.test.ts: current-user works after login and fails after logout`)
Evidence File:  evidence/HG-AUTH-002-session-revocation.txt
Result:         ✅ Verified Fixed
```

---

### HG-AUTH-003: Session Binding Validation (IP / User-Agent Fingerprint)

```
Finding:        HG-AUTH-003 — Session Hijack Defense via Client Fingerprint
Before:         Token intercepted and replayed with foreign IP / User-Agent → 200 OK
After:          Token replayed with mismatched IP / User-Agent → 401 Unauthorized, {"error":"Session binding violation. Please login again.","code":"unauthenticated"}
Method:         Unit & integration verification in `src/server/auth/jwt.ts`
Evidence File:  evidence/HG-AUTH-003-session-binding.txt
Result:         ✅ Verified Fixed
```

---

### HG-CSRF-001: Double-Submit CSRF Token Validation

```
Finding:        HG-CSRF-001 — Cross-Site Request Forgery on Cookie-Based Mutations
Before:         POST /api/grievances (with cookies, no CSRF token) → 201 Created
After:          POST /api/grievances (with cookies, no CSRF token) → 403 Forbidden, {"error":"CSRF token missing or invalid.","code":"forbidden"}
Method:         Automated test execution (`src/server/app.test.ts: rejects state-changing requests without a valid CSRF token`)
Evidence File:  evidence/HG-CSRF-001-csrf-validation.txt
Result:         ✅ Verified Fixed
```

---

### HG-INPUT-001: Magic-Byte MIME Detection for Uploads

```
Finding:        HG-INPUT-001 — Polyglot / Disguised Malicious File Upload
Before:         Non-image files (e.g. PHP/HTML) named with `.png` extension accepted by backend
After:          File buffer header inspected; non-image payloads rejected with 400 Bad Request ("Attachments must be a valid JPEG, PNG, GIF, or WebP image.")
Method:         Automated test execution (`src/server/app.test.ts: rejects oversized and disallowed attachments`)
Evidence File:  evidence/HG-INPUT-001-magic-bytes.txt
Result:         ✅ Verified Fixed
```

---

### HG-INPUT-002: Institutional Email Domain Validation

```
Finding:        HG-INPUT-002 — Rogue Non-Institutional Account Registration
Before:         POST /api/signup with `hacker@external.com` → 201 Created
After:          POST /api/signup with `hacker@external.com` → 400 Bad Request, {"error":"Only @giet.edu (or @example.test) email addresses are allowed."}
Method:         Integration verification in `src/server/validation/validate.ts`
Evidence File:  evidence/HG-INPUT-002-domain-validation.txt
Result:         ✅ Verified Fixed
```

---

### HG-DOS-001: Distributed Token-Bucket Rate Limiting

```
Finding:        HG-DOS-001 — Brute-Force Authentication Flooding & Layer-7 Denial of Service
Before:         Unrestricted rapid requests permitted against authentication endpoints
After:          Bursts exceeding 5 tokens throttled with 429 Too Many Requests ("Too many requests – please try again later.")
Method:         Python rate limit test harness (`rate_limit_test.py`)
Evidence File:  evidence/HG-DOS-001-rate-limiting.txt
Result:         ✅ Verified Fixed
```

---

### HG-CONF-001: Dynamic CORS & Health Monitoring

```
Finding:        HG-CONF-001 — Dynamic Allowed Origins & Database Health Probe
Before:         Static localhost CORS; missing `/api/health` orchestrator probe
After:          GET /api/health → 200 OK {"status":"healthy","database":"connected"}; preflight from untrusted origin returns no `Access-Control-Allow-Origin`
Method:         Direct HTTP request verification
Evidence File:  evidence/HG-CONF-001-cors-health.txt
Result:         ✅ Verified Fixed
```

---

## Part B — Functional Regression Verification Checklist

### Student Workflow
- [x] **Login with valid credentials**: `POST /api/login` succeeds with 200 OK, sets secure cookies.
- [x] **Create a new grievance**: `POST /api/grievances` creates ticket with `GRV-XXXX` format (201 Created).
- [x] **View own grievance list and detail**: `GET /api/grievances` returns only author's tickets; `GET /api/grievances/:id` returns 200 OK.
- [x] **Add a comment on own grievance**: `POST /api/grievances/:id/comments` appends comment (201 Created).
- [x] **Upload an allowed attachment**: `POST /api/grievances/:id/attachments` accepts valid PNG/JPEG (201 Created).
- [x] **Download own attachment**: `GET /api/attachments/:id` returns image stream (200 OK / 302 Redirect).
- [x] **Edit own open grievance**: `PATCH /api/grievances/:id` updates title/description on open tickets (200 OK).

### Warden Workflow
- [x] **Login with valid credentials**: `POST /api/login` returns Warden role and access tokens (200 OK).
- [x] **View authorized grievances**: `GET /api/grievances` returns full institutional ticket list (200 OK).
- [x] **Comment on a grievance**: `POST /api/grievances/:id/comments` records warden response (201 Created).
- [x] **Update grievance status**: `PATCH /api/grievances/:id` transitions status to "In Progress" / "Resolved" (200 OK).
- [x] **View/download authorized attachments**: `GET /api/attachments/:id` streams attachment to warden (200 OK).

### Admin Workflow
- [x] **Admin login & role routing**: Admin authenticates and accesses `/api/admin/*` endpoints (200 OK).
- [x] **List system users safely**: `GET /api/admin/users` returns all accounts without exposing password hashes (200 OK).
- [x] **Provision new warden accounts**: `POST /api/admin/wardens` generates warden credential with `@giet.edu` email (201 Created).
- [x] **Reset warden password**: `PATCH /api/admin/users/:id/password` resets credentials and invalidates active warden sessions (200 OK).
- [x] **Delete warden account**: `DELETE /api/admin/users/:id` purges warden and cascades associations (200 OK).
- [x] **Self-protection guards**: Admin cannot delete own account or reset own password via user endpoint (403 Forbidden).

### Cross-Cutting & Automated Test Suite
- [x] **Direct API execution**: All workflows verified via direct HTTP API calls bypassing the frontend UI.
- [x] **TypeScript & Svelte Diagnostics**: `npm run typecheck` passes with **0 errors and 0 warnings** ([`evidence/typecheck-run.txt`](evidence/typecheck-run.txt)).
- [x] **Automated Test Suite**: Vitest test run completes **23/23 tests passing (100%)** across `src/server/app.test.ts` and `src/server/admin.test.ts` ([`evidence/vitest-full-run.txt`](evidence/vitest-full-run.txt)).
