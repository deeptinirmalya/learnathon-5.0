# 🏢 HostelGrievance — University Hostel Grievance Management System

A production-hardened, full-stack grievance tracking platform built for university hostels. Students can report hostel maintenance issues, upload photographic evidence, track grievance lifecycles, and communicate directly with hostel wardens in a secure, role-isolated environment.

---

## 🚀 Technology Stack

- **Frontend**: [SvelteKit 5](https://svelte.dev/) (Runes Mode), [TailwindCSS v4](https://tailwindcss.com/), [Lucide Svelte Icons](https://lucide.dev/)
- **Backend API**: [Hono](https://hono.dev/) on Node.js
- **Database & ORM**: PostgreSQL ([Neon Database](https://neon.tech/)) with [Prisma ORM](https://www.prisma.io/)
- **Caching & Rate Limiting**: [Redis](https://redis.io/) with Lua-based Token Bucket limiter
- **Media Storage**: [Cloudinary](https://cloudinary.com/) (with Magic-Byte MIME verification)
- **Reverse Proxy**: [Nginx](https://nginx.org/) with Layer-7 DDoS protection zones and real-IP propagation
- **Observability**: [Prometheus](https://prometheus.io/) (Metrics collector) & [Grafana](https://grafana.com/) (Live dashboards)

---

## 👥 Role-Based Portals & Features

| Role | Features & Permissions |
| :--- | :--- |
| **🎓 Student** | • File grievances with categories (*Water, Electricity, Internet, Cleanliness, Room, Mess*)<br>• Upload photographic evidence (JPEG/PNG/GIF/WebP capped at 2MB)<br>• Edit details on own open grievances<br>• Comment on own grievance timeline<br>• View real-time status updates (*Open ➔ In Progress ➔ Resolved*) |
| **🛡️ Warden** | • View all institutional hostel grievances<br>• Transition ticket lifecycle statuses (*Open*, *In Progress*, *Resolved*)<br>• Post official status updates & contractor notes on grievances<br>• Securely view and download student attachments |
| **👑 Admin** | • Complete user directory overview with zero credential leakage<br>• Provision new warden accounts (`@giet.edu` domain enforcement)<br>• Reset warden passwords and invalidate active compromised sessions<br>• Purge decommissioned warden accounts (with self-deletion protection)<br>• Change administrative passwords |

---

## 🔑 Demo Accounts & Login Credentials

All seeded test accounts come pre-configured in the database:

| Role | Email Address | Password | Description / Assigned Room |
| :--- | :--- | :--- | :--- |
| **👑 Admin** | `admin@giet.edu` | `SecureAdminPass123!` | System Administrator Dashboard |
| **🛡️ Warden** | `warden@giet.edu` | `warden@123` | Chief Hostel Warden (Mr. K. Sahu) |
| **🎓 Student** | `student@giet.edu` | `student@123` | Aarav Mehta (Room B-204) |

> **Note**: In development mode with default `.env` fallback passwords, accounts also accept `admin123`, `warden123`, and `student123`.

---

## ⚡ How to Start the Project

### Option A: Docker Compose (Full Production Stack with Grafana) — Recommended

Start the entire application stack including Nginx, Backend API, SvelteKit Frontend, Redis, Prometheus, and Grafana in a single command:

```bash
docker compose up -d --build
```

#### 🌐 Public Browser Access:

| Service | Public URL | Credentials / Access Notes |
| :--- | :--- | :--- |
| **🏢 Main Web Application** | **`http://localhost`** *(Port 80)* | Complete Web UI + API served via Nginx Reverse Proxy. |
| **📊 Grafana Dashboard** | **`http://localhost:3002`** | Live metrics, latency, CPU/Memory charts.<br>**Username:** `admin` \| **Password:** `SecureGrafanaPass123!` *(or `admin`)*<br>*Path:* **Dashboards ➔ Observability ➔ HostelGrievance Production Observability** |

#### 🔒 Internal Docker Network Ports (Private & Isolated):

| Internal Service | Container Port | Connected To | Security & Isolation Status |
| :--- | :--- | :--- | :--- |
| **`frontend`** (SvelteKit SSR) | `3000` | Proxied by `nginx` | Private (Accessible via Port 80) |
| **`backend`** (Hono Node.js API) | `3001` | Proxied by `nginx` & `prometheus` | Private (API reachable via Port 80 `/api/`) |
| **`redis`** (Redis 7) | `6379` | Connected to `backend` | Private (No public port binding; internal cache) |
| **`prometheus`** (Metrics Scraper) | `9090` | Queried by `grafana` | Private (Hidden from public internet; zero open host ports) |
| **`api/metrics`** (Raw Metrics) | `3001/api/metrics` | Scraped by `prometheus` | Protected (Blocked with `403 Forbidden` by Nginx for external visitors) |

---

### Option B: Local Development Mode

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Seed / Reset the Database
```bash
npm run db:reset
```
*Populates PostgreSQL with 3 students, 2 wardens, 2 admins, 8 grievances, 10 comments, and sample image attachments.*

#### 3. Run Frontend & API Concurrently
```bash
npm run dev:all
```
- **Frontend UI**: `http://localhost:5173`
- **Hono Backend API**: `http://127.0.0.1:3001`
*(Vite automatically proxies all `/api/*` traffic to port 3001).*

---

## 🧪 Testing & Verification

Run automated test suites and compiler checks to verify system integrity:

```bash
# 1. Typecheck TypeScript & Svelte files (0 errors, 0 warnings)
npm run typecheck

# 2. Run full automated Vitest test suite (23/23 tests passing)
npm test

# 3. Production bundle build verification
npm run build
```

---

## 🛡️ Security Architecture & Documentation

The application implements defense-in-depth security across proxy, application, and database layers:

- **IDOR Protection**: Strict object-level ownership validation (`assertCanViewGrievance`) prevents students from accessing or tampering with other students' grievances and photos.
- **Authentication**: Dual-token JWT (15-min access tokens, 7-day refresh token rotation) with database-backed JTI blacklisting on logout and `User.tokenVersion` invalidation.
- **Session Binding**: Tokens are bound to client IP + User-Agent fingerprints (`SHA-256`) to block replay attacks across networks.
- **CSRF Defense**: Double-submit cryptographic `X-CSRF-Token` validation on all state-changing HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`).
- **File Upload Security**: Magic-byte inspection (`detectMimeFromBytes`) validates actual file headers (JPEG, PNG, GIF, WebP) and enforces a 2MB size cap.
- **Rate Limiting**: Distributed Redis token-bucket limiter (5 requests burst / 0.1s refill) combined with Nginx edge rate-limiting zones (`10r/s` API, `30r/s` site).
- **Password Security**: Salted `scrypt` key derivation with constant-time verification.

### Detailed Security Deliverables:
- 📄 [`SECURITY.md`](SECURITY.md) — Security posture statement, assumptions, and residual risk analysis.
- 📄 [`THREAT-MODEL.md`](THREAT-MODEL.md) — Asset registry, threat actors, trust boundary matrix, and 5 key attack paths.
- 📄 [`HARDENING.md`](HARDENING.md) — 12-point vulnerability remediation log cross-referenced to evidence.
- 📄 [`TEST-EVIDENCE.md`](TEST-EVIDENCE.md) — Empirical before/after request-response captures and functional regression verification.
