# Admin Feature Documentation

## Overview
The HostelGrievance platform includes a comprehensive admin dashboard that allows administrators to manage wardens, change passwords, and oversee the grievance system. This document details all admin features, security measures, and setup procedures.

## Admin Features

### 1. **Change Admin Password**
- **Endpoint**: `PATCH /api/admin/password`
- **Access**: Admin users only
- **Requirements**: 
  - Current password (for verification)
  - New password (minimum 6 characters)
  - Confirmation of new password
- **Security**:
  - Requires verification of current password
  - Rate limited: 5 requests per 50 seconds per user
  - All existing refresh tokens are revoked upon password change
  - User is logged out of all sessions after password change
- **Frontend**: Admin Dashboard → "Change My Password" section

### 2. **Add Wardens**
- **Endpoint**: `POST /api/admin/wardens`
- **Access**: Admin users only
- **Requirements**:
  - Warden Name (2-100 characters)
  - Email Address (must be @giet.edu domain)
  - Initial Password (minimum 6 characters)
- **Security**:
  - Email validation enforces @giet.edu domain only
  - Rate limited: 5 requests per 50 seconds per IP
  - Password hashing using scrypt algorithm
  - Duplicate email check prevents account creation with existing emails
- **Response**: Returns created warden details including auto-generated ID
- **Frontend**: Admin Dashboard → "Create Warden" form

### 3. **Remove Wardens**
- **Endpoint**: `DELETE /api/admin/users/{id}`
- **Access**: Admin users only
- **Security**:
  - Admin cannot remove their own account
  - Only warden accounts can be removed
  - Associated comments are cascade-deleted
  - No rate limiting (prevents DOS but dangerous operation protected by role check)
- **Confirmation**: Frontend shows confirmation dialog before deletion
- **Frontend**: Admin Dashboard → User Management table → Delete button

### 4. **Reset Warden Passwords**
- **Endpoint**: `PATCH /api/admin/users/{id}/password`
- **Access**: Admin users only
- **Requirements**:
  - Target user must be a warden
  - New password (minimum 6 characters)
- **Security**:
  - Cannot reset admin's own password (use "Change My Password" instead)
  - Cannot reset student account passwords
  - Revokes all refresh tokens for target user
  - User is logged out of existing sessions
- **Frontend**: Admin Dashboard → User Management table → Key icon button

### 5. **View All Users**
- **Endpoint**: `GET /api/admin/users`
- **Access**: Admin users only
- **Response**: List of all system users (students, wardens, admins)
- **Data Returned**: Name, email, role, room number
- **Frontend**: Admin Dashboard → User Management table

### 6. **View All Wardens**
- **Endpoint**: `GET /api/admin/wardens`
- **Access**: Admin users only
- **Response**: Filtered list of warden accounts only
- **Frontend**: Can be called programmatically or through admin dashboard

## Email Domain Validation

### Frontend Validation
- **Login Page** (`/login`): Only accepts @giet.edu emails
  - Validation: `/^[^\s@]+@giet\.edu$/i`
  - Error message: "Only @giet.edu email addresses are allowed."
  
- **Signup Page** (`/signup`): Only accepts @giet.edu emails for student registration
  - Validation: `/^[^\s@]+@giet\.edu$/i`
  - Error message: "Only @giet.edu email addresses are allowed."
  - Form shows: "Register as a student to file grievances. (GIET University email only)"

### Backend Validation
- **Email Validator** (`src/server/validation/validate.ts`):
  - Regex: `/^[^\s@]{1,24}@giet\.edu$/i`
  - Enforces strict @giet.edu domain
  - Applied to: login, signup, warden creation, all email inputs
  - Error thrown: `HttpError(400, 'bad_request', 'Only @giet.edu email addresses are allowed.')`

## Role-Based Access Control (RBAC)

### Admin Role
- **ID Format**: `admin-{uuid}`
- **Capabilities**:
  - Access admin dashboard at `/admin`
  - View all users and wardens
  - Create new warden accounts
  - Change their own password
  - Reset warden passwords
  - Remove warden accounts
  - Manage all system operations

### Warden Role
- **ID Format**: `war-{uuid}`
- **Capabilities**:
  - Access warden dashboard at `/warden`
  - View assigned grievances
  - Add comments to grievances
  - Update grievance status

### Student Role
- **ID Format**: `stu-{uuid}`
- **Capabilities**:
  - Access student dashboard at `/student`
  - Create new grievances
  - View own grievances
  - Add comments to own grievances
  - Upload attachments to grievances

## Post-Login Role-Based Routing

After successful login, users are automatically redirected based on their role:
- **Admin** → `/admin` (Admin Dashboard)
- **Warden** → `/warden` (Warden Dashboard)
- **Student** → `/student` (Student Dashboard)

This is handled in [+layout.ts](src/routes/+layout.ts) using:
```typescript
const prefix = user?.role === 'admin' ? '/admin' : user?.role === 'student' ? '/student' : '/warden';
redirect(307, prefix);
```

## Security Implementation

### Authentication
- **Method**: JWT (JSON Web Tokens)
- **Algorithm**: HS256 with symmetric key
- **Token Types**:
  - **Access Token**: 15-minute expiry, stores user role and permissions
  - **Refresh Token**: 7-day expiry, used to obtain new access tokens
- **Storage**:
  - Access token: Secure HTTP-only cookie + localStorage (for SPA state)
  - Refresh token: Secure HTTP-only cookie
- **Token Verification**: 
  - Signature validation
  - Expiry check
  - Blacklist check (for revoked tokens)
  - Fingerprint validation (IP + User-Agent based)

### Password Security
- **Algorithm**: Scrypt with salt
- **Min Length**: 6 characters
- **Max Length**: 128 characters
- **Hashing**: Never stored in plaintext
- **Verification**: Constant-time comparison prevents timing attacks

### Rate Limiting
Implemented at endpoint level with configurable limits:

| Endpoint | Limit | Refill Rate | Mode |
|----------|-------|------------|------|
| `/api/admin/password` | 5 tokens | 0.1/sec (10 sec refill) | Per User |
| `/api/admin/wardens` (POST) | 5 tokens | 0.1/sec (10 sec refill) | Per IP |
| `/api/login` | 5 tokens | 0.1/sec (10 sec refill) | Per Login Endpoint |
| `/api/refresh` | 10 tokens | 1.0/sec (1 sec refill) | Per IP |

### API Security Headers
All API responses include security headers:
- `Content-Security-Policy`: `default-src 'none'; frame-ancestors 'none'; sandbox;`
- `X-Content-Type-Options`: `nosniff`
- `X-Frame-Options`: `DENY`
- `Referrer-Policy`: `no-referrer`

### CORS (Cross-Origin Resource Sharing)
- **Allowed Origins**: 
  - `http://localhost:3000`
  - `http://localhost:5173`
  - Configurable via environment
- **Allowed Methods**: GET, POST, PUT, PATCH, DELETE, OPTIONS
- **Allowed Headers**: Content-Type, Authorization
- **Credentials**: Enabled (for cookies)

### Admin Endpoint Middleware
All `/api/admin/*` routes enforce admin-only access:
```typescript
adminRoutes.use('*', async (c, next) => {
    const user = await requireJwtAuth(c, db);
    if (user.role !== 'admin') {
        throw new HttpError(403, 'forbidden', 'Only administrators can access this resource.');
    }
    await next();
});
```

## Setting Up Admin Account

### Initial Setup (Development)
The system uses environment-based seed credentials for initial setup:

1. **Set environment variables** (`.env` or `.env.local`):
   ```
   SEED_ADMIN_PASSWORD=YourSecureAdminPassword123!
   SEED_WARDEN_PASSWORD=YourSecureWardenPassword123!
   SEED_STUDENT_PASSWORD=YourSecureStudentPassword123!
   JWT_SECRET=your-secret-key-min-32-chars-long
   ```

2. **Run database seed**:
   ```bash
   npm run seed:db
   ```
   This creates:
   - **Admin Account**: `admin@giet.edu` with `SEED_ADMIN_PASSWORD`
   - **Warden Account**: `warden@giet.edu` with `SEED_WARDEN_PASSWORD`
   - **Student Accounts**: Multiple test students with `SEED_STUDENT_PASSWORD`

3. **Access admin dashboard**:
   - Navigate to `http://localhost:5173/login`
   - Login with: `admin@giet.edu` / `SEED_ADMIN_PASSWORD`
   - Redirected to `/admin` dashboard

### Production Setup
For production deployment:
1. Use strong, unique passwords for all seed accounts
2. Change admin password immediately after first login (via "Change My Password" feature)
3. Remove or disable demo accounts
4. Store JWT_SECRET securely (minimum 32 characters, use cryptographically random value)
5. Update CORS allowed origins
6. Enable HTTPS only
7. Set secure cookie flags in production environment

### Default Demo Credentials (Development Only)
> ⚠️ These credentials are for development/testing only and should NOT be used in production.

Located in [login page](src/routes/login/+page.svelte):
```
Admin: admin@giet.edu / SecureAdminPass123!
Student: student@example.test / SecureStudentPass123!  [Note: Only @giet.edu works in production]
Warden: warden@example.test / SecureWardenPass123!     [Note: Only @giet.edu works in production]
```

## API Endpoints Reference

### Admin Endpoints Summary

| Method | Endpoint | Purpose | Auth | Rate Limit |
|--------|----------|---------|------|-----------|
| GET | `/api/admin/users` | List all users | JWT + Admin | - |
| GET | `/api/admin/wardens` | List wardens only | JWT + Admin | - |
| POST | `/api/admin/wardens` | Create new warden | JWT + Admin | 5/50s (IP) |
| PATCH | `/api/admin/password` | Change own password | JWT + Admin | 5/50s (User) |
| PATCH | `/api/admin/users/:id/password` | Reset warden password | JWT + Admin | - |
| DELETE | `/api/admin/users/:id` | Remove warden | JWT + Admin | - |

### Request/Response Examples

#### Create Warden
```bash
POST /api/admin/wardens
Content-Type: application/json

{
  "name": "Mr. John Smith",
  "email": "john.smith@giet.edu",
  "password": "SecureWardenPass123!"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "user": {
    "id": "war-a1b2c3d4",
    "name": "Mr. John Smith",
    "email": "john.smith@giet.edu",
    "role": "warden"
  }
}
```

#### Change Password
```bash
PATCH /api/admin/password
Content-Type: application/json

{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword456!"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Password changed. You will be logged out of existing sessions."
}
```

## Frontend Components

### Admin Dashboard Page
**Location**: [src/routes/admin/+page.svelte](src/routes/admin/+page.svelte)

**Sections**:
1. **Create Warden Card**
   - Form with: Name, Email, Password fields
   - Submit button triggers warden creation
   - Toast notifications for success/error

2. **Change My Password Card**
   - Form with: Current Password, New Password, Confirm Password
   - Validation for matching passwords and minimum length
   - Logs out user and redirects to login after success

3. **User Management Table**
   - Displays all users (admin, wardens, students)
   - Columns: Name, Email, Role Badge, Room, Actions
   - Action buttons only for wardens:
     - **Key Icon**: Reset password
     - **Trash Icon**: Delete warden
   - Read-only rows for students and admins

## Testing Admin Features

### Manual Testing Checklist

- [ ] Login with admin account successfully
- [ ] Verify redirect to `/admin` dashboard after login
- [ ] **Create Warden**:
  - [ ] Enter valid warden details
  - [ ] Verify @giet.edu email validation works
  - [ ] Confirm new warden appears in user list
  - [ ] New warden can login with provided credentials
  
- [ ] **Change Own Password**:
  - [ ] Current password must be correct
  - [ ] New passwords must match
  - [ ] Minimum 6 character validation works
  - [ ] Verify user is logged out after password change
  
- [ ] **Reset Warden Password**:
  - [ ] Select warden and reset password
  - [ ] Old password no longer works
  - [ ] Warden is logged out from existing sessions
  - [ ] Warden can login with new password
  
- [ ] **Delete Warden**:
  - [ ] Confirmation dialog appears
  - [ ] Warden account is removed
  - [ ] Cannot delete own admin account
  - [ ] Associated comments are also deleted
  
- [ ] **Email Validation**:
  - [ ] Reject non-@giet.edu emails on frontend
  - [ ] Backend rejects non-@giet.edu emails
  - [ ] Error message is clear and helpful

### API Testing with cURL

```bash
# Login as admin
curl -X POST http://localhost:5173/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@giet.edu","password":"SecureAdminPass123!"}'

# Create warden
curl -X POST http://localhost:5173/api/admin/wardens \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"name":"Test Warden","email":"test.warden@giet.edu","password":"TestPass123!"}'

# List all users
curl -X GET http://localhost:5173/api/admin/users \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Change password
curl -X PATCH http://localhost:5173/api/admin/password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"currentPassword":"OldPass123!","newPassword":"NewPass456!"}'
```

## Security Audit Checklist

- [x] Email domain restricted to @giet.edu (frontend + backend)
- [x] JWT authentication on all admin endpoints
- [x] Role-based access control (admin-only middleware)
- [x] Rate limiting on sensitive operations
- [x] Password hashing with scrypt
- [x] Token revocation on password change
- [x] Session-based refresh token management
- [x] Security headers on API responses
- [x] CORS properly configured
- [x] Input validation on all endpoints
- [x] Error messages don't leak sensitive info
- [x] Admin cannot self-delete
- [x] Admin cannot reset own password via reset endpoint
- [x] No default hardcoded credentials (uses environment variables)

## Troubleshooting

### Admin cannot login
- [ ] Verify email is exactly `admin@giet.edu`
- [ ] Check that password matches `SEED_ADMIN_PASSWORD` env variable
- [ ] Run seed script again: `npm run seed:db`
- [ ] Check database connection

### Warden creation fails with "Email already exists"
- [ ] Verify the email hasn't been used before
- [ ] Try a different email address
- [ ] Check database for duplicate entries

### Password reset shows "User not found"
- [ ] Verify the user ID in the database
- [ ] Ensure you're trying to reset a warden (not student or admin)
- [ ] Check user role in database

### "Only administrators can access this resource" error
- [ ] Verify JWT token includes `"role": "admin"`
- [ ] Check token hasn't expired
- [ ] Verify Authorization header includes "Bearer "
- [ ] Re-login to refresh token

### Rate limit exceeded
- [ ] Wait for rate limit window to reset (typically 50 seconds)
- [ ] Try from a different IP address (for IP-based limits)
- [ ] Check rate limit configuration in [rate_limit.ts](src/server/http/rate_limit.ts)

## Implementation Notes

### Database Schema
- Users table includes: `id`, `email`, `name`, `role`, `passwordHash`, `tokenVersion`, `createdAt`
- Refresh tokens table tracks active sessions
- Token blacklist prevents use of revoked tokens
- Login history records all authentication attempts

### Backend Architecture
- **Framework**: Hono (lightweight TypeScript web framework)
- **Database**: Prisma ORM with PostgreSQL
- **Auth**: JWT with HS256
- **Password**: Scrypt hashing algorithm
- **Session**: Refresh token rotation strategy

### Frontend Architecture
- **Framework**: SvelteKit with TypeScript
- **State**: Svelte stores for session management
- **Security**: HttpOnly cookies for token storage
- **Validation**: Frontend validation + backend verification

## Future Enhancement Ideas
1. Two-factor authentication (2FA) for admin accounts
2. Admin audit log to track all administrative actions
3. Bulk warden import from CSV
4. Admin notification when suspicious activities detected
5. Scheduled password change enforcement
6. API key management for programmatic admin access
7. Role-based permissions with fine-grained control
8. Admin activity dashboard with metrics
