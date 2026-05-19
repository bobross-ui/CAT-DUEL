# CAT Duel

A real-time 1v1 competitive exam-prep app for CAT aspirants. Players are matched by Elo rating and race through the same set of timed CAT questions — Quant, DILR, and VARC — with live scores, Elo adjustments, and a full post-match review.

Available as a **React Native app** (iOS + Android) and a **web app** from a single codebase.

---

## Architecture

```
┌──────────────────────────────────┐        ┌──────────────────────────────────────┐
│  React Native / Expo Web         │        │  Node.js + Express + TypeScript      │
│                                  │◄─REST─►│                                      │
│  iOS · Android · Browser         │        │  /matchmaking  (Socket.io namespace) │
│                                  │◄──WS──►│  /game         (Socket.io namespace) │
│  .mobile.tsx / .desktop.tsx      │        │                                      │
│  runtime platform switcher       │        │  ┌──────────┐   ┌──────────────────┐ │
└──────────────────────────────────┘        │  │ Postgres │   │  Redis           │ │
                                            │  │ (Prisma) │   │  matchmaking q   │ │
                                            │  │          │   │  game state      │ │
                                            │  │          │   │  question pool   │ │
                                            │  └──────────┘   │  leaderboard     │ │
                                            │                  └──────────────────┘ │
                                            └──────────────────────────────────────┘
                                                        │
                                            ┌───────────┴──────────┐
                                            │  Firebase Auth        │
                                            │  Sentry               │
                                            └──────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Mobile / Web | React Native (Expo SDK 54) | Single TypeScript codebase for iOS, Android, and web |
| Backend | Node.js + Express + TypeScript | Same language across the stack; first-class WebSocket support |
| Real-time | Socket.io | Rooms, namespaces, reconnection, and transport fallback built-in |
| Database | PostgreSQL 16 via Prisma ORM | Relational integrity with type-safe queries |
| Cache / Queue | Redis 7 | Matchmaking sorted set, ephemeral game state, question pool, leaderboard cache |
| Auth | Firebase Auth | Email/password + Google; handles token issuance, revocation, and Google OAuth |
| CI | GitHub Actions | Lint + type-check on every push and PR |

---

## Monorepo Structure

```
/
├── server/                        # Node.js + Express backend
│   ├── src/
│   │   ├── config/                # env validation (Zod), Firebase Admin, Redis, CORS
│   │   ├── middleware/            # auth, admin, rate limiting, Zod request validation
│   │   ├── routes/                # health, auth, users, admin, questions, games, leaderboard
│   │   ├── services/              # matchmaking, gameSession, elo, leaderboard, questionPool,
│   │   │                          #   streak, botPlayer, userCache, analytics
│   │   └── lib/                   # logger (pino), Sentry
│   └── prisma/
│       └── schema.prisma
├── mobile/                        # React Native (Expo) + web
│   └── src/
│       ├── components/            # Button, Card, Text, Chip, Avatar, TierBadge,
│       │                          #   Skeleton, ShareLinkModal, MathText, TitaAnswerPad,
│       │                          #   web/DesktopFrame, web/LeftRail, web/PageContainer
│       ├── context/               # AuthContext, ThemeProvider, AppPreferencesContext
│       ├── hooks/                 # useDesktopLayout, useCurrentProfile, useKeyboardShortcuts,
│       │                          #   useDocumentTitle
│       ├── navigation/            # RootNavigator, linking config, shared types
│       ├── screens/               # *.tsx (platform switcher), *.mobile.tsx, *.desktop.tsx
│       ├── services/              # api, socket, questions, leaderboard, share, analytics
│       └── theme/                 # Studyhall design system: tokens, themes, ThemeProvider
└── packages/
    └── types/                     # Shared TypeScript interfaces (User, ApiResponse)
```

---

## Architectural Decisions

### 1. Two-layer Redis question pool cache

Every duel match needs 20 questions from the right difficulty window without scanning the full questions table.

**Layer 1 — ID pool (`qpool:{category}`):** One sorted set per category; each member is a question ID, score is its difficulty rating. Populated at worker startup and refreshed every 5 minutes. Selection uses `ZRANGEBYSCORE` to retrieve IDs within the Elo-derived difficulty window and samples randomly from that list.

Storing difficulty as the sorted-set score (rather than separate keys per difficulty level) means the filter degrades gracefully when distribution is skewed, and automatically improves as difficulty ratings converge over time.

**Layer 2 — Content cache (`qcontent:{id}`):** Full question content cached on first use, evicted after 24 hours. On a cold start or cache miss, a targeted `findMany` for just the selected IDs runs — no full table scan.

After warm-up, match creation makes zero `findMany` calls against the questions table.

---

### 2. Two-phase match lifecycle (`pending_match` → `active_game`)

The first deployed version set `active_game:{userId}` the moment `match:found` was emitted. If one device failed to connect before the countdown, both players were permanently locked — neither could re-queue until the Redis TTL expired.

The fix introduces a two-phase lock:

- `pending_match:{userId}` is set immediately after `match:found` (short TTL)
- `active_game:{userId}` is set only after countdown completes **and** both players are in the room
- A 10-second pre-start timeout cancels the match and re-queues the waiting player if the other never joins
- `GET /api/games/active` returns only genuinely `ACTIVE` duels — pre-start reservations are invisible to the reconnect flow

**State machine:** `FOUND` → `WAITING_FOR_PLAYERS` → `COUNTDOWN` → `ACTIVE` → `FINISHED / CANCELLED`

---

### 3. Reconnect-safe game state and result replay

Two classes of race condition required Redis NX locks:

- **Double-countdown:** Two sockets joining the room concurrently could each trigger `startCountdown`. A `game:{gameId}:starting` NX lock ensures only the first caller proceeds; the lock is checked again after the countdown delay (the in-memory object could be stale from a competing write).
- **Double-end:** Timer expiry and both players finishing simultaneously could both call `endGame`. A `game:{gameId}:ending` NX lock serialises this path.

**Result replay for network flicker:** When a game ends, each player's `game:finished` payload is written to Redis with a 5-minute TTL before broadcasting. If a player's socket drops at exactly that moment and they reconnect afterward, `game:join` detects `FINISHED` status and replays their stored result immediately — they never get stuck on the question screen.

---

### 4. Auth latency vs revocation coverage

`verifyIdToken(token, true)` — Firebase's full revocation check — involves a live network call on every request. Under load this added ~120ms per API call.

The hot path uses local JWT verification (cryptographic only) plus an in-process Redis blocklist check (`isFirebaseUidBlocked`). Revocations written through the app — account deletion, admin token revoke — push the Firebase UID into the `revoked_uids` Redis set immediately. High-risk boundaries (account deletion re-auth, admin actions) use a separate `requireFirebaseRevocationCheck` middleware that calls `verifyIdToken(token, true)`.

**Known residual risk:** If a user is disabled directly in the Firebase Console or by an external service, the app-local blocklist won't know. The 2026-05-12 security audit flagged this and recommended persisting blocked UIDs in Postgres as a durable fallback. That work is tracked in `PRE_PHASE7_ISSUES.md`.

---

### 5. Web/mobile parity via runtime platform switcher

All screens exist as three files:

```
HomeScreen.tsx          ← 11-line switcher, imported by navigation
HomeScreen.mobile.tsx   ← full native implementation
HomeScreen.desktop.tsx  ← full web/desktop implementation
```

`useDesktopLayout` returns `true` when `Platform.OS === 'web'` **and** viewport width ≥ 1024px **and** the device has hover/pointer capability. The switcher composes the right variant at runtime; navigation imports are unchanged.

Desktop screens add a persistent left rail, right-rail panels, keyboard shortcuts (`1–4` for answer selection, `Enter` to submit, `Escape` to quit), `document.title` sync, and `beforeunload` warnings during active duels — none of which are visible on native.

---

### 6. Question serve buffer and dead-letter queue

Every submitted answer increments `timesServed` and `timesCorrect` on the question row. Under match load this creates write contention on hot question rows.

`questionServeBuffer.ts` batches these increments in an in-memory map and flushes to Postgres every 30 seconds using `updateMany`. Counts never need to be exact — they feed difficulty calibration, not billing — so a crash-loss of one flush window is acceptable.

Match persistence (`persistMatch`) runs inside a single Prisma `$transaction` with a 3-retry loop and exponential backoff. On final failure, the failed payload is pushed to a `match_persist_failed` Redis list (dead-letter queue) so it can be replayed without losing the result. `game:finished` is broadcast before the transaction — players see their result immediately regardless of DB latency.

---

### 7. Forfeit grace window

On disconnect during an active duel, the server starts a 15-second forfeit timer. If the player reconnects before it fires, the timer is cancelled and they resume the match. If it fires, `endGame` runs with the opponent as forced winner — forfeit counts as a full Elo win to discourage ragequitting.

`opponent:disconnected` and `opponent:reconnected` events give the still-connected player real-time visibility into the grace window.

---

### 8. Per-player question queue with skip + revisit

Each duel runs from a per-player queue; head is the currently-served question. Skip rotates head to tail. Revisit (jumping to a skipped Q from the navigator) has two modes depending on what's left in the queue:

- **Any fresh remaining:** displaced current is placed right behind target — after answering, the player returns to the fresh Q they were on.
- **All-skipped (cycle mode):** queue is *rotated* so target becomes head; every other item keeps its original ring position. After answering, the player advances to target's natural successor in the cycle.

```
Cycle: queue = [3, 4, 8, 10, 2], all skipped, current = Q3
Jump to Q8:  rotate → [8, 10, 2, 3, 4]
Answer Q8:   shift  → [10, 2, 3, 4]   ← next is Q10, not Q4
```

Insertion patterns (`[target, current, ...rest]`) destroy the ring's relative order in a cycle, which is why this mode needs rotation specifically. Separately, `skippedIds` is tracked as explicit server state — never derived from `seenIds − answered − current` — because jumping to a skipped Q must *not* mark the displaced current as skipped.

---

## Data Model

| Table | Key Columns |
|---|---|
| `users` | id, firebase_uid, email, display_name, elo_rating (default 1200), peak_elo, rank_tier, games_played, wins, win_rate, current_streak, longest_streak, is_bot, is_guest |
| `questions` | id, category (QUANT/DILR/VARC), question_type (MCQ/TITA), difficulty (1–5), text, options (JSON), correct_answer, correct_answer_text, explanation, source, passage_id |
| `passages` | id, text, source, source_pdf, is_verified (for VARC reading comprehension) |
| `matches` | id (= gameId), player1_id, player2_id, winner_id, is_draw, scores, elo_changes, status (completed/forfeited), finished_at |
| `match_answers` | match_id, user_id, question_id, selected_answer, typed_answer (TITA), is_correct, time_taken_ms |
| `practice_answers` | user_id, question_id, selected_answer, typed_answer, is_correct, time_taken_ms |

Indexes worth noting: `eloRating DESC` on users (matchmaking), `[rankTier, eloRating DESC]` composite (tier leaderboards), `[matchId, userId]` on match_answers (per-player review queries).

---

## Reliability Engineering

- **Graceful shutdown:** The server tracks open sockets (`openSockets`) and in-flight requests (`busySockets`). On `SIGTERM`, new connections get `Connection: close` headers, in-flight requests are allowed to complete, and idle sockets are destroyed.
- **Question pool atomic rebuild:** Pool refresh writes to a temp key, renames it over the live key, then deletes the old key — no window where the pool is empty. Removed or unverified question IDs are excluded on rebuild, not just on add.
- **Redis adapter for Socket.io:** `@socket.io/redis-adapter` pub/sub allows horizontal scaling to multiple server processes with shared room membership.
- **Zod env validation at startup:** Missing or malformed `DATABASE_URL`, `REDIS_URL`, Firebase credentials, and production-required settings fail fast with a descriptive error before the process accepts any connections.
- **Socket payload validation:** Socket.io game events run through `socketPayloadSchemas.ts` (Zod) to bound field lengths and reject malformed submissions. REST practice answers use the same validation middleware.

---

## Question Content

Questions are sourced from extracted real CAT papers (QUANT, DILR, VARC) plus manually curated content:

- **MCQ:** standard multiple-choice with four options
- **TITA (Type In The Answer):** numeric entry with exact-match validation and a custom numpad UI on mobile
- **VARC passages:** the `Passage` model stores reading comprehension text; passages are preloaded into `GameState` at match init (one DB read) and attached to questions before emitting — zero per-question DB calls during a live duel

Math rendering uses a lightweight `MathText` component that handles `$...$` inline spans, fractions, roots, and common CAT extraction artifacts — no LaTeX renderer dependency.

---

## Matchmaking

```
1. User taps "Find Match"
2. ZADD matchmaking_queue <elo_rating> <user_id>        (Redis sorted set)
3. Poll every 2s:
   a. For each queued user, ZRANGEBYSCORE ±150 Elo
   b. Pair the closest Elo match
   c. Remove both, create game room
4. If no match after 30s → widen to ±300 Elo
5. If no match after 60s → emit queue:timeout
```

A bot player fills the queue if no human opponent is found within the expanded window, ensuring users can always play.

---

## Elo System

```
E  = 1 / (1 + 10^((opponent_elo - player_elo) / 400))    ← expected score
R' = R + K × (actual - E)                                  ← new rating

K = 32  (< 30 games played)
K = 16  (≥ 30 games played)
Floor = 100

Forfeit counts as score 1/0 (full win for opponent).
```

Rank tiers: Bronze (< 1000) → Silver (1000–1299) → Gold (1300–1599) → Platinum (1600–1899) → Diamond (1900+)

---

## Testing & Quality

- **119 tests across 16 server test suites** covering Elo calculation (symmetry, K-factor switching, Elo floor, all tier boundaries), question pool, socket payload validation, and auth/admin routes
- TypeScript strict mode across all packages — `npx tsc --noEmit` is part of CI
- ESLint + Prettier enforced in CI; pre-commit hooks block type errors
- **2026-05-12 security audit** identified: 18 npm dependency vulnerabilities (1 critical — `protobufjs`), Socket.io payload validation gaps (since patched), and `verifyIdToken` revocation tradeoffs (tracked in `PRE_PHASE7_ISSUES.md`). Dependency remediation is the primary pre-launch gate.

---

## Design System (Studyhall)

A custom token-based design system with:
- Three font families: Source Serif 4, Geist, JetBrains Mono with 18 typographic presets
- Warm-neutral palette (`moss` accent, `coral` signal, `ink` scale) with full light/dark mode
- Reduce Motion support across all animations
- Persisted theme preference (system / light / dark) via `expo-secure-store`
- Theme-aware scrollbar injection on web (Firefox + WebKit)

---

## Build Phases

| Phase | Status | What was built |
|---|---|---|
| 1 | ✅ | Monorepo scaffold, Docker, Postgres + Redis, Firebase Auth, profile screen |
| 2 | ✅ | Question bank, admin API, AI question generation, solo practice mode |
| 3 | ✅ | Socket.io matchmaking, real-time duel, live score sync, match persistence |
| 4 | ✅ | Elo rating system, leaderboard (Global / Around Me / By Tier), match history |
| 5 | ✅ | Studyhall design system, animations, haptics, onboarding, deep linking, analytics, settings |
| 6 | ✅ | Web adaptation with desktop layouts, keyboard shortcuts, left-rail navigation |
| 7 | 🚧 | Launch: dependency audit remediation, production deploy (AWS + Cloudflare Pages), monitoring |

---

## Local Setup

### Prerequisites

- Node.js v18+
- Docker Desktop
- Expo Go on your phone (for native development)
- Firebase project with Email/Password auth enabled

### 1. Install dependencies

```bash
git clone <repo-url>
cd cat-duel
npm install          # installs all workspaces: server, mobile, packages/types
```

### 2. Start Postgres and Redis

```bash
docker compose up -d
# PostgreSQL 16 on :5432 (db: catduel, user/pass: catduel)
# Redis 7 on :6379
```

### 3. Configure the backend

Create `server/.env`:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://catduel:catduel@localhost:5432/catduel
REDIS_URL=redis://localhost:6379
REDIS_TLS=false

FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 4. Run migrations and seed

```bash
cd server
npx prisma migrate dev
npx prisma db seed        # seeds test users and questions
```

### 5. Start the backend

```bash
npm run dev:server        # from repo root
# → http://localhost:3000/api/health
```

### 6. Configure the mobile app

Create `mobile/.env`:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...

EXPO_PUBLIC_API_URL=http://192.168.x.x:3000   # your machine's LAN IP
EXPO_PUBLIC_APP_URL=http://192.168.x.x:8081/--
```

### 7. Start the app

```bash
cd mobile && npx expo start
# Scan QR with Expo Go for native, or press W for web
```

---

## API Surface

All responses: `{ success: boolean; data?: T; error?: { code: string; message: string } }`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | — | Health check |
| GET | `/api/auth/me` | ✓ | Current user profile + streak + rating delta |
| PATCH | `/api/users/me` | ✓ | Update display name / avatar |
| DELETE | `/api/users/me` | ✓ + revocation check | Delete account (blocks active duels) |
| GET | `/api/games/active` | ✓ | Resumable active duel, if any |
| GET | `/api/games/history` | ✓ | Paginated match history |
| GET | `/api/games/stats` | ✓ | Aggregate win rate, Elo high/low, streak |
| GET | `/api/games/:id` | ✓ | Full match detail with per-question breakdown |
| GET | `/api/leaderboard/global` | ✓ | Top 100 by Elo (Redis cached 60s) |
| GET | `/api/leaderboard/around-me` | ✓ | 10 players centered on caller's rank |
| GET | `/api/leaderboard/tier/:tier` | ✓ | Top 100 within a tier (cached 2 min) |
| POST | `/api/admin/questions` | admin | Create question |
| POST | `/api/admin/questions/import-jsonl` | admin | Bulk import from extraction pipeline |
| POST | `/api/admin/passages/import-jsonl` | admin | Bulk import VARC passages |

Protected routes require `Authorization: Bearer <firebase-id-token>`.
