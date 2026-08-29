# Security Policy & Posture Statement

## Current Security Posture

The **HostelGrievance** application is **safe to deploy with standard operational conditions**. All core access control, authentication, input validation, and denial-of-service protections have been hardened and verified against regression. All critical attack vectors—including horizontal privilege escalation (IDOR), unauthorized grievance state modification, attachment exfiltration, session hijacking, cross-site request forgery (CSRF), and MIME polyglot uploads—are mitigated at the server and proxy layers.

---

## Major Improvements Made

- **Object-Level Authorization (IDOR)**: Enforced strict ownership verification (`assertCanViewGrievance`) across all grievance retrieval, modification, comment, and attachment endpoints.
- **Role-Based Access Control (RBAC)**: Restricted grievance status transitions exclusively to Wardens/Admins, and secured admin user provisioning (`/api/admin/*`) with server-side role validation.
- **Dual-Token Session Architecture**: Implemented 15-minute JWT access tokens and 7-day rotating refresh tokens with database-backed JTI blacklisting and global token version invalidation.
- **Session Binding**: Bound JWT access tokens to client IP and User-Agent fingerprints (SHA-256) to block replay of stolen tokens across different networks or browsers.
- **Double-Submit CSRF Defense**: Enforced cryptographic CSRF token validation on all state-changing HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) authenticated via cookies.
- **Magic-Byte Upload Validation**: Integrated file header byte inspection (JPEG, PNG, GIF, WebP) and 2 MB size bounds, preventing executable polyglot uploads.
- **Multi-Tier Rate Limiting**: Deployed token-bucket rate limiting via Redis (with in-memory fallback) and Nginx proxy limits (10 req/s API, 30 req/s global) on authentication and mutation routes.
- **Cryptographic Password Security**: Upgraded password storage to salted `scrypt` key derivation, preventing credential recovery via rainbow tables or GPU cracking.
- **Institutional Domain Restriction**: Enforced `@giet.edu` email validation on signup, login, and warden provisioning.
- **Security Headers & Health Probing**: Hardened responses with strict CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and added an active `/api/health` database probe.

---

## Assumptions

1. **TLS Termination**: Production deployment runs behind an HTTPS reverse proxy (e.g., Nginx, Cloudflare) terminating TLS 1.2/1.3 with valid SSL certificates.
2. **Secrets Isolation**: Environment variables (`JWT_SECRET`, `SEED_ADMIN_PASSWORD`, `DATABASE_URL`, `CLOUDINARY_*`) are securely managed and never committed to source control.
3. **Proxy Header Trust**: The reverse proxy accurately sets `X-Forwarded-For` and `X-Real-IP` headers, and untrusted direct client IP spoofing is prevented at the firewall layer.
4. **Database & Storage Isolation**: The PostgreSQL database and Redis instances are deployed on a private virtual network not directly accessible from the public internet.

---

## Residual Risks

1. **Upstream Framework Dependencies**: 9 low/high severity advisories exist in build-time devDependencies (`@sveltejs/kit` cookie parsing and `@prisma/config` deepmerge-ts). These do not run in production runtime artifacts and will be resolved as upstream package maintainers release new major versions.
2. **WAN Database Latency**: Interactive transaction timeouts require explicit configuration when communicating with serverless remote PostgreSQL providers (e.g., Neon) over high-latency WAN connections.
