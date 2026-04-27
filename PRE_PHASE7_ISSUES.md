# CAT Duel — Issues to Fix Before Phase 7

Source docs reviewed:
- `CAT_Duel_Phase5_Polish_StorePrep.md`
- `CAT_Duel_Phase5_Polish_StorePrep.md` → Step 5.13 Code Review Cleanup
- `CAT_Duel_Code_Review.md`

This file consolidates the cleanup work that should be resolved before moving from Phase 5 polish into Phase 7 launch/scale work.

---

## Must Fix Before Phase 7

### 1. Google sign-in fails on native iOS/Android
- **Source:** Code Review 4.1, Phase 5.13
- **Location:** `mobile/src/context/AuthContext.tsx`
- **Issue:** Google auth only passes a web client ID. Native iOS/Android builds need platform-specific OAuth client IDs.
- **Fix:** Add `iosClientId` and `androidClientId`, update `mobile/.env.example`, and configure matching OAuth clients in Google Cloud.

### 2. Public user endpoint leaks private data
- **Source:** Code Review 2.1, Phase 5.13
- **Location:** `server/src/routes/users.ts`
- **Issue:** `GET /api/users/:id` can expose the full user row, including `firebaseUid` and `email`, to unauthenticated callers.
- **Fix:** Require auth and return only public-safe fields. Only expose email to the current user.

### 3. AI question generation has no rate limit
- **Source:** Code Review 2.3, Phase 5.13
- **Location:** `server/src/routes/admin.ts`
- **Issue:** `POST /api/admin/questions/generate` can burn Gemini API budget quickly if an admin token is compromised.
- **Fix:** Add per-admin rate limiting, log usage metadata where available, and consider a daily generation cap.

### 4. Auth middleware writes on every request
- **Source:** Code Review 2.2, Phase 5.13
- **Location:** `server/src/middleware/auth.ts`
- **Issue:** Every authenticated request runs a Prisma upsert, creating unnecessary DB writes and `updatedAt` churn.
- **Fix:** Use find-then-create, and only sync profile fields when they actually change. Keep the Phase 5 `touchStreak` behavior throttled.

### 5. No admin bootstrap path
- **Source:** Code Review 2.4, Phase 5.13
- **Location:** `server/src/middleware/admin.ts`, `server/src/middleware/auth.ts`
- **Issue:** New users default to `role = "user"` and there is no supported way to promote the first admin without manual DB edits.
- **Fix:** Add an `ADMIN_EMAILS` env allowlist or a promote-admin script.

### 6. Production CORS is wide open
- **Source:** Code Review 2.5, Phase 5.13
- **Location:** `server/src/index.ts`
- **Issue:** API and Socket.io CORS use `origin: "*"`, which is unsafe for production.
- **Fix:** Add an env-driven allowlist such as `CORS_ORIGINS`, defaulting to permissive behavior only in local development.

---

## Should Fix Before Phase 7

### 7. Question content is not sanitized
- **Source:** Code Review 2.6, Phase 5.13
- **Location:** `server/src/routes/admin.ts`, `server/src/services/questionGenerator.ts`
- **Issue:** Question text, options, and explanations are stored as-is.
- **Fix:** Strip or escape HTML on input, or define a strict allowlist if formatted content is needed.

### 8. Practice answers can duplicate per user/question
- **Source:** Code Review 3.1, Phase 5.13
- **Location:** `server/prisma/schema.prisma`
- **Issue:** The practice-question exclusion logic assumes one answer per `(userId, questionId)`, but the database does not enforce it.
- **Fix:** Add `@@unique([userId, questionId])` if retries are not planned, or dedupe the query if retries are planned.

### 9. Match question balancing can silently under-return
- **Source:** Code Review 3.4, Phase 5.13
- **Location:** `server/src/services/gameSession.ts`
- **Issue:** Sparse categories can produce fewer than the intended number of match questions without warning.
- **Fix:** Log shortfalls, progressively widen difficulty ranges, and fail gracefully if too few questions are available.

### 10. Server env vars are not validated at startup
- **Source:** Code Review 6.6, Phase 5.13
- **Location:** `server/src/config/env.ts`
- **Issue:** Missing required env vars can let the server boot into a broken state.
- **Fix:** Add Zod validation at boot and crash early with a clear error.

---

## Socket Polish Before Phase 7

### 11. `game:join` can be missed or duplicated
- **Source:** Code Review 1.1, Phase 5.13
- **Location:** `mobile/src/screens/DuelScreen.tsx`
- **Issue:** Joining only inside the socket `connect` listener can miss the initial connection or double-emit on reconnect.
- **Fix:** Emit `game:join` explicitly after socket creation and keep the reconnect handler idempotent.

### 12. Countdown interval can leak on rapid remount
- **Source:** Code Review 1.2, Phase 5.13
- **Location:** `mobile/src/screens/DuelScreen.tsx`
- **Issue:** Rapid navigation/remounts can create fragile countdown interval behavior.
- **Fix:** Start countdown only on a clear `PREMATCH -> COUNTDOWN` phase transition and clear any existing interval before starting another.

### 13. Matchmaking socket IDs linger after match creation
- **Source:** Code Review 1.3, Phase 5.13
- **Location:** `server/src/services/matchmaking.ts`
- **Issue:** `socket:mm:${userId}` keys are not deleted immediately after `match:found`.
- **Fix:** Delete both players' matchmaking socket keys after emitting `match:found`.

### 14. Duel socket listener cleanup is incomplete
- **Source:** Code Review 4.5, Phase 5.13
- **Location:** `mobile/src/screens/DuelScreen.tsx`
- **Issue:** Cleanup only removes one listener and relies on `disconnect()` to remove the rest.
- **Fix:** Use `removeAllListeners()` on the per-screen socket or explicitly unregister every event handler.

---

## Phase 5 Completion Checks That Gate Phase 7

These are not all code review defects, but Phase 5 says the app should be complete before Phase 7 begins.

- All red Code Review items resolved.
- All orange Code Review items resolved except scaling items intentionally deferred to Phase 7.
- EAS production builds succeed for iOS and Android.
- Privacy Policy and Terms drafts exist under `/docs/legal/` and name PostHog + Firebase.
- Data safety/privacy labels are drafted.
- Store screenshots, icon, splash assets, listing copy, and deep-link association files are prepared.
- Phase 5 functional additions are complete: rating impact preview, opponent progress ping, and daily streak.
- Phase 5 polish is complete: redesigned screens, 4-tab navigation, settings, onboarding, accessibility, analytics, error boundary, loading/empty/error states, display-name fixes, pull-to-refresh, and account deletion.

---

## Track Into Phase 7, Not Before It

Phase 5.13 explicitly leaves these for Phase 7 launch/scale work. They should be planned as early Phase 7 tasks, but they do not block completing Phase 5 unless the deployment strategy requires multi-instance production before Phase 7 starts.

### A. Distributed matchmaking lock
- **Source:** Code Review 5.1, Phase 5.13
- **Location:** `server/src/services/matchmakingLoop.ts`
- **Issue:** Multiple server instances can run matchmaking concurrently and race on the same queue.

### B. Timer recovery on server restart
- **Source:** Code Review 5.2, Phase 5.13
- **Location:** `server/src/services/gameSession.ts`
- **Issue:** In-memory timers are lost on restart, potentially orphaning active games.

### C. Redis health check at boot
- **Source:** Code Review 5.5, Phase 5.13
- **Location:** `server/src/index.ts`
- **Issue:** The server can boot even if Redis is unavailable.
