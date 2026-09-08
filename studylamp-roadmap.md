# Study Lamp - Active Improvement Roadmap

This file contains only unfinished, partial, or ongoing work. Completed
features are intentionally omitted so the roadmap stays useful.

Current review date: 2026-09-07

## Product Decisions Already In Effect

- `/playlists` is the student personal-playlist page.
- The student Topics page was removed. Playlist discovery uses search,
  category, tag, visibility, and sorting controls on `/playlists`.
- Categories are private to each user at
  `users/{uid}/categories/{categoryId}`. There is no global category
  collection. Users can create, rename, and delete their own categories.
- Tags remain shared application data and are user-creatable but admin-owned
  for update/delete operations.
- Shared category names are copied into the recipient's private category list
  when a shared playlist is imported.
- Video progress is kept in memory between checkpoints, saved every 60
  seconds while playing, and flushed on pause, end, page change, hidden tab,
  and page unload.
- There are currently no `onSnapshot` listeners under `src/`.

## Phase 0 - Fix Facebook Embed Sizing

**Status: Partial.** Facebook embed fallback handling exists, but sizing still
uses timeout-based normalization rather than observing the injected iframe.

### Goal

Prevent portrait Facebook videos and Reels from being cropped or rendered
with a stale fixed height.

### Work

1. Replace the one-shot `setTimeout` sizing logic in
   `src/components/video/FacebookEmbed.tsx` with a `ResizeObserver` watching
   the injected iframe.
2. Read the iframe's actual width and height attributes when available.
3. Apply the calculated aspect ratio to the wrapper and let the iframe fill
   the wrapper without fighting SDK inline styles.
4. Preserve the existing timeout fallback that offers an external link when
   the SDK fails to render.
5. Test one landscape Facebook video and one portrait Reel manually.

## Phase 1 - Finish Sharing Consistency

**Status: Partial.** Direct sharing, recipient lookup, approval status,
expiry, revoke, and the Shared page exist. The original receipt-based design
was not adopted, so do not implement a second sharing architecture beside the
current direct-share model.

### Remaining work

- Decide whether public/unlisted visitors should create approval records or
  remain view-only. Document the decision before changing the data model.
- If approval records are needed, add them incrementally under the current
  `shares/{shareToken}` model rather than introducing duplicate receipt and
  direct-share flows.
- Add a pending-approval count to the Shared navigation only if it can be
  fetched as a one-time query. Do not add a live listener for it.
- Ensure accepted shared videos and playlists have a clear destination in the
  Library and no stale route or Topics links.
- Add emulator tests for: owner access, recipient approval, rejected shares,
  expired shares, revoked shares, and unauthorized cross-user reads.

### Important security checks

- A recipient must not be able to approve or reject another user's share.
- A non-owner must not change visibility, expiry, or revoke state.
- A private share must not become readable merely because its token is known.
- Shared category names may be copied into a recipient's own category list,
  but category documents themselves must never become cross-user readable.

## Phase 2 - Goal Pacing And Progress Graph

**Status: Not started.** Goals and completion tracking exist, but there is no
daily pace calculation, pacing guidance, or progress graph.

### Scope

1. Add a pure `computeDailyPace` helper in `src/lib/goalUtils.ts` returning:
   - videos remaining
   - days remaining
   - videos per day needed
   - `ahead`, `on-track`, `behind`, or `overdue` status
2. Base actual pace on completed videos during the last seven days.
3. Show a compact guidance message on the existing playlist detail page.
4. Add one small burndown chart to the existing page. Do not create a new
   dashboard page for this feature.
5. Add unit tests for no target date, overdue goals, early completion, and
   the exact pace boundary.

## Phase 3 - Branded Password And Account Settings

**Status: Partial.** Password reset email initiation works. A branded action
handler, change-password flow, and settings page are still missing.

### Scope

1. Add `/auth/action` for Firebase password-reset links using
   `confirmPasswordReset`.
2. Match the action page to the Study Lamp visual system.
3. Add `/settings` with a Change Password form using:
   - current password
   - new password
   - confirmation
   - `reauthenticateWithCredential`
   - `updatePassword`
4. Add a Header menu item linking to Settings.
5. Keep the existing forgot-password flow working.
6. Document the Firebase Console email-template and Action URL setup.

## Phase 4 - Category And Tag Data Hygiene

**Status: Partial.** User-owned categories and shared tags work, but the
transition needs operational safeguards and cleanup.

### Remaining work

- Add emulator/security-rule tests proving user A cannot read, edit, or delete
  user B's categories.
- Add validation for category rename/delete behavior when playlists or videos
  still reference the category ID. Choose and document one policy:
  preserve the label as an orphaned reference, or clear references before
  deletion.
- Add a small admin-only cleanup view for orphaned category references if the
  preserve-reference policy is chosen.
- Audit older personal playlist/video documents that reference the removed
  global category collection and define a one-time migration or fallback.
- Add duplicate protection tests for category names that differ only by case
  or surrounding whitespace.
- Keep category and tag counts on `/playlists` scoped to the current owner.

## Phase 5 - Spark Capacity And Persistence Audit

**Status: Ongoing.** This is a recurring operational check, not a one-time
feature.

### Current known state

- No `onSnapshot` calls currently exist under `src/`.
- YouTube progress uses a 60-second periodic checkpoint plus lifecycle saves.
- Notes and summaries use debounced writes of roughly 900 milliseconds.
- Firestore Spark daily quotas to watch are approximately 50K reads, 20K
  writes, and 20K deletes.

### Monthly audit

For `[N]` active students watching `[M]` videos per week, estimate:

```text
daily watched videos = N * M / 7
progress writes = watched videos * periodic checkpoints
                 + pause/end/navigation checkpoints
note writes = editing sessions * pauses after the debounce window
reads = page loads + playlist/video/state/note/summary/bookmark reads
listeners = count of onSnapshot subscriptions and peak concurrent users
```

Record:

- estimated daily reads, writes, and deletes
- number of live listeners
- peak concurrent connections
- remaining Spark quota margin
- the smallest adjustment needed if a quota is approached

Prefer increasing debounce/checkpoint intervals or batching writes before
removing user-facing features. Re-run after any new listener or real-time
feature is introduced.

## Phase 6 - AI Assistance, Carefully Scoped

**Status: Not started.** There is no AI-backed feature in the current app.

Choose one feature at a time:

1. Generate an editable starter summary from title and description.
2. Suggest tags during admin imports, with explicit admin approval.
3. Improve search only after measuring whether literal search is insufficient.

Rules for any AI work:

- Keep API keys server-side in a Next.js API route.
- Never silently overwrite a student's notes or tags.
- Keep manual entry fully functional if the AI request fails.
- Add request limits and clear error states before enabling it for users.
- Do not use AI for deterministic progress, goals, permissions, or privacy.

## Recommended Order

1. Finish the Facebook `ResizeObserver` fix.
2. Add sharing emulator/security tests and settle public-link behavior.
3. Complete category migration and orphan-reference policy.
4. Implement goal pacing and its pure unit tests.
5. Add branded password actions and Settings.
6. Run the Spark capacity audit with real usage numbers.
7. Choose one small, additive AI feature only if user feedback justifies it.

## Definition Of Done For Any Phase

- Inspect the current implementation before editing.
- Keep the change within the phase scope.
- Add pure unit tests for pure logic.
- Use the Firebase emulator for rule and cross-user privacy tests.
- Run `npx tsc --noEmit` and `npm run build`.
- Run the relevant tests and the full test suite when shared behavior changes.
- Manually test the changed workflow on desktop and a narrow mobile viewport.
- Update this roadmap immediately so completed work does not remain in the
  active plan.
