# Homesqre Auth Testing Playbook

## Auth Modes
1. JWT email/password auth (cookie-based + Bearer fallback)
2. Emergent Google OAuth (cookie-based session_token)
3. Mock mobile OTP verification on registration

## Test Credentials (seeded on startup)
- admin@homesqre.com / Homesqre@2026 (admin)
- agent@homesqre.com / Agent@2026 (agent)
- builder@homesqre.com / Builder@2026 (builder)
- customer@homesqre.com / Customer@2026 (customer)

## API Tests
```bash
# Login
curl -c cookies.txt -X POST $URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@homesqre.com","password":"Homesqre@2026"}'

# Me
curl -b cookies.txt $URL/api/auth/me

# Logout
curl -b cookies.txt -X POST $URL/api/auth/logout
```

## Browser tests
- Set cookie `access_token=<JWT>` (httpOnly, path=/) and navigate to /dashboard
- For Google OAuth: cookie `session_token=<token>` with same flags

## Notes
- Mock OTP returns 6-digit code in response body as `dev_otp` field — accept any 6-digit during verify.
- Users have `is_verified` boolean; can be skipped during dev.
