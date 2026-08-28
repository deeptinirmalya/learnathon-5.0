# """
# Rate Limit Tester for HostelGrievance API
# ==========================================
# Tests the token-bucket rate limiter on the live local API.

# Endpoints tested:
#   POST /api/signup   → limit: 5 tokens, refill: 0.1/s (1 per 10s)
#   POST /api/login    → limit: 5 tokens, refill: 0.1/s (1 per 10s)

# Run with:
#     pip install requests
#     python rate_limit_test.py
# """

# import requests
# import time
# import json
# from datetime import datetime

# # ── Config ──────────────────────────────────────────────────────────────────
# BASE_URL = "http://localhost:5173/api"   # Vite proxy → Hono backend
# # BASE_URL = "http://localhost:3001/api" # Or hit backend directly

# SIGNUP_URL  = f"{BASE_URL}/signup"
# LOGIN_URL   = f"{BASE_URL}/login"
# # ─────────────────────────────────────────────────────────────────────────────


# def ts() -> str:
#     return datetime.now().strftime("%H:%M:%S.%f")[:-3]


# def print_result(i: int, method: str, url: str, resp: requests.Response):
#     status  = resp.status_code
#     emoji   = "✅" if status < 400 else ("🚫" if status == 429 else "❌")
#     try:
#         body = resp.json()
#     except Exception:
#         body = resp.text[:120]
#     print(f"  [{ts()}] #{i:02d} {emoji}  {method} {url.split('/')[-1]} → {status}  {json.dumps(body)[:100]}")


# # ── Test 1: Hammer /api/signup to trigger 429 ────────────────────────────────
# def test_signup_rate_limit(burst: int = 8):
#     print(f"\n{'═'*60}")
#     print(f"TEST 1 — Signup rate limit  (limit: 5 tokens, rapid burst of {burst})")
#     print(f"{'═'*60}")

#     for i in range(1, burst + 1):
#         payload = {
#             "name":     f"Test User {i}",
#             "email":    f"testuser{i}_{int(time.time())}@giet.edu",
#             "password": "TestPass123!",
#             "room":     f"A-{100 + i}"
#         }
#         try:
#             resp = requests.post(SIGNUP_URL, json=payload, timeout=5)
#             print_result(i, "POST", SIGNUP_URL, resp)
#         except requests.exceptions.ConnectionError:
#             print(f"  [{ts()}] #{i:02d} 🔴  Cannot connect to {SIGNUP_URL} — is the server running?")
#             return

#     # Wait and retry after refill (10s = 1 token at rate 0.1/s)
#     wait = 12
#     print(f"\n  ⏳  Waiting {wait}s for token refill...")
#     time.sleep(wait)

#     print(f"\n  Retrying after refill:")
#     payload = {
#         "name":     "Retry User",
#         "email":    f"retry_{int(time.time())}@giet.edu",
#         "password": "TestPass123!",
#         "room":     "B-200"
#     }
#     resp = requests.post(SIGNUP_URL, json=payload, timeout=5)
#     print_result(99, "POST", SIGNUP_URL, resp)


# # ── Test 2: Hammer /api/login to trigger 429 ─────────────────────────────────
# def test_login_rate_limit(burst: int = 8):
#     print(f"\n{'═'*60}")
#     print(f"TEST 2 — Login rate limit  (limit: 5 tokens, rapid burst of {burst})")
#     print(f"{'═'*60}")

#     for i in range(1, burst + 1):
#         payload = {
#             "email":    "wrong@giet.edu",
#             "password": "WrongPassword!"
#         }
#         try:
#             resp = requests.post(LOGIN_URL, json=payload, timeout=5)
#             print_result(i, "POST", LOGIN_URL, resp)
#         except requests.exceptions.ConnectionError:
#             print(f"  [{ts()}] #{i:02d} 🔴  Cannot connect to {LOGIN_URL}")
#             return


# # ── Test 3: Measure exact rate limit threshold ───────────────────────────────
# def test_exact_threshold():
#     print(f"\n{'═'*60}")
#     print("TEST 3 — Find exact 429 threshold on /api/login")
#     print(f"{'═'*60}")

#     blocked_at = None
#     for i in range(1, 15):
#         payload = {"email": "probe@giet.edu", "password": "WrongPass!"}
#         try:
#             resp = requests.post(LOGIN_URL, json=payload, timeout=5)
#             status = resp.status_code
#             if status == 429 and blocked_at is None:
#                 blocked_at = i
#             print_result(i, "POST", LOGIN_URL, resp)
#         except requests.exceptions.ConnectionError:
#             print(f"  🔴  Server not reachable")
#             return

#     if blocked_at:
#         print(f"\n  📊 Rate limit triggered at request #{blocked_at}")
#         print(f"     Expected: 6th request (5 token max burst)")
#     else:
#         print(f"\n  ⚠️  No 429 returned in 14 requests — rate limiting may not be active")


# # ── Test 4: Slow steady requests (should never be blocked) ───────────────────
# def test_slow_requests(count: int = 5, delay: float = 3.0):
#     print(f"\n{'═'*60}")
#     print(f"TEST 4 — Slow requests ({delay}s gap) — should all succeed")
#     print(f"{'═'*60}")

#     for i in range(1, count + 1):
#         payload = {"email": "slow@giet.edu", "password": "WrongPass!"}
#         try:
#             resp = requests.post(LOGIN_URL, json=payload, timeout=5)
#             print_result(i, "POST", LOGIN_URL, resp)
#         except requests.exceptions.ConnectionError:
#             print(f"  🔴  Server not reachable")
#             return
#         if i < count:
#             print(f"  ⏳  Sleeping {delay}s...")
#             time.sleep(delay)


# # ── Entry point ───────────────────────────────────────────────────────────────
# if __name__ == "__main__":
#     print("HostelGrievance — Rate Limit Test Suite")
#     print(f"Target: {BASE_URL}")
#     print(f"Time:   {ts()}")

#     test_signup_rate_limit(burst=8)
#     test_login_rate_limit(burst=8)
#     test_exact_threshold()
#     test_slow_requests(count=4, delay=3.0)

#     print(f"\n{'═'*60}")
#     print("✅  All tests complete")
#     print(f"{'═'*60}\n")
import requests

for i in range(40):
    res = requests.get("http://localhost:3001/api/public-test")
    print(res)
