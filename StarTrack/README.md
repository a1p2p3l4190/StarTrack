# StarTrack

StarTrack is a premium Michelin dining ecosystem.
This scaffold includes:

- `mobile/` — React Native Expo mobile app for gourmet collectors
- `admin/` — React.js admin portal for metadata, NFC inventory, and security dashboards
- `backend/` — Go Gin API gateway with PostgreSQL/GORM and S3 storage integration

## Project structure

- `mobile/` — cross-platform iOS/Android app shell
- `admin/` — web console for restaurant metadata and hardware management
- `backend/` — API service with authentication middleware and storage adapters

## Getting started

Start the backend first — both frontends depend on it.

### Backend

```bash
cd StarTrack/backend
createdb startrack
psql -d startrack -f db/schema.sql   # schema + seed data (see backend/README.md for details)
export DATABASE_URL="postgres://user:password@localhost:5432/startrack?sslmode=disable"
export JWT_SECRET="something-long-and-random"
go mod tidy
go run .
```

Runs on `http://localhost:8081`. Full endpoint reference and demo logins in
[`backend/README.md`](backend/README.md).

### Admin

```bash
cd StarTrack/admin
npm install
npm run dev
```

Sign in with `admin@startrack.app` / `StarTrack123!`.

### Mobile

```bash
cd StarTrack/mobile
npm install
npm start
```

Sign in (or register) from the in-app login screen —
`demo@startrack.app` / `StarTrack123!` works out of the box. On a physical
device the app auto-detects your dev machine's LAN IP through Expo; if that
fails, edit `resolveApiBase()` in `mobile/api.js`.
