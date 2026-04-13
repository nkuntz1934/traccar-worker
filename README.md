# traccar-worker

Traccar-compatible GPS tracking server running on Cloudflare Workers. Uses the official [traccar-web](https://github.com/traccar/traccar-web) React frontend and implements the Traccar REST API + OsmAnd HTTP ingestion protocol.

## Stack

- **Cloudflare Workers** — API backend + request routing
- **Workers Static Assets** — serves the traccar-web React SPA
- **D1** — SQLite database (devices, positions, users, sessions, geofences)
- **Durable Objects** — WebSocket hub with hibernation for real-time position updates

## Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- Cloudflare account with Workers, D1, and Durable Objects enabled
- `wrangler login` completed

## Setup

### 1. Create D1 database

```bash
npx wrangler d1 create traccar-db
```

Copy the `database_id` from the output into `wrangler.jsonc`.

### 2. Update `wrangler.jsonc`

Set your `account_id` and the `database_id` from step 1. Update the custom domain in `routes` to match your domain.

### 3. Initialize schema

```bash
npx wrangler d1 execute traccar-db --remote --file=schema.sql
```

### 4. Build frontend

```bash
npm install
bash build-frontend.sh
```

This clones [traccar/traccar-web](https://github.com/traccar/traccar-web), builds it, and copies the output to `frontend/build/`.

### 5. Deploy

```bash
npx wrangler deploy
```

## Default credentials

- **Email:** `admin@example.com` (change in `schema.sql` before init)
- **Password:** `admin`

Change the password after first login.

## GPS device ingestion

Devices send position data via the OsmAnd HTTP protocol to the `/ingest` endpoint.

### Traccar Client app (iOS/Android)

Set **Server URL** to:

```
https://your-domain.example/ingest
```

### curl

```bash
curl "https://your-domain.example/ingest?id=DEVICE1&lat=38.89&lon=-77.03&timestamp=$(date +%s)&speed=0"
```

Devices are auto-created on first report and linked to the admin user.

## Architecture

```
GPS Device (Traccar Client / OsmAnd)
  → POST /ingest?id=X&lat=Y&lon=Z
  → Worker: parse OsmAnd protocol → D1 insert → Durable Object broadcast

Browser (traccar-web SPA)
  → Static assets from Workers Static Assets
  → REST API: /api/server, /api/session, /api/devices, /api/positions, ...
  → WebSocket: /api/socket → Durable Object for real-time updates
```

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/server` | No | Server configuration |
| POST | `/api/session` | No | Login (form-urlencoded: email + password) |
| GET | `/api/session` | Cookie | Check auth / current user |
| DELETE | `/api/session` | Cookie | Logout |
| GET | `/api/devices` | Cookie | List devices |
| POST | `/api/devices` | Cookie | Create device |
| PUT | `/api/devices/:id` | Cookie | Update device |
| DELETE | `/api/devices/:id` | Cookie | Delete device |
| GET | `/api/positions` | Cookie | Latest positions (or history with `deviceId`, `from`, `to`) |
| GET | `/api/socket` | Cookie | WebSocket upgrade for real-time updates |
| GET/POST | `/api/geofences` | Cookie | Geofence CRUD |
| GET/POST | `/api/users` | Cookie | User CRUD (admin only) |
| POST/DELETE | `/api/permissions` | Cookie | Link/unlink objects |
| GET | `/api/reports/*` | Cookie | Route, events, trips, stops, summary reports |

## Project structure

```
src/
  index.ts          — Main router: OsmAnd → API → WebSocket → SPA fallback
  types.ts          — TypeScript interfaces and Env bindings
  auth.ts           — PBKDF2 password hashing, session management, row mappers
  osmand.ts         — OsmAnd protocol parser (query params + JSON body)
  tracker-hub.ts    — Durable Object: WebSocket hibernation + broadcast
  api/
    server.ts       — GET/PUT /api/server
    session.ts      — POST/GET/DELETE /api/session
    devices.ts      — CRUD /api/devices
    positions.ts    — GET /api/positions, GPX/KML export
    users.ts        — CRUD /api/users
    geofences.ts    — CRUD /api/geofences
    groups.ts       — CRUD /api/groups
    permissions.ts  — POST/DELETE /api/permissions
    reports.ts      — GET /api/reports/* (route, events, trips, stops, summary)
    commands.ts     — GET/POST /api/commands
    notifications.ts
    drivers.ts
    maintenances.ts
    calendars.ts
schema.sql          — D1 database schema + default admin user
wrangler.jsonc      — Cloudflare Workers configuration
build-frontend.sh   — Clone + build traccar-web
```

## Regenerating the admin password hash

The default password hash in `schema.sql` is PBKDF2 (100k iterations, SHA-256). To generate a new one:

```bash
node -e "
const crypto = require('crypto');
const salt = crypto.randomBytes(16);
crypto.pbkdf2('YOUR_PASSWORD', salt, 100000, 32, 'sha256', (err, hash) => {
  console.log(salt.toString('base64') + ':' + hash.toString('base64'));
});
"
```

Replace the hash in the `INSERT INTO users` statement in `schema.sql`.
