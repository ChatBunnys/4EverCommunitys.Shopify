# 18+ Streaming-Only Platform (MVP)

This repository contains an adults-only (18+) streaming-only MVP with server-verified age gating, account authentication, and entitlement-checked playback.

## Product assumptions used

- **Preferred stack:** Express backend + Vanilla JS frontend (MVP starter)
- **Monetization model:** Hybrid **Subscription + PPV**
- **Target region:** **United States** baseline compliance assumptions

## Backend upgrades in this step

- Password hashing upgraded from simple hash to `pbkdf2` with per-user salt.
- Session tokens now include TTL-based expiry checks.
- Added lightweight auth-route rate limiting for register/login endpoints.
- Added per-user audit event logging and a `GET /api/audit/me` endpoint for recent account events.
- User/subscription/purchase data now persists to `data/store.json`.
- Added automated API tests (`node --test`) for auth, entitlement checks, and session expiry.

## Features implemented

- Signed HttpOnly age-verification cookie via `POST /api/age-verify`
- Auth endpoints:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- Subscription endpoint: `POST /api/subscriptions/activate`
- PPV endpoint: `POST /api/purchase-ppv`
- Playback entitlement enforcement on `GET /api/streams/:id/playback`

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## API (summary)

- Public-ish: `GET /api/health`, `GET /api/config`, `POST /api/age-verify`
- Requires age + auth: `GET /api/streams`, `GET /api/streams/:id/playback`, `GET /api/subscription-plans`, `POST /api/subscriptions/activate`, `POST /api/purchase-ppv`, `GET /api/auth/me`, `GET /api/audit/me`

## Testing

```bash
npm run check
npm test
```

## Compliance note

This is still a starter. Before production, add:

- Third-party age/KYC verification provider integration
- Real payment processor and webhook verification
- A production database and migrations
- Consent/audit logs and legal review for launch jurisdictions
