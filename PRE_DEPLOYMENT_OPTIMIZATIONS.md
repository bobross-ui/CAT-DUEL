# Pre-Deployment Optimizations

Performance improvements to implement before production launch.

---

## Practice Answer Serve-Token Binding

**Status:** Deferred. This overlaps with the planned full practice backend refactor, so do not implement it as a standalone pre-deployment patch.

**Note:** The security hardening item for binding `GET /api/questions/next` to `POST /api/questions/:id/answer` via a short-lived Redis `serveToken` should be folded into the practice refactor. That refactor should also decide whether to add a `PracticeAnswer` uniqueness constraint and how replay/expired-token behavior should work in the new practice flow.

---

## 1. Preload Full Question Content into Redis at Game Init

**Status:** Completed in `a1365bb` (`Preload duel questions in Redis`). Server typecheck passes. Full server test suite still has unrelated fixture failures in `questionImport.test.ts` and `extractedFixtures.test.ts`.

**Problem:** `getQuestionForClient` hits the DB once per question per player during an active duel. For a 10-question game with 2 players that's 20 DB hits while the game is live. At high concurrency this becomes significant load.

**Fix:** At game init in `selectQuestionsForMatch`, fetch full client-safe question content (id, category, questionType, subTopic, subType, difficulty, text, options, passageId) alongside the existing query and store in `questions: Record<string, ClientQuestion>` on `GameState` in Redis — same pattern as `passages`.

Replace the two hot-path `getQuestionForClient` calls in `gameSession.ts` with direct `state.questions[questionId]` lookups:
- Line ~596: first question emitted in `game:start`
- Line ~707: next question emitted in `game:question` after each answer

Also handle the reconnect call sites (~lines 1051 and 1251) the same way.

**Result:** 0 DB hits during an active duel. All DB load shifts to match init which is predictable and batchable.

**Files:** `server/src/services/gameSession.ts`
