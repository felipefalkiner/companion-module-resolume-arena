# Changelog / Summary of Changes

**Short summary** ✅
- Implemented subscribe-on-demand (per-item subscriptions) for Clips (connected), Columns, and Decks.
- Added debounced feedback batching to reduce expensive repeated `checkFeedbacks` calls (50 ms debounce).
- Wired feedback subscribe/unsubscribe handlers to avoid subscribing to every parameter by default.
- Updated module metadata for local dev testing (renamed to `arena-falk` / `resolume-arena-falk` in `package.json` and `companion/manifest.json`).
- All changes were committed and pushed to `origin/master`.

---

## What changed (files & highlights) 🔧

### Core
- `src/index.ts`
  - **Added** `markFeedbackDirty(...keys)` — collects dirty feedback keys in a Set and flushes them via a debounced timer (50 ms) to call `checkFeedbacks(...)` once per burst.
  - **Purpose:** Coalesce many rapid feedback updates into a single call to reduce CPU / UI churn.

### Clips
- `src/domain/clip/clip-utils.ts`
  - **Added** `clipConnectedSubscriptions` map and methods:
    - `clipConnectedFeedbackSubscribe(feedback, context)`
    - `clipConnectedFeedbackUnsubscribe(feedback, context)`
  - **Changed** `initConnectedFromComposition()` to only subscribe `/composition/layers/:layer/clips/:column/connect` when that clip has an active feedback subscription.
  - **Changed** `messageUpdates` to use `markFeedbackDirty('connectedClip')` only for clips with active subscriptions (instead of calling `checkFeedbacks` for every message).
  - **Result:** Reduced automatic subscriptions and redundant feedback recalculation when many clips exist.

- `src/feedbacks/clip/feedbacks/connectedClip.ts`
  - Wired `subscribe` / `unsubscribe` to `clipConnectedFeedbackSubscribe` / `Unsubscribe`.

### Columns
- `src/domain/columns/column-util.ts`
  - **Added** per-column subscription maps: `columnSelectedSubscriptions`, `columnConnectedSubscriptions`, `columnNameSubscriptions`.
  - **Added** subscribe/unsubscribe handlers for column feedbacks (name/select/connect).
  - **Changed** `initConnectedFromComposition()` to unsubscribe all then only subscribe paths for columns with active feedback subscriptions.
  - **Changed** `messageUpdates` to `markFeedbackDirty()` only for affected column feedbacks when subscriptions exist (global summary feedbacks still updated as needed).

- `src/feedbacks/column/feedbacks/*`
  - Wired `subscribe` / `unsubscribe` where applicable (e.g., `columnSelected`, `columnConnected`, `columnName`).

### Decks
- `src/domain/deck/deck-util.ts`
  - **Added** per-deck subscription maps: `deckSelectedSubscriptions`, `deckNameSubscriptions`.
  - **Added** subscribe/unsubscribe handlers for deck feedbacks (`deckSelected`, `deckName`).
  - **Changed** `initConnectedFromComposition()` to only subscribe per-deck paths when subscriptions exist and to use `markFeedbackDirty()` for the relevant keys.

- `src/feedbacks/deck/feedbacks/*`
  - Wired `subscribe` / `unsubscribe` for `deckSelected` and `deckName`.

### Other fixes & build
- Fixed duplicate method issue during refactor and ensured TypeScript builds cleanly.
- Ran `yarn build` successfully after changes.

---

## Rationale / Why this helps 💡
- Resolume's WebSocket sends many parameter updates for large compositions. Subscribing to every parameter by default caused:
  - High message churn (lots of `parameter_subscribed` logs)
  - Many immediate `checkFeedbacks()` calls, overloading the module and slowing Companion UI.
- Subscribe-on-demand keeps the WebSocket subscription surface small (only parameters actually needed for active feedbacks), and debounced feedback updates coalesce many rapid updates into one UI refresh — both dramatically improve runtime performance under load.

---

## How to test / verify ✅
1. Build locally: `yarn` && `yarn build`. Confirm `dist/index.js` exists.
2. Restart Companion and connect to Resolume with a large composition.
3. Enable/disable a feedback (e.g., a `connectedClip` feedback on a clip) and observe that **subscribe/unsubscribe** messages appear only for that clip's `/connect` path.
4. Verify the logs show fewer noisy `parameter_subscribed` messages and that UI updates remain correct.
5. Confirm no TypeScript build errors and that changes are committed/pushed.

---

## Commits & Push
- Commit messages include:
  - `feat: subscribe-on-demand for columns & clips; debounced feedback batching; add per-column/clip subscription handlers`
  - `feat: subscribe-on-demand for decks; add per-deck subscription handlers`
- Branch/remote: changes were pushed to `origin/master`.

---

## Next recommended steps (optional) ⚡
- Apply subscribe-on-demand to other noisy subsystems (e.g., Layers / Layer Groups) if needed.
- Add param-guarding in websocket action helpers to avoid `/parameter/by-id/undefined` errors.
- Optionally filter the websocket-level debug logging for `parameter_subscribed` (only log meaningful changes) to reduce console noise.
- Add unit/integration tests for subscribe/unsubscribe behavior.

---

> Note: This work was vibe-coded with GitHub Copilot (Raptor mini (Preview)).

---

If you want, I can create a trimmed changelog entry suitable for a PR description or a short README note. 

