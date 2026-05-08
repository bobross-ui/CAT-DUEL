# CAT-DUEL — Production Readiness Implementation Plan

Sequenced step-by-step plan to get the app from current state to production-shippable.
Estimated effort: **8–12 working days** for one engineer; **5–7 days** for two engineers running Phases 1+2 in parallel with Phase 4.

Each task lists: **Where**, **What**, **Library / approach**, **Acceptance**. No code blocks — all guidance is intended to be handed to Claude Code for implementation. When a library exists for the job, use it; do not roll a custom version.

---

## Phase 0 — Pre-flight setup (½ day)

### ✅ 0.1 Add the env vars used downstream
- **Where:** `server/src/config/env.ts`
- **What:** Extend the Zod schema with the variables introduced by later tasks so they are validated up front.
  - `GAME_DURATION_SECONDS` (z.coerce.number, default `600`)
  - `RUN_BACKGROUND_JOBS` (z.enum(['true','false']), default `'false'`, transformed to boolean)
  - `SENTRY_DSN` (z.string().url().optional())
  - `LOG_LEVEL` (z.enum(['debug','info','warn','error']), default `'info'`)
  - `TRUST_PROXY` (z.coerce.number().int().nonnegative(), default `0`)
  - `ALLOW_PROD_SEED` (z.enum(['true','false']), default `'false'`)
- **Acceptance:** Server still boots in dev with no new vars set; production rejects missing required ones.

### ✅ 0.2 Set up a working test command
- **Where:** root `package.json`, `server/package.json`
- **What:** Ensure `npm test --workspace=server` runs cleanly. The codebase already has Jest tests under `server/src/**/__tests__/*`. Fix any unrelated fixture failures noted in `PRE_DEPLOYMENT_OPTIMIZATIONS.md` (`questionImport.test.ts`, `extractedFixtures.test.ts`) before adding CI gating in 5.1, otherwise CI will block all merges from day one.
- **Acceptance:** `npm test` passes locally on a fresh clone.

---

## Phase 1 — Launch blockers (Days 1–4)

Each item is independently shippable. Aim for one PR per task to keep review loads sane.

### ✅ 1.1 Restore game duration to 10 minutes
- **Where:** `server/src/services/matchmaking.ts:63`, `server/src/services/gameSession.ts:175`
- **What:** Replace the hardcoded 2-minute duration constants with a single import from `env.GAME_DURATION_SECONDS` (added in 0.1).
- **Library:** none.
- **Acceptance:** `grep -n "120\|2 \* 60" server/src` returns nothing related to duration; new env var is documented in `README.md`.

### ✅ 1.2 Make answer timing server-authoritative
- **Where:** `server/src/services/gameSession.ts` — the question-serve sites (lines ~596, ~707) and `handleAnswer` (lines ~681, ~712).
- **What:**
  1. When a question is served to a player, write a per-(gameId, playerId, questionId) `servedAt` timestamp into the existing Redis game state (or a sibling hash). It already exists implicitly via the timer but is not used for grading.
  2. In `handleAnswer`, ignore the client's `timeTakenMs`; compute it as `Date.now() - servedAt`.
  3. Reject answers received after `state.startedAt + env.GAME_DURATION_SECONDS * 1000`.
  4. Reject answers for a question the player is not currently on (already partially enforced; tighten the check).
- **Library:** none — `Date.now()` and existing ioredis client.
- **Acceptance:** Forging `timeTakenMs: 0` from a tampered client produces a `MatchAnswer` row with the real elapsed time. A unit test on `handleAnswer` covers the late-submit rejection.

### ✅ 1.3 Graceful shutdown
- **Where:** `server/src/index.ts`. Will also need exported stop functions on `services/matchmakingLoop.ts` and `services/questionServeBuffer.ts` (currently `start*` only).
- **What:** Register handlers for `SIGTERM` and `SIGINT` that, in order:
  1. Stop accepting new HTTP connections and drain in-flight ones.
  2. Disconnect Socket.io clients (`io.disconnectSockets(true)`) then `await io.close()`.
  3. Stop the matchmaking interval and the question-serve flush interval.
  4. Run `flushQuestionServeCounts()` one last time so buffered counters land in Postgres.
  5. `await prisma.$disconnect()`.
  6. `await redis.quit()`.
  7. `process.exit(0)`. Wrap the whole sequence in a 30s timeout that hard-exits on overrun.
- **Library:** **`http-terminator`** (npm) for HTTP draining — it handles keep-alive sockets correctly, which `server.close()` does not. Socket.io's `close` and `disconnectSockets` are built in.
- **Acceptance:** `kill -TERM <pid>` during a request lets the request finish; logs show clean shutdown sequence; no Redis/Prisma connection-leak warnings.

### 1.4 Process-level error handlers
- **Where:** `server/src/index.ts`
- **What:** Add `process.on('uncaughtException', …)` and `process.on('unhandledRejection', …)` that log via the new pino logger (Phase 4) and call the same shutdown sequence as 1.3 with `exit(1)`. Do not attempt to recover.
- **Library:** Node built-in.
- **Acceptance:** Throwing inside a `setTimeout` produces a structured log line and a clean shutdown, not a silent process termination.

### 1.5 Real `/health` probes
- **Where:** `server/src/routes/health.ts`
- **What:** Keep the existing `GET /api/health` as a cheap liveness probe (always 200 if process is alive). Add `GET /api/health/ready` that:
  - Runs `prisma.$queryRaw\`SELECT 1\`` with a 1-second timeout.
  - Runs `redis.ping()` with a 1-second timeout.
  - Returns 200 only if both succeed; 503 otherwise.
- **Library:** none — Prisma and ioredis already expose what's needed. Wrap each call in `Promise.race` with a timeout. Do not pull in `terminus`/`@godaddy/terminus` — overkill.
- **Acceptance:** Stop the local Postgres container — `/api/health/ready` returns 503; `/api/health` still returns 200.

### 1.6 Socket.io Redis adapter
- **Where:** `server/src/index.ts`, with a small helper next to `server/src/config/redis.ts`.
- **What:** Configure Socket.io to use the Redis pub/sub adapter so broadcasts fan out across replicas.
- **Library:** **`@socket.io/redis-adapter`** (the official adapter). Create two new ioredis clients via `redis.duplicate()` (one for pub, one for sub) and pass to `createAdapter`. Apply on the root `io` before the `.of('/matchmaking')` and `.of('/game')` namespaces are used.
- **Acceptance:** Two-replica local test (run two `npm run dev` on different ports, both connected to the same Redis): players connected to different instances both receive the duel's broadcast events.

### 1.7 Run background loops on a single instance
- **Where:** `server/src/index.ts` — the calls to `startMatchmakingLoop` and `startQuestionServeCountFlush`.
- **What:** Gate both behind `if (env.RUN_BACKGROUND_JOBS) { … }`. In production, deploy a dedicated worker pod/process with that flag true; web replicas leave it false. Keep matchmaking's existing Redis lock as defence-in-depth.
- **Library:** none. Avoid `redlock` — single-instance worker is simpler and the current Redis lock pattern in `matchmakingLoop.ts` is already adequate as a fallback.
- **Acceptance:** Run three local server processes with the flag false on two and true on one — only the third fires matchmaking ticks and serve-count flushes.

### 1.8 Crash recovery for active games
- **Where:** new function in `server/src/services/gameSession.ts`, called from `startServer()` in `server/src/index.ts` after Redis is connected and before `httpServer.listen`.
- **What:** Use `redis.scan` (NOT `KEYS`) over `active_game:*` and `game:state:*` keys. For each game state:
  - Status `COUNTDOWN` and elapsed > 30s → cancel and clear pending_match keys for both players.
  - Status `ACTIVE` and `now > startedAt + duration` → call `endGame` immediately (results land in DB, both players stay in their stuck UI until they reconnect, then `game:sync` cleanly informs them it ended).
  - Status `ACTIVE` and still within duration → reschedule the countdown / forfeit / end timers based on persisted timestamps.
- **Library:** ioredis (`scan` async iterator). Do not use `KEYS *` — it blocks Redis.
- **Acceptance:** Kill server while a duel is mid-flight → restart → game resolves within its remaining time, ratings written, both `active_game:*` keys cleaned.

### 1.9 Lock `/api/users/:id` to public projection
- **Where:** `server/src/routes/users.ts:23-46`
- **What:** Decide one of:
  - **Preferred:** Keep the route public (no auth needed) but return only `{ id, displayName, avatarUrl, eloRating, rankTier, gamesPlayed, wins, currentStreak, longestStreak }`. Never return `email`, `firebaseUid`, `lastActiveDate`, `role`, `deletedAt`, `onboardingCompletedAt`. The mobile `PublicProfileScreen` only needs the public projection.
- For the owner's own profile use a separate `GET /api/users/me` that returns the full record (already exists as `/api/auth/me` — verify and consolidate).
- **Library:** none.
- **Acceptance:** Curl `/api/users/<other-id>` with own bearer returns ONLY public fields. Schema test in `routes/__tests__/users.test.ts` enforces the projection.

### 1.10 JSON body size limit
- **Where:** `server/src/index.ts:55`
- **What:** Pass `{ limit: '32kb' }` to `express.json()`. Multer routes handle their own larger payloads, so 32kb is fine app-wide.
- **Acceptance:** A 1MB JSON POST returns 413.

### 1.11 Multer hardening
- **Where:** `server/src/routes/admin.ts:278` (and any other multer usage).
- **What:**
  - Add `fileFilter` that rejects anything other than `application/json`, `text/csv`, `text/plain`.
  - Set `limits: { fileSize: 5 * 1024 * 1024, files: 10 }`.
  - For defence in depth, validate magic bytes after upload using **`file-type`** (npm) — `fileTypeFromBuffer` on the first 4KB. Reject if header MIME and detected type disagree.
- **Library:** `multer` (already installed) + `file-type`.
- **Acceptance:** Renamed `.exe` upload is rejected; oversize file is rejected; no other filetypes parse.

### 1.12 Socket room membership check on `answer:submit`
- **Where:** `server/src/services/gameSession.ts:1166-1198` (`answer:submit` handler).
- **What:** Before invoking `handleAnswer`, assert `socket.rooms.has(gameId)`. If false, emit an error and return. (This is in addition to the existing `isParticipant` check, which protects against cross-account abuse but not against a single account bypassing the join step.)
- **Library:** built into Socket.io 4.
- **Acceptance:** Manually crafted socket that authenticates and emits `answer:submit` without ever calling `game:join` cannot influence a duel's score.

### 1.13 Gate `DebugScreen` from production
- **Where:** `mobile/src/navigation/index.tsx:164`
- **What:** Wrap registration of the screen in `if (__DEV__) { … }`. Or keep it but gate access on `user.role === 'admin'` if you want a runtime debug surface for staff.
- **Library:** none — `__DEV__` is provided by React Native.
- **Acceptance:** EAS production build does not include the screen.

### 1.14 Clear React Query cache on signOut and account delete
- **Where:** `mobile/src/navigation/index.tsx:286`, `mobile/src/screens/SettingsScreen.tsx:106-110`, and any other signOut path inside `mobile/src/context/AuthContext.tsx`.
- **What:** Replace targeted `removeQueries({ queryKey: queryKeys.me() })` with `queryClient.clear()`. Also call `clear()` after `deleteMe` succeeds and before `signOut`. Mirror this in any web-platform storage path so AsyncStorage/localStorage preference keys are reset where appropriate.
- **Library:** TanStack Query (already installed).
- **Acceptance:** Logout user A on web, login user B → no flash of A's match history, leaderboard rank, or profile data.

### 1.15 Production Dockerfile
- **Where:** new `server/Dockerfile`, new `server/.dockerignore`, optionally a `docker-compose.prod.yml` for parity testing.
- **What:** Multi-stage build:
  - **Builder stage:** `node:20-alpine`. Copy root `package.json` + `package-lock.json` + `server/package.json` + `packages/types/package.json`. `npm ci` (full workspace install). Copy `server/` and `packages/types/`. Run `npx prisma generate --schema=server/prisma/schema.prisma` and `npm run build --workspace=server`.
  - **Runtime stage:** `node:20-alpine`. Copy `server/dist`, `server/prisma/schema.prisma`, `server/prisma/migrations/`, `node_modules` (pruned with `npm ci --omit=dev` re-run, or `npm prune --omit=dev`). Add a non-root user (UID 1001) and switch to it. `EXPOSE 3000`. `HEALTHCHECK CMD wget --spider http://localhost:3000/api/health/ready`. `CMD ["node", "--enable-source-maps", "dist/index.js"]`.
- **Library:** none — standard Node tooling.
- **Acceptance:** `docker build -f server/Dockerfile .` produces an image < 250MB. `docker run` starts cleanly given the env vars.

---

## Phase 2 — Performance / scale (Days 4–6)

### 2.1 Composite indexes for leaderboard
- **Where:** `server/prisma/schema.prisma` (User model), new migration.
- **What:** Add the indexes that the leaderboard query patterns actually need:
  - `@@index([deletedAt, gamesPlayed, eloRating(sort: Desc)])` for global rank.
  - `@@index([deletedAt, rankTier, gamesPlayed, eloRating(sort: Desc)])` for tier rank.
- Generate via `npx prisma migrate dev --name leaderboard_indexes` locally; apply via `prisma migrate deploy` in CI/staging.
- **Acceptance:** `EXPLAIN ANALYZE` on `getUserGlobalRank()` and `getTierCounts()` shows index scans, no sequential scan; query latency on a 10k-user staging dataset drops below 10ms p99.

### 2.2 Cache the question pool, cap selection
- **Where:** `server/src/services/gameSession.ts:518-537` (`selectQuestionsForMatch`); add a new helper, e.g. `services/questionPool.ts`.
- **What:**
  - On server startup (and via a `setInterval` of 5 min, gated by `RUN_BACKGROUND_JOBS`), pre-compute Redis sets of verified question IDs grouped by `(category, difficulty)` keys.
  - `selectQuestionsForMatch` randomly picks IDs from the cached sets (use `SRANDMEMBER`), then calls the existing Redis-cached question content path. Falls back to a single capped DB query (`take: 200`) only if the set is missing.
  - The current `balanceByCategory` logic stays — it operates on IDs from the cache.
- **Library:** ioredis (already in use). No new dependency.
- **Acceptance:** Match creation makes zero `findMany` calls against the questions table after warm-up; cold-start fallback works.

### 2.3 Match history: replace OR with UNION
- **Where:** `server/src/routes/games.ts:28-42`
- **What:** Replace the `OR: [{ player1Id }, { player2Id }]` Prisma `findMany` with either:
  - Two separate `findMany` calls with the proper `(playerId, finishedAt DESC)` index, merged + sliced in code, OR
  - A `prisma.$queryRaw` with `UNION ALL` of the two indexed queries, ordered by `finished_at DESC` and limited.
- **Library:** Prisma (already in use). The raw approach is more efficient at the DB level; the two-query merge is easier to maintain.
- **Acceptance:** `EXPLAIN ANALYZE` shows two index scans (one per index), no bitmap-OR. Test in `routes/__tests__/games.test.ts` (new) verifies pagination correctness.

### 2.4 Cap `/api/games/stats`
- **Where:** `server/src/routes/games.ts:115-124`
- **What:** Add `take: 100` and `orderBy: { finishedAt: 'desc' }` to the matches query. Cache result per user in Redis for 5 minutes (key: `stats:${userId}`).
- **Library:** ioredis.
- **Acceptance:** A user with 1000+ matches no longer fetches all of them on stats hit; cache hits return < 5ms.

### 2.5 Cache `getTierCounts`
- **Where:** `server/src/services/leaderboard.ts:266-279`
- **What:** Wrap the aggregation in a 60-second Redis cache (single key for all tiers since it's a small payload).
- **Library:** ioredis.
- **Acceptance:** Tier counts return from cache 99% of the time; warm-up cost paid once a minute.

### 2.6 Cap `getNearbyLeaderboard` skip
- **Where:** `server/src/services/leaderboard.ts:170-206`
- **What:** Skip-based pagination is O(n) at deep ranks. Replace with: fetch a window using keyset pagination on `eloRating`, or cache the top 1000 users in Redis as a sorted set and use `ZREVRANGE` for the requesting user's window. The Redis sorted-set approach is dramatically faster for "around me" queries.
- **Library:** ioredis sorted sets (`ZADD`, `ZREVRANGE`, `ZRANK`).
- **Acceptance:** "Around me" leaderboard for a user at rank 5000 returns in < 20ms.

---

## Phase 3 — Real-time hardening (Days 6–8)

### 3.1 Rate-limit `game:forfeit`
- **Where:** `server/src/services/gameSession.ts:1200`
- **What:** Apply `enforceSocketEventLimit` (already exists in `services/socketRateLimit.ts`) with a strict cap (e.g. 3 per 60s per user).
- **Acceptance:** Spamming forfeit is rejected after the third call; opponent's game cannot be ended via repeated forfeit attempts.

### 3.2 Reconnect should not refresh per-question timer
- **Where:** `server/src/services/gameSession.ts:1100-1117` (the `game:sync` reconnect path).
- **What:** Track per-(gameId, playerId, questionId) `firstServedAt` (already needed for 1.2). On reconnect, the resync should compute remaining question time from `firstServedAt`, not start fresh.
- **Acceptance:** Disconnect after seeing Q4, wait 30s, reconnect → Q4 timer continues from where it left off.

### 3.3 `pending_match:*` cleanup on prestart cancel
- **Where:** `server/src/services/gameSession.ts:411-440` (`cancelPreStartGame`).
- **What:** Unconditionally `redis.del('pending_match:${userId}')` for both players in the cleanup branch (currently only deleted if both re-queue).
- **Acceptance:** After a prestart cancel, neither player sees a stale "match found" UI on next reconnect.

### 3.4 Stop swallowing async errors silently
- **Where:** `server/src/services/gameSession.ts` lines ~451, ~666, ~880, ~990, ~1058, ~1195, ~1210 (catch blocks that just log).
- **What:** Replace each `console.error(e)` with the structured logger (`logger.error({ err, gameId, userId }, 'message')`) added in Phase 4, and additionally `Sentry.captureException(e, { extra: { gameId, userId } })`. For match-completion failures specifically, also emit a `game:error` socket event so the client can show a recovery prompt.
- **Library:** pino + `@sentry/node` (added in 4.1, 4.2).
- **Acceptance:** Forcing a Prisma error inside `endGame` produces a Sentry event with full context and a logger line tagged with the game ID.

### 3.5 Per-user (not per-socket) socket rate limiting
- **Where:** `server/src/services/socketRateLimit.ts:73`
- **What:** Decide intent: if 60/min was meant to be per user, drop `socket.id` from the key so all sockets for that user share a bucket. Document the decision either way in code comments.
- **Acceptance:** A user with three concurrent sockets cannot exceed the per-user limit by submitting in parallel.

---

## Phase 4 — Observability (Days 7–10, can run in parallel with Phase 3)

### 4.1 Structured logging with pino
- **Where:** new `server/src/lib/logger.ts`; `server/src/index.ts` to wire HTTP middleware; replace all `console.*` sites in `server/src/**/*.ts`.
- **What:**
  - Create a pino instance with level from `env.LOG_LEVEL`. In dev, pipe through pino-pretty.
  - Configure `redact` for `req.headers.authorization`, anything matching `*.password`, `*.token`, `*.firebaseIdToken`, `*.firebasePrivateKey`.
  - Add `pino-http` as the first middleware after helmet/cors. It auto-attaches `req.log` and a request ID, and honors incoming `X-Request-Id`.
  - For propagation into services and socket handlers, use Node's built-in `AsyncLocalStorage` (no library needed). Store the request ID and the child logger; services read from it.
  - Replace every `console.log`/`console.warn`/`console.error` in the server (~16 sites — the perf audit mentioned `errorHandler.ts:5`, `matchmakingLoop.ts:159`, multiple in `gameSession.ts`).
- **Libraries:** **`pino`**, **`pino-http`**, **`pino-pretty`** (devDependency).
- **Acceptance:** Production logs are NDJSON with `req.id`, no auth headers leaked, no `console.*` left in `server/src` (lint rule `no-console: error` enforces it).

### 4.2 Sentry on the server
- **Where:** new `server/src/lib/sentry.ts`; `server/src/index.ts` (init at top, before any other imports if possible); `server/src/middleware/errorHandler.ts`.
- **What:**
  - Initialize Sentry with `SENTRY_DSN`, `environment: env.NODE_ENV`, `tracesSampleRate: 0.1` in prod / `1.0` in dev.
  - For Express v4, use `Sentry.Handlers.requestHandler()` and `Sentry.Handlers.errorHandler()` (Sentry v8 still supports it). Mount request handler before routes, error handler before the existing `errorHandler` middleware.
  - For Socket.io: wrap the registered handlers in a small `withSentry` helper that calls `Sentry.captureException` on throw and rethrows. Apply in `services/matchmaking.ts` and `services/gameSession.ts` registration points.
  - Add `Sentry.captureException` to the catch blocks in `matchmakingLoop.ts` tick and `questionServeBuffer.ts` flush.
- **Libraries:** **`@sentry/node`**. Optionally `@sentry/profiling-node` for CPU profiling — skip unless needed.
- **Acceptance:** Throwing in any route produces a Sentry event within 30s with full request context (URL, method, user ID, `req.id`).

### 4.3 Sentry on mobile
- **Where:** `mobile/App.tsx` (or whatever the entry component is), `mobile/src/services/analytics.ts` (currently a stub), `mobile/src/components/AppErrorBoundary.tsx`, `mobile/app.json` (or `app.config.ts`), EAS hooks.
- **What:**
  - Install **`@sentry/react-native`**. For Expo SDK 54, follow the Expo + Sentry guide; the EAS plugin handles native config and source-map upload.
  - Init at app start with `EXPO_PUBLIC_SENTRY_DSN`. Wrap the root component with `Sentry.wrap`.
  - Replace the stub `track('error', …)` path in `analytics.ts` with `Sentry.captureException`. Keep the existing event interface for product analytics — those can route to a separate provider later.
  - In `AppErrorBoundary.componentDidCatch`, call `Sentry.captureException`.
  - Configure source-map upload in EAS build — Sentry's docs cover the post-install hook.
- **Library:** **`@sentry/react-native`** (NOT the older `sentry-expo` shim, which is deprecated in favor of direct `@sentry/react-native` integration with EAS).
- **Acceptance:** A force-thrown error in any screen reaches Sentry within 30s with a symbolicated stack trace.

### 4.4 Source maps
- **Where:** `server/tsconfig.json`, `server/package.json` (start script), Dockerfile (1.15).
- **What:**
  - Set `"sourceMap": true` in tsconfig.
  - Run Node with `--enable-source-maps` (built-in flag, Node 14+; preferred over the `source-map-support` package since you already require Node 20).
  - Ensure the Dockerfile copies `*.js.map` files into the runtime stage.
  - For the mobile app, source-map upload to Sentry is handled by the EAS build hook from 4.3.
- **Acceptance:** A Sentry event from a server crash references the original `.ts` filename and line number.

### 4.5 Structured logging for socket flows
- **Where:** `server/src/services/gameSession.ts`, `server/src/services/matchmaking.ts`.
- **What:** Add per-event log lines (`game:start`, `game:answer`, `game:end`, `mm:join`, `mm:match`) with `gameId`, `userId`, `eventName`, and outcome. Keep them at `info` level so a duel can be reconstructed from logs.
- **Library:** pino (from 4.1).
- **Acceptance:** Given a gameId, `grep gameId=<id>` shows the full duel timeline.

---

## Phase 5 — Migration safety, CI, and remaining HIGHs (Days 9–11)

### 5.1 CI tests + branch protection
- **Where:** `.github/workflows/ci.yml`, GitHub repo settings.
- **What:**
  - Add a `test` job that runs `npm test --workspace=server` against a Postgres + Redis service container (already common pattern with `services:` in GitHub Actions; use `postgres:16-alpine` and `redis:7-alpine`). Apply migrations with `npx prisma migrate deploy` before tests.
  - Add `npm audit --omit=dev --audit-level=high` as a soft gate (warn-only initially via `|| true`, then promote to required).
  - Add a job that runs `npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --exit-code` to catch missing migrations.
  - In repo settings: require `lint`, `type-check`, `test` checks to pass before merge to `main`; require 1 reviewer.
- **Library:** GitHub Actions (built in); Prisma already vendored.
- **Acceptance:** A PR with a failing test cannot be merged.

### 5.2 Seed guard
- **Where:** `server/prisma/seed.ts`
- **What:** At the top of `main()`, throw if `process.env.NODE_ENV === 'production'` AND `process.env.ALLOW_PROD_SEED !== 'true'`. Document the override in a comment.
- **Library:** none.
- **Acceptance:** `prisma db seed` against a production-flagged env throws before any DB write.

### 5.3 Migration zero-downtime runbook
- **Where:** new `MIGRATION_RUNBOOK.md` at repo root; reference from `.github/PULL_REQUEST_TEMPLATE.md` (create if absent).
- **What:** Document the rule: any column drop, enum value removal, or NOT-NULL addition must ship in two deploys (deploy 1 stops writing/reading; deploy 2 alters schema). Capture the lesson learned from the existing `20260417093543_add_rank_tier_and_elo_changes` (drops index) and `20260505000000_remove_ai_question_source` (drops enum value) — both would have broken old running pods during a rolling deploy.
- **Library:** none — process change.
- **Acceptance:** Future risky migrations are flagged in PR review against the runbook.

### 5.4 Restore Helmet defaults
- **Where:** `server/src/index.ts:41-48`
- **What:** Remove `useDefaults: false`. Keep your specific overrides (`defaultSrc: 'none'`, `frameAncestors: 'none'`) but let helmet apply the rest of its defaults. The CSP applies mostly to HTML responses; the API doesn't return HTML, but the headers cost nothing and protect against future static-asset additions.
- **Library:** helmet (already in use).
- **Acceptance:** `curl -I` against the server shows the standard helmet header set.

### 5.5 `trust proxy` setting
- **Where:** `server/src/index.ts`
- **What:** `app.set('trust proxy', env.TRUST_PROXY)`. Default 0 (no proxy); production behind a single LB sets `1`. This makes `req.ip` reflect the true client IP for express-rate-limit and pino-http.
- **Acceptance:** Behind a load balancer, rate-limit buckets are per-client-IP not per-LB-IP.

### 5.6 Socket token refresh on reconnect
- **Where:** `mobile/src/services/socket.ts:6-14`
- **What:** Pass `auth` to `io()` as a function (not a static object). Socket.io re-invokes the function on every reconnect, so each reconnect gets a fresh Firebase ID token via `getAuth().currentUser?.getIdToken()`. Add a `connect_error` listener that detects `INVALID_TOKEN` and triggers a manual reconnect after `getIdToken(true)` (force refresh).
- **Library:** Socket.io client + Firebase Auth (already in use).
- **Acceptance:** Disconnect socket, idle past token expiry (~60 min), reconnect → succeeds without sign-out.

### 5.7 Display-name signup race
- **Where:** `server/src/routes/auth.ts:39-66`
- **What:** Keep the current pattern (Firebase create → Postgres create → on P2002 collision, delete the Firebase user) but on cleanup failure, call `Sentry.captureException` with the Firebase UID so it can be manually cleaned. The race window is unavoidable with two systems; what matters is that orphans are visible.
- **Library:** Sentry (added in 4.2).
- **Acceptance:** Two simultaneous signups with the same display name → one wins, other gets 409, no silent Firebase orphans.

### 5.8 Practice answer atomicity
- **Where:** `server/src/routes/questions.ts:166-204`
- **What:** Wrap the `practiceAnswer.create` and the conditional `question.update` (timesCorrect++) in `prisma.$transaction([…])`. Alternative: move the stat increment into the existing `questionServeBuffer` pattern — it's already designed for buffered async writes.
- **Library:** Prisma (already in use).
- **Acceptance:** Forcing a stat-update failure does not leave an orphan PracticeAnswer.

### 5.9 User-cache invalidation on soft delete
- **Where:** `server/src/routes/users.ts:94-104`, `server/src/services/userCache.ts`
- **What:** Before the `prisma.user.update({ data: { deletedAt, … } })`, call `userCache.invalidate(userId)`. After the update, call it again to be safe. Verify the cache module exposes an invalidation function; if not, add one.
- **Library:** ioredis.
- **Acceptance:** Delete an account → `/api/auth/me` returns 401/404 immediately, not after the 5-minute TTL.

### 5.10 Node engines field
- **Where:** root `package.json`, `server/package.json`, `mobile/package.json`.
- **What:** Add `"engines": { "node": ">=20 <21" }`. Update CI matrix to Node 20.
- **Acceptance:** `npm install` warns on Node < 20.

### 5.11 `lazyConnect` race in Redis
- **Where:** `server/src/config/redis.ts:15`, `server/src/index.ts`
- **What:** `verifyRedisConnection` already pings — make sure it `await`s before any other code uses the client. The current `startServer` does this; add a clarifying comment so a future refactor doesn't move the call.
- **Acceptance:** Server logs a clean Redis-ready line before listening.

---

## Smoke test plan (run before opening to real users)

Run all of these against staging mirroring prod config (two server replicas + one worker replica):

1. **Two-instance broadcast:** Player A connects to instance 1, Player B to instance 2 (force via direct IPs). Matchmake, complete a duel. Both see all events. Validates 1.6.
2. **Rolling restart:** `kill -TERM` instance 1 mid-duel. Instance 1 drains; players' sockets reconnect to instance 2 cleanly; duel finishes. Validates 1.3, 1.6, 1.8.
3. **Time forgery:** Use a custom client (or curl against the answer endpoint after intercepting a token) to submit `timeTakenMs: 0`. Verify the persisted MatchAnswer row has the real elapsed time. Validates 1.2.
4. **Cross-game injection:** Connect to `/game` namespace as a non-participant, emit `answer:submit` with a known opponent gameId. Verify rejection. Validates 1.12.
5. **Logout / login on shared device:** Sign in user A on web, browse, sign out, sign in user B → no flash of A's data. Validates 1.14.
6. **Health probe:** Stop staging Postgres → `/api/health/ready` returns 503; LB rotates traffic away. Bring it back → traffic returns. Validates 1.5.
7. **Body-size attack:** POST 5MB JSON to any endpoint → 413. Validates 1.10.
8. **File-upload attack:** Rename `.exe` to `.json`, upload via admin → rejected. Validates 1.11.
9. **Sentry:** Force a runtime error on server and on mobile → both events arrive in Sentry within 30s with sourcemaps. Validates 4.2, 4.3, 4.4.
10. **Token expiry:** Idle a logged-in mobile session past Firebase token expiry. Reconnect socket → succeeds. Validates 5.6.
11. **Load smoke (basic):** 200 concurrent matchmaking requests, 100 concurrent duels in flight. Latency p99 < 500ms; no errors in logs. Validates 2.1–2.6.

---

## What is intentionally not in this plan

- **GDPR data export endpoint** — flagged in the audit but acceptable to ship without if your privacy policy commits to honoring email-based requests within 30 days. Add when scaling to EU users.
- **Audit log for admin actions** — useful but not blocking. Add after launch.
- **Web SSR / og: meta tags for shared profiles** — SEO concern, not security/correctness.
- **Forced version updates on mobile** — only needed if you ship a backwards-incompatible API change.
- **Backups** — your hosted Postgres provider (RDS, Supabase, Neon, etc.) handles this; just confirm in their dashboard before launch.

---

## Library quick reference

| Concern | Library | Notes |
|---|---|---|
| HTTP draining | `http-terminator` | Handles keep-alive correctly |
| Socket.io clustering | `@socket.io/redis-adapter` | Official |
| Logger | `pino`, `pino-http`, `pino-pretty` | Fast, structured |
| Error tracking (server) | `@sentry/node` | Use Sentry v8+ Express integration |
| Error tracking (mobile) | `@sentry/react-native` | EAS plugin handles source maps; do NOT use the deprecated `sentry-expo` shim |
| File MIME validation | `file-type` (npm) | Magic-byte detection in addition to multer's `fileFilter` |
| Source maps (Node) | built-in `--enable-source-maps` | No package needed |

Avoid adding: `redlock` (existing Redis lock pattern is sufficient given the `RUN_BACKGROUND_JOBS` flag); `terminus`/`@godaddy/terminus` (overkill for the health probes); `source-map-support` package (use Node's built-in flag); `winston` or `bunyan` (pino is faster and well-supported).
