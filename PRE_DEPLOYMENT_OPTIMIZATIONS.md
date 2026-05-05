# Pre-Deployment Optimizations

Performance improvements to implement before production launch.

---

## 1. Preload Full Question Content into Redis at Game Init

**Problem:** `getQuestionForClient` hits the DB once per question per player during an active duel. For a 10-question game with 2 players that's 20 DB hits while the game is live. At high concurrency this becomes significant load.

**Fix:** At game init in `selectQuestionsForMatch`, fetch full client-safe question content (id, category, questionType, subTopic, subType, difficulty, text, options, passageId) alongside the existing query and store in `questions: Record<string, ClientQuestion>` on `GameState` in Redis — same pattern as `passages`.

Replace the two hot-path `getQuestionForClient` calls in `gameSession.ts` with direct `state.questions[questionId]` lookups:
- Line ~596: first question emitted in `game:start`
- Line ~707: next question emitted in `game:question` after each answer

Also handle the reconnect call sites (~lines 1051 and 1251) the same way.

**Result:** 0 DB hits during an active duel. All DB load shifts to match init which is predictable and batchable.

**Files:** `server/src/services/gameSession.ts`
