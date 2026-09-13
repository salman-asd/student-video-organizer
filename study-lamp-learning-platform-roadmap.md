# Study Lamp — Personalized Learning Platform Roadmap

Builds on `study-lamp-ai-roadmap.md` (the AI system already shipped:
`aiConnections`, `aiEncryption`, `aiService`, multi-provider fallback,
`AiConnectionDialog`, the Summary-tab "Generate starter summary" feature).
Everything below reuses that system rather than replacing it. Same working
rules as every other roadmap in this project: one phase per fresh chat,
attach only the files a phase names, run tests before moving on, commit
before starting the next phase.

**Read this before starting:** this is a large roadmap (~20 sessions).
Group A is close to mandatory (everything else calls AI through it). After
that, treat B–F as a menu, not a queue — ship whichever group gives you the
most value next, skip or defer the rest. Don't feel obligated to build all
of it just because it's written down.

---

## Group A — System AI (admin-controlled, no personal connection required)

Everything after this group calls AI through the resolver built here.
Build this first regardless of which other group you do next.

### A1 — System-owned connections collection

**Prompt:**
```
Read src/lib/server/aiConnections.ts, src/lib/server/aiEncryption.ts, and
the /aiConnections rule in firestore.rules (currently `allow read, write:
if false`, admin-SDK-only).

Add a parallel top-level collection systemAiConnections/{id}, same document
shape as users/{uid}/aiConnections/{id} (provider, encryptedApiKey [reuse
encryptApiKey/decryptApiKey as-is, no new encryption code], model, label,
priority, isActive, status, cooldownUntil, lastUsedAt/lastSuccessAt/
lastFailureAt). Add functions in a new src/lib/server/systemAiConnections.ts
mirroring aiConnections.ts's create/list/update/delete/getActiveConnectionRaw/
recordTestResult/recordConnectionFailure — same logic, different collection
and admin-only auth check instead of isSelf(uid).

Add matching firestore.rules: allow read, write: if false (same deny-all —
this collection is admin-SDK-only from day one, exactly like the personal
one).

No API routes or UI yet — this phase is just the data layer, mirrored.
```

**Test plan:** write a throwaway admin-SDK script (or a temporary test)
that creates, lists, and deletes a `systemAiConnections` doc directly via
`adminDb`, confirming the shape matches `aiConnections` exactly.

### A2 — Per-user quota

**Prompt:**
```
Read src/lib/server/aiConnections.ts for the subcollection/validation
pattern this app uses.

Add users/{uid}/aiQuota/current: { dailyLimit: number, usedToday: number,
date: string (YYYY-MM-DD), systemAiEnabled: boolean }. Add a top-level
singleton systemAiSettings/defaults: { defaultDailyLimit: number } for the
platform-wide default so admin doesn't have to set every user individually.

Add src/lib/server/aiQuota.ts:
- getOrInitQuota(uid): reads users/{uid}/aiQuota/current; if missing,
  creates it from systemAiSettings/defaults (systemAiEnabled: true by
  default).
- consumeQuota(uid): Firestore transaction — resets usedToday to 0 if
  `date` isn't today, checks usedToday < dailyLimit, increments if so,
  returns boolean (whether the call is allowed). This is the same
  transactional-counter pattern as any other write-guard in this app.
- setUserQuotaOverride(uid, { dailyLimit?, systemAiEnabled? }): admin-only
  write.

firestore.rules: both new collections get allow read: if isSelf(uid) ||
isAdmin(); allow write: if false (admin-SDK-only), same pattern as
aiConnections — a client-writable quota counter defeats the point.
```

**Test plan:** call `consumeQuota` past the limit in a script/test, confirm
it returns `false` on the (limit+1)th call and `true` before; confirm the
counter resets after manually rolling `date` back a day.

### A3 — The resolver every AI feature calls

**Prompt:**
```
Read src/lib/server/aiConnections.ts's getActiveConnectionRaw and
src/app/api/ai/summary/route.ts's fallback loop (the while(true) walking
priority-ordered connections) — this phase generalizes that pattern so
every future AI feature (quiz generation, roadmap generation, this one)
shares it instead of re-implementing the loop each time.

Add src/lib/server/resolveAiConnection.ts exporting:

async function withAiConnection<T>(
  uid: string,
  attempt: (apiKey: string, provider: AiProvider, model: string) => Promise<T>
): Promise<T>

Logic: try the user's own active personal connections first (existing
priority/fallback/cooldown behavior, unlimited — their key, their cost).
If none exist or all fail with a fallback-worthy AiServiceError code, check
aiQuota.consumeQuota(uid); if allowed, try systemAiConnections the same
way; if quota is exhausted or no system connections exist, throw a clear
AiServiceError explaining the user can add their own key in Settings or
ask an admin for more quota.

Refactor src/app/api/ai/summary/route.ts to call withAiConnection instead
of its own inline loop — behavior should be identical for users who
already have a personal connection, and now also work for users who don't
(falling through to system tier).
```

**Test plan:**
1. A user with an active personal connection: confirm summary generation
   still works exactly as before, system tier never touched (check
   `usedToday` doesn't increment).
2. A user with zero personal connections and quota available: confirm
   summary generation now works via the system tier.
3. A user with zero personal connections and exhausted quota: confirm the
   friendly error message, not a raw 500.

### A4 — Admin surfaces

**Prompt:**
```
Read src/app/admin/users/[userId]/page.tsx (the existing per-user admin
detail page with its Enable/Disable access toggle) and
src/components/settings/AiConnectionDialog.tsx (reuse this component
as-is for system connections too).

1. Add an "AI Access" card to admin/users/[userId]/page.tsx: shows this
   user's aiQuota (dailyLimit, usedToday/dailyLimit today), a toggle for
   systemAiEnabled, and an editable dailyLimit override — calling
   setUserQuotaOverride from Phase A2.

2. Add src/app/admin/ai-settings/page.tsx (admin-only route, follow the
   existing admin route-guard pattern used elsewhere under src/app/admin/):
   list/add/edit/delete/test systemAiConnections (reuse AiConnectionDialog
   exactly as the personal Settings page uses it, just pointed at the
   /api/ai/system-connections routes you'll add mirroring
   /api/ai/connections), plus a form for systemAiSettings/defaults'
   defaultDailyLimit.

3. Add the matching /api/ai/system-connections routes, admin-auth-gated
   (check how existing admin-only routes verify role, e.g. via the user's
   Firestore role field after token verification).
```

**Test plan:** as admin, add a system Gemini connection and set a default
quota of 5/day. As a fresh test student with no personal connection, use
"Generate starter summary" 5 times — 6th should show the quota message.
Confirm a student cannot reach `/admin/ai-settings` directly by URL.

---

## Group B — Rich-text summary editor

Independent of everything else; do this whenever, including before Group A
if you want a quick visible win first.

### B1 — Editor + storage

**Prompt:**
```
Read src/app/video/[videoId]/page.tsx and src/app/playlists/[playlistId]/
[videoId]/page.tsx's Summary tab (plain textarea bound to summary state +
debouncedSaveSummary + the Phase-5 "Generate starter summary" button), and
src/lib/firestore/notes.ts's saveSummary, and the notes/summaries size
guard in firestore.rules (currently 20000 chars).

Add Tiptap (@tiptap/react, @tiptap/starter-kit — check current versions on
npm) as a new dependency. Replace the plain textarea in both video pages'
Summary tab with a Tiptap editor (basic toolbar: headings, bold/italic,
bullet/numbered lists, blockquote — nothing exotic). Store its HTML output
in the same summaries/{videoId} doc's content field (still a string,
just HTML instead of plain text now) via the same debouncedSaveSummary
path — no new Firestore field, no migration needed for old plain-text
summaries (Tiptap renders them as plain paragraphs fine).

Raise the firestore.rules size guard on notes/{videoId} and
summaries/{videoId} from 20000 to 50000 chars (HTML markup is heavier than
plain text) — update the comment explaining why.

Update the "Generate starter summary" flow so the AI draft is inserted as
the editor's content (wrap plain text in a <p> or split on newlines into
paragraphs) instead of raw textarea value.
```

**Test plan:** create a summary with headings/bold/lists, refresh, confirm
it persists and re-renders correctly. Open an old plain-text summary from
before this phase, confirm it still displays. Generate an AI draft,
confirm it lands in the editor cleanly.

---

## Group C — MCQ quizzes + growth metrics

### C1 — Quiz data model + generation

**Prompt:**
```
Read src/lib/ai/aiService.ts (generateVideoSummary — mirror its pattern),
src/lib/server/resolveAiConnection.ts (Phase A3), and src/types/index.ts's
Video/PersonalVideo shape.

Add a quiz cache at videos/{videoId}/quiz (shared/cacheable — one
generation serves every student who watches this video, not regenerated
per user) and the personal-video equivalent at the matching path under
personalPlaylists, with shape: { questions: [{ id, prompt, options: [{id,
text}], correctOptionId, explanation }], generatedAt, sourceHash } —
sourceHash (title+description hashed) lets you detect "this video's
metadata changed, regenerate" later without building that now.

Add src/lib/ai/aiService.ts's generateVideoQuiz(connection, video):
Promise<QuizQuestion[]>, prompting for N (start with 5) MCQs from
title/description (or transcript if available — reuse getYouTubeTranscript
from the summary feature). Add POST /api/ai/quiz/generate using
withAiConnection, caching the result in the quiz doc above so a second
student watching the same video doesn't trigger a second AI call.

firestore.rules: quiz subcollection readable by any signed-in active user
(same as the parent video), writable only via admin SDK (client never
writes generated quiz content directly).
```

**Test plan:** generate a quiz for a video, confirm it's cached (check
Firestore directly — second request for the same video shouldn't call the
AI service again, verify via a temporary log line).

### C2 — Taking a quiz + recording attempts

**Prompt:**
```
Read src/app/video/[videoId]/page.tsx's tab structure (Notes/Summary tabs)
and src/lib/firestore/notes.ts for the users/{uid}/... subcollection
pattern.

Add a "Quiz" tab next to Summary/Notes. If no quiz exists yet, show a
"Generate quiz" button (calls Phase C1's route). Once generated, render an
MCQ flow: one question at a time or all-at-once (match whatever this app's
existing quiz_display-style UX conventions look like, or build a simple
inline version — no need for a library), grade on submit, show the
explanation per question.

Add users/{uid}/quizAttempts/{attemptId}: { videoId, categoryId (denormalized
from the video/playlist), score, totalQuestions, completedAt }. Save one on
submit. firestore.rules: same isSelf(uid) || isAdmin() pattern as every
other users/{uid} subcollection in this app.
```

**Test plan:** take a quiz, confirm score saves; retake it, confirm a
second attempt is recorded (don't overwrite the first — attempts are a
history, not a single high-score field).

### C3 — Mastery rollup on the Dashboard

**Prompt:**
```
Read src/app/dashboard/page.tsx for its existing card/stat conventions and
users/{uid}/quizAttempts from Phase C2.

Add a per-category mastery computation (in a new src/lib/masteryUtils.ts,
with unit tests, since it's pure logic with no Firebase calls): average
score per categoryId across a user's quizAttempts, weighted toward more
recent attempts (simple recency weighting, not a full spaced-repetition
algorithm — don't overbuild this). Surface it as a small "Your Growth" card
on the Dashboard: top categories by mastery, with a simple progress bar
each.
```

---

## Group D — Onboarding & interests

Do this before Group E (roadmaps need to know the user's interests).

### D1 — Interest selection on first login + Settings

**Prompt:**
```
Read src/components/auth/AuthProvider.tsx (where a new user's profile
first gets created) and src/lib/firestore/categoriesTags.ts's
listCategories (the existing admin-curated, closed-list categories).

Add interests?: { categoryId: string; level: "basic" | "intermediate" |
"advanced" | null }[] to UserProfile in src/types/index.ts. On first
login (check however this app currently detects "profile doc didn't exist
before this sign-in" in AuthProvider), redirect to a new /onboarding page
instead of the Dashboard: a multi-select grid over listCategories()
results, plus an "Other" option that reveals a text input (this phase:
just collect the free text, Phase D2 does the AI-assisted naming). Save
selected categoryIds to UserProfile.interests (level: null for now — Group
E sets that when the user picks a roadmap level).

Add the same multi-select as an editable section on /settings (existing
users should be able to revisit their interests later, not just once).
```

**Test plan:** sign up a fresh test account, confirm onboarding shows
before the Dashboard and only once; confirm an existing user isn't
re-shown it; confirm editing interests from Settings persists.

### D2 — AI-assisted "Other" interest naming (approval queue)

**Prompt:**
```
Read src/lib/firestore/categoriesTags.ts's createTagIfMissing (the
existing case-insensitive-match-then-create pattern for tags) and
firestore.rules' /categories/{categoryId} rule (currently admin-only for
all writes — do not change this; categories stay a closed list).

Add a new top-level categorySuggestions/{id} collection: { suggestedName,
suggestedBy (uid), status: "pending"|"approved"|"rejected", aiCleanedName,
similarExistingCategoryId (nullable), createdAt }. Any signed-in active
user can create one (mirroring the /tags create-only-not-update-delete
rule split from Phase 2b of the main roadmap); only admin can update
status.

Add POST /api/ai/suggest-category-name using withAiConnection: given the
user's typed "Other" text, ask the model to (a) return a cleaned-up
canonical name (fix casing/typos), and (b) flag if it looks like a
near-duplicate of an existing category (pass the current category list in
the prompt). Wire this into the onboarding "Other" input from D1: on blur/
submit, call this route, show "Did you mean '{aiCleanedName}'?" or "This
looks similar to '{existingCategory}' — use that instead?" before creating
the categorySuggestions doc.

Add an admin review UI (a tab on an existing admin page, or a small new
one) listing pending suggestions with Approve (creates the real Category
via the existing admin-only path) / Reject buttons — never auto-create a
category from a suggestion.
```

**Test plan:** submit "Progamming" as an Other interest, confirm the AI
suggests "Programming" and/or flags the existing "Programming" category if
one exists; confirm nothing becomes a real category until admin approves.

---

## Group E — Interest-based roadmaps, playlist suggestions, AI goals

Depends on Group D (needs `UserProfile.interests`) and Group A (needs
`withAiConnection`).

### E1 — Roadmap generation (shared templates + personal editable copy)

**Prompt:**
```
Read src/types/index.ts's Category and the interests field from Phase D1,
and src/lib/server/resolveAiConnection.ts.

Add roadmapTemplates/{categoryId}_{level}: { categoryId, level, steps: [{
title, description, order }], generatedAt } — a SHARED, cacheable
generation (same "generate once, reuse for every student" principle as
the quiz cache in Group C) covering all three levels
(basic/intermediate/advanced) for a category in one generation call so a
student sees all three previews before choosing.

Add users/{uid}/learningRoadmaps/{id}: { categoryId, level, steps: [...],
adoptedFromTemplateAt, updatedAt } — this is the user's OWN editable copy,
created by cloning a roadmapTemplates entry once they pick a level. This
IS the "write a custom roadmap if I don't like the AI's" feature — editing
this document directly, no separate custom-roadmap system needed.

Add POST /api/ai/roadmap/generate (admin-triggerable, or auto-generate
on-demand the first time any student picks that category if the template
doesn't exist yet — decide based on whether you want admin pre-seeding or
lazy generation; lazy is simpler and matches this app's existing "lazily
create Unsorted playlist on first use" precedent). Add
POST /api/roadmaps/adopt: { categoryId, level } → clones the template into
users/{uid}/learningRoadmaps.

firestore.rules: roadmapTemplates readable by any signed-in active user,
admin-SDK-write-only. learningRoadmaps: standard isSelf(uid) || isAdmin()
read; write allowed for isSelf(uid) too, since editing your own roadmap
(the custom-roadmap feature) is a normal user action, not an AI-only path
— validate steps' shape the way this app validates any other partial
personal-data write.
```

**Test plan:** pick a category with no existing template — confirm one
generates with 3 levels; pick the same category as a second test user —
confirm no second AI call fires (template already cached); edit your
adopted roadmap's steps directly, confirm it saves and doesn't affect the
shared template or other users' copies.

### E2 — Roadmap UI + level picker

**Prompt:**
```
Add /roadmap (or a section on /topics, per the main roadmap's existing
Topics page) showing the user's chosen interests from Phase D1. For each,
if no learningRoadmaps entry exists yet, show the three generated levels
(from roadmapTemplates) side by side for the user to pick exactly one
(update UserProfile.interests[].level on pick, matching Phase D1's schema).
Once adopted, show their personal roadmap as an editable step list (basic
inline edit — title/description per step, add/remove/reorder steps reusing
this app's existing SortableList component from src/components/dnd/).
```

### E3 — YouTube playlist suggestions per roadmap step

**Prompt:**
```
Read src/lib/video-platforms/youtubeDuration.ts (the existing YouTube Data
API v3 usage pattern — auth via YOUTUBE_API_KEY, same env var, same
quota-conscious calling style) — this app currently only looks up video
duration, not search, so this is new API surface on an existing key.

Add src/lib/video-platforms/youtubeSearch.ts: searchYouTubePlaylists(query,
maxResults) using the search.list endpoint (type=playlist), returning
title/thumbnail/channel/playlistId. Add a "Suggested playlists" section per
roadmap step (Phase E2's UI) that calls this with a query built from the
step's title + the interest's category name, showing 3-5 results with an
"Add to my Playlists" button that reuses the EXISTING YouTube playlist
import flow this app already has (check src/app/admin/playlists' or
wherever the current YouTube-playlist-import code lives) rather than
building a second importer.
```

**Test plan:** confirm suggested playlists are genuinely relevant to the
step (spot-check a few categories); confirm "Add to my Playlists" produces
a normal personal playlist indistinguishable from a manually-imported one.

### E4 — AI-suggested Goals from roadmap milestones

**Prompt:**
```
Read src/types/index.ts's Goal interface and src/app/goals/page.tsx's
existing goal-creation flow.

On the roadmap UI (Phase E2), add a "Suggest goals from this roadmap"
action: calls a small prompt (no new infra needed — reuse withAiConnection)
turning the roadmap's steps into 2-4 candidate Goal drafts (title,
suggested targetDate spaced across a reasonable timeframe, linked to any
personal playlist added via Phase E3 for that step via linkedPlaylists).
Show them as dismissible suggestion cards; "Add to my Goals" creates a
real Goal via the existing goal-creation code, editable afterward like any
other goal — never auto-added without the click.
```

---

## Group F — Pace, time-remaining, and the growth dashboard

### F1 — Finish the prerequisite from the main roadmap (Phase 5, not started)

This is `study-lamp-roadmap.md`'s own Phase 5, still unbuilt — do it here
if you haven't already, since Groups above now give it more to show.

**Prompt:**
```
Read src/lib/goalUtils.ts (calculateGoalProgress already exists;
computeDailyPace does not) and src/app/goals/page.tsx.

Add computeDailyPace(goal, videos) to goalUtils.ts returning {
videosRemaining, daysRemaining, videosPerDayNeeded, status:
"ahead"|"on-track"|"behind"|"overdue" }, with unit tests covering: no
targetDate, already overdue, completed early, exact-pace boundary. Surface
it as a small pace card on the Goals page and on the playlist detail page
for any goal linking that playlist (per the original roadmap's design).
```

### F2 — Growth dashboard tying it together

**Prompt:**
```
Read src/lib/masteryUtils.ts (Phase C3) and src/lib/goalUtils.ts's
computeDailyPace (Phase F1).

Add a "Your Progress" section to the Dashboard combining: per-interest
roadmap completion (% of learningRoadmaps steps whose linked playlist/
videos are watched), quiz mastery per category (Phase C3), and active
goals' pace status (Phase F1) — one row per interest, not a separate
dashboard page. Keep this to reading existing data (no new AI calls) —
this is pure aggregation/display.
```

---

## Suggested order

**A (all 4 sub-phases) → then pick your next highest-value group.** A
reasonable default: **A → B → D → E → C → F**, since onboarding/interests
naturally precede roadmaps, and quizzes + pace analytics are enhancements
that matter more once there's a roadmap driving what a student is
actually working toward. But every group past A stands alone — if quizzes
matter more to you right now than onboarding, do C before D. Nothing here
blocks anything else except what's explicitly noted (E needs D; F1/F2
benefit from C and E existing but F1 alone is a fine standalone session).
