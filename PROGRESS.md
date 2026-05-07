# CAT Duel — Build Progress

## Phase 1: Foundation & Auth

---

### Step 1.1 — Project Scaffold ✅

**What was built:**

**Monorepo root**
- `package.json` — npm workspaces covering `server`, `mobile`, `packages/*`
- Root-level scripts: `lint`, `type-check`, `format`
- ESLint (`@typescript-eslint`) + Prettier configured
- `.github/workflows/ci.yml` — GitHub Actions CI runs lint + type-check on push/PR to `main`

**`server/`** — Node.js + Express + TypeScript
- `src/index.ts` — Express app with CORS + JSON middleware, mounts routers
- `src/routes/health.ts` — `GET /api/health` returns `{ success: true, data: { status: "ok", timestamp } }`
- `src/config/env.ts` — loads `.env` via dotenv, exports typed `env` object (PORT, NODE_ENV, DATABASE_URL, REDIS_URL)
- `.env` — `PORT=3000`, `DATABASE_URL=postgresql://catduel:catduel@localhost:5432/catduel`, `REDIS_URL=redis://localhost:6379`
- Dev server runs via `ts-node-dev` with hot reload on port 3000

**`mobile/`** — React Native (Expo)
- Bootstrapped with `create-expo-app` (blank TypeScript template)
- `src/` folder structure created: `screens/`, `components/`, `services/`, `hooks/`, `context/`, `navigation/`
- Dependencies installed: `axios`, `@react-navigation/native`, `expo-secure-store`
- Deleted nested `.git` (created by create-expo-app) so it's part of the monorepo

**`packages/types/`** — Shared TypeScript interfaces
- `ApiResponse<T>` — standard API response shape (`success`, `data?`, `error?`)
- `User` — shared user interface (id, email, displayName, avatarUrl, eloRating, gamesPlayed, createdAt)

**`docker-compose.yml`**
- PostgreSQL 16 — port 5432, DB `catduel`, user/pass `catduel`
- Redis 7 — port 6379
- Both with named volumes for persistence

**Verified:**
- `docker compose up -d` → Postgres + Redis running
- `GET http://localhost:3000/api/health` → `{ "status": "ok" }`

---

### Step 1.2 — Database Schema ✅

**What was built:**

**Prisma setup**
- Installed `prisma` + `@prisma/client` (v6)
- `prisma/schema.prisma` — generator set to `prisma-client` with output `../src/generated/prisma`
- `src/generated/prisma/` — generated Prisma client (created via `npx prisma generate`)

**Users table**
- `prisma/schema.prisma` defines the `User` model:
  - `id` — UUID primary key
  - `firebaseUid` — unique, maps to `firebase_uid`
  - `email` — unique
  - `displayName`, `avatarUrl` — nullable
  - `eloRating` — default 1200, indexed (critical for matchmaking)
  - `gamesPlayed` — default 0
  - `createdAt`, `updatedAt` — auto-managed timestamps
  - Table mapped to `users` (snake_case)
- Migration run: `npx prisma migrate dev --name init_users` → `users` table created in Postgres

**Seed script**
- `prisma/seed.ts` — upserts a test user (`test@catduel.com`, elo 1200)
- `package.json` `"prisma": { "seed": "ts-node prisma/seed.ts" }` wires it to `npx prisma db seed`
- Import path uses `../src/generated/prisma/client` (Prisma v6 requires explicit `/client` suffix)

**Verified:**
- Migration applied, `users` table visible in Prisma Studio (`npx prisma studio`)
- Seed ran successfully, test user row visible in Studio

---

### Step 1.3 — Firebase Auth ✅

**What was built:**

**Backend**
- Installed `firebase-admin` (v13)
- `src/config/firebase.ts` — initializes Firebase Admin SDK from env vars (no JSON file)
- `src/config/env.ts` — added `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (with `\\n → \n` replacement for the private key)
- `src/models/prisma.ts` — Prisma client singleton
- `src/middleware/auth.ts` — verifies Firebase ID token, upserts user in Postgres (syncs email/displayName/avatarUrl on every login), attaches to `req.user`
- `src/types/express.d.ts` — extends Express `Request` with `user: User` (Prisma type)
- `src/routes/auth.ts` — `GET /api/auth/me` (protected), returns the Postgres user record
- `src/index.ts` — mounts auth router at `/api/auth`

**Mobile**
- Installed `firebase` (v12), `expo-auth-session`, `expo-crypto`, `expo-web-browser`, `@react-native-async-storage/async-storage`
- `src/config/firebase.ts` — initializes Firebase app + auth via `getAuth` (Firebase v12 handles persistence automatically with AsyncStorage installed)
- `src/context/AuthContext.tsx` — manages auth state (`user`, `loading`), exposes `signInWithEmail`, `signInWithGoogle`, `signOut`; Google sign-in uses `expo-auth-session/providers/google`
- `src/services/api.ts` — axios instance with request interceptor that attaches `Authorization: Bearer <token>` on every request
- `App.tsx` — wrapped with `AuthProvider`
- `mobile/.env` — all Firebase config values stored as `EXPO_PUBLIC_*` env vars (not hardcoded)

**Key decisions:**
- Firebase credentials stored in env vars (not a JSON file) — works the same in local + AWS deployment
- Firebase client config (apiKey etc.) moved to `mobile/.env` using `EXPO_PUBLIC_` prefix — Expo's built-in env var system
- `getReactNativePersistence` not available in Firebase v12; fixed by importing from `@firebase/auth` (RN build) with a `paths` override in `mobile/tsconfig.json`
- `app.json` — added `scheme: "catduel"` (required for deep linking / OAuth redirects) and renamed app from default `"mobile"` to `"CAT Duel"`

**Verified:**
- Backend starts cleanly, Firebase Admin initializes without errors
- Expo app loads on device via QR code with no crashes

---

### Step 1.4 — API Scaffolding ✅

**What was built:**
- Installed `zod`
- `src/middleware/validate.ts` — Zod validation middleware, runs `safeParse` on `req.body`, returns `VALIDATION_ERROR` with first issue message on failure
- `src/middleware/errorHandler.ts` — global Express error handler, catches unhandled errors, returns `INTERNAL_ERROR` 500
- `src/routes/users.ts` — `GET /api/users/:id` (public) + `PATCH /api/users/me` (protected, validates `displayName` + `avatarUrl` via Zod)
- `src/index.ts` — mounts users router at `/api/users`, registers `errorHandler` last

**Verified:**
- Server starts cleanly with all routes registered

---

### Step 1.5 — Basic User Profile Screen ✅

**What was built:**
- `src/navigation/index.tsx` — `RootNavigator` using `createNativeStackNavigator`; shows `LoginScreen` or `ProfileScreen` based on Firebase auth state
- `src/screens/LoginScreen.tsx` — email/password inputs + Google sign-in button (Google sign-in deferred — see below)
- `src/screens/ProfileScreen.tsx` — fetches `GET /api/auth/me`, displays displayName, email, Elo rating, games played, sign out button
- `App.tsx` — `SafeAreaProvider` → `AuthProvider` → `NavigationContainer` → `RootNavigator`
- `mobile/.env` — added `EXPO_PUBLIC_API_URL=http://<local-ip>:3000`; `api.ts` baseURL set to `${EXPO_PUBLIC_API_URL}/api`

**Key decisions:**
- Google Sign-in deferred for Expo Go — `expo-auth-session` v7 + Expo SDK 54 deprecated the Expo auth proxy; Google OAuth rejects `exp://` redirect URIs. Will be implemented properly with a dev/production build in Phase 5.
- `EXPO_PUBLIC_API_URL` stores just the server base (no `/api`); `/api` is appended in `api.ts` — keeps the env var clean and the path prefix in code where it belongs

**Verified:**
- Email/password login works end-to-end: Firebase token → backend verifies + upserts user in Postgres → profile screen loads with live data
- Firebase auth persistence works — user stays logged in across app restarts (AsyncStorage via `@firebase/auth` RN build)

---

---

## Phase 2: Question Engine

---

### Step 2.1 — Question Database Schema ✅

**What was built:**

- `QuestionCategory` enum: `QUANT`, `DILR`, `VARC`
- `QuestionSource` enum: `MANUAL`, `AI`
- `role` field added to `User` model (default `"user"`)
- `Question` model: category, subTopic, difficulty (1–5), text, options (JSON array of 4), correctAnswer (index 0–3), explanation, source, isVerified, timesServed, timesCorrect
- `PracticeAnswer` model: tracks every answer a user submits in solo practice (userId, questionId, selectedAnswer, isCorrect, timeTakenMs)
- Indexes: `[category, difficulty]` and `[isVerified, category]` on questions; `[userId, questionId]` on practice_answers
- Migration: `20260415181812_add_questions` applied
- Seed: 23 questions across all categories (QUANT: 9, DILR: 7, VARC: 7), all `isVerified: true`

---

### Step 2.2 — Admin API ✅

**What was built:**

- `src/middleware/admin.ts` — `adminOnly` middleware, returns 403 if `req.user.role !== 'admin'`
- `src/routes/admin.ts` — full admin question management, all routes protected by `authMiddleware + adminOnly`
- Installed: `multer` (file upload), `csv-parse` (CSV parsing)

**Endpoints:**
- `POST   /api/admin/questions` — create single question (Zod validated)
- `GET    /api/admin/questions` — list with pagination + filters (`category`, `difficulty`, `verified`, `page`, `limit`)
- `GET    /api/admin/questions/stats` — total, verified, unverified, count by category
- `GET    /api/admin/questions/:id` — single question with practiceAnswer count
- `PATCH  /api/admin/questions/:id` — partial update (Zod validated)
- `DELETE /api/admin/questions/:id` — hard delete
- `PATCH  /api/admin/questions/:id/verify` — flip isVerified to true
- `POST   /api/admin/questions/bulk` — CSV file upload, validates each row, inserts in bulk, returns `{ inserted, failed, errors }`

**CSV format:**
```
category,sub_topic,difficulty,text,option1,option2,option3,option4,correct_answer,explanation
```

---

### Step 2.3 — Gemini API Integration ⚠️ (built, not tested)

**What was built:**

- Switched from Anthropic to Google Gemini (`@google/generative-ai`)
- `GEMINI_API_KEY` added to `env.ts` and `server/.env`
- `src/services/questionGenerator.ts` — calls Gemini, strips markdown fences from response, parses + validates JSON output via Zod, saves with `source: AI, isVerified: false`. Skips and logs on JSON parse failure or validation error.
- `POST /api/admin/questions/generate` — admin-only endpoint, body: `{ category, difficulty, count (max 20), subTopic? }`, returns `{ saved, failed, questions[] }`

**Key decisions:**
- Currently set to `gemini-2.0-flash` — confirm correct model name for your API key (see pinned note below)
- AI output validated with same Zod schema as manual creation — malformed responses are skipped, not hard failures
- All AI questions start as `isVerified: false` — admin must review before they're served in practice

**Pinned:** Confirm correct Gemini model name by running:
```powershell
Invoke-RestMethod -Uri "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_GEMINI_API_KEY" | Select-Object -ExpandProperty models | Select-Object name
```
Then update `model` in `server/src/services/questionGenerator.ts` if needed.

---

### Step 2.4 — Question Serving API ✅

**What was built:**

- `src/routes/questions.ts` — all routes protected by `authMiddleware`
- Mounted at `/api/questions` in `index.ts`

**Endpoints:**
- `GET /api/questions/next` — returns next unseen, verified question for the user. Filters: `?category=QUANT&difficulty=3`. Never includes `correctAnswer` or `explanation`. Returns `{ noMoreQuestions: true }` when all questions seen.
- `POST /api/questions/:id/answer` — body: `{ selectedAnswer, timeTakenMs }`. Saves `PracticeAnswer`, increments `timesCorrect` if correct, returns `{ isCorrect, correctAnswer, explanation, timeTakenMs }`.
- `GET /api/questions/practice/summary` — returns `{ total, correct, incorrect, accuracy, totalTimeMs, avgTimePerQuestionMs }`. Optional `?since=ISO_DATE` filter.

---

### Step 2.5 — Solo Practice Mode (Mobile) ✅

**What was built:**

- `mobile/src/services/questions.ts` — typed service layer for all 3 question API calls
- `mobile/src/screens/PracticeHomeScreen.tsx` — category selector (QUANT/DILR/VARC cards) + difficulty filter chips + Start Practice button
- `mobile/src/screens/QuestionScreen.tsx` — question text, 4 option buttons, elapsed timer, submit, animated result overlay (correct/incorrect highlight + explanation slide-up), Next Question / End Session
- `mobile/src/screens/PracticeSummaryScreen.tsx` — accuracy circle, stats grid (correct, incorrect, total time, avg time), Practice Again / Back to Home
- `mobile/src/navigation/index.tsx` — added `PracticeHome`, `Question`, `PracticeSummary` to `RootStackParamList`
- `mobile/src/screens/ProfileScreen.tsx` — added Practice button that navigates to `PracticeHome`

---

## Phase 2 Complete ✅

All 5 steps done. Question bank live with 23 seeded questions. Solo practice works end-to-end.

**Bug fixed:** 4 seed questions had wrong `correctAnswer` indices (off-by-one in data, not code). Fixed and re-seeded.

**Pending:** Step 2.3 (Gemini question generation) not yet tested — confirm model name and verify end-to-end before Phase 3.

---

---

## Phase 3: Real-time Matchmaking & Duels

---

### Step 3.1 — Socket.io Server Setup ✅

**What was built:**

**Server**
- Installed `socket.io` + `ioredis`
- `src/config/redis.ts` — ioredis singleton with `lazyConnect: true`
- `src/middleware/socketAuth.ts` — verifies Firebase ID token on socket handshake, looks up user in Postgres (no upsert — socket auth is read-only), attaches `socket.data.user`
- `src/index.ts` — switched from `app.listen` to `createServer` + `httpServer.listen`; Socket.io attached to the HTTP server; two namespaces exported: `matchmakingNs` (`/matchmaking`) and `gameNs` (`/game`); both use `socketAuthMiddleware`; `online_users` Redis set maintained on connect/disconnect for both namespaces

**Mobile**
- Installed `socket.io-client`
- `src/services/socket.ts` — `createMatchmakingSocket()` and `createGameSocket()` async factory functions; fetch Firebase ID token at call time and pass via `socket.handshake.auth.token`; websocket-only transport, reconnection enabled

**Note:** `online_users` uses a Redis set — `SADD` is idempotent so a user connecting to both namespaces still counts as one entry. `SCARD` gives exact unique user count. A hash would only be needed if per-user metadata (e.g. last-active timestamp) is required later.

**Verified:**
- Server starts cleanly (`Server running on port 3000`)
- `GET /api/health` still responds correctly
- TypeScript compiles with no errors

---

---

### Step 3.2 — Matchmaking Engine ✅

**What was built:**

- `src/services/gameSession.ts` — stub file with `initializeGame` (no-op), `registerGameHandlers` (no-op), and `getActiveGameId` helpers; Step 3.3 fills these in
- `src/services/matchmaking.ts` — `registerMatchmakingHandlers(matchmakingNs)`: handles `queue:join` (guards duplicate entries + active game check, adds to Redis sorted set, stores socket ID + join timestamp), `queue:leave`, and `disconnect` (auto-remove from queue); `createMatch(matchmakingNs, player1, player2)`: removes both from queue, fetches display profiles from Postgres, notifies both via stored socket IDs, calls `initializeGame` stub
- `src/services/matchmakingLoop.ts` — `startMatchmakingLoop(matchmakingNs)`: polls Redis every 2s; ±150 Elo range initially, widens to ±300 after 30s; times out at 60s with `queue:timeout` event; errors caught per-iteration so loop never crashes
- `src/index.ts` — wires up `registerMatchmakingHandlers`, `registerGameHandlers`, `startMatchmakingLoop`; extracted `trackOnlineUser` helper to avoid duplicate connection blocks

**Key decisions:**
- Socket ID stored as `socket:mm:{userId}` (not `socket:{userId}`) to avoid future collision with game namespace socket keys in Step 3.3
- `createMatch` fetches user display info from Postgres (queue only stores userId + Elo); defensive null-check in case user was deleted between queue join and match

**Note:** Redis errors log but don't crash the server when Docker is not running — matchmaking loop errors are caught per-iteration.

**Verified:**
- TypeScript compiles with no errors
- Server starts cleanly, health endpoint responds even with Redis down
- Two test sockets (Alice + Bob, Elo 1200) authenticated, joined queue, and received `match:found` within 2 seconds
- Both players received identical `gameId` — confirmed server pairs correctly
- Opponent profile in `match:found` shows correct displayName and Elo for each player

---

### Step 3.3 — Game Session Manager ✅

**What was built:**

- `src/services/gameSession.ts` — full implementation replacing the stub:
  - `initializeGame` — selects questions (Elo-based difficulty, round-robin category balance, Fisher-Yates shuffle), writes `GameState` to Redis with 20-min TTL, sets `active_game:{userId}` for both players
  - `registerGameHandlers` — wires `game:join`, `answer:submit`, `disconnect` on the game namespace
  - `game:join` handler — validates player belongs to game, joins Socket.io room; if reconnecting to `ACTIVE` game sends `game:sync` with current scores, question, and elapsed timer; if both players in room triggers countdown (Redis NX lock prevents double-countdown)
  - `startCountdown` — marks state `COUNTDOWN`, emits `game:countdown`, re-reads state from Redis after 3s (safety check), transitions to `ACTIVE`, sends `game:start` + first question to both, starts server timer
  - `startGameTimer` — `setInterval` every 1s; broadcasts `game:timer` every 10s and every 1s in last 30s; calls `endGame` at 0
  - `handleAnswer` — validates: game is ACTIVE, user belongs to game, questionId matches expected progress, not already answered (double-submission guard); looks up `correctAnswer` from DB; updates score/progress/answers in Redis; emits `answer:result` to answering player and `opponent:scored` to opponent; sends next question; ends early if both players finished
  - `endGame` — Redis NX lock prevents double-ending from concurrent timer + both-players-done; marks `FINISHED`, cancels timer, determines winner/draw, emits `game:finished` to both, clears `active_game` keys; TODO stub for Step 3.5 persistence
  - `getActiveGameId` — helper used by REST route
- `src/routes/games.ts` — `GET /api/games/active` (protected): returns active `gameId` for the authenticated user; used by mobile reconnection flow (Step 3.4)
- `src/index.ts` — mounts games router at `/api/games`

**Key decisions vs spec:**
- Re-reads game state from Redis inside the `setTimeout` callback in `startCountdown` (spec mutates the passed-in object — stale if game was abandoned during countdown)
- Redis `NX` lock on `game:{gameId}:starting` prevents double-countdown from two sockets joining concurrently
- Redis `NX` lock on `game:{gameId}:ending` prevents double-`endGame` from timer expiry + both-players-finishing simultaneously
- Double-answer-submission guard: checks `state[answerKey][questionId]` before processing

**Note:** 19 questions served in test (not 20) because the seed only has 19 questions in difficulty range [2,3] at Elo 1200. Will be a non-issue once the question bank grows.

**Verified:**
- TypeScript compiles with no errors
- Both players joined game room → countdown fired → `game:start` received
- Both players received the **same first question**
- `correctAnswer` confirmed absent from client-facing question payload
- P1 answered → got `answer:result` → P2 received `opponent:scored` → P1 advanced to Q2
- `GET /api/games/active` returned correct `gameId` mid-match

---

### Step 3.4 — Live Duel Screen (Mobile) ✅

**What was built:**

**Server additions to `gameSession.ts`:**
- `forfeitTimers` map (in-memory, keyed by userId) — 2-minute auto-forfeit timers on disconnect
- `endGame` now accepts `options: { forcedWinnerId? }` — forced winner bypasses score comparison (used for forfeit)
- `game:forfeit` handler — ends game with opponent as forced winner
- `disconnect` handler — starts 2-min auto-forfeit `setTimeout`; if player reconnects before expiry, `game:join` cancels it

**Mobile new files:**
- `src/screens/MatchmakingScreen.tsx` — IDLE/SEARCHING/FOUND phases; creates matchmaking socket on mount; handles `queue:joined`, `queue:error`, `queue:timeout`, `match:found`; disconnects matchmaking socket before navigating to Duel
- `src/screens/DuelScreen.tsx` — full game lifecycle in one screen:
  - PREMATCH: shows opponent name + Elo while connecting to game socket
  - COUNTDOWN: 3-2-1 visual tick (client-driven from server-sent initial value)
  - ACTIVE: score header (with spring animations on score change), countdown timer (red below 60s), question card, 4 option buttons, submit; no "Next" button — auto-advances on `game:question`
  - Reconnection: `connect` event always emits `game:join`; server responds with `game:sync` if already ACTIVE
  - Forfeit: `Alert.alert` confirmation → emit `game:forfeit` → navigate to Profile
  - Android back button intercepted during COUNTDOWN/ACTIVE → shows quit dialog
  - `game:finished` → disconnect socket → `navigation.replace('DuelResults')`
- `src/screens/DuelResultsScreen.tsx` — Win/Loss/Draw banner, score comparison, Play Again + Back to Home buttons; question breakdown deferred to Step 3.5

**Mobile modified files:**
- `src/navigation/index.tsx` — added `Matchmaking`, `Duel` (gesture disabled), `DuelResults` to stack; exported `OpponentInfo` and `GameFinishedPayload` types
- `src/screens/ProfileScreen.tsx` — added "Find Duel" primary button above Practice

**Note:** Two pre-existing TypeScript errors in `AuthContext.tsx` (`useProxy` option type mismatch from expo-auth-session v7 API change) — unrelated to this step, present since Phase 1.

**Verified:**
- Server type-checks clean
- Mobile type-checks clean (excluding pre-existing AuthContext errors)

---

### Step 3.5 — Match Results & Persistence ✅

**What was built:**

**Schema (`server/prisma/schema.prisma`)**
- `Match` model — stores one row per completed duel: `id` (= gameId UUID), player1Id/player2Id FKs, winnerId (nullable), isDraw, scores, questionsAnswered, totalQuestions, durationSeconds, finishedAt, createdAt; indexed on both player IDs
- `MatchAnswer` model — one row per (player × question) pair answered in a match: matchId, userId, questionId, selectedAnswer, isCorrect, timeTakenMs; indexed on `[matchId, userId]`
- Back-relations added to `User` (matchesAsPlayer1, matchesAsPlayer2, matchAnswers) and `Question` (matchAnswers)
- Migration: `20260416102435_add_match_tables` applied

**Server**
- `src/services/gameSession.ts` — replaced `// TODO Step 3.5` stub with `persistMatch()` call (fire-and-forget, errors logged but don't block `game:finished` delivery)
- `persistMatch(state, winnerId)` — runs a single Prisma `$transaction`: creates Match row (using gameId as primary key), bulk-inserts all MatchAnswer rows for both players, increments `gamesPlayed` for both users
- `src/routes/games.ts` — two new endpoints added:
  - `GET /api/games/history` — last 20 matches for the authenticated user (ordered by finishedAt desc, includes player1/player2 display info)
  - `GET /api/games/:id` — full match detail with the requesting user's MatchAnswer rows each including `question.text`, `question.options`, `question.correctAnswer`, `question.explanation`; 403 if caller is not a participant

**Mobile**
- `src/screens/DuelResultsScreen.tsx` — upgraded from static score display to full post-game review:
  - Fetches `GET /api/games/:gameId` on mount (non-blocking — scores shown immediately, breakdown appears when loaded)
  - Per-question cards with: correct/wrong badge, question text, all 4 options highlighted (green = correct answer, red = player's wrong pick), explanation; scrollable via `ScrollView`

**Verified:**
- TypeScript compiles with no errors
- Migration applied cleanly; Match + MatchAnswer tables visible in Postgres
- `persistMatch` fires after `game:finished` — Match row created, answers persisted, gamesPlayed incremented for both users
- `GET /api/games/history` returns match list with player info
- `GET /api/games/:id` returns per-question breakdown for the requesting player

---

---

## Phase 4: Elo Rating System, Leaderboard & History

---

### Step 4.1 — Elo Calculation Service ✅

**What was built:**

- `server/src/services/elo.ts` — pure, side-effect-free Elo functions:
  - `calculateElo` — single-player rating change (K-factor, expected score, MIN_ELO floor)
  - `calculateMatchElo` — full match result for both players at once; determines outcome (player1_win / player2_win / draw)
  - `getRankTier` — maps Elo to BRONZE / SILVER / GOLD / PLATINUM / DIAMOND
  - `ELO_CONSTANTS` exported for tuning (K=32 new, K=16 established, floor=100, threshold=30 games)
- `server/src/services/__tests__/elo.test.ts` — 21 unit tests covering: equal-rated win/loss/draw, upset win, heavy-favourite win, K-factor switch at 29/30 games, Elo floor, symmetry, and all tier boundaries
- `server/jest.config.js` — ts-jest preset, node environment
- `server/package.json` — added `jest`, `ts-jest`, `@types/jest` devDeps; added `"test": "jest"` script
- `server/tsconfig.json` — added `"types": ["node", "jest"]` so VS Code resolves jest globals without a separate tsconfig

**Key decision:** Jest types added directly to the main `tsconfig.json` (not a separate `tsconfig.test.json`) so VS Code discovers them automatically for test files — no red squiggly lines on `describe`/`it`/`expect`.

**Verified:**
- `npm test` in `server/` → 21/21 tests pass

---

### Step 4.2 — Schema Updates ✅

**What was built:**

- `server/prisma/schema.prisma`:
  - `RankTier` enum added: BRONZE, SILVER, GOLD, PLATINUM, DIAMOND
  - `rankTier RankTier @default(SILVER)` added to `User` model
  - `@@index([eloRating(sort: Desc)])` — upgraded to sorted desc
  - `@@index([rankTier, eloRating(sort: Desc)])` — new composite index for tier-filtered leaderboards
  - `player1EloChange Int @default(0)` and `player2EloChange Int @default(0)` added to `Match`
  - `status String @default("completed")` added to `Match` (completed | forfeited)
  - Match indexes upgraded to composite: `[player1Id, finishedAt(sort: Desc)]` and `[player2Id, finishedAt(sort: Desc)]`
- Migration `20260417093543_add_rank_tier_and_elo_changes` applied
- `server/scripts/backfill-rank-tiers.ts` — one-off script; reads all users, sets `rankTier` from their current `eloRating`; ran once (5 users backfilled)
- `server/prisma/seed.ts` — test user now seeds with `rankTier: 'SILVER'`

**Verified:**
- Migration applied cleanly
- `npm run type-check` passes
- 5 users backfilled with correct tiers in Prisma Studio

---

### Step 4.3 — Wire Elo into Match Completion ✅

**What was built:**

- `server/src/services/gameSession.ts` — imported `calculateMatchElo`, `getRankTier`, `MatchEloResult` from `elo.ts`
- `endGame` — fetches fresh `eloRating` + `gamesPlayed` from DB for both players (not stale Redis state); computes `calculateMatchElo` (forfeit uses dummy 1/0 scores for a full win); enriches `game:finished` payload with `eloBefore`, `eloAfter`, `eloDelta`, `newTier`, `tierChanged` per player
- `persistMatch` — new signature accepts `eloResult`; updates both users' `eloRating`, `rankTier`, `gamesPlayed` in one transaction; writes `player1EloChange`/`player2EloChange`/`status` to the match row; 3-retry loop with exponential backoff; dead-letter queue (`match_persist_failed` Redis list) on final failure; invalidates `leaderboard:global:top100` cache after success

**Key decisions:**
- Elo fetched from DB at match end, not from Redis game state (which has matchmaking-time Elo and could be stale)
- Broadcast happens before persist — users see results immediately; if persist fails it goes to dead-letter queue
- Forfeit counts as a full win for Elo purposes (discourages ragequitting)

**Verified:**
- Played a match — `matches` row has correct `player1_elo_change`/`player2_elo_change`, `users` table shows updated `elo_rating` and `rank_tier`

---

### Step 4.4 — Leaderboard API ✅

**What was built:**

- `server/src/services/leaderboard.ts` — three leaderboard functions + rank helper:
  - `getUserGlobalRank` — counts users with strictly higher Elo (tiebreak: earlier createdAt); returns null if user has < 5 games
  - `getGlobalLeaderboard` — top 100 by Elo desc, Redis cached for 60s (TTL only, no explicit invalidation)
  - `getAroundMeLeaderboard` — 10 players centered on caller; falls back to top 10 if unranked
  - `getTierLeaderboard` — top 100 within a specific tier, cached 2 min
- `server/src/routes/leaderboard.ts` — three endpoints, all protected by `authMiddleware`:
  - `GET /api/leaderboard/global`
  - `GET /api/leaderboard/around-me`
  - `GET /api/leaderboard/tier/:tier` — 400 on invalid tier
- `server/src/index.ts` — mounted at `/api/leaderboard`

**Key decision:** Removed explicit cache invalidation after each match (was in persistMatch). TTL-only expiry avoids cache stampede when many matches finish simultaneously. 60s stale leaderboard is acceptable.

**Note:** `around-me` was briefly removed then restored — it shows 10 players centered around the caller's rank position (rank neighbors, not location-based).

**Verified:**
- `GET /api/leaderboard/global` returns correct ranked entries with `isCurrentUser` flag, `currentUserRank`, and `totalRanked`

---

### Step 4.5 — Match History API ✅

**What was built:**

- `server/src/routes/games.ts` — expanded with three endpoints:
  - `GET /api/games/history` — paginated match history (default 20, max 50); includes opponent info, result (win/loss/draw/forfeit), score, Elo change, and duration; ordered by `finishedAt` desc
  - `GET /api/games/stats` — aggregate stats for the authenticated user: totalGames, wins, losses, draws, forfeits, winRate, eloHigh, eloLow, avgEloDelta
  - `GET /api/games/:id` — full match detail: both players' scores, Elo changes, and per-question answer breakdown (text, options, correctAnswer, explanation) for the requesting player

**Verified:**
- TypeScript compiles with no errors
- Endpoints return correct data with proper 403 guard on match detail

---

### Step 4.6 — Mobile Results Screen Elo Display ✅

**What was built:**

- `mobile/src/components/TierBadge.tsx` — reusable tier badge component; color-coded per tier (Bronze/Silver/Gold/Platinum/Diamond); `small` prop for inline use in leaderboard rows; `highlighted` prop adds border for tier-change display
- `mobile/src/components/EloChangeCard.tsx` — animated Elo counter (Animated.Value counts from `eloBefore` to `eloAfter` over 1.5s with 500ms delay); delta pill colored green/red/gray; when `tierChanged=true` shows `tierBefore → PROMOTED!/Demoted → newTier`; when `tierChanged=false` shows single badge
- `mobile/src/navigation/index.tsx` — `GameFinishedPayload` updated with full `PlayerResult` type (`eloBefore`, `eloAfter`, `eloDelta`, `newTier`, `tierChanged`); `isForfeit` added to payload
- `mobile/src/screens/DuelResultsScreen.tsx` — added `EloChangeCard` below win/loss banner; forfeit banner shown when `isForfeit=true`

**Bug fixed:** Initially showed two identical tier badges (Silver + Silver) when no tier change occurred. Fixed by rendering a single `TierBadge` when `tierChanged=false`.

**Verified:**
- Results screen shows animated Elo count-up after match
- Promotion/demotion case shows before → after badges with promotion text
- Forfeit banner displays correctly

---

### Step 4.7 — Mobile Leaderboard Screen ✅

**What was built:**

- `mobile/src/services/leaderboard.ts` — `getGlobal()`, `getAroundMe()`, and `getTier(tier)` service calls
- `mobile/src/screens/LeaderboardScreen.tsx` — full leaderboard UI:
  - Global / Around Me / By Tier tabs; By Tier tab opens tier picker modal on second tap
  - `FlatList` with pull-to-refresh; `useFocusEffect` re-fetches on screen focus
  - Rank banner shows `Your rank: #N of M` when user is ranked
  - Unranked nudge shows `Play N more matches to join the leaderboard` when user has < 5 games
  - `LeaderboardRow` — rank column (crown/medals for top 3), name + `TierBadge`, Elo; current user row highlighted
  - Tier picker modal with all 5 tiers using `TierBadge`
- `mobile/src/screens/ProfileScreen.tsx` — added Leaderboard navigation button
- `mobile/src/navigation/index.tsx` — added `Leaderboard` to `RootStackParamList`, imported `LeaderboardScreen`

**Bug fixed:** By Tier tab was showing global rank vs tier-scoped total (e.g. "Your rank: #14 of 7"). Fixed `getTierLeaderboard` to compute `currentUserRank` within the selected tier only; returns null if the user is not in that tier.

**Seeded:** 20 dummy ranked users across all tiers added to `prisma/seed.ts` for leaderboard testing.

**Verified:**
- Global, Around Me, and tier-filtered leaderboards load correctly
- Around Me shows 10 players centered on caller's rank; falls back to top 10 if unranked
- By Tier rank banner shows correct rank within that tier
- Current user highlighted in list; rank banner shown
- Tier picker modal works; switching tabs re-fetches

---

### Step 4.8 — Mobile Match History Screen ✅

**What was built:**

- `mobile/src/screens/MatchHistoryScreen.tsx` — paginated match history list:
  - Fetches `GET /api/games/history`; pull-to-refresh; infinite scroll (loads next page on end reached)
  - Each row: outcome pill (WIN/LOSS/DRAW), opponent name + `TierBadge`, score, Elo delta (green/red), date + duration
  - Tap row → navigates to `MatchDetail`
- `mobile/src/screens/MatchDetailScreen.tsx` — full match breakdown:
  - Fetches `/api/games/:id` and `/auth/me` in parallel (to identify which player is "me")
  - Score + Elo change summary card; per-question cards with correct/wrong badges, option highlights, explanation
- `mobile/src/navigation/index.tsx` — added `MatchHistory` and `MatchDetail` to `RootStackParamList`
- `mobile/src/screens/ProfileScreen.tsx` — added Match History navigation button

**Verified:**
- TypeScript compiles with no errors

---

### Step 4.9 — Profile Screen Rank Tier Badge + Progress Bar ✅

**What was built:**

- `mobile/src/screens/ProfileScreen.tsx`:
  - `TierBadge` shown below display name
  - `TierProgressBar` component (inline in file): shows current Elo vs next tier threshold with colored fill bar and % label; Diamond shows "Max Rank — 100%"
  - `statsRow` margin reduced to accommodate new elements
- `mobile/src/screens/LeaderboardScreen.tsx`:
  - By Tier tab defaults to the user's own rank tier (passed as `userTier` nav param from ProfileScreen — no extra API call)
  - Unranked nudge suppressed on the tier tab (was incorrectly showing "Play 5 more matches" when user was in a different tier)
- `mobile/src/navigation/index.tsx` — `Leaderboard` route updated: `undefined` → `{ userTier: string }`
- `server/prisma/seed.ts` — 50 additional dummy users added (total 70), spread across all tiers

**Verified:**
- Progress bar shows correct tier color and percentage
- Leaderboard tier tab opens to user's own tier by default
- No extra network request for tier defaulting

---

## Phase 4 Complete ✅

All 9 steps done. Elo system live, leaderboard working (Global / Around Me / By Tier), match history and detail screens built, profile shows tier badge + progress bar. 70 dummy users seeded for testing.

---

---

## Phase 5: Mobile App Polish & Store Prep

---

### Step 5.1 — Design System: Studyhall ✅

**What was built:**

**Packages installed**
- `@expo-google-fonts/source-serif-4`, `@expo-google-fonts/geist`, `@expo-google-fonts/jetbrains-mono`, `expo-splash-screen`, `expo-linear-gradient`

**`mobile/src/theme/`**
- `tokens.ts` (rewritten) — Studyhall warm-neutral palette (`palette.light` / `palette.dark`): moss accent, coral signal, ink scale, warm bg. Standalone `tierColors` map. `type` presets for all 18 typographic roles across 3 families. Updated `spacing` + `radii`.
- `themes.ts` (rewritten) — `buildTheme()` extends each palette with backward-compat aliases (`text`, `border`, `surface`, etc.) so the 11 existing screens keep working until Step 5.3 migration. `lightTheme` / `darkTheme` exported; `Theme` type inferred from result.
- `ThemeProvider.tsx` (updated) — replaced `override` with `preference: 'system' | 'light' | 'dark'` + `setPreference`; hydrates from `expo-secure-store` on mount; persists changes.

**New components in `mobile/src/components/`**
- `Text.tsx` — namespaced `Text.Serif`, `Text.Sans`, `Text.Mono`. Each takes a `preset` key from the `type` map; `Text.Mono` auto-applies `fontVariant: ['tabular-nums']`.
- `Chip.tsx` — variants default / accent / coral / dark; optional `dot` prefix; JetBrains Mono `chipLabel` preset.

**Updated components**
- `Button.tsx` — new variants: `primary` (accent bg), `ghost` (transparent, line border), `dark` (ink bg), `coral`; `secondary` kept as compat alias (→ ghost) for existing screens; `Animated.Value` scale-to-0.98 on press via `Pressable`.
- `Card.tsx` — `theme.card` bg, `theme.line` border (1px), inline shadow (removed `shadows` import from tokens).
- `Avatar.tsx` — `LinearGradient` fill (moss for `you`, sienna for `opponent`); overlay shine; `xl: 88` size added.
- `TierBadge.tsx` — reads from `tierColors` map (standalone import) instead of `theme[tierKey]`.
- `EloChangeCard.tsx` — uses `Text.*` components + new Studyhall token names (accent, coral, ink, line).

**`mobile/App.tsx`** (updated)
- `useFonts` loads all 9 font weights (Source Serif 4 × 3, Geist × 4, JetBrains Mono × 2)
- `SplashScreen.preventAutoHideAsync()` at module level; `SplashScreen.hideAsync()` once `fontsLoaded`; returns `null` until fonts are ready — no system-font flash.

**`mobile/src/screens/DebugScreen.tsx`** (new)
- Scrollable design-system showcase: all 3 font families at every preset, palette swatches, Button × 6 states, Card, Chip × 4 variants, Avatar (both variants × 4 sizes), TierBadge × 5 tiers.
- Live theme toggle (system / light / dark) via `Chip` + `Button`.
- Wired as `Debug` route in `RootNavigator`; temporary "Design System" button on `ProfileScreen` for now — will be moved to Settings → About → 5-tap in Step 5.3.

**Verified:**
- `npx tsc --noEmit` in `mobile/` → 0 errors
- Root `npm run lint` → 0 errors

---

---

### Bug Fix — Forfeit Flow ✅

**What was fixed:**

**`mobile/src/screens/DuelScreen.tsx`**
- `doQuit()` previously disconnected the socket and navigated to Profile directly, bypassing `game:finished`. Now only emits `game:forfeit` and lets the server response drive navigation — forfeiting player correctly lands on results screen with "You Lost".

**`mobile/src/screens/DuelResultsScreen.tsx`**
- Forfeit banner now shows context-aware message: "You forfeited the match" or "Opponent forfeited the match" based on who won.

**`server/src/services/gameSession.ts`**
- `endGame()` now persists each player's result payload in Redis (5-min TTL) before calling `fetchSockets()`. This covers the case where a socket is briefly absent from the room at that moment.
- `game:join` handler now has a `FINISHED` status case: if a player reconnects after the game ended (missed `game:finished` due to mobile network flicker), their result is replayed from Redis immediately.

**Root cause:** Mobile socket briefly drops from the game room exactly when `endGame` calls `fetchSockets()`. The player misses `game:finished` and, on reconnect, the `game:join` handler had no FINISHED case — player was permanently stuck. The fix closes this gap with Redis persistence + state machine recovery.

**Verified:**
- Forfeiting player sees results screen (not Profile)
- Opponent receives `game:finished` correctly; intermittent "stuck on question screen" resolved
- `npm run type-check` → 0 errors

---

---

### Step 5.2 — Navigation Shell ✅

**What was built:**

**New package**
- `@react-navigation/bottom-tabs` installed

**New components**
- `mobile/src/components/TabBar.tsx` — custom Studyhall-styled bottom tab bar; uses `@expo/vector-icons` Feather icons; active tab in `theme.accent`, inactive in `theme.ink3`; JetBrains Mono chipLabel preset for tab labels; respects `useSafeAreaInsets` for home-indicator clearance

**New screens**
- `mobile/src/screens/HomeScreen.tsx` — Home tab: fetches user profile, shows greeting + name + Elo + tier badge + "Find Duel" and "Solo Practice" buttons
- `mobile/src/screens/PlayScreen.tsx` — Play tab: game-mode hub with "Find Duel" and "Solo Practice" buttons

**Navigation restructure (`mobile/src/navigation/index.tsx`)**
- Exported `MainTabParamList` (`Home` / `Play` / `Ranks` / `Me`)
- `MainTabNavigator` (Bottom Tab Navigator) wraps the 4 tab screens with `TabBar`
- Root stack: `MainTabs` (tab navigator) + full-screen flows that stack on top (Matchmaking, Duel, DuelResults, PracticeHome, Question, PracticeSummary, MatchHistory, MatchDetail, Debug)
- `RootStackParamList`: removed `Profile` and `Leaderboard` (now tab screens); added `MainTabs: NavigatorScreenParams<MainTabParamList>`

**Updated screens**
- `LeaderboardScreen` — converted to tab root (`Ranks`); removed back button; removed `userTier` param dependency (defaults `selectedTier` to `'SILVER'`); imports stripped down (no unused `navigation` / `Props` type)
- `ProfileScreen` — converted to `Me` tab; removed Find Duel / Practice / Leaderboard nav buttons (now accessible via tabs); kept Match History, Design System, Sign Out; updated type to `CompositeScreenProps`
- `DuelScreen` — `navigation.replace('Profile')` → `navigation.navigate('MainTabs')` (game error + pre-match quit)
- `DuelResultsScreen` — "Back to Home" → `navigation.navigate('MainTabs')`
- `PracticeSummaryScreen` — "Back to Home" → `navigation.navigate('MainTabs')`

**Verified:**
- `npx tsc --noEmit` in `mobile/` → 0 errors
- `npm run lint` → 0 errors

---

### Pre-5.3 Typography Migration ✅

**What was built:**
- All 13 screens migrated from raw RN `<Text>` to `AppText.Serif` / `AppText.Sans` / `AppText.Mono` with preset system
- `Button` `secondary` variant alias removed from type, bgColor, textColor, borderStyle; all 8 screens using `variant="secondary"` updated to `variant="ghost"`

**Verified:**
- `npx tsc --noEmit` → 0 errors

---

### Step 5.3.1 — Home Screen Redesign ✅

**What was built:**
- Time-based greeting: Morning (05–12), Afternoon (12–17), Evening (17–22), Late night (22–05)
- Streak sub-copy: `Ready to climb?` (0–1), `{n}-day streak` (2–6), `{n}-day streak · on fire` (7+)
- Avatar top-right taps to Me tab
- 3-stat Card (flexDirection: row, internal dividers): Rating `◆ N` + delta in accentDeep/coral/ink3, Tier name in tier color + distance to next tier, Win% (computed client-side from last 20 games) + `last 20`
- Big ink Play card: eyebrow, serif 40 "Play", sub, divider, CTA row with accent arrow circle
- Practice secondary row with sub-copy
- Graceful fallbacks: `currentStreak` and `ratingChangeToday` default to 0/null (not yet in backend); win% shows `—` if no history

**Bug fix (same session):**
- Dark mode: Play card now inverts correctly — light bg (`theme.ink` = cream) + dark text in dark mode; dark bg + white text in light mode. Uses `mode` from `useTheme()` to derive `playCardBg`, `playTextPrimary`, `playTextMid`, `playTextFaint`, `playTextFainter`, `playDividerBg`.

**Verified:**
- `npx tsc --noEmit` → 0 errors

---

### Step 5.3.2 — Matchmaking Searching Redesign ✅

**What was built:**
- Full-bleed centered layout (no header, no back button)
- `RippleRing` sub-component: built-in `Animated` API (no Reanimated), `setTimeout` stagger at 0/800/1600ms, `scale 0.5→1.5` + `opacity 0.85→0` over 2400ms loop with `Easing.out(Easing.ease)`. 3 rings `position: absolute` inside RING_SIZE=200 container — all centered automatically
- Avatar (xl) inside 104×104 card with moss shadow, centered over rings (non-absolute, centered by container)
- Status chip with pulsing dot (opacity 1↔0.25, 700ms each)
- Phase enum: `CONNECTING | SEARCHING | FOUND` (no IDLE — auto-joins queue on socket connect)
- Elapsed counter starts at SEARCHING; widens Elo range from ±150 to ±300 at 30s
- Hint lines: `matching by rating · ◆{low} – ◆{high}` and `10-min duel · mixed`
- Fetches `/auth/me` for the current profile; live matchmaking stats were removed for now
- Cancel → `navigation.navigate('MainTabs')`

**Verified:**
- `npx tsc --noEmit` → 0 errors

---

---

### Step 5.3.3 — Matchmaking Found Screen Redesign ✅

**What was built:**

**Server (`server/src/services/matchmaking.ts`)**
- Added `gamesPlayed` to both player DB selects in `createMatch`
- Added `ratingImpactFor()` — computes `{ win, loss }` Elo delta preview using existing `calculateElo` service
- Each player's `match:found` emission now includes their personal `ratingImpact` payload

**Mobile navigation (`mobile/src/navigation/index.tsx`)**
- Added `Found` to `RootStackParamList` with params `{ gameId, opponent, ratingImpact: { win, loss } | null }`
- Registered `FoundScreen` in the stack (gesture disabled like Duel)

**`mobile/src/screens/MatchmakingScreen.tsx`**
- `match:found` handler now navigates to `Found` (passing `ratingImpact`) instead of directly to `Duel`

**`mobile/src/screens/FoundScreen.tsx`** (new)
- Eyebrow: `OPPONENT FOUND` (mono uppercase, ink3, centered)
- Headline: `you vs {name}` — heroSerif 26, opponent name in SourceSerif italic + accentDeep
- VS row: two `SideCard`s (`flex: 1` each) with italic "vs" between
  - You: `card` bg + 1px `line` border; your avatar/name/elo/tier+winRate (fetched from `/auth/me` + `/games/stats`)
  - Opponent: `accentSoft` bg, no border; derived tier from elo via `getTier()`
- Rules Card: 2×2 grid — `DURATION · 10:00`, `QUESTIONS · 20`, `SECTIONS · Mixed`, `SCORING · +1 per correct`
- Rating impact chip: `accentSoft` bg + `accentDeep` text, shows only when `ratingImpact` present
- Start banner: `ink` background, accent box with animated countdown digit (scale 1.2→1 + opacity 0→1, 300ms per tick), serif "starting in" text in `bg`-color
- Countdown: 3→2→1 then auto-`navigation.replace('Duel', ...)` at 0
- Abandon note: "leaving now counts as a loss" (Sans small, ink3, centered)

**Verified:**
- `npx tsc --noEmit` → 0 errors (mobile + server)

---

---

### Step 5.3.4 — Duel Screen Redesign ✅

**What was built:**

**`mobile/src/screens/DuelScreen.tsx`** (full rewrite)

**Socket additions:**
- `opponent:progress` listener — updates `opponentProgress: { currentQuestion, questionsAnswered }` in state; the server emit for this is wired in Step 5.5.2

**State changes:**
- Added `opponentProgress: OpponentProgress | null` to `DuelState`
- Removed `lastAnswerCorrect` (no feedback border in new design — fade handles transition)

**ACTIVE phase redesign:**
- **HUD** — three-column row: you (avatar sm + serif 22 score + "you" label) | italic serif "vs" | opponent (avatar sm + serif 22 score + progress ping label)
  - Opponent progress ping: blinking dot (opacity 1↔0.3, 700ms each) + `{name} · on Q{n}`; solid dot when `done`; plain name when no progress yet
  - Score pulse updated to `scale 1→1.15→1, 180ms` (was spring animation)
- **Progress + Timer row** — 3px accent fill bar (`(questionNumber-1)/totalQuestions` width) + right-aligned mono timer (coral + JetBrains SemiBold at `<60s`)
- **Q-meta row** — `CATEGORY · SUBTOPIC` (mono uppercase, left, flex:1) + `Q N of N` in pill (mono, line border, right)
- **Options** — serif letter key (`scoreLg`, accentDeep when selected) + sans body text; selected state = `accentSoft` bg + `accent` border (was ink border + bg2)
- **Question fade** — fade-out (200ms) on `game:question`, update state in callback, fade-in (200ms)
- **Footer** — full-width `Submit` primary button, hidden while `showFeedback`; Quit is a small absolutely-positioned label top-right
- **PREMATCH/COUNTDOWN** — minimal: centered serif "connecting..." / "Get ready" + mono count

**Verified:**
- `npx tsc --noEmit` → 0 errors

---

---

### Post-5.3.4 — Seamless FoundScreen→DuelScreen transition ✅

**Problem solved:** After FoundScreen navigated to DuelScreen, there was a blank screen while DuelScreen waited for `game:start`. Then the question loaded mid-countdown or after it, creating a jarring experience.

**What was built:**

**`mobile/src/services/socket.ts`**
- Replaced the consume-once `getOrCreateGameSocket` pattern with a shared-socket pattern
- `getGameSocket()` — creates the `/game` socket on first call, returns the same promise on subsequent calls
- `releaseGameSocket()` — clears the module-level promise; called by DuelScreen on cleanup
- Removed `preConnectGameSocket` and `createGameSocket` exports (no longer needed)

**`mobile/src/navigation/index.tsx`**
- Exported `ClientQuestion` and `InitialGameState` interfaces (used across FoundScreen + DuelScreen)
- Added `initialState: InitialGameState` to `Duel` params

**`mobile/src/screens/FoundScreen.tsx`**
- Replaced `preConnectGameSocket` call with `getGameSocket()` on mount — connection starts immediately
- Emits `game:join` once connected; re-emits on reconnect
- `game:start` payload now stored in state (`initialState`) instead of triggering navigation immediately
- Navigation to Duel only happens when BOTH conditions are true: countdown reaches 0 AND `initialState` is received
  - If server responds fast (before countdown ends): waits for countdown
  - If server is slow (after countdown ends): waits for `game:start`

**`mobile/src/screens/DuelScreen.tsx`**
- Initialized `DuelState` from `initialState` params — `currentQuestion`, `questionNumber`, `totalQuestions`, `timeRemaining` all pre-populated on mount
- Uses `getGameSocket()` (shared socket, already connected)
- Removed `game:start` handler — game is already started when DuelScreen mounts
- Timer starts in the `connect()` effect immediately on mount (not inside `game:start` handler)
- Re-emits `game:join` on reconnect only (FoundScreen already joined for the initial connection)
- Removed blank-view guard (`!ds.currentQuestion` was always false with initialState-init)
- Calls `releaseGameSocket()` in cleanup

**Verified:**
- FoundScreen stays visible and counts down fully before navigating
- DuelScreen mounts with first question already showing — no blank screen, no extra connecting delay

---

---

### Step 5.3.5 — Duel Results Screen Redesign ✅

**What was built:**

**`mobile/src/screens/DuelResultsScreen.tsx`** (full rewrite)

**Hero block (border-bottom):**
- Verdict row: italic serif `Victory.` / `Defeat.` / `Draw.` (accentDeep / coral / ink2) on the left; large mono delta `+14` / `-12` (deltaLg preset, 26px JetBrains-SemiBold) color-matched on the right
- Elo sub-line: `◆ 842 → 856 · Silver` (mono ink3)
- Tier-change chip (if `tierChanged`): `promoted to gold` (accentSoft/accentDeep) or `dropped to silver` (coralSoft/coral) — pill shape, monospace eyebrow label
- Score split bar: 8px height, accent fill (your fraction) + 2px gap + ink3 fill (their fraction), `overflow: hidden` for clean pill shape; score numbers below in statVal serif (yours ink, theirs ink3)
- Forfeit pill (if `isForfeit`): amber centered pill — `opponent forfeited` / `you forfeited`

**Question review section:**
- Eyebrow header: `QUESTION REVIEW` (mono uppercase ink3)
- One compact Card row per attempted question: Q-number (mono 13px) | topic name (Sans bodyMed) + category (mono eyebrow) | 22×22 MarkCircle
- MarkCircle: `✓` on accentSoft for correct, `✗` on coralSoft for wrong, `—` on line2 if null

**Actions (border-top):**
- `Home` ghost + `Rematch →` primary (flex: 1) side by side

**Bonus fix:**
- `DuelState.currentQuestion` changed from `ClientQuestion | null` to `ClientQuestion` (always initialized from `initialState` params — never null)

**Verified:**
- `npx tsc --noEmit` → 0 errors

---

### Post-5.3.5 — Results screen bug fixes ✅

**Bug 1 — 6 rows instead of 3 (both players' answers shown):**
- Root cause: `GET /api/games/:id` returns all `MatchAnswer` rows for the match (both players). Client was rendering the flat array directly.
- Fix: added `userId: string` to `AnswerDetail` interface; `useMemo` groups raw answers by `questionId` into `GroupedQuestion[]` (one entry per unique question, each holding `yourAnswer` and `theirAnswer`). Renders `grouped.length` rows instead of `rawAnswers.length`.

**Bug 2 — rows not tappable / can't see questions:**
- Fix: each row is now a `Pressable` toggling `expandedId: string | null` state. When expanded shows: question text (serif) → 4 color-coded options (accentSoft = correct, coralSoft = your wrong pick, bg2 = neutral) → explanation. Chevron icon indicates collapsed/expanded state.
- Section header now shows "you / {oppName}" legend above the two mark columns.

**UI fixes:**
- Verdict text (`lineHeight: 40`) and delta text (`lineHeight: 36`) both given extra lineHeight so italic/tall glyphs aren't clipped at the top.
- Home button replaced with 52×52 Feather `home` icon (card bg, line border) to match Rematch button height.
- Delta aligned with `marginTop: 5` to compensate for verdict's extra leading.

---

---

### Step 5.3.6 — Profile / Me Screen Redesign ✅

**What was built:**

**`mobile/src/screens/ProfileScreen.tsx`** (full rewrite)

- Avatar xl centered at top (moss gradient, debug tap ×5 → Debug screen)
- Serif name + inline `edit` touch target; tap opens edit modal
- Rating row: `◆ {eloRating}` (mono) + `TierBadge small` inline
- 3-stat Card (same pattern as HomeScreen): matches played / win rate / peak rating
  - Fetches `/games/stats` in parallel with `/auth/me`; `winRate` (0–1 fraction) shown as `%`; `peakElo` shown as `◆ N`; falls back to `gamesPlayed` from profile if stats fetch fails
- Hairline (2px) tier progress bar + mono eyebrow label: `{N} to {NextTier}` or `max rank`
- Card-style list rows: Match History → navigate, Settings → placeholder (built in 5.8), Sign Out → coral
- Error state: serif heading + body + Retry button
- Pull-to-refresh tinted accent

**Verified:**
- `npx tsc --noEmit` → 0 errors

---

---

### Step 5.3.7 — Ranks / Leaderboard Screen Redesign ✅

**What was built:**

**`mobile/src/screens/LeaderboardScreen.tsx`** (redesign)

- Underline-style segmented tab control (3 tabs, `borderBottomWidth: 2` active indicator, mono uppercase labels) replacing filled pill tabs
- Row: card with `line` border + `accentSoft` bg + `accent` border for current user row
  - Rank column: emoji medal for top 3, mono `#N` for others
  - Avatar sm (`you` variant for current user, `opponent` for others)
  - Serif name + TierBadge small
  - `◆ {eloRating}` mono right
- Rank banner: mono eyebrow `YOUR RANK · #N OF M` in `accentSoft`
- Unranked nudge: mono eyebrow in `bg2`
- Empty state: serif editorial heading (`Play a few matches to earn your rank.` / `Be the first.`) + body copy
- Tier picker modal cleaned up: `SELECT TIER` mono eyebrow heading, `accentSoft` bg on selected tier

**Verified:**
- `npx tsc --noEmit` → 0 errors

---

### Step 5.3.8 — Match History Screen Redesign ✅

**What was built:**

**`mobile/src/screens/MatchHistoryScreen.tsx`** (redesign)

- Card-style rows (`card` bg, `line` border, `borderRadius: 12`, `overflow: hidden`) replacing flat border-bottom rows
- Left 4px stripe: `accent` (WIN) / `coral` (LOSS) / `ink3` (DRAW)
- Avatar sm (`opponent` variant) for each entry
- Serif opponent name (italic preset, 15px override)
- Combined result line: `WIN · 12-9` (sans bodyMed, stripe color) replacing separate outcome pill + score
- Forfeit suffix: ` · forfeit` appended inline
- Elo delta right-aligned (accentDeep / coral / ink3)
- Smarter timestamp: `Today, 6:42 PM` / `Yesterday, 6:42 PM` / `Apr 17, 6:42 PM`
- Editorial empty state: serif "No matches yet." + body "Find your first duel."
- `ItemSeparatorComponent` (8px gap) replacing border-bottom

**Verified:**
- `npx tsc --noEmit` → 0 errors

---

### Step 5.3.9 — Practice Screens Redesign ✅

**What was built:**

**`mobile/src/screens/PracticeHomeScreen.tsx`** (redesign)
- Removed emojis; sections as accent-chip-style cards (QUANT/DILR/VARC mono label + sans subtitle)
- Difficulty as pill chips (`ink` bg when selected)
- CTA: `Begin Practice →` primary

**`mobile/src/screens/QuestionScreen.tsx`** (redesign)
- Timer display removed (time still tracked internally for stats)
- Option letter key: `AppText.Serif preset="scoreLg"` replacing mono — matches Duel screen
- Selected option: `accentSoft` bg + `accent` border + `accentDeep` letter (was `bg2` + `ink`)
- Explanation: inline below options inside ScrollView (replaced slide-up Animated panel)
- Footer shows `Submit` before answer, `Next →` after — no panel toggle logic
- noMore state: editorial serif "You've seen every question in this filter." + "Try a different section." ghost button
- Per-question result tracked in session ref: `{ category, subTopic, isCorrect }[]`

**`mobile/src/screens/PracticeSummaryScreen.tsx`** (redesign)
- Serif verdict heading: `Strong.` / `Solid.` / `Keep going.` based on accuracy
- 3-stat Card: Correct / Incorrect / Total (replaces accuracy circle + 4-stat grid)
- qrow list: one Card row per answered question — Q-number (mono) · topic/subtopic · `MarkCircle` (✓/✗ with accentSoft/coralSoft bg)
- Actions: `Try Again` primary + `Home` ghost

**`mobile/src/navigation/index.tsx`**
- `PracticeSummary` params extended with optional `questions?: { category, subTopic, isCorrect }[]`

**Verified:**
- `npx tsc --noEmit` → 0 errors

---

---

---

### Step 5.4 — Animations & Haptics ✅

**What was built:**

**New package**
- `expo-haptics` installed for native tactile feedback

**New shared app preferences / motion foundation**
- `mobile/src/context/AppPreferencesContext.tsx` — central app preferences context:
  - `hapticsEnabled` persisted via platform storage
  - `reduceMotionEnabled` reads OS Reduce Motion via `AccessibilityInfo`
  - `playHaptic()` maps app moments to Expo haptic feedback
- `mobile/App.tsx` — wraps the app in `AppPreferencesProvider`
- `mobile/src/components/ScreenTransitionView.tsx` — shared screen-entry fade + scale `0.99 → 1`, disabled when Reduce Motion is on

**Motion / haptics wired into the core flow**
- `Button` press animation changed to explicit 80ms scale-to-0.98 timing; disabled when Reduce Motion is enabled
- `MatchmakingScreen`:
  - screen-entry transition
  - ripple rings and status dot respect Reduce Motion
  - `match_found` success haptic when a match is found
- `FoundScreen`:
  - screen-entry transition
  - countdown digit animation respects Reduce Motion
  - light haptic on countdown ticks
- `DuelScreen`:
  - screen-entry transition
  - opponent ping dot respects Reduce Motion
  - score pulse disabled under Reduce Motion
  - light haptic on answer submit
  - one-time warning haptic when timer crosses 60s
  - success/warning haptic on win/loss; draw stays silent
- `DuelResultsScreen`:
  - screen-entry transition
  - score split bar now animates via measured width-based `Animated.Value`s over 600ms
  - reduced motion snaps score bar to final width
- Home / Ranks / Match History / Me:
  - pull-to-refresh light haptic
  - screen-entry transition on tab roots where appropriate

**Bug fixed during testing:**
- Results score split bar originally used a layout/flex animation and appeared instantly on-device. Replaced with explicit measured-width animation so it visibly grows in.

**Verified:**
- `npx tsc --noEmit` in `mobile/` → 0 errors

**Remaining tie-in:**
- Settings UI for toggling haptics is still part of Step 5.8; the preference/storage layer is ready.

---

### Step 5.5 — New Backend Features ✅

**5.5.1 Rating impact preview — already completed in Step 5.3.3**
- Server sends per-player `ratingImpact: { win, loss }` in `match:found`
- Found screen renders the rating impact chip

**5.5.2 Opponent progress ping**
- `server/src/services/gameSession.ts` now emits `opponent:progress` after a valid answer submit:
  - payload: `{ currentQuestion, questionsAnswered }`
  - opponent HUD updates live with `name · on Q{n}` / `done`
- `game:sync` includes `opponentProgress`, so reconnecting mid-match restores the HUD state instead of showing a blank opponent progress label
- Mobile `DuelScreen` consumes the sync payload and keeps the existing ping UI working

**5.5.3 Daily streak**
- `server/prisma/schema.prisma`:
  - `currentStreak Int @default(0) @map("current_streak")`
  - `longestStreak Int @default(0) @map("longest_streak")`
  - `lastActiveDate DateTime? @map("last_active_date") @db.Date`
- Migration added:
  - `server/prisma/migrations/20260420103000_add_user_streak_fields/migration.sql`
- `server/src/services/streak.ts`:
  - `touchStreak(userId)` with 1-hour Redis throttle
  - UTC day boundary for v1
  - same-day no-op, yesterday increments, missed day resets to 1
- `authMiddleware` calls `touchStreak()` after auth/user creation and refreshes `req.user` when streak changes
- `GET /api/auth/me` now also returns `ratingChangeToday`, computed from today’s match Elo deltas
- Home already reads `currentStreak` / `ratingChangeToday`, so the existing header copy now has real backend data

**Verified:**
- `npm run type-check` in `server/` → 0 errors
- `npx tsc --noEmit` in `mobile/` → 0 errors
- Prisma client regenerated
- Local SQL migration applied directly with `prisma db execute` after starting local Postgres/Redis containers

---

### Reliability Refactor — Matchmaking Pre-Start Lifecycle ✅

**Problem fixed:**
- Previously `active_game:{userId}` was set as soon as a match was found. If one device failed to enter the game after `match:found`, both users could get stuck with "already in game" until the Redis TTL expired.

**Server lifecycle changes**
- Added a two-phase lock model:
  - `pending_match:{userId}` for pre-start reservation
  - `active_game:{userId}` only after the duel becomes `ACTIVE`
- `GameState.status` expanded to:
  - `FOUND`
  - `WAITING_FOR_PLAYERS`
  - `COUNTDOWN`
  - `ACTIVE`
  - `FINISHED`
  - `CANCELLED`
- `initializeGame()` now:
  - creates Redis game state before `match:found` is emitted
  - sets `pending_match` keys with short TTL
  - schedules a 10-second pre-start timeout
  - does **not** set `active_game`
- Countdown completion now:
  - verifies both players are still joined
  - sets both `active_game` keys
  - clears both `pending_match` keys
  - emits `game:start`
- Pre-start cancellation clears pending/game/start/end/cancel keys and never persists a match result
- Active-duel disconnect/force-close now uses a short 15-second forfeit grace window

**Socket/API contract additions**
- New game namespace events:
  - `match:status` — `{ gameId, status: 'waiting_for_opponent' | 'countdown', seconds? }`
  - `match:cancelled` — `{ gameId, reason: 'join_timeout' | 'opponent_left' | 'cancelled' }`
  - `match:requeueing` — `{ gameId, reason }`
- `queue:join` now resumes a valid `pending_match` by re-emitting `match:found` instead of blocking.
- `GET /api/games/active` still returns only true active duels because `active_game` is now set only at `ACTIVE`.

**Mobile changes**
- `FoundScreen` is now a real pre-start orchestration screen:
  - connects to `/game`
  - emits `game:join`
  - displays `waiting for opponent` until the server sends countdown status
  - navigates to `Duel` only when both local countdown is done and `game:start` has arrived
- Pre-start copy changed from "leaving now counts as a loss" to status-oriented copy.
- `match:requeueing` disconnects the shared game socket and routes back to `Matchmaking` with a retry notice.
- `MatchmakingScreen` accepts an optional `notice` route param for auto-requeue messages.
- `mobile/src/services/socket.ts` adds `disconnectGameSocket()` for clean pre-start cancellation/requeue.

**Verified:**
- `npm run type-check` in `server/` → 0 errors
- `npx tsc --noEmit` in `mobile/` → 0 errors

**Manual runtime checks completed/recommended:**
- Both players join within 10s → countdown → duel starts
- One player never joins → connected player auto-requeues
- Both players close app before start → no stale active lock
- Player disconnects during countdown → no loss, pre-start cancels/requeues
- Player force-closes during active duel → opponent sees disconnect banner and receives forfeit win after ~15s ✅
- Force-closed player reopens after forfeit → can queue again ✅

**Follow-up active-duel reliability fix:**
- Replaced the old 2-minute `ACTIVE` disconnect wait with a 15-second grace timer.
- Added `opponent:disconnected` / `opponent:reconnected` socket events.
- `DuelScreen` now shows an opponent-disconnected banner while the grace timer is active.
- `endGame()` clears both players' active forfeit timers when a duel finishes.
- `GET /api/games/active` now returns resumable active duel data and clears stale `active_game` locks when Redis state is missing/not active.
- `queue:join` now emits `queue:active_game` with resume payload instead of dead-ending on "already in game".
- `PlayScreen` / `MatchmakingScreen` route users back into active duels when needed.
- Verified manually on device by force-closing one player during an active duel.
- Pushed to GitHub on branch `codex`:
  - `ff55a54 Refactor matchmaking pre-start lifecycle`

---

### Step 5.6 — Onboarding Flow ✅

**What was built:**

**Backend**
- `server/prisma/schema.prisma`:
  - `onboardingCompletedAt DateTime? @map("onboarding_completed_at")`
- Migration added:
  - `server/prisma/migrations/20260423120000_add_onboarding_completed_at/migration.sql`
- `PATCH /api/users/me` now accepts `onboardingCompletedAt` as an ISO datetime and stores it on the current user.

**Mobile**
- `mobile/src/screens/OnboardingScreen.tsx` — four-slide editorial onboarding flow:
  - `CAT Duel.` / `prep like you compete.`
  - `Match up. Race to solve.`
  - `Climb from Bronze to Diamond.`
  - `Ready.` with `Practice first` and `Find a match` CTAs
- Slides use existing Studyhall primitives (`AppText`, `Button`, `Card`, `Avatar`, `TierBadge`) and theme tokens.
- Skip on slides 1–3 completes onboarding and lands on Home.
- Final CTAs complete onboarding and redirect to Practice or Matchmaking.
- `RootNavigator` now fetches `/auth/me` after Firebase auth and gates:
  - signed out → Login
  - signed in without `onboardingCompletedAt` → Onboarding
  - signed in with `onboardingCompletedAt` → Main app

**Verified:**
- `npx prisma generate` in `server/` → generated client updated
- `npm run type-check` in `server/` → 0 errors
- `npx tsc --noEmit` in `mobile/` → 0 errors

---

### Step 5.7 — Loading, Empty, Error States ✅

**What was built:**

**Packages installed**
- `zod`, `react-native-toast-message`

**New shared utilities/components**
- `mobile/src/components/Skeleton.tsx` — shared Studyhall skeleton primitives using `theme.card` / `theme.line`, with reduced-motion support.
- `mobile/src/services/toast.ts` — top-anchored network toast helper.
- `mobile/src/services/api.ts` — response interceptor shows a short network toast when a request fails before receiving a server response.
- `mobile/App.tsx` — mounted the toast host.

**Loading skeletons**
- Home: header avatar, stats card, play card, practice row.
- Ranks: leaderboard row skeletons.
- Match History: history card skeletons.
- Profile: avatar/name/stats/list skeletons.
- Duel Results: question-review breakdown skeletons.

**Empty/error state polish**
- Home, Ranks, Match History, Profile, and Results breakdown now use the standard error pattern: `Couldn't load.` / `Check your connection and try again.` / `Retry`.
- Match History empty state now includes the primary `Find Duel` CTA.
- Ranks tier-empty copy now names the selected tier: `Be the first Diamond.`
- Practice Home shows `You haven't practiced yet.` with a primary start CTA when practice total is zero.
- `QuestionScreen.loadNextQuestion()` now keeps exhausted-question state distinct from real fetch errors.

**Display name fixes**
- Signup display name is required and validated client-side with Zod (2–30 chars) before Firebase `updateProfile`.
- Profile edit modal now uses the same Zod validation and limits input to 30 chars before `PATCH /api/users/me`.

**Verification:**
- `npx tsc --noEmit` in `mobile/` → 0 errors
- Root `npm run lint` → 0 errors

---

### Step 5.8 — Settings Screen ✅

**What was built:**

**Mobile**
- `mobile/src/screens/SettingsScreen.tsx` — Studyhall-styled Settings screen opened from Me → Settings.
- Account section includes read-only email, display-name edit modal, password reset email for email-auth users, sign-out confirmation, and type-to-confirm delete-account modal.
- Appearance section includes live theme segmented control (`System` / `Light` / `Dark`), haptics toggle, and persisted anonymous analytics toggle.
- About section includes version/build fallback, Privacy Policy, Terms, and Contact actions using existing Expo/browser/linking capabilities.
- `mobile/src/context/AppPreferencesContext.tsx` now persists `analyticsEnabled` for Step 5.11 PostHog opt-out wiring.

**Backend**
- `DELETE /api/users/me` now blocks active duels with `ACTIVE_MATCH`, deletes dependent match/practice data in a transaction, removes the user row, then deletes the Firebase Auth user via Admin SDK.

**Verified:**
- `npx tsc --noEmit` in `mobile/` → 0 errors
- `npm run type-check` in `server/` → 0 errors
- Root `npm run lint` → 0 errors
- `npm test` in `server/` → 21 tests passing

---

### Step 5.9 — Deep Linking ✅

**What was built:**

**Mobile**
- `mobile/app.json` now declares iOS associated domains and Android verified-link intent filters for `https://catduel.app/profile/*`, `/match/*`, and `/leaderboard*`, while keeping the existing `catduel://` dev scheme.
- `mobile/src/navigation/linking.ts` defines React Navigation linking prefixes/routes plus canonical share URL helpers.
- `mobile/App.tsx` wires the linking config into `NavigationContainer`.
- `mobile/src/navigation/index.tsx` preserves protected destinations through login/onboarding, then resolves pending links with `navigationRef.resetRoot()` once auth, onboarding, and navigation are ready. Internal redirect screens are not exposed as browser URLs.
- Added `PublicProfileScreen` for read-only `/profile/:userId` links so the Me tab remains focused on account actions.
- `/match/:matchId` opens existing match detail, and `/leaderboard/:tier` opens the Ranks tab with the tier preselected.
- Share actions added on Me, Duel Results, and Ranks using editorial CAT Duel URLs.
- Added `ShareLinkModal` so web and native users can see/select/copy generated links consistently; the system share helper remains isolated in `services/share.ts`.
- Local share links can use `EXPO_PUBLIC_APP_URL=http://<local-ip>:8081/--`; production falls back to `https://catduel.app`.

**Docs**
- Drafted site-association payloads in `docs/deep-linking/` for Phase 6 hosting:
  - `apple-app-site-association.json`
  - `assetlinks.json`

**Verified:**
- `npx tsc --noEmit` in `mobile/` → 0 errors
- Root `npm run lint` → 0 errors

---

### Step 5.10 — Accessibility Pass ✅

**What was built:**

**Shared components**
- `mobile/src/components/Button.tsx` now exposes button role, label/hint overrides, and disabled/loading accessibility state.
- `mobile/src/components/TabBar.tsx` now labels each tab and preserves selected state for screen readers.
- `mobile/src/components/ShareLinkModal.tsx` now uses the passed modal title, marks the modal as accessibility-modal, labels the share URL field, and labels the copy action.

**Mobile screen pass**
- Added labels, roles, hints, and selected/disabled states to key custom controls across Login, Home, Profile, Ranks, Practice, Duel, Duel Results, Match History, Match Detail, Onboarding, and Settings.
- Added accessible names for form fields and destructive confirmation inputs.
- Added modal close handling for native back/escape behavior on share/edit/delete/tier picker modals.
- Added selected state to segmented controls, leaderboard tabs, practice filters, answer choices, and expandable review rows.

**Verification:**
- `npx tsc --noEmit` in `mobile/` → 0 errors
- Root `npm run lint` → 0 errors
- No root/mobile test script is currently defined; server tests were not run because this pass touched mobile accessibility only.

---

### Step 5.11 — Lightweight Analytics Instrumentation ✅

**What was built:**

**Analytics wrapper**
- `mobile/src/services/analytics.ts` now exposes a small provider-agnostic wrapper:
  - `init()`
  - `track()`
  - `identify()`
  - `reset()`
  - `setEnabled()`
- The wrapper logs events in development only for now; no PostHog dependency was added yet.
- Screens call the wrapper instead of importing any analytics SDK directly, so PostHog can be added later in one focused patch.

**Privacy guardrails**
- Analytics property sanitization drops sensitive or overly specific fields:
  - email
  - display name
  - Firebase UID
  - raw paths
  - user ID fields outside the identify call
  - question text / answer text
- Deep-link analytics now records route names only (`profile`, `match`, `leaderboard`, `leaderboard_tier`) instead of raw URLs or IDs.
- Share analytics now records only the surface (`profile`, `results`, `ranks`) instead of user/match IDs.

**Opt-out + lifecycle**
- Settings → Anonymous analytics now controls the analytics service state via `AppPreferencesContext`.
- Turning analytics off clears the in-memory identified user.
- Login/profile hydration calls `identify()` with non-sensitive beta properties (`tier`, `gamesPlayed`, `currentStreak`) when the app user id is available.
- Logout calls `reset()`.

**Beta events wired**
- `onboarding_completed` — destination selected after onboarding
- `rating_preview_shown` — win/loss/draw deltas once per Found screen
- `match_started` — ranked 10-minute match start
- `match_ended` — result + rating delta
- `streak_changed` — only when `/auth/me` returns a changed streak value
- `share_initiated` — profile/results/ranks surface
- `deeplink_opened` — sanitized route name only
- `app_error` — render error message + whether a component stack exists

**Error boundary**
- Added `mobile/src/components/AppErrorBoundary.tsx`.
- `mobile/App.tsx` wraps the app in the boundary and emits `app_error` for render crashes.
- Friendly fallback UI is shown if a root render error occurs.

**Verification:**
- `npx tsc --noEmit -p mobile/tsconfig.json` → 0 errors
- `npm run type-check` → 0 errors
- Root `npm run lint` → 0 errors
- Root `npm test` is not available because no `test` script is defined.

**Pushed:**
- `ef1843c Implement lightweight analytics instrumentation` to `main`

---

## Up Next

- **Step 5.12** — Store asset prep

### Step 5.12 — Store Asset Prep 🚧

**What was started:**
- Replaced default Expo placeholder PNGs with deterministic local Studyhall identity assets:
  - `mobile/assets/icon.png` — 1024×1024 ink rounded-square with amber diamond mark.
  - `mobile/assets/adaptive-icon.png` — 1024×1024 transparent Android foreground mark.
  - `mobile/assets/splash-icon.png` — 1024×1024 transparent light-mode splash mark.
  - `mobile/assets/splash-icon-dark.png` — 1024×1024 transparent dark-mode splash mark.
  - `mobile/assets/favicon.png` — 48×48 matching web favicon.
- Updated `mobile/app.json` splash and adaptive icon backgrounds to Studyhall token colors:
  - light splash `#FAF7F2`
  - dark splash `#141312`
  - Android adaptive background `#FDF3E0`

**Verified:**
- PNG dimension/type check via `file mobile/assets/*.png`
- `npx expo config --json` in `mobile/` resolves new splash/adaptive config
- `npx tsc --noEmit -p mobile/tsconfig.json` → 0 errors
- Root `npm run lint` → 0 errors

**Still remaining for 5.12:**
- Store listing copy/docs
- Privacy Policy + Terms drafts in `docs/legal/`
- Screenshot framing/capture workflow
- EAS production build config and signed build verification

---

## Phase 6: Web Adaptation

### Step 6.1 — Foundation Cleanup ✅

**What was built:**
- `AuthContext` now branches Google sign-in by platform:
  - Web uses Firebase `signInWithPopup`.
  - Popup-blocked / popup-closed errors fall back to `signInWithRedirect`.
  - `getRedirectResult` runs once on web provider mount to complete pending redirect sign-ins.
  - Web auth initialization includes Firebase `browserPopupRedirectResolver`, fixing `auth/argument-error` in browser Google sign-in.
  - Native keeps the existing Expo auth-session flow unchanged.
- Added `mobile/src/hooks/useDesktopLayout.ts` as the single runtime breakpoint hook:
  - `Platform.OS === 'web'`
  - viewport width `>= 1024`
  - desktop-like input capability via `(hover: hover) and (pointer: fine)`
- Added the Phase 6 screen variant scaffold for:
  - Home
  - Live Duel
  - Matchmaking
  - Results
  - Leaderboard
  - Profile
  - Practice Home
  - Practice Question
  - Login
- Existing implementations were moved to `.mobile.tsx`.
- New `.desktop.tsx` files currently alias the mobile implementations until Step 6.4 builds the real desktop layouts.
- Original screen filenames now remain stable as tiny runtime switchers, so existing navigation imports keep working.

**Verified:**
- `npx tsc --noEmit -p mobile/tsconfig.json` → 0 errors
- Root `npm run lint` → 0 errors
- Root `npm run type-check` → 0 errors
- `npm test --workspace=server` → 21 tests passing
- `npx expo export --platform web` in `mobile/` → exported successfully

**Up next for Phase 6:**
- Step 6.2 — Layout primitives and left rail

### Phase Naming Cleanup ✅

**What changed:**
- Renamed the pre-launch cleanup tracker from `PRE_PHASE6_ISSUES.md` to `PRE_PHASE7_ISSUES.md`.
- Updated the doc headings/body so launch-and-scale cleanup now gates Phase 7, keeping Phase 6 reserved for Web Adaptation.

### Step 6.2 — Layout Primitives & Left Rail 🚧

**What was started:**
- Added desktop web layout primitives:
  - `mobile/src/components/web/DesktopFrame.tsx`
  - `mobile/src/components/web/LeftRail.tsx`
  - `mobile/src/components/web/NavRow.tsx`
  - `mobile/src/components/web/PageContainer.tsx`
  - `mobile/src/components/web/EyebrowLabel.tsx`
  - `mobile/src/components/web/DesktopHero.tsx`
- Added shared web hooks:
  - `mobile/src/hooks/useCurrentProfile.ts`
  - `mobile/src/hooks/useKeyboardShortcuts.ts`
  - `mobile/src/hooks/useDocumentTitle.ts`
  - `mobile/src/hooks/useUnsavedChangesWarning.ts`
- Desktop placeholder screens that use persistent chrome now render inside `DesktopFrame` so the left rail can be verified at desktop width while the full screen redesigns remain deferred to Step 6.4.
- Login and Matchmaking remain unwrapped for now because the Phase 6 plan treats them as focused/no-rail desktop surfaces.

**Verified:**
- `npx tsc --noEmit -p mobile/tsconfig.json` → 0 errors
- Root `npm run lint` → 0 errors
- Root `npm run type-check` → 0 errors

### Step 6.3 — Backend Additions ✅

**What was built:**
- Added denormalized duel outcome fields to `User`:
  - `wins Int @default(0)`
  - `winRate Float @default(0)`
- Added migration `20260428000000_add_user_wins_win_rate`.
- Updated match persistence so completed duels increment `gamesPlayed`, set `wins`, and recompute `winRate` as a 0–1 fraction for both players.
- Added `server/scripts/backfill-wins.ts` to backfill existing users from stored match winners.
- Extended leaderboard entries with `winRate`.
- Extended the global leaderboard response with `tierCounts`, grouped by `rankTier` for ranked users.
- Bumped leaderboard Redis cache keys so old cached payloads do not mask the new fields.

**Deferred by decision:**
- Weekly climbers endpoint
- Topic mastery endpoint

**Verified:**
- `npx prisma generate --schema server/prisma/schema.prisma` → generated successfully
- `npm run type-check --workspace=server` → 0 errors
- `npm run lint --workspace=server` → 0 errors
- `npm test --workspace=server` → 21 tests passing
- `npx tsc --noEmit --target ES2020 --module commonjs --strict --esModuleInterop --skipLibCheck --types node server/scripts/backfill-wins.ts` → 0 errors
- Root `npm run lint` → 0 errors
- Root `npm run type-check` → 0 errors

### Step 6.4.1 — Home Desktop ✅

**What was built:**
- Replaced the placeholder desktop Home wrapper with a real desktop layout in `mobile/src/screens/HomeScreen.desktop.tsx`.
- Reused existing data sources for the desktop Home view:
  - `/auth/me` via `useCurrentProfile`
  - `/games/stats`
  - `/games/history?page=1&limit=5`
  - `/leaderboard/global` as a temporary source for the right-rail climbers card
- Added the desktop Home sections from the Phase 6 plan:
  - greeting header with disabled search/notification placeholders
  - 4-cell stat strip
  - large Play hero card
  - Practice / Custom / Quick mode cards
  - recent matches list
  - right rail with climbers and friends-online placeholder
- Wired Home desktop web behavior:
  - `useDocumentTitle('CAT Duel')`
  - `P` keyboard shortcut to matchmaking with a small hero acknowledgement pulse
- Adjusted shared desktop chrome:
  - `DesktopFrame` now allocates main/right rail width proportionally so the center panel remains dominant without hardcoded panel widths.
  - `LeftRail` no longer renders a duplicate Play hero card; navigation starts with the standard compete rows.
  - `TabBar` hides itself at the desktop breakpoint so the left rail is the only desktop navigation surface.
- Fixed Home hero contrast so the card inverts by theme:
  - light mode uses a dark hero card with light text
  - dark mode uses a light hero card with dark text

**Deferred by decision:**
- Real weekly climbers endpoint; Home temporarily uses the existing global leaderboard response.
- Visual browser QA beyond the running local Expo web server.

**Verified:**
- `npx tsc --noEmit -p mobile/tsconfig.json` → 0 errors
- `npx eslint mobile/src/components/web/LeftRail.tsx mobile/src/screens/HomeScreen.desktop.tsx mobile/src/components/web/DesktopFrame.tsx mobile/src/components/TabBar.tsx` → 0 errors
- `git diff --check` → 0 whitespace errors

### Step 6.4.2 — Live Duel Desktop ✅

**What was built:**
- Replaced the placeholder desktop Duel wrapper with a real desktop layout in `mobile/src/screens/DuelScreen.desktop.tsx`.
- Reused the existing live duel behavior from mobile:
  - shared game socket lifecycle via `getGameSocket` / `releaseGameSocket`
  - question transitions, score pulse animations, timer updates, reconnect sync, submit, quit/forfeit, and results navigation
  - analytics events and haptic hooks remain aligned with mobile
- Added the desktop Duel surface:
  - top HUD with both players, scores, timer, question counter, and progress bar
  - two-column body with persistent question text on the left and answer options on the right
  - compact right rail with current opponent question and question navigator
  - bottom quit / submit row
- Kept Duel focused by hiding the persistent left rail only on the desktop Duel screen.
- Removed v1 scratchpad from the Phase 6 plan by decision.
- Simplified opponent live track so it shows only the question the opponent is currently on, without revealing correctness.
- Made the Duel right rail responsive via layout constraints (`18%`, min `220`, max `292`) instead of JS sizing math.
- Wired web-specific Duel behavior:
  - `1`–`4` answer selection
  - `Enter` submit
  - `Escape` quit confirmation
  - document title timer with critical-time prefix
  - `beforeunload` warning during active duels
- Added `showLeftRail`, `rightRailStyle`, and `rightRailContentStyle` options to `DesktopFrame` while preserving existing defaults for other screens.
- Updated `useDesktopLayout` to require desktop-like pointer/hover capability in addition to web width.
- Added `mobile/src/services/storage.ts` so non-sensitive preferences use `localStorage` on web and `SecureStore` on native.
- Removed the unused `/matchmaking/stats` fetch and "online / avg wait" text from `MatchmakingScreen.mobile.tsx` for now.

**Deferred by decision:**
- Scratchpad UI/backend.
- Matchmaking online count / average wait stats.
- Full authenticated live-duel browser QA with two active players.

**Verified:**
- `npx tsc --noEmit -p mobile/tsconfig.json` → 0 errors
- Root `npm run lint` → 0 errors
- Root `npm run type-check` → 0 errors
- `npx expo export --platform web` in `mobile/` → exported successfully

### Step 6.4.3 — Duel Results Desktop ✅

**What was built:**
- Replaced the placeholder desktop Results wrapper with a real desktop layout in `mobile/src/screens/DuelResultsScreen.desktop.tsx`.
- Reused existing Results data sources:
  - `route.params.results` for match outcome, Elo deltas, tiers, scoreline, and forfeit state
  - `/games/${gameId}` for answer breakdown data
  - `/auth/me` via `useCurrentProfile` for the current user's display name/avatar fallback
  - `ShareLinkModal` + `matchUrl(gameId)` for share flow
- Added the desktop Results hero:
  - `MATCH #... · ago · RANKED` breadcrumb
  - large italic serif verdict (`Victory.`, `Defeat.`, `Draw.`)
  - rating trail with Elo before/after, delta pill, and tier chip
  - right-side avatar vs-stack and large scoreline
- Added the desktop Results body:
  - question table with `# / topic / section / you / them / time`
  - inline expand/collapse review for each row
  - expanded rows show full question text, all answer options, correct/wrong highlighting, `YOU` / `THEM` tags, and explanation
  - section breakdown card for `QUANT`, `DILR`, and `VARC`
  - pace card comparing average time per answered question
  - match summary card with accuracy, answered count, score gap, and unanswered count
  - Home, Share, and Rematch actions
- Updated `/games/:id` to include `question.subTopic` so Results can display topic and section separately.
- Added document title sync: `Result: Won/Lost/Draw score-score · CAT Duel`.
- Created local ignored `todolist` with `change solo practice result page` for the deferred solo practice result redesign.

**Changed from original 6.4.3/6.4.4 plan by decision:**
- Editorial commentary engine was removed and is not shipped.
- Results rows expand inline instead of navigating to `MatchDetail`.
- The planned streak card was replaced with match-specific summary stats.

**Deferred by decision:**
- Solo practice result page redesign; tracked locally in ignored `todolist`.
- Visual browser QA of the desktop Results screen after the final layout tweaks.

**Verified:**
- `npx tsc --noEmit -p mobile/tsconfig.json` → 0 errors
- `npm run type-check --workspace=server` → 0 errors
- `git diff --check` → 0 whitespace errors

**Pushed:**
- `b5734db Implement desktop duel results screen` to `main`

### Step 6.4.5 — Leaderboard Desktop ✅

**What was built:**
- Replaced the placeholder desktop Leaderboard wrapper with a real desktop layout in `mobile/src/screens/LeaderboardScreen.desktop.tsx`.
- Reused the existing leaderboard endpoints:
  - `/leaderboard/global`
  - `/leaderboard/around-me`
  - `/leaderboard/tier/:tier`
- Added the desktop Leaderboard surface:
  - header strip with italic serif title, hardcoded v1 season copy, Global/Friends scope control, and current-rank pill
  - left panel with global top-3 podium and tier ladder
  - right panel with rank table and Global / Around Me tabs
  - clickable tier ladder rows that switch the rank table to that tier
  - loading, error, empty, current-user highlight, and unranked states
- Used existing `tierCounts`, `winRate`, and `gamesPlayed` fields from the current backend response.
- Added document title sync: `Leaderboard · CAT Duel`.

**Changed from original 6.4.5 plan by decision:**
- Weekly climbers were not added. The podium uses existing global top 3 instead.
- Streaks were removed from the leaderboard table.
- The replacement table metric is `matches` (`gamesPlayed`) because a real question-accuracy field is not available in the leaderboard API yet.

**Scalability note:**
- The current leaderboard API is bounded, not truly paginated:
  - global and tier endpoints return top 100
  - around-me returns 10 nearby ranks
  - top lists are cached in Redis
- This is acceptable for the current v1 desktop screen, but million-user browsing would need cursor/page endpoints or a materialized/Redis sorted-set leaderboard.

**Deferred by decision:**
- Weekly climbers endpoint and UI.
- Streaks in global/tier leaderboards.
- Real question-level accuracy metric in leaderboard responses.
- Full browser visual QA of the desktop Leaderboard screen.

**Verified:**
- `npx tsc --noEmit -p mobile/tsconfig.json` → 0 errors
- `npx eslint mobile/src/screens/LeaderboardScreen.desktop.tsx` → 0 errors
- `git diff --check` → 0 whitespace errors
- `npx expo export --platform web` in `mobile/` → exported successfully

### Step 6.4.6 — Profile Desktop ✅

**What was built:**
- Replaced the placeholder desktop Profile wrapper with a real desktop layout in `mobile/src/screens/ProfileScreen.desktop.tsx`.
- Reused existing data sources:
  - `/auth/me` via `useCurrentProfile`
  - `/games/stats` for current Elo, peak Elo, win rate, best available stats, and `eloHistory`
  - `/games/history?page=1&limit=3` for the profile mini recent-match list
- Added the desktop Profile surface:
  - compact cover header with theme-aware `PROFILE` label and faint initial mark
  - overlapping avatar, display name, tier badge, joined date, and match count
  - header actions for Edit profile, Settings, and Share
  - current rating card with tier progress
  - stats card with matches, win rate, and best streak
  - achievements placeholder with locked slots
  - 90-day rating chart with rating labels on the y-axis and dates on the x-axis
  - topic mastery future-version stub
  - recent matches mini list capped at 3 rows, with `View all` linking to full match history
- Reused existing edit display-name modal validation/save flow and `ShareLinkModal`.
- Added document title sync: `{displayName} · CAT Duel` or `Your profile · CAT Duel`.
- Polished light/dark behavior:
  - cover label/mark colors are theme-aware
  - avatar uses a dark drop shadow in light mode and a soft white glow in dark mode
  - cover height and header spacing were tightened after visual QA

**Changed from original 6.4.6 plan by decision:**
- No `ratingChange7d` or weekly rating delta was added.
- Topic mastery endpoint/aggregation was not added; the card is a future-version stub.
- Public profile keeps the existing mobile-layout fallback for v1.
- Recent matches shows only 3 rows on Profile; the full list remains behind `View all`.
- The chart uses DOM SVG on desktop web instead of adding `react-native-svg`.

**Deferred by decision:**
- Full desktop public profile.
- Real topic mastery endpoint and progress rows.
- Achievements backend/earned badge logic.

**Verified:**
- `npx tsc --noEmit` in `mobile/` → 0 errors
- `npx expo export --platform web --output-dir /tmp/cat-duel-web-export` in `mobile/` → exported successfully

**Pushed:**
- `b87ca48 Implement desktop profile screen` to `main`

### Step 6.4.7 — Practice Home Desktop ✅

**What was built:**
- Replaced the placeholder desktop Practice Home wrapper with a real desktop layout in `mobile/src/screens/PracticeHomeScreen.desktop.tsx`.
- Added the desktop Practice Home surface:
  - italic serif `Practice` header and subtitle
  - three section cards for `QUANT`, `DILR`, and `VARC`
  - difficulty segmented control for `All`, `Easy`, `Medium`, and `Hard`
  - explicit `Start Practice` button that stays disabled until a section is selected
- Updated the desktop interaction model:
  - hovering a section card highlights it only while hovered
  - clicking a section card selects it without starting practice
  - the selected section remains highlighted
  - `Start Practice` navigates to `Question` with the selected category and difficulty
- Polished the desktop UI after visual QA:
  - removed keyboard-shortcut hints from Practice Home; `1`–`4` / `Enter` belong to the question screen
  - removed per-card arrow affordances
  - removed question-count / difficulty meta text from section cards
  - tightened card height and spacing after the meta row was removed
  - restyled the Start button to use the app's active ink/bg treatment

**Cleanup completed:**
- Removed the unused practice summary request from mobile Practice Home.
- Removed `questionService.getSummary()` and its `PracticeSummary` response type from `mobile/src/services/questions.ts`.
- Removed the pre-release-only `GET /questions/practice/summary` backend route from `server/src/routes/questions.ts`.
- Kept the actual `PracticeSummary` route/screen intact; it is the post-practice session summary and uses route/session data, not the removed endpoint.

**Changed from original 6.4.7 plan by decision:**
- Practice Home does not use keyboard shortcuts; those remain for Practice Question.
- Practice does not start immediately from a section card click; an explicit Start button is required.
- The question-bank summary/meta display was removed from Practice Home.

**Verified:**
- `npx tsc --noEmit` in `mobile/` → 0 errors
- `npm run type-check` in `server/` → 0 errors

**Pushed:**
- `8ef2680 Implement desktop practice home` to `main`
- `ccbef94 Remove unused practice summary endpoint` to `main`

### Step 6.4.8 — Practice Question Desktop ✅

**What was built:**
- Replaced the placeholder desktop Practice Question wrapper with a real desktop layout in `mobile/src/screens/QuestionScreen.desktop.tsx`.
- Reused the existing solo-practice behavior from mobile:
  - question loading through `questionService.getNext`
  - answer submission through `questionService.submitAnswer`
  - session stats tracking for the existing `PracticeSummary` route
  - no-more-questions, retry, and end-session flows
- Added the desktop Practice Question surface:
  - focused no-left-rail interface matching the desktop Duel screen treatment
  - compact top bar with section/subtopic, practice mode pill, and End session action
  - split main body with question text on the left and answer options on the right
  - submitted state preserves the question/options and shows the explanation inline under the answers
  - option key badges plus `1`–`4` shortcut hints before submission
- Wired web-specific behavior:
  - `1`–`4` select options
  - `Enter` submits when an option is selected
  - `Enter` advances to the next question after a result is showing
  - document title sync as `Practice · Q${qNumber} · CAT Duel`
  - non-selectable question/option text and context-menu prevention on the question card

**Changed from original 6.4.8 plan by decision:**
- The implementation keeps the desktop logic local to `QuestionScreen.desktop.tsx` instead of extracting a shared practice-question hook, keeping the change surgical.
- The explanation is no longer a separate right-side rail; Practice Question now follows the Duel-style focused interface without the app left rail.

**Verified:**
- `npx tsc --noEmit -p mobile/tsconfig.json` → 0 errors
- `npx eslint mobile/src/screens/QuestionScreen.desktop.tsx` → 0 errors
- `git diff --check` → 0 whitespace errors
- `npx expo export --platform web --output-dir /tmp/cat-duel-web-export-648` in `mobile/` → exported successfully

### Step 6.4.9 — Matchmaking + Found Desktop ✅

**What was built:**
- Replaced the placeholder desktop Matchmaking alias with a real desktop flow in `mobile/src/screens/MatchmakingScreen.desktop.tsx`.
- Merged the desktop searching and found/countdown states into one focused pre-duel screen:
  - no persistent left rail, matching the Phase 6 focused matchmaking design
  - three-column `you | vs/rules/countdown | opponent` layout
  - opponent placeholder while searching
  - opponent card fills in when `match:found` arrives
  - countdown appears in-place when `match:status` enters countdown
- Reused the existing socket behavior from mobile Matchmaking and Found:
  - matchmaking namespace: `queue:join`, `queue:timeout`, `queue:active_game`, `match:found`
  - game namespace: `game:join`, `match:status`, `match:cancelled`, `match:requeueing`, `game:start`
  - existing shared game socket is kept for direct transition into Duel
- Desktop now stays on `Matchmaking` through search, opponent found, and countdown, then `navigation.replace('Duel', ...)` on `game:start`.
- Mobile/native behavior remains unchanged:
  - `MatchmakingScreen.mobile.tsx` still navigates to `Found`
  - `FoundScreen.tsx` remains the native pre-start flow
- Added document title sync for the desktop flow:
  - `Searching · CAT Duel`
  - `Match found! · CAT Duel`
  - `(!) Match found! · CAT Duel` while the document is hidden
  - `Starting · CAT Duel`

**Changed from original 6.4.9 plan by implementation constraint:**
- The visible Cancel button emits `queue:leave` only while still connecting/searching. After a match is found, the server-side Found flow does not expose a dedicated player-cancel socket event, so the desktop screen avoids inventing a new contract.

**Verified:**
- `npx tsc --noEmit` in `mobile/` → 0 errors
- `git diff --check` → 0 whitespace errors
- `npx expo start --web` compiled the web bundle successfully on port `8083`
- In-app browser smoke check from logged-in Home:
  - Home → Matchmaking navigated successfully
  - queue joined and found an opponent
  - flow advanced into active Duel
  - browser console showed no errors
- Note: the in-app browser viewport was narrow, so it exercised the compact/mobile fallback path; desktop layout still passed static checks and web bundle compilation.

**Pushed:**
- `3f56b43 Implement desktop matchmaking flow` to `main`

---

### CAT Quant Typed Questions — Backend + Frontend ✅

**What was built:**

**Backend**
- Added typed question support for `MCQ` and `TITA`.
- Extended question storage with `questionType`, `subType`, nullable `options`, nullable `correctAnswer`, nullable `correctAnswerText`, `sourcePdf`, `externalQuestionNumber`, and `answerMismatch`.
- Added `EXTRACTED` question source for imported CAT questions.
- Updated practice and match answers to support both selected MCQ answers and typed TITA answers.
- Added admin JSONL import endpoint:
  - `POST /api/admin/questions/import-jsonl`
  - protected by existing auth/admin middleware
  - imports CAT Quant JSONL rows
  - skips duplicate `sourcePdf + externalQuestionNumber`
  - returns inserted/skipped/failed row summary
- Added MCQ/TITA validation and grading:
  - MCQ uses numeric selected option index
  - TITA uses normalized exact typed-answer matching

**Frontend**
- Updated shared mobile/web question and answer types for `MCQ | TITA`.
- Added `MathText` for lightweight CAT-style inline math cleanup:
  - handles `$...$` spans, escaped braces, fractions, roots, arrows, operators, and common extraction artifacts.
- Added `TitaAnswerPad` with themed numeric keypad, decimal, minus, backspace, clear, and submit support.
- Updated Practice Question mobile + desktop:
  - MCQ options still render normally.
  - TITA renders the numpad and submits `typedAnswer`.
  - post-submit result shows explanation and correct answer text for TITA.
- Updated Duel mobile + desktop:
  - MCQ answer submit remains unchanged.
  - TITA emits `typedAnswer` through the existing socket submit event.
- Updated Duel Results and Match Detail:
  - MCQ keeps option highlighting.
  - TITA shows submitted answer, correct answer, and explanation.

**Verified:**
- `npm run type-check --workspace=server` → 0 errors
- `npm test --workspace=server` → 23 tests passing
- `npx tsc --noEmit -p mobile/tsconfig.json` → 0 errors

**Pushed:**
- `4b8807f Add typed question import support` to `main`
- `32bfedf Add frontend typed question support` to `main`

---

### VARC Passage Support — Backend ✅

**What was built:**

**Schema**
- Added `Passage` model with `externalId` (short hash from extraction pipeline), `text`, `source`, `sourcePdf`, `isVerified`.
- `@@unique([sourcePdf, externalId])` for dedup on re-import.
- Added nullable `passageId` FK on `Question` with `@@index([passageId])`.

**Admin API** (`/api/admin/passages`)
- `POST /` — create passage
- `GET /` — list with `?verified=` filter and pagination
- `GET /:id` — single passage + linked questions
- `PATCH /:id` — partial update
- `PATCH /:id/verify` — flip `isVerified`
- `DELETE /:id` — 409 if questions reference it
- `POST /import-jsonl` — bulk import from `*_passages.jsonl` files (up to 100 files per request)
- `POST /questions/import-jsonl` — updated to handle VARC questions with `passage_id` → DB UUID lookup
- `passageId` added to question create/update schemas with VARC-only validation

**Import Scripts**
- `scripts/import-passages.sh` — uploads all `*_passages.jsonl` files from a directory in one request
- `scripts/import-questions.sh` — uploads all question `.jsonl` files (excluding passages) from a directory

**Duel (Socket)**
- `selectQuestionsForMatch` now fetches passage text alongside questions and stores unique passages in `GameState.passages` (Redis) — one DB read at game init, zero extra hits during the duel.
- `withPassage()` helper attaches `passage: { id, text } | null` before emitting on all four question emit sites: `game:start`, `game:question`, `game:sync`, `getActiveGameForUser`.

**Practice**
- `findPracticeQuestionInCategories` includes passage join inline (both select blocks) — no Redis state needed for practice.

**Types**
- `ClientPassage` interface added to `mobile/src/navigation/index.tsx`.
- `ClientQuestion` extended with `passageId` and `passage` fields — shared by mobile and desktop layouts.

**Verified:**
- `npx tsc --noEmit` (server) → 0 errors
- `npx tsc --noEmit` (mobile) → 0 errors
- All existing tests pass

**Pushed:**
- `af64bc1 Add Passage model and passageId FK to Question schema`
- `91aaf47 Add passage CRUD routes and passageId to question schemas`
- `4d0cb88 Add passage JSONL import service and route`
- `6ee3640 Add import-passages.sh script`
- `28ddd9e Fix import-passages.sh for filenames with spaces`
- `ea25083 Increase file limit for passage import route`
- `b58aaf9 Support VARC questions with passage_id in JSONL import`
- `23600a1 Add passageId to question selects for duel and practice`
- `8ca84ff Preload passages into GameState at match init`
- `9aaa6ba Attach passage from GameState before emitting questions to clients`
- `9e1b018 Add ClientPassage type and passage field to ClientQuestion`

---

### VARC Passage Support — UI ✅

**What was built:**

**Mobile (duel + practice)**
- When `question.passage` is non-null, a bordered `PASSAGE` block (styled with `theme.bg2` + `theme.line`) renders above the question stem inside the existing `ScrollView`.
- Uses `MathText preset="body"` with `lineHeight: 26` for comfortable prose reading.

**Desktop (duel + practice)**
- Left panel shows passage text when present (eyebrow label switches to `PASSAGE`), otherwise shows question text as before — no layout change for non-RC questions.
- Right panel inserts the question stem above the options when a passage is present.
- For practice desktop, the subTopic chip is suppressed from the left panel header in passage mode (still appears in the right panel chip row).

**Independent panel scrolling**
- Added `fillHeight` prop to `DesktopFrame`: when set, replaces the outer `ScrollView` with a `View` so inner panel `ScrollView`s get a bounded height and scroll independently.
- `DuelScreen.desktop` and `QuestionScreen.desktop` both pass `fillHeight` — passages scroll in the left panel while options stay fixed in the right panel.

**Theme-aware scrollbar**
- `ThemeProvider` injects a `<style id="cat-duel-scrollbar">` on web that updates on every mode change.
- Light mode: `rgba(28,27,26,0.22)` thumb; dark mode: `rgba(255,255,255,0.18)` thumb; transparent track.
- Covers Firefox (`scrollbar-color` / `scrollbar-width`) and WebKit (`::-webkit-scrollbar-*`).

**Types**
- `Question` interface in `mobile/src/services/questions.ts` extended with `passageId` and `passage` fields to match what the practice API now returns.

**Verified:**
- `npx tsc --noEmit` (mobile) → 0 errors

**Pushed:**
- `641e30a Add passage rendering to duel and practice screens (desktop + mobile)`

---

### Pre-Deployment Security Hardening — Tier 1 Partial ✅

**What was built:**

**Environment + Origin Safety**
- Added Zod-based server env validation with loud startup failures for missing/malformed required config.
- Added production guardrails for Redis and CORS: production requires `rediss://` Redis URLs and rejects wildcard `ALLOWED_ORIGINS`.
- Replaced open REST/Socket.IO CORS with an `ALLOWED_ORIGINS` allowlist; native/no-origin requests still pass and localhost origins are allowed outside production.

**HTTP + Redis Hardening**
- Added Helmet security headers with API CSP `default-src 'none'; frame-ancestors 'none'`.
- Added production HSTS configuration.
- Added Redis TLS support via `rediss://` or `REDIS_TLS=true`.
- Added startup Redis ping so the server fails fast when Redis auth/TLS/connectivity is misconfigured.

**Rate Limiting**
- Added Redis-backed REST rate limiting with `express-rate-limit` + `rate-limit-redis`.
- Added global unauthenticated IP limit and authenticated per-user limit.
- Added tighter route caps for profile update, account deletion, and practice answer submission.
- Added Socket.IO throttling with `rate-limiter-flexible` for concurrent sockets, matchmaking queue events, game join, and answer submit.

**Verified:**
- `npm run type-check` (server) → 0 errors
- `npm test -- --runInBand src/routes/__tests__/questions.test.ts` → passes
- `git diff --check` → passes

**Pushed:**
- `ba4d924 Validate server environment at startup`
- `ae8cc3f Restrict API CORS origins`
- `6cb6e2b Add API security headers`
- `ba899cb Harden Redis production configuration`
