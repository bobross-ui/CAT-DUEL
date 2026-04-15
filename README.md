# CAT Duel

A real-time 1v1 competitive mobile app for CAT exam preparation. Players are matched by Elo rating and compete in timed duels (10–15 min) answering the same CAT questions.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native (Expo SDK 54, managed workflow) |
| Backend | Node.js + Express + TypeScript |
| Real-time | Socket.io (Phase 3) |
| Database | PostgreSQL 16 via Prisma ORM |
| Cache / Queue | Redis 7 |
| Auth | Firebase Auth (email/password + Google) |
| AI Questions | Claude API / Anthropic (Phase 2) |

---

## Monorepo Structure

```
/
├── server/                  # Node.js + Express backend
│   ├── src/
│   │   ├── config/          # env vars, Firebase Admin init
│   │   ├── middleware/      # auth, validate (Zod), errorHandler
│   │   ├── models/          # Prisma client singleton
│   │   ├── routes/          # health, auth, users
│   │   ├── services/        # business logic
│   │   └── index.ts
│   └── prisma/
│       └── schema.prisma
├── mobile/                  # React Native (Expo)
│   └── src/
│       ├── config/          # Firebase client init
│       ├── context/         # AuthContext
│       ├── navigation/      # RootNavigator
│       ├── screens/         # LoginScreen, ProfileScreen
│       └── services/        # axios instance with auth interceptor
├── packages/
│   └── types/               # Shared TypeScript interfaces (User, ApiResponse)
└── docker-compose.yml
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Expo Go](https://expo.dev/go) app on your phone (for mobile development)
- A Firebase project with **Email/Password** auth enabled

---

## Installation

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd cat-duel
npm install
```

This installs dependencies for all workspaces (`server`, `mobile`, `packages/types`) via npm workspaces.

### 2. Start the database and Redis

```bash
docker compose up -d
```

This spins up:
- PostgreSQL 16 on port `5432` (DB: `catduel`, user/pass: `catduel`)
- Redis 7 on port `6379`

### 3. Configure the backend

Create `server/.env`:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://catduel:catduel@localhost:5432/catduel
REDIS_URL=redis://localhost:6379

# Firebase Admin SDK (from Firebase console → Project Settings → Service Accounts)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 4. Run database migrations

```bash
cd server
npx prisma migrate dev --name init_users
npx prisma db seed        # optional: seeds a test user
```

### 5. Start the backend

```bash
# From repo root
npm run dev:server

# Or from server/
cd server && npm run dev
```

Backend runs on `http://localhost:3000`. Verify with:

```bash
curl http://localhost:3000/api/health
# → { "success": true, "data": { "status": "ok" } }
```

### 6. Configure the mobile app

Create `mobile/.env`:

```env
# Firebase client config (from Firebase console → Project Settings → Your apps)
EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
EXPO_PUBLIC_FIREBASE_APP_ID=your-app-id

# Your machine's local IP (not localhost — phone needs to reach your machine)
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000
```

> **Note:** Use your machine's local network IP (e.g. `192.168.1.5`), not `localhost`, so the phone can reach the backend over Wi-Fi.

### 7. Start the mobile app

```bash
cd mobile && npx expo start
```

Scan the QR code with Expo Go on your phone.

---

## API Endpoints (Phase 1)

All responses follow this shape:

```typescript
{ success: boolean; data?: T; error?: { code: string; message: string } }
```

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | No | Health check |
| GET | `/api/auth/me` | Yes | Get current user profile |
| GET | `/api/users/:id` | No | Get user by ID |
| PATCH | `/api/users/me` | Yes | Update display name / avatar |

Protected routes require `Authorization: Bearer <firebase-id-token>` header.

---

## Auth Flow

1. User signs in via Firebase Auth on the mobile app (email/password)
2. Firebase ID token is stored in device secure storage
3. Axios interceptor attaches the token to every API request
4. Backend verifies the token with Firebase Admin SDK and auto-creates/upserts the user in Postgres on first login — no separate registration step needed

> **Google Sign-in** is deferred to Phase 5. Expo Go's `exp://` redirect URI is rejected by Google OAuth; a proper dev/production build is required.

---

## Other Dev Commands

```bash
# Lint and type-check (from root)
npm run lint
npm run type-check

# Prisma
cd server && npx prisma studio          # visual DB browser
cd server && npx prisma migrate dev     # run new migrations

# Reset Docker volumes (wipes DB data)
docker compose down -v
```

---

## Build Phases

| Phase | Status | What's built |
|---|---|---|
| 1 | ✅ Done | Monorepo scaffold, Docker, Postgres + Redis, Firebase Auth, profile screen |
| 2 | Upcoming | Question bank, Claude API question generation, solo practice mode |
| 3 | — | Socket.io matchmaking, real-time duel with live score sync |
| 4 | — | Elo system, leaderboard, match history, rank tiers |
| 5 | — | Animations, push notifications, Google Sign-in, offline caching |
| 6 | — | Docker → AWS deploy, load testing, monitoring, launch |
