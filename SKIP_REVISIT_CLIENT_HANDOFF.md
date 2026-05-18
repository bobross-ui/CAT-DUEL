# Skip + Revisit — Client Hand-Off (Steps 4–7)

Server work (steps 1–3) is complete. This doc covers the client work needed to wire up the skip + tap-to-jump UX. Self-contained — you should not need the prior conversation.

---

## Feature recap

In a duel (20 questions, 10 min, +1/0 scoring), a player can now:
1. **Skip** the current question → it rotates to the tail of their queue.
2. **Jump** to any previously-skipped question via a tappable navigator.

Same 20 questions per player; per-player serve order; revisits allowed up until the timer expires. Bots never skip — they answer linearly.

---

## Server protocol — what the client must use

### Socket events the client emits

| Event            | Payload                              | When |
|------------------|--------------------------------------|------|
| `answer:submit`  | `{ gameId, questionId, selectedAnswer? \| typedAnswer?, timeTakenMs? }` | unchanged |
| `question:skip`  | `{ gameId, questionId }`             | user taps Skip; `questionId` must equal the currently-served question |
| `question:jump`  | `{ gameId, questionId }`             | user taps a skipped navigator cell to revisit; `questionId` must be in `yourSkippedIds` |
| `game:forfeit`   | `{ gameId }`                         | unchanged |
| `game:join`      | `{ gameId }`                         | unchanged |

Rate limits (server-side, no client action needed): `question:skip` and `question:jump` each capped at 60/min.

### Socket events the client receives

**`game:question`** (current/next question to serve)
```ts
{ question: ClientQuestion & { passage: ClientPassage | null }, questionNumber: number, totalQuestions: number }
```
- `questionNumber` is now the question's **position in the master list** (`questionIds.indexOf(currentQuestionId) + 1`), **not** the answered count + 1. This means it can decrease (e.g. after a jump back to Q3 from Q5).
- The current question ID is `question.id`.
- The progress bar can no longer be derived from `questionNumber`. Use answered count instead — `answeredQuestionIds.size` on the client.

**`answer:result`** — unchanged
```ts
{ questionId, isCorrect, correctAnswer, correctAnswerText, yourScore }
```
On receipt, add `questionId` to `answeredQuestionIds` and remove it from any local skipped set.

**`opponent:scored`** — unchanged
```ts
{ opponentScore }
```

**`opponent:progress`** — payload shape changed
```ts
// OLD: { currentQuestion, questionsAnswered }
// NEW:
{ questionsAnswered: number, questionsSkipped: number }
```
- `currentQuestion` is **gone**. Replace any "on Q5" display with answered + skipped counts.
- Always emitted as an object now (never `null`), so always-truthy. Use the count values to decide what to render.
- Emitted on opponent answer, opponent skip, and (now also) opponent jump.

**`game:sync`** (reconnect / resume)
```ts
{
  yourScore, opponentScore, opponent, timeRemaining,
  currentQuestion,                  // queue[0] for the reconnecting player
  currentQuestionId: string | undefined,
  questionNumber,                   // master-list position, not progress + 1
  questionIds: string[],            // master-list order for navigator cells and jump targets
  totalQuestions,
  yourSeenIds: string[],            // NEW — all question IDs the player has been served, in serve order
  yourSkippedIds: string[],         // NEW — seen, unanswered, and not currently served
  opponentProgress: {               // NEW shape, always object
    questionsAnswered: number,
    questionsSkipped: number,
  },
  playerFinished: boolean,
}
```
Use `questionIds`, `currentQuestionId`, `yourSeenIds`, and `yourSkippedIds` to restore navigator state after reconnect. Derive answered IDs after reconnect as:

```ts
const answeredQuestionIds = yourSeenIds.filter(
  id => id !== currentQuestionId && !yourSkippedIds.includes(id)
);
```

**`game:finished`**, **`game:timer`**, **`opponent:disconnected/reconnected`** — unchanged.

### `initialState` payload (from `getActiveGameForUser` → `/api/games/active`)

```ts
{ duration, totalQuestions, firstQuestion, questionNumber }
```
`questionNumber` is now master-list position. The HTTP route does not return `questionIds`, `seenIds`, or `skippedIds` — the client should rely on the subsequent `game:sync` (sent right after `game:join`) to populate those fields. Until `game:sync` arrives, treat `questionIds` as unknown and `yourSeenIds` as `[firstQuestion.id]`.

---

## Client state shape — proposed

In `DuelScreen.mobile.tsx` and `DuelScreen.desktop.tsx`, extend `DuelState`:

```ts
interface DuelState {
  currentQuestion: ClientQuestion;
  questionNumber: number;            // master-list position of current Q
  totalQuestions: number;
  selectedAnswer: number | null;
  typedAnswer: string;
  showFeedback: boolean;
  yourScore: number;
  opponentScore: number;
  timeRemaining: number;

  // NEW
  yourSeenIds: string[];             // question IDs the user has been served
  yourSkippedIds: string[];          // server-derived skipped IDs from game:sync; update locally on question changes
  answeredQuestionIds: Set<string>;  // grows on each answer:result
  questionIds: string[];             // master-list order, sent in game:sync; needed to render navigator cells in stable positions
  playerFinished: boolean;           // from game:sync, or answeredQuestionIds.size >= totalQuestions

  opponentProgress: { questionsAnswered: number; questionsSkipped: number } | null;
}
```

`questionIds` is in `game:sync`, not `game:start` or `/api/games/active`. Before `game:sync` arrives, render a minimal current-question view and defer the full navigator / jump UI until `questionIds.length > 0`.

Replace the old `allDone = showFeedback && questionNumber === totalQuestions` logic. With revisits, the final answered question can be any master-list position. Use:

```ts
const allDone = ds.playerFinished || ds.answeredQuestionIds.size >= ds.totalQuestions;
```

### Navigator state derivation

For each `q` in `questionIds` (index `i`, position `i + 1`):

| Status     | Condition                                           | Visual          |
|------------|-----------------------------------------------------|-----------------|
| `answered` | `answeredQuestionIds.has(q)`                        | green soft + ✓  |
| `current`  | `q === currentQuestion.id`                          | inverted ink    |
| `skipped`  | `yourSkippedIds.includes(q)`                        | dashed border / amber |
| `unseen`   | otherwise                                           | grey default    |

---

## Step 4 — Mobile UI

**Goal:** add Skip button to footer, replace opponent indicator copy, update types.

**Files:**
- `mobile/src/screens/DuelScreen.mobile.tsx`
- `mobile/src/navigation/index.tsx` (type for `opponentProgress`)

**Changes:**

1. **Footer layout** — three buttons: `Quit · Skip · Submit`. Skip is a ghost-variant `Button` (`variant="ghost"`) in the middle, between Quit and the submit wrap. Currently the footer is:
   ```
   ┌─────────────────────────────────────┐
   │ [Quit]                  [Submit]    │
   └─────────────────────────────────────┘
   ```
   New:
   ```
   ┌─────────────────────────────────────┐
   │ [Quit]    [Skip]        [Submit]    │
   └─────────────────────────────────────┘
   ```
   Skip handler:
   ```ts
   function handleSkip() {
     if (!ds.currentQuestion || ds.showFeedback) return;
     void playHaptic('answer_submit'); // or a new 'skip' haptic
     socketRef.current?.emit('question:skip', {
       gameId,
       questionId: ds.currentQuestion.id,
     });
   }
   ```
   Disable Skip when `ds.showFeedback` or `allDone`.

2. **Opponent indicator** — currently renders `Opp · on Q5` (line ~399–413). Replace with answered/skipped counts. Suggested format:
   ```
   Opp · 12 answered   (when skipped === 0)
   Opp · 12 ans · 2 skipped   (when skipped > 0)
   Opp · done   (when answered + skipped === totalQuestions or playerFinished)
   ```
   Keep the blinking dot for the active indicator (no change there).

3. **Socket handlers** — already handle `game:question`, `opponent:progress`. Update:
   - `opponent:progress` listener: destructure new shape `{ questionsAnswered, questionsSkipped }`.
   - `game:question` listener: update `currentQuestion` and `questionNumber` in state. No change in shape, but remember `questionNumber` semantics shifted.
   - `game:sync` listener: pull out `questionIds`, `currentQuestionId`, `yourSeenIds`, and `yourSkippedIds`; seed `answeredQuestionIds` using the derivation above.
   - `answer:result` listener: add `questionId` to `answeredQuestionIds`, remove it from `yourSkippedIds`, and set `playerFinished` when `answeredQuestionIds.size >= totalQuestions`.

4. **Type updates** in `mobile/src/navigation/index.tsx`:
   ```ts
   export type OpponentProgress = {
     questionsAnswered: number;
     questionsSkipped: number;
   };
   ```
   Remove any reference to `currentQuestion` in that type.

**Acceptance:**
- Skip button visible during active duel, disabled during `showFeedback`.
- Tapping Skip causes the question to change immediately (new question from server).
- Opponent HUD shows answered count, no longer references `currentQuestion`.
- Reconnect mid-duel restores the current question correctly.

---

## Step 5 — Desktop UI

**Goal:** add Skip button + `S` shortcut, update opponent live track, make question navigator tappable for revisit.

**Files:**
- `mobile/src/screens/DuelScreen.desktop.tsx`

**Changes:**

1. **Footer** — currently a `[Quit ... Submit]` row (lines 701–724). Add a Skip ghost button next to Submit. Same handler logic as mobile.

2. **Keyboard shortcut** — add `S` to the `shortcuts` array (lines 211–255). Same handler as the button. Disable when `showFeedback`.
   ```ts
   { key: 's', handler: handleSkip }
   ```

3. **Opponent live track card** (lines 475–496) — currently shows `ON Q5`. Replace with:
   ```
   12 / 20 ANSWERED
   2 SKIPPED              (only if > 0)
   ```
   Keep the blinking dot.

4. **Question navigator card** (lines 498–533) — currently shows static 20-cell grid. Add new cell statuses (see "Navigator state derivation" table above) and make cells tappable:
   ```tsx
   const status = getCellStatus(qId, ds);
   const onPress = (status === 'skipped' || status === 'current')
     ? () => handleJump(qId)
     : undefined;
   return (
     <Pressable
       key={q}
       onPress={onPress}
       disabled={!onPress}
       style={[styles.qCell, cellStyleForStatus(status, theme)]}
     >
       <Text.Mono>{status === 'answered' ? '✓' : q}</Text.Mono>
     </Pressable>
   );
   ```
   - `handleJump`:
     ```ts
     function handleJump(targetQuestionId: string) {
       if (targetQuestionId === ds.currentQuestion.id) return;
       socketRef.current?.emit('question:jump', { gameId, questionId: targetQuestionId });
     }
     ```
   - Tap on `current` cell = no-op (or trigger skip — designer's call; recommend no-op for clarity).

5. **Legend** (lines 528–532) — add a `skipped` swatch:
   ```tsx
   <LegendSwatch label="skipped" color={theme.amberSoft} border={theme.amber} />
   ```

6. **Document title** (line 159) — no change needed.

**Acceptance:**
- `S` skips the current question; Enter submits; works alongside existing 1–4 / Esc shortcuts.
- Question navigator cells visually distinguish answered / current / skipped / unseen.
- Tapping a skipped cell jumps back to it; server responds with `game:question` for that target.
- Tapping an unseen cell does nothing.

---

## Step 6 — Mobile tap-to-jump bottom sheet

**Goal:** mobile gets a way to revisit specific skipped questions, not just FIFO cycle through them.

**Files:**
- `mobile/src/screens/DuelScreen.mobile.tsx`
- new component: `mobile/src/components/JumpToQuestionSheet.tsx`

**Changes:**

1. **Add a "Revisit" chip** in the question meta row (next to the `Q 5 of 20` pill) that's visible only when `ds.yourSkippedIds.length > 0`. The chip shows the count: `↶ 2 skipped`.

2. **On tap**, open a bottom sheet listing skipped questions. Use `Modal` from `react-native` with slide-up animation:
   ```tsx
   <Modal visible={sheetOpen} animationType="slide" transparent>
     <View style={styles.sheetBackdrop} onTouchStart={() => setSheetOpen(false)}>
       <View style={styles.sheet}>
         <AppText.Mono preset="eyebrow">SKIPPED — TAP TO RETURN</AppText.Mono>
         {ds.yourSkippedIds.map(qId => {
           const num = ds.questionIds.indexOf(qId) + 1;
           const q = lookupQuestion(qId); // need a map of seen questions; see note below
           return (
             <Pressable key={qId} onPress={() => handleJump(qId)} style={styles.row}>
               <AppText.Mono>Q{num}</AppText.Mono>
               <MathText preset="body" numberOfLines={2}>{q.text}</MathText>
             </Pressable>
           );
         })}
       </View>
     </View>
   </Modal>
   ```

3. **Question preview lookup** — to show the question text in the sheet, the client needs a cache of seen questions. Maintain a `Record<string, ClientQuestion>` updated on each `game:question` event. If a question was seen but the client only stored the *current* one, the previously-seen ones aren't available. Two options:
   - **(a)** Cache every `game:question` payload by ID into a local map on the client (simplest, preferred).
   - **(b)** Have the server send all seen questions in the sync payload. More bandwidth; only needed if cache option misses (e.g. reconnect mid-revisit).
   - Pragmatically, do **(a)** and accept that after reconnect the sheet's previews are "Q5" only (no text) until that Q is re-served. Trade-off acceptable for v1.

4. **`handleJump`** — emit `question:jump`, close sheet:
   ```ts
   function handleJump(targetQuestionId: string) {
     socketRef.current?.emit('question:jump', { gameId, questionId: targetQuestionId });
     setSheetOpen(false);
   }
   ```

**Acceptance:**
- Chip appears as soon as user has at least 1 skipped question.
- Sheet lists all skipped questions with their global Q number.
- Tap → jump → sheet closes → new question loads.

---

## Step 7 — Manual verification

**Goal:** play through the feature end-to-end on web + bot match. No new code; just a checklist.

**Setup:** local dev (`docker compose up -d`, `npm run dev:server`, `cd mobile && npx expo start --web`).

**Scenarios:**

1. **Bot match — skip + revisit FIFO** (mobile + web):
   - Start a duel.
   - Skip Q1 → expect Q2 served, navigator marks Q1 skipped.
   - Skip Q2 → expect Q3 served.
   - Answer Q3–Q20.
   - Should now be served Q1 (oldest skip). Answer.
   - Served Q2. Answer.
   - Game ends correctly.

2. **Bot match — tap-to-jump** (desktop only — mobile uses sheet):
   - Skip Q1, Q2, Q3.
   - Tap Q2 cell in navigator → expect Q2 served immediately (skipping Q4).
   - Answer Q2. Q4 is now current.
   - Tap Q3 in navigator → jumps. Answer.
   - Continue. Game ends.

3. **Bot match — mobile jump sheet**:
   - Skip Q1, Q3, Q5.
   - Tap the "3 skipped" chip → sheet opens listing Q1, Q3, Q5.
   - Tap Q3 → sheet closes, Q3 served.
   - Verify each previously-skipped question text shows correctly.

4. **Reconnect** (mobile + web):
   - Skip a few questions.
   - Force a reconnect (toggle airplane mode, refresh browser).
   - Verify the navigator still shows correct skipped/answered states.
   - Verify the same currently-served question reappears.

5. **Opponent indicator** (run a 2-player session via two browser tabs as different test accounts):
   - From tab A: answer 2, skip 1.
   - Tab B should display: `2 answered · 1 skipped`.
   - No `currentQuestion` field anywhere in the UI.

6. **Timer expiry mid-revisit**:
   - Skip a few. With <10s left, jump to a skipped one. Let timer expire.
   - Match ends. Score = correct answers count. Skipped questions don't count.

7. **Edge cases**:
   - Skip when only 1 question left in queue → screen flickers / resets state but stays on same question. No crash.
   - Spam-tap Skip rapidly → rate limit holds at 60/min; no client error.
   - Forfeit (Quit) mid-revisit → opponent wins. No regression.

**Done when** all scenarios pass on web + Expo Go.

---

## Server reference — touchpoints for follow-up

If you find a server-side gap during client work:

| File | Function | What it does |
|---|---|---|
| `server/src/services/gameSession.ts` | `handleAnswer` | reads `queue[0]`, shifts on answer |
| `server/src/services/gameSession.ts` | `handleSkip` | rotates queue head → tail |
| `server/src/services/gameSession.ts` | `handleJump` (added in step 3) | reorders queue: target → head, displaced → skip pile |
| `server/src/services/gameSession.ts` | `buildOpponentProgress` | always-object payload `{questionsAnswered, questionsSkipped}` |
| `server/src/services/socketPayloadSchemas.ts` | schemas | `socketQuestionSkipPayloadSchema`, `socketQuestionJumpPayloadSchema` |
| `server/src/services/socketRateLimit.ts` | limiters | `question:skip`, `question:jump` at 60/min each |

`questionIds` is currently emitted in `game:sync`, but not in `game:start` or `/api/games/active`. Prefer consuming it from `game:sync`; only add it to `game:start` if the client needs to render the full navigator before the post-mount `game:join` sync returns.

---

## Out of scope (defer to a future PR)

- Showing skipped questions as "unattempted" rows in the post-match results screen (currently `state.player1Answers` only contains answered questions; would need server changes to emit the skipped IDs in results).
- Negative marking (would change scoring; not a UX change).
- TITA-only skip variant (we shipped skip for both MCQ and TITA).
