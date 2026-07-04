# cucu server

The cucu API. Verifies Supabase-issued auth tokens and owns the data. Deployed on Railway.

- **Stack:** Node.js + TypeScript + Express, run with `tsx` (no build step).
- **Auth model:** Supabase Auth issues the session JWT (Apple / Google). The app sends it as
  `Authorization: Bearer <jwt>`; this server validates it via `supabase.auth.getUser()` and
  reads/writes Postgres with the service-role key.

## Endpoints

| Method | Path      | Auth | Description |
|--------|-----------|------|-------------|
| GET    | `/health` | no   | Liveness probe → `{ ok: true }` |
| GET    | `/me`     | yes  | Ensures the account row exists; returns `{ id, email, hasProfile }` |

## Local development

```bash
cd server
cp .env.example .env       # fill in your Supabase values
npm install
npm run dev                # http://localhost:8080
```

Smoke test:

```bash
curl localhost:8080/health
# {"ok":true}

curl localhost:8080/me -H "Authorization: Bearer <a-supabase-access-token>"
# {"id":"...","email":"...","hasProfile":false}
```

Get a token for manual testing from the app (log it after sign-in) or the Supabase dashboard.

## Deploy to Railway

1. New project → Deploy from this repo → set **Root Directory** to `server`.
2. Add variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
   (`PORT` is injected by Railway.)
3. Deploy. Nixpacks runs `npm install` then `npm start`.
4. Copy the public URL into the iOS app's `API_BASE_URL` (see `Secrets.xcconfig`).

## Environment

See `.env.example`. The service-role key is server-only and must never ship in the app.
