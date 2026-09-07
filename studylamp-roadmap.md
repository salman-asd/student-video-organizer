# Study Lamp — Improvement Roadmap

Each phase is scoped to be doable in one AI chat session. Do them roughly in
order — later phases assume earlier ones landed. Paste the "Prompt" block
verbatim into a fresh chat with your zipped codebase attached.

## Implementation Status

Status markers reflect the current repository on 2026-09-06:

- **Complete** — the requested behavior is implemented and has focused validation.
- **Partial** — a working subset exists, but the roadmap scope or architecture is incomplete.
- **Not started** — no meaningful implementation was found.
- **Ongoing** — periodic maintenance rather than a one-time feature.

---

## Phase 0 — Two quick bug fixes

**Status: Partial.** The Unsorted playlist flow is complete. Facebook embed sizing still uses timeout-based normalization instead of the requested `ResizeObserver` approach.

### 0a. Facebook portrait video gets cropped

**Status: Partial / not complete.** `FacebookEmbed.tsx` has fallback handling and sizing cleanup, but still uses `setTimeout` normalization.

**What's happening:** `FacebookEmbed.tsx` sets `data-width="auto"` on the
`fb-video` xfbml element and then tries to fix the resulting iframe's size
after the fact with a `setTimeout`-based `normalizeEmbedSize()` function.
This is a race: Facebook's SDK sometimes re-adjusts the iframe's inline
`height`/`width` attributes *after* your normalize function already ran,
which is exactly the "fixed height crops it, but removing the fixed height
loses the frame" symptom you're seeing — the container and the iframe
disagree about who owns sizing.

**Better fix:** Stop fighting the SDK's own sizing. Use a `ResizeObserver`
on the injected iframe (not a one-shot timeout) so your container always
tracks the iframe's *actual* current size, and set `aspect-ratio` via CSS
custom property computed from the iframe's own `width`/`height` attributes
once they're known, instead of forcing `height: auto` and hoping.

**Prompt:**
```
Open src/components/video/FacebookEmbed.tsx. The current
normalizeEmbedSize() function uses a one-shot setTimeout to fix the
iframe's size after the Facebook SDK injects it, which races against the
SDK's own later size adjustments and causes portrait videos to crop.

Replace the setTimeout-based normalization with a ResizeObserver watching
the injected iframe. When the iframe's width/height attributes are first
available, compute the aspect ratio and apply it via a CSS aspect-ratio
style on the wrapping container, then let the iframe fill that container
at width:100%/height:100% instead of fighting inline styles. Keep the
existing 6-second "did it render at all" fallback-to-external-link check
as-is. Test against both a landscape Facebook video and a portrait Reel
URL and confirm neither crops nor leaves letterboxing.
```

### 0b. Add a video without a playlist first

**Status: Complete.** Unsorted playlists, standalone saves, quick-add access, and move-to-playlist behavior are implemented.

**What's happening:** Every video-creation function in
`src/lib/firestore/personalPlaylists.ts` (`addPersonalVideo`,
`addExistingVideoToPersonalPlaylist`, etc.) requires a `playlistId` — the
data model has no concept of a video that exists without one.

**Design decision:** Add a synthetic **"Unsorted"** personal playlist per
user (auto-created on first use, not shown in the playlist picker as a
normal playlist) that acts as a holding pen. This avoids inventing a whole
parallel "standalone video" collection with its own rules/queries — it
reuses everything that already works for personal playlists, and "move to
playlist" becomes the existing `movePersonalVideo`-style reassignment
instead of a new concept.

**Prompt:**
```
In src/lib/firestore/personalPlaylists.ts, add a getOrCreateUnsortedPlaylist
(ownerId) helper that finds-or-creates a personal playlist flagged
isUnsorted: true (add this field to PersonalPlaylist in src/types/index.ts).
Add addStandaloneVideo(ownerId, videoData) that resolves the Unsorted
playlist via that helper and calls the existing addPersonalVideo against it.

In the UI: add a "Save Video" quick-add entry point (reuse the existing Add
Video dialog pattern from src/app/my-playlists/[playlistId]/page.tsx) that's
reachable without first opening a playlist — put it in the sidebar or
dashboard header. On /my-playlists, the Unsorted playlist should render
first with a distinct label like "Unsorted (12)" instead of a normal
playlist card, and clicking it opens the normal playlist video list where
each row gets an "Add to Playlist" action (reuse the move logic already in
personalPlaylists.ts) that removes it from Unsorted once assigned.

Do not create the Unsorted playlist eagerly for every user — only
lazily on first standalone save, so users who never use this feature never
get an empty phantom playlist.
```

---

## Phase 1 — Data model & Firestore rules cleanup

**Status: Complete.** Expiry fields and controls, expiry-aware access checks, note/summary size limits, and write-shape validation are implemented.

Your rules file is already solid (private-by-path personal playlists,
public-by-snapshot shares). Two real gaps:

1. **No rate/size limiting on writes** — a compromised or buggy client
   could write unbounded data (e.g. a broken loop calling `saveProgress`).
   Firestore rules can't rate-limit, but they *can* cap document size and
   reject obviously-malformed writes.
2. **`shares/{shareToken}` has no expiry concept** — `revokedAt` exists but
   nothing ever *sets* an automatic expiry; a share link works forever
   until manually revoked.

**Prompt:**
```
Review firestore.rules and src/types/index.ts's ShareRecord interface.

1. Add an optional `expiresAt: Timestamp | null` field to ShareRecord and
   PlaylistShare. Update the /shares/{shareToken} read rule so
   isShareActive() also checks `(data.expiresAt == null || data.expiresAt >
   request.time)`. Add an "Expires" option (never / 7 days / 30 days) to
   ShareDialog.tsx that sets this on create.

2. Add basic size guards to the notes/{videoId} and summaries/{videoId}
   rules (reject writes where request.resource.data.content.size() >
   20000) so a runaway autosave loop or pasted content can't create
   multi-megabyte documents that blow through the free-tier storage quota.

3. Audit every `allow write` in firestore.rules for missing
   request.resource.data type/shape validation (e.g. confirm
   watchedPercentage is a number between 0-100, priority is one of
   high/medium/low/null) and add validation functions where missing. List
   every field you added validation for and why.
```

---

## Phase 2 — Library: a unified, read-only discovery feed (re-added)

**Status: Complete.** `/library` is now a read-only discovery feed combining personal Playlists, Suggested content, and accepted directed Shared content. It includes source labels, source toggles, search, sorting, platform/category/tag filters, URL query prefiltering, and duplicate-source tie-breaking. Management actions remain on the source pages. Public-link receipt discovery remains part of the partial Phase 4c work.

**Reversing the earlier removal, on purpose.** The first version of Library
was cut because nobody could explain why it existed next to two other
pages. That reasoning doesn't hold anymore: now that Playlists (personal),
Suggested (admin, hidden from nav), and Shared (cross-user) each have one
clear job, there's a real gap — no single place to search or filter across
*everything a student has access to* without checking three pages
separately. Library comes back with a narrower, defensible scope than
before:

**Library is read-only.** You can search, filter, and open things from
here — you cannot create, edit, delete, reorder, or manage anything on this
page. Every management action still happens on its home page (Playlists,
Shared, or admin's Suggested/admin tools). This constraint is what keeps
Library from sliding back into "an ambiguous fourth page" — its one job is
discovery, nothing else.

**Sources merged into one feed, each visibly labeled:**
- Your own Playlists (personal)
- Suggested (admin's shared library — still real content, worth surfacing
  here even though it has no nav link of its own)
- Shared To Me (accepted shares only — pending/rejected don't belong in a
  "things I can watch" feed)

**Prompt:**
```
Read src/app/playlists/page.tsx, src/app/suggested/page.tsx (from Phase
2c), and src/lib/firestore/shares.ts's getReceiptsByStatus (from Phase 4;
do Phase 4/4b before this if you want Shared content included from day
one — otherwise ship Library with just Playlists + Suggested first and
add the Shared source in a follow-up pass once 4b exists).

Add src/app/library/page.tsx: fetch all three sources for the current
user, merge into one list, and tag each item with its source ("personal" |
"suggested" | "shared"). Reuse VideoCard/playlist-card components, adding
a small source badge per card. Support: text search (title), category
filter, tag filter, source filter (checkboxes: show/hide each of the three
sources), and the existing sort options. No bulk actions, no create
button, no edit/delete affordances anywhere on this page — clicking a card
navigates to that item's real home page (Playlists/Suggested/Shared) to
manage it, Library itself stays pure read-only.

Add "Library" to the sidebar nav.
```

**Test plan:**
1. Confirm a video that exists in more than one source (e.g. a Suggested
   video the student also happens to have accepted via Shared) doesn't
   duplicate confusingly — decide and implement a clear tie-break (show
   once, prefer the "personal"/"shared" badge over "suggested" if it's
   reachable multiple ways) rather than leaving it ambiguous.
2. Confirm every card's badge matches its actual source correctly — this
   is the one detail that, if wrong, undermines the entire point of the
   page.
3. Confirm there is no way to trigger a create/edit/delete/reorder action
   from this page — if you find one, it's a scope leak, remove it.

---

## Phase 2b — Optional tagging with inline "create new," for playlists, videos, and accepted shares

**Status: Partial.** Optional categories/tags are implemented for personal playlists and videos, including the reusable picker, normalized user-created tags, admin-only category selection, Topics, and Library filtering. Tagging during Shared approval and the broader privacy-scoped Topics/dashboard enhancements remain.

**Decision on categories vs. tags — they get different rules, deliberately.**
If both are freely creatable by any student, you get "C#" / "CSharp" /
"C-Sharp" as separate categories within weeks, and Topics/Library filtering
stops meaning anything because content fragments across near-duplicates
nobody can reconcile. So:

- **Categories stay admin-curated, closed list** — a small, structural set
  of top-level subjects. No inline-create here; if the right one doesn't
  exist, the picker allows leaving it blank (it's optional) rather than
  inventing a new category on the spot.
- **Tags become open and crowd-sourced** — any active user can create a
  new tag inline if the dropdown doesn't have what they need. New tags are
  normalized (trimmed, compared case-insensitively) before creating, so
  typing "react" when "React" already exists reuses it instead of forking
  it. Tags stay editable/deletable by admins only, so one student can't
  rename or remove a tag others depend on.

**One shared component, not three separate implementations.** Build
`TagCategoryPicker` once — a combobox that (a) is entirely optional/
skippable, (b) searches existing tags as you type, (c) shows a "Create
'{query}' as a new tag" row when nothing matches, (d) is category
single-select / tags multi-select. Reuse it in all three places you asked
about: Create/Edit Playlist, Add/Edit Video, and the Accept-share action.

**Extending tagging down to the video level too** (you're right that this
was missing) — add `categoryId`/`tagIds` to `PersonalVideo` as well as
`PersonalPlaylist`, mirroring how the admin shared `Video` type already
supports per-video tags independent of its playlist's category. A playlist
carries a default topic; individual videos inside it can carry their own
finer-grained tags on top.

**On "tag when accepting a shared item":** don't force a blocking step —
add the same optional `TagCategoryPicker` as a collapsed/inline section on
the Accept action in the Shared → Approval tab, defaulting to skipped if
the student just clicks Accept without touching it. The same picker also
stays available afterward from the item's card in Shared To Me / Library,
so tagging is never a one-time-only opportunity.

**Topics page, updated for Library's return:** `/topics` is a grid of
pre-filters — clicking a category card now lands on `/library?category=<id>`
(not `/playlists?category=`, since Library is the actual unified filtering
surface now) with that filter pre-applied.

**Prompt:**
```
Read src/types/index.ts's PersonalPlaylist and PersonalVideo interfaces,
src/lib/firestore/personalPlaylists.ts, src/lib/firestore/categoriesTags.ts,
src/components/share/ShareDialog.tsx (or the Approval tab from Phase 4b),
and the Create/Edit Playlist + Add/Edit Video dialogs on the renamed
src/app/playlists/page.tsx (do Phase 2c before this one).

1. Add categoryId?: string | null and tagIds?: string[] to BOTH
   PersonalPlaylist and PersonalVideo in src/types/index.ts. Add
   updatePersonalPlaylistTags and updatePersonalVideoTags to
   personalPlaylists.ts.

2. In categoriesTags.ts, add createTagIfMissing(name): normalizes the
   input (trim, lowercase for comparison against existing tags' stored
   lowercase-normalized field — add a `nameLower` field to Tag if it
   doesn't already have one for this comparison), returns the existing
   tag's id if a case-insensitive match exists, otherwise creates a new
   one and returns its id. Do NOT add an equivalent for categories — that
   stays admin-only via the existing admin/categories page, unchanged.

3. Update firestore.rules: /tags/{tagId} gets
   `allow create: if isSignedIn() && isActive();` in addition to the
   existing admin write rule, but update/delete stay admin-only (split
   the current single `allow write: if isAdmin()` into separate
   create/update/delete rules to express this). /categories/{categoryId}
   is unchanged (admin-only for all writes).

4. Build src/components/shared/TagCategoryPicker.tsx: a category
   single-select (existing categories only, plus a "None" option) and a
   tags multi-select combobox (search-as-you-type, shows existing matches,
   shows a "Create '{query}'" row calling createTagIfMissing when no exact
   match exists). Entirely optional — every consuming form must work fine
   with both fields left empty.

5. Wire TagCategoryPicker into: the Create/Edit Playlist dialog, the
   Add/Edit Video dialog (personal playlists), and the Accept action in
   the Shared → Approval tab (as a collapsed "Add to a topic (optional)"
   section that doesn't block a plain one-click Accept).

6. Add src/app/topics/page.tsx per the earlier design (category cards with
   live counts, privacy-scoped to the current user's own content + admin
   Suggested content), each card linking to /library?category=<id>.
   Library (Phase 2) reads that query param on mount and pre-filters.

7. Add "Browse by Topic" to the sidebar nav and a "Browse by Topic"
   section on the Dashboard showing the top 6 categories by count with a
   "See all" link to /topics.
```

**Test plan:**
1. Create a playlist with no category and no tags — confirm it saves fine
   and never blocks on either field.
2. Type a brand-new tag name into the picker, confirm it appears
   immediately as selected and is now available in the dropdown for other
   playlists/videos without a page refresh.
3. Type a tag name that differs only in case from an existing tag —
   confirm it reuses the existing tag (check Firestore directly: no
   duplicate document was created).
4. Confirm a student CANNOT create a new category from anywhere in the
   student-facing UI — the picker should only ever let them choose from
   the existing admin-curated list or leave it blank.
5. Confirm a student cannot update or delete an existing tag (try it via
   the browser console against the live Firestore SDK, not just via UI,
   since the real protection is the security rule, not the button being
   hidden).
6. On the Approval tab, click Accept without touching the tag section —
   confirm the item still gets accepted successfully with no
   category/tags set.
7. As Student A, tag a personal playlist "C#". As Student B, visit
   `/topics` → "C#" → confirm Student A's playlist does **not** appear
   anywhere in Student B's Library view (the one privacy check most worth
   double-checking here).

---

## Phase 2c — Rename & hide: "Playlists" → "Suggested" (hidden from nav), "My Playlists" → "Playlists"

**Status: Complete.** Personal playlists now use `/playlists`, curated curriculum uses `/suggested`, Suggested is hidden from the student sidebar, links/tests were updated, and Firestore/admin paths were preserved. Existing `/my-playlists` bookmarks are not compatibility redirects.

**Decision (confirming your latest instruction, which supersedes both the
earlier "Course Library" and "Suggested By Admin" naming):** Keep all the
admin-curriculum code and Firestore data intact — do **not** delete the
`playlists/{id}` collection, admin's playlist editor, or the JSON/YouTube
import tools, since admin still needs those to manage the underlying
content. What changes is the student-facing **label, route, and nav
visibility**:

- Old admin-curated `/playlists` page → renamed **"Suggested"**, route
  becomes `/suggested`. **Removed from the sidebar entirely** — no nav
  link for students. The page/route itself keeps working if visited
  directly (e.g. an admin sends someone a direct link), it's just not
  discoverable through navigation anymore, since you said this business
  logic isn't needed right now.
- Old `/my-playlists` (personal playlists) → promoted to the primary
  **"Playlists"** label, route becomes `/playlists`, features unchanged.
  This is now the *only* playlists-related nav item.
- A **"Shared"** nav item is coming too, but it's added in Phase 4b when
  that page actually exists — not here, so this phase never ships a nav
  link that points at nothing.

**On "rename rules everything regarding to this":** to be precise about
what actually needs to change — the Firestore **security rules don't need
new permission logic**, since they're keyed to collection paths
(`playlists/{id}` vs `users/{uid}/personalPlaylists/{id}`), not to route
names, UI labels, or nav visibility. Hiding a nav link never touches
who-can-read-what — the underlying `playlists/{id}` collection is still
exactly as readable as before to any signed-in active student who has the
direct URL. What *does* need updating: the explanatory comments inside
`firestore.rules` that reference the old names, so they don't confuse
future-you.

**File list, confirmed via grep against your actual code:**
- References to `/my-playlists`: `Sidebar.tsx`, `PlaylistSidebar.tsx`,
  `admin/users/[userId]/page.tsx`, `goals/page.tsx`, `dashboard/page.tsx`,
  `videoRoutes.ts`, `watchPage.ts` (+ its test), and the four pages inside
  `src/app/my-playlists/` itself.
- References to `/playlists`: `Sidebar.tsx`, `PlaylistSidebar.tsx`,
  `src/app/playlists/page.tsx`, `watchPage.ts` (+ its test).
  (`src/app/admin/playlists/*` is the separate admin-management route and
  is unaffected by this rename — it stays as-is.)

**Prompt:**
```
Rename the student-facing routes: src/app/my-playlists/** becomes
src/app/playlists/** (the folder move — old /playlists/[playlistId] and
/playlists/[playlistId]/[videoId] become the new personal-playlist pages),
and the OLD src/app/playlists/page.tsx (admin-curriculum browse page)
moves to src/app/suggested/page.tsx.

Update every reference found in: Sidebar.tsx (the "Playlists" nav item's
label AND href now point to the new /playlists route and list the
student's own personal playlists — do NOT add any nav item for
/suggested; remove any existing nav entry that pointed at the old
/playlists route instead of relabeling it), PlaylistSidebar.tsx,
admin/users/[userId]/page.tsx (the "Personal Playlists" tab's links),
goals/page.tsx, dashboard/page.tsx, videoRoutes.ts's getVideoWatchHref
(swap the hardcoded "/my-playlists" string), and watchPage.ts +
watchPage.test.ts.

In firestore.rules, update only the explanatory comments above the
`match /playlists/{playlistId}` block and the
`match /personalPlaylists/{playlistId}` block so they reference the new
student-facing names ("Suggested" / "Playlists") alongside the existing
technical description — do NOT change any allow/read/write condition,
since permissions are keyed to collection paths, not labels or nav
visibility.

Do NOT touch: the underlying Firestore collection names/paths (playlists/
{id} and personalPlaylists/{id} stay exactly as they are — this is a
route/label/nav-visibility change only, not a data migration or a
permissions change), the admin management routes under
src/app/admin/playlists/**, or any of the import/JSON/YouTube-import admin
tooling.

After the rename, grep the whole src/ tree one more time for any leftover
literal "/my-playlists" or hardcoded old "/playlists" strings this list
missed (e.g. inside a toast message or test fixture) before considering
this phase done — a rename phase's biggest risk is exactly the reference
nobody thought to grep for.
```

**Test plan:**
1. `npm run build` — TypeScript will catch any import path that still
   points at the deleted `src/app/my-playlists` or old `src/app/playlists`
   folder location.
2. Manual: log in as a student, confirm the sidebar shows exactly one
   playlists-related item, labeled "Playlists," pointing at your personal
   playlists — and confirm there is **no** visible link to "Suggested"
   anywhere in student nav.
3. Manual: manually type `/suggested` into the address bar while logged in
   as a student — confirm the page still loads and shows the old admin
   content (hidden ≠ deleted; this is intentional, not a bug).
4. Manual: as admin, confirm `/admin/playlists` (the management UI) still
   works unchanged — this rename should not have touched it at all.
5. `grep -rn "/my-playlists" src/` and `grep -rn '"/playlists"' src/` —
   both should return zero unexpected hits (only the new route's own
   internal references, if any).

---

## Phase 3 — Group Watch Later / Priority / Continue Learning by playlist

**Status: Complete.** Watch Later and Priority use independent per-playlist sortable groups; Continue Learning is grouped by playlist with its existing recency ordering.

**Prompt:**
```
Read src/app/watch-later/page.tsx, src/app/priority/page.tsx, and
src/app/continue-learning/page.tsx, plus src/hooks/useAllVideos.ts.

Change all three from a flat video list to grouped sections: group by
playlistId (playlistTitle as the section header), each group internally
sorted/reorderable the same way the flat list is today (reuse
SortableList.tsx per-group, not globally — check src/components/dnd/
SortableList.tsx supports independent instances). Videos with no
playlistId (once Phase 0b lands, this shouldn't happen, but handle it
defensively) go in a final "Other" section shown without a header if
empty. Preserve existing drag-and-drop reorder persistence — check
reorderPersonalVideoList in personalPlaylists.ts and the equivalent for
shared-video state in userVideoState.ts for how order is currently saved,
and keep writes scoped to reordering *within* a group only (don't let a
drag move a video's cross-group playlist membership).
```

---

## Phase 4 — Sharing system overhaul: data model + rules

**Status: Partial.** Direct email sharing, recipient UID lookup, approval status, expiry, and private/unlisted/public access are implemented. The roadmap's `specific` visibility and per-user `shareReceipts` collection are not implemented.

This replaces the earlier "add a `specific` visibility" idea with the
fuller system you described: share to a specific email (system user or
not), share to anyone, an expiry deadline, and an accept/reject step for
anyone with an account. This phase is data-model-only — no new pages yet
(that's 4b and 4c) — because getting the model right first means the UI
phases don't have to guess at document shapes.

**Design — one extra collection, not a notifications system.** Rather than
building a separate `notifications` collection (more reads, more to keep
in sync), a per-recipient **"receipt"** doc under
`users/{uid}/shareReceipts/{shareToken}` does double duty as both the
notification *and* the accept/reject state:

- Created **immediately, at share-creation time**, if you shared to a
  specific email that matches an existing account — this is what makes it
  a real notification instead of "here's a link, hope you remember it."
- Created **lazily, the first time** a logged-in user opens a `public` or
  `unlisted` link that wasn't specifically addressed to them — this is
  what powers "anyone who follows the link and happens to be logged in
  gets asked to approve it into their library," which is what you
  described for the "anyone" case.
- Never created for anonymous (logged-out) visitors — they have no
  account to file a receipt under, so they just get the bare viewer
  (Phase 4d handles that).

```
shares/{shareToken}                        (existing collection, extended)
  ownerUid, entityType, entityId, title, videos[], thumbnailUrl, ...
  visibility: "private" | "unlisted" | "public" | "specific"
  recipientEmail: string | null            (only set when visibility="specific")
  recipientUid: string | null              (resolved at creation time if the
                                             email matched an existing account;
                                             null if it didn't — see note below)
  expiresAt: Timestamp | null              (deadline you set: "in 24 hours",
                                             "in 7 days", or never)
  revokedAt: Timestamp | null              (existing field, unchanged)

users/{uid}/shareReceipts/{shareToken}      (NEW — one per user, per share
                                             they've been offered)
  shareToken, sharedByUid, sharedByName, title, thumbnailUrl
  status: "pending" | "accepted" | "rejected"
  createdAt, respondedAt
```

**On "email not found in the system" (a deliberate privacy choice):** the
share always shows the same "Shared! ✅" success message whether or not the
email matches an account — never reveal to the sharer whether an email is
registered (that's an email-enumeration privacy leak). If it doesn't
match, `recipientUid` stays null; nobody gets a receipt, and the share
behaves like an `unlisted` link that only reaches whoever the sharer
personally forwards it to. **Known limitation, worth stating up front:**
if that email signs up later, it does *not* retroactively get matched —
that's a reasonable v2 idea (a scheduled/on-signup check against
`recipientEmail` fields), not a v1 requirement.

**Prompt:**
```
Read src/lib/firestore/shares.ts, src/types/index.ts's ShareRecord, and
src/components/share/ShareDialog.tsx.

1. Add to ShareRecord: recipientEmail: string | null, recipientUid: string
   | null, expiresAt: Timestamp | null. Add "specific" as a fourth
   visibility value alongside private/unlisted/public (update
   SHARE_VISIBILITIES in src/types/index.ts).

2. Add a ShareReceipt type and users/{uid}/shareReceipts/{shareToken}
   collection per the shape above.

3. In shares.ts, add:
   - findUserByEmail(email): looks up a user by email — only admins can
     currently list all users, so add a narrow Firestore query (indexed on
     email) or a small API route restricted to authenticated callers that
     returns ONLY {uid, displayName} for an exact match, never a list.
   - createShare(...) — extend the existing create function to accept
     recipientEmail and expiresAt. If recipientEmail is provided, call
     findUserByEmail; if it resolves, set recipientUid AND immediately
     create that user's shareReceipts/{shareToken} doc with status:
     "pending". If it doesn't resolve, still succeed (see privacy note
     above) — no receipt is created.
   - createReceiptIfMissing(shareToken, uid): called when a logged-in user
     opens a public/unlisted share that isn't already accepted/rejected by
     them — creates a "pending" receipt lazily. Idempotent (check-then-set,
     or a transaction) so re-opening the link twice doesn't duplicate it.
   - respondToShare(uid, shareToken, "accepted" | "rejected"): updates the
     receipt's status and respondedAt.
   - getReceiptsByStatus(uid, status): powers the Shared hub tabs in
     Phase 4c.
   - getSharesByOwner(ownerUid): all shares this user created (any
     visibility), for the "Shared By Me" tab.

4. Update firestore.rules:
   - /shares/{shareToken}: read rule gains
     `|| request.auth.uid == resource.data.recipientUid`. Add a size/shape
     validation function requiring visibility in the four allowed values,
     expiresAt is a timestamp or null, and if visibility == "specific"
     then recipientEmail must be a non-empty string.
   - /users/{uid}/shareReceipts/{shareToken}: allow read, update (status/
     respondedAt only) if isSelf(uid); allow create if isSelf(uid) OR if
     the request is creating a receipt on behalf of a recipientUid that
     matches a share the caller owns (the "immediate receipt on specific
     share" case — model this as: the receipt create is allowed if
     isSelf(uid) [covers the lazy self-service case] OR
     get(/databases/$(database)/documents/shares/$(shareToken)).data.ownerUid
     == request.auth.uid [covers the owner creating a receipt for someone
     they just shared with]). Never allow anyone to set status directly to
     "accepted" on someone else's behalf.
   - Add a `isShareExpired(data)` helper: `data.expiresAt != null &&
     data.expiresAt < request.time`, and fold it into the existing
     isShareActive() check so an expired share reads exactly like a
     revoked one.

5. Add a composite index in firestore.indexes.json for shareReceipts on
   (status, createdAt) if the Phase 4c queries need it — check the actual
   error Firestore throws when you run the query locally rather than
   guessing; it tells you the exact index to add.

Keep the existing private/unlisted/public link-based flow's *behavior*
unchanged for anyone who doesn't use the new "specific" option or set an
expiry — this is additive.
```

**Test plan:**
1. Unit test (no Firebase needed): write `.test.ts` cases for any pure
   date-math you add (e.g. "expires in 24 hours" → correct Timestamp).
2. Firebase emulator (or two throwaway accounts): create a "specific"
   share to an email that IS a registered student — confirm their
   `shareReceipts/{token}` doc appears immediately, status "pending",
   without them ever clicking the link.
3. Same, but to an email that is NOT registered — confirm the sharer still
   sees a success message, and confirm directly in Firestore that no
   receipt document was created anywhere.
4. Confirm an expired share (`expiresAt` in the past) is unreadable even
   by someone who has the exact link and was previously able to view it.
5. Confirm a student cannot write `status: "accepted"` into *another*
   student's `shareReceipts` doc (security rules should reject it) — this
   is the one most worth testing in the emulator specifically, since it's
   the rule most likely to have a subtle hole.

---

## Phase 4a — Quick fix: let a user cancel/revoke a share right now

**Status: Complete.** Revoke is available from the share dialog and Shared management UI, including revoke-all for grouped shares.

**Checked directly against your code:** no, currently a user **cannot**
cancel a share once created — confirmed by grepping `ShareDialog.tsx` for
any revoke/cancel/unshare button: there isn't one, even though the backend
function (`revokeShare` in `shares.ts`) already exists and works. It's
just never called from any UI. Small enough to fix immediately, independent
of Phase 4/4b/4c — do this one first, today, before the bigger sharing
rebuild.

**Prompt:**
```
Open src/components/share/ShareDialog.tsx. When a share already exists for
this video/playlist (visibility is not "private", or a shareToken exists),
add a "Stop Sharing" button that calls the existing revokeShare(token)
function from shares.ts, then resets the dialog's visibility state back to
"private" and shows a confirmation toast ("Link disabled — no one can view
this anymore"). Add a brief confirm step (native confirm() or a small
inline "Are you sure?" — match whatever confirmation pattern this codebase
already uses elsewhere, check admin/playlists/page.tsx's delete-playlist
flow for the existing convention) since this immediately breaks the link
for anyone currently holding it.
```

**Test plan:** revoke a share, then in a second (incognito) browser
confirm the previously-working link now shows "This content is no longer
available" instead of the video/playlist.

---

## Phase 4b — The "Shared" page: four tabs

**Status: Partial.** The four-tab Shared page exists with grouped duplicate shares, approval actions, manage shares, individual revoke, and revoke-all. It uses direct share queries and `approvalStatus` on share documents instead of the roadmap's receipt APIs and sidebar pending badge.

**Naming check against your spec:** you asked for All / Shared By Me /
Shared To Me / Approval. I'd keep all four exactly as you named them —
they map cleanly onto the data model from Phase 4:

| Tab | Query |
|---|---|
| **Shared By Me** | `getSharesByOwner(myUid)` — every share I've created, any visibility |
| **Approval** | `getReceiptsByStatus(myUid, "pending")` |
| **Shared To Me** | `getReceiptsByStatus(myUid, "accepted")` |
| **All** | union of "Shared By Me" + "Shared To Me" (NOT pending — pending is unresolved, it stays exclusive to Approval so it can't be missed) |

**On "should look like the Playlists page, but with who-shared-it info":**
agreed — reuse the same card grid component from the new `/playlists`
page (Phase 2c), extended with a small attribution line per card ("Shared
by Rahim · 2 days ago" or "You shared this · expires in 5 days").

**Prompt:**
```
Read src/app/playlists/page.tsx (the renamed personal-playlists page from
Phase 2c) for the card grid pattern to reuse, and src/lib/firestore/
shares.ts for the query functions added in Phase 4.

Add src/app/shared/page.tsx with four tabs (All / Shared By Me / Shared To
Me / Approval) per the table above. Reuse the existing playlist/video card
component, adding an optional `attribution` prop that renders a small line
under the title: "Shared by {name} · {relative time}" for items shared to
you, or "You shared this · expires {relative time}" / "You shared this ·
no expiry" for items you shared. On the Approval tab, each card gets
Accept and Reject buttons calling respondToShare(uid, token, ...) instead
of the normal card click-through; accepting immediately moves it to
"Shared To Me" without a page reload (optimistic update, then refetch).

Add "Shared" to Sidebar.tsx. If there are any pending Approval items, show
a small badge with the count next to "Shared" in the sidebar (one extra
lightweight query on app-shell mount — getReceiptsByStatus(myUid,
"pending"), NOT a live onSnapshot listener, to stay within free-tier
budget; refresh it on navigation to the Shared page, not continuously).
```

**Test plan:**
1. Manual: Student A shares a personal playlist to Student B's email.
   Confirm B sees a badge count on "Shared" in their sidebar without doing
   anything else.
2. B opens Shared → Approval, sees the card with Accept/Reject. Reject it
   → confirm it disappears from Approval and never appears in "Shared To
   Me". Repeat and Accept instead → confirm it now shows in both "Shared
   To Me" and "All", and the badge count drops.
3. As Student A, open "Shared By Me" → confirm the same item shows there
   regardless of B's accept/reject choice (owner should always see what
   they shared, independent of recipient response).
4. Confirm a `public`/`unlisted` share you personally created does NOT
   generate a receipt/notification for yourself (only for other users who
   open it while logged in — see Phase 4c).

---

## Phase 4c — Public link behavior: anonymous viewer vs. logged-in approval

**Status: Partial.** Anonymous links use a chrome-less player-first page and pending direct recipients are redirected to Approval. Lazy receipts for public/unlisted visitors and the full accepted-receipt flow are not implemented.

This is the piece that makes "anyone" sharing and "specific person"
sharing feel like one consistent system instead of two different features
glued together.

**Rule, exactly as you described it:**
- **Not logged in** → bare, chrome-less page: no sidebar, no header, video
  player on top, the rest of the playlist's items listed below it. No
  login wall for `public` shares; `unlisted` behaves the same (the
  "unlisted-ness" is about discoverability, not about requiring login).
  `specific` and `private` shares still require login, since accepting a
  share is inherently an account-bound action.
- **Logged in, share isn't addressed to me and I haven't responded yet**
  (a `public`/`unlisted` link I just happened to click, or a `specific`
  share where I'm the match) → redirect to `/shared?tab=approval`, with
  that item focused/highlighted, instead of showing the content inline.
  This is what turns "someone sent me a random link" into "it's sitting
  in my organized Shared tab" instead of a stray browser tab.
- **Logged in and I already accepted this exact share** → just show it
  normally (send me to the actual playlist/video view, not back through
  approval again — approving twice would be a bad loop).

**Prompt:**
```
Read src/app/share/[type]/[token]/page.tsx and the receipt functions added
in Phase 4/4b.

Restructure this page's logic:
1. On load, fetch the share by token. If revoked/expired, show the
   existing "no longer available" state (unchanged).
2. If there is no logged-in user: render a NEW minimal layout for this
   route only (do not wrap in AppShell — no sidebar, no header). Video
   player fills the top of the viewport; below it, a simple vertical list
   of the playlist's other videos (title + thumbnail, clicking one swaps
   the player, no navigation away from this page). This is the only
   place in the app that intentionally skips AppShell.
3. If there IS a logged-in user:
   a. Call createReceiptIfMissing(shareToken, uid) (from Phase 4) unless a
      receipt already exists for this user+token.
   b. If their receipt (existing or just-created) has status "pending",
      redirect to /shared?tab=approval&focus={shareToken} instead of
      rendering the share content here.
   c. If their receipt status is "accepted" (or they're the share's
      owner, or they're an admin), render the normal in-app playlist/video
      view (reuse the existing shared-library video page, not the bare
      layout from step 2 — a logged-in user should always get the full
      app chrome).
   d. If their receipt status is "rejected", show a small "You declined
      this share" message with a link back to /shared, not the content.
```

**Test plan:**
1. Log out completely, open a `public` share link → confirm no sidebar/
   header render at all, video plays, other items listed below and
   clickable, and confirm the browser's back button / a manual URL edit
   can't reach any other app page from here (this page should feel
   self-contained).
2. Log in as a student who has never seen this link, open it → confirm
   immediate redirect to Shared → Approval with the item focused, NOT the
   video itself.
3. Accept it, then re-open the exact same share link → confirm it now
   goes straight to the normal in-app video view, no approval detour.
4. As the share's owner, open your own share link while logged in →
   confirm you see the content directly (owners shouldn't have to approve
   their own share).
5. As an admin who is neither the owner nor the recipient, open a
   `private` share link → confirm normal admin-override access still
   works (this touches the same read rule as before, just confirm nothing
   in Phase 4/4b regressed it).

---

## Phase 5 — Goal pacing guidance + progress graph

**Status: Not started.** Goals and progress tracking exist, but daily pace computation, pace guidance, burndown chart, and related tests are not present.

**Design:** For a goal linked to one or more playlists with a `targetDate`,
compute: videos remaining ÷ days remaining = videos/day needed to stay on
pace. Surface this as a small daily nudge and a burndown-style chart on the
playlist detail page (not a new page — attach to existing playlist view).

**Prompt:**
```
Read src/lib/goalUtils.ts and src/app/goals/page.tsx to understand the
current Goal/linkedPlaylists model, and src/app/playlists/[playlistId]/
page.tsx for the playlist detail page.

1. Add a computeDailyPace(goal, videos) function to goalUtils.ts returning
   { videosRemaining, daysRemaining, videosPerDayNeeded, onTrack: boolean,
   status: "ahead"|"on-track"|"behind"|"overdue" } — "on track" means the
   student's actual completion rate over the last 7 days meets or exceeds
   videosPerDayNeeded.
2. On the playlist detail page, if a goal links to this playlist, show a
   small card: "Watch 2 more videos today to stay on pace" (or "You're
   ahead — nice work" / "Behind pace by N videos") using that function.
3. Add a burndown chart (use the chart_display_v0 tool if working in
   Claude, otherwise Recharts) on the same page: x-axis = days from goal
   creation to target date, two lines — "ideal pace" (straight line from
   total videos to 0) and "actual remaining" (computed from each video's
   completedAt). Keep this to a single chart, no new page.
4. Write unit tests for computeDailyPace covering: no target date, goal
   already overdue, goal completed early, and the exact-pace boundary case.
```

---

## Phase 6 — Branded password reset + in-header "Change Password"

**Status: Partial.** The existing login reset-email flow works, but the custom action handler, settings page, reauthentication flow, and Header Change Password item are not implemented.

**Confirming the gap you spotted:** you're right — checked `Header.tsx`'s
user dropdown, it only has "My Dashboard" and "Log out". There's no
logged-in "change my password" option anywhere, only the logged-out
"Forgot password?" flow on the login page. Those are genuinely two
different features (forgot = you don't know your current password, reset
via email; change = you do know it, just want a new one) and this app is
currently missing the second one entirely, not just failing to surface it.

**Prompt:**
```
The reset-password flow already works via Firebase's default email +
action handler (see AuthProvider.tsx's resetPassword function and
firebase's default UI at the auth domain). This phase only improves it,
it doesn't build it from scratch:

1. In Firebase Console > Authentication > Templates, customize the
   "Password reset" email template (sender name, subject, and add the
   app's name/logo reference) — tell me you did this, no code change
   needed for this part, it's console-only.
2. Build a custom action-handler page at /auth/action (Firebase lets you
   redirect its email links to your own domain via the "Action URL"
   setting in the same Templates section) that reads the oobCode query
   param and calls confirmPasswordReset from firebase/auth directly,
   styled to match the rest of the app instead of Google's generic page.
3. Add an in-app "Change Password" option (for a logged-in user who knows
   their current password) under a new /settings page — this is a
   different flow from the forgot-password one: use
   reauthenticateWithCredential + updatePassword from firebase/auth,
   requiring the current password first. Add "Change Password" as a third
   item in Header.tsx's user dropdown (alongside the existing "My
   Dashboard" and "Log out"), linking to /settings.
```

---

## Phase 7 — Where AI actually helps here (and where it doesn't)

**Status: Not started.** No Claude-backed summary, semantic search, or admin tag-suggestion feature is implemented.

Concrete, scoped ideas — not "add AI" everywhere:

1. **Personal video summaries** — students already write their own
   `summaries/{videoId}`. Add an optional "Generate a starter summary"
   button that calls the Claude API server-side (Next.js API route, key
   never exposed to client) with the video's title + any available
   transcript/description, inserting a draft the student then edits. This
   keeps the "student's own words" principle from your original spec
   intact — AI drafts, human owns the final text.
2. **Smart search on the Playlists / Suggested / Topics pages** — instead
   of literal substring match (`filterSort.ts`'s current query matching),
   embed video titles/tags once at admin-import time and do semantic
   search. Given your free-tier constraint, skip a vector DB — Firestore
   can hold a precomputed embedding array per video and you do cosine
   similarity client-side for a library this size (hundreds, not tens of
   thousands, of videos).
3. **Auto-tagging on admin import** — when an admin bulk-imports via JSON
   or YouTube playlist, offer an optional "Suggest tags" pass using titles
   only, admin approves before saving (never auto-applied silently).
4. **Where NOT to use AI**: goal pacing (Phase 5) is pure arithmetic, don't
   make it an LLM call. Progress tracking, watch state, and priority should
   stay deterministic — AI in a learning app should assist content
   creation/discovery, not decide the student's own data for them.

**Prompt (pick one sub-feature at a time, don't do all four in one session):**
```
Implement [Phase 7, item N] from the roadmap. Add a new Next.js API route
under src/app/api/ that calls the Claude API server-side (see the
anthropic_api_in_artifacts pattern: no API key on the client). Keep the
existing manual-entry path fully functional — this is additive only.
```

---

## Phase 8 — Staying on Firebase Spark + Vercel free tier as this grows

**Status: Ongoing.** This remains a periodic capacity and listener audit, not a completed feature.

Not a code change — a periodic check-in. Re-run this prompt monthly once
you have real users:

**Prompt:**
```
Given the current data model in src/types/index.ts and firestore.rules,
estimate rough Firestore read/write volume for [N] active students each
watching [M] videos/week, factoring in: the 20-second progress-save
interval in VideoPlayer.tsx, the debounced note/summary autosave, and any
onSnapshot listeners currently in use (grep for onSnapshot across src/ and
list every live listener — each one holds a persistent connection, which
matters for Spark plan concurrent-connection limits, not just read count).
Flag anything likely to exceed Spark's free daily quota (50K reads/20K
writes/20K deletes per day) and suggest the smallest change to fix it —
prefer raising a debounce/interval over removing a feature.
```

---

## How To Continue With Copilot

Work on one focused step per conversation. Start each step with the current repository and the relevant roadmap section; do not paste the entire roadmap unless needed.

1. Finish Phase 0a: replace Facebook timeout sizing with `ResizeObserver`, then test a landscape video and portrait Reel.
2. Complete Phase 2c: move personal playlist routes to `/playlists`, move curriculum browsing to `/suggested`, update links/tests, and hide Suggested from the sidebar.
3. Finish Phase 2: turn Library into the read-only unified feed, adding Suggested and accepted Shared sources without management actions.
4. Implement Phase 2b: add tags and Topics after the final routes are stable.
5. Choose the sharing architecture: keep the current direct-share model as v1, or migrate to `shareReceipts` before adding more approval behavior. Do not build both models in parallel.
6. Finish Phase 4b/4c based on that choice: pending badges, receipt-based approval, focused approval links, and accepted-share navigation if receipts are chosen.
7. Implement Phase 6: custom password action handler and Change Password settings flow.
8. Implement Phase 5: goal pace arithmetic and one playlist burndown chart, with unit tests first.
9. Pick one Phase 7 feature: summaries, semantic search, or admin tag suggestions. Keep it additive and server-side.
10. Run Phase 8 monthly: review reads, writes, deletes, listeners, and deployment costs as usage grows.

For each step, ask Copilot to inspect the current files first, state one local hypothesis, make the smallest focused edit, run the narrow tests/typecheck, and report remaining gaps. This prevents older prompts from rebuilding features that already exist under a different implementation.

## Suggested order

0 → 1 → 2c → 2 → 2b → 3 → 4a → 4 → 4b → 4c → 6 → 5 → 7 → 8 (repeat 8 periodically)

Phases 0–1 are foundation/bug fixes, low risk. Run **2c first**, then **2**,
then **2b** — despite the letters, the real dependency chain is: 2c creates
the `/playlists` and `/suggested` routes Library needs to pull from → 2
builds Library itself (initially just Playlists + Suggested sources,
since Shared doesn't exist yet) → 2b adds tagging plus the Topics page
that links into Library. If you also want Shared content inside Library
from day one rather than added later, do the whole 4/4a/4b block before 2,
then come back — but shipping Library with two sources first and adding
the third once Shared exists is the lower-risk order. 3 is another early UX
cleanup. 4a is a 15-minute fix, worth doing today regardless of when you
get to the rest. 4 (data model) must land before 4b (the Shared
page UI) and 4c (the public-link/approval routing), in that order — each
depends on the query functions and receipt collection the previous one
adds. 6 is small and self-contained. 5 is the biggest single build (new
chart, new computation). 7 is optional and incremental. 8 is ongoing
maintenance, not a one-time task.

---

## How to test each phase

This repo already has real unit tests (`npm test` runs
`tsx --test` against every `src/**/*.test.ts` file — see `goalUtils.test.ts`,
`shareAccess.test.ts`, `watchProgress.test.ts` etc. as examples of the
existing style). For every phase:

1. **Before you start:** run `npm test` and `npm run build` once, note that
   both pass cleanly, so you know any new failure came from this phase.
2. **Pure-logic changes** (goalUtils, filterSort, keywordSort, anything in
   `src/lib/*.ts` with no React/Firebase in it) — always ask the AI to add
   `.test.ts` cases in the same pass, not after. These run instantly and
   don't need a live Firebase project.
3. **Firestore rules changes** (Phase 1, 4b) — install the Firebase
   emulator (`firebase init emulators`, pick Firestore) and test against
   `firebase emulator:start` instead of your real database. This lets you
   safely try "can student B read student A's private data" without risking
   real data. If you don't want to set up emulators, the manual fallback
   is: create two throwaway test accounts and manually click through the
   exact scenario the rule is supposed to block, in an incognito window for
   the second account.
4. **UI/component changes** (most phases) — `npm run dev` and manually walk
   the specific user flow the phase touched, on both desktop width and a
   narrow mobile viewport (browser devtools device toolbar). Check the
   browser console for errors on every page you touch, not just the one
   you changed — a bad import or type error in a shared component (Video
   Card, SortableList) breaks every page that uses it.
5. **Before merging/deploying any phase:** `npm run build` must pass (this
   catches TypeScript errors `npm run dev` sometimes doesn't surface
   immediately), then `npm test` again, then a manual click-through of the
   specific flow, then push.
6. **After deploying to Vercel:** check the Vercel deployment's function
   logs for the first real usage of any new API route (Phase 6's password
   action handler, Phase 4b's email-lookup route, Phase 7's AI routes) —
   these can't be fully tested locally if they depend on production env
   vars you haven't set in Vercel yet.

---

## Running this roadmap with Claude (free tier)

Claude's free tier gives you chat with a smaller daily message allowance
and no persistent file storage between separate conversations unless you
use a **Project** (see next section — Projects are available on free tier
too, just with the same message limits).

Practical workflow:
1. **One phase per conversation.** Don't try to fit two phases in one
   chat — free-tier context/message limits make long multi-phase sessions
   run out mid-way, and you'll lose track of what half-finished.
2. **Re-attach only what's needed.** You don't need to re-zip your whole
   codebase every time — for most phases, attach just the specific files
   named in that phase's prompt (e.g. Phase 0a only needs
   `FacebookEmbed.tsx`). Smaller uploads = more room left in the
   conversation for back-and-forth.
3. **Ask for one file's full contents back, not a diff description**, if
   you're copy-pasting manually (no code-editing tool access on plain
   chat) — say "give me the complete updated file" so you can paste-replace
   cleanly instead of hand-applying a described change.
4. **Verify before moving to the next phase.** Run the phase's tests
   (previous section) before starting a new chat for the next phase — free
   tier makes it expensive to backtrack across sessions if phase 3 was
   built on a broken phase 2.

---

## Running this roadmap with GitHub Copilot (free tier)

Copilot's free tier (in VS Code, or wherever you have it) works
differently — it has direct file access in your actual project, so it's
better suited to multi-file phases than copy-paste chat is.

1. **Open the real repo**, not a zip — Copilot Chat with file access can
   read `firestore.rules`, `src/types/index.ts` etc. directly if you
   reference them with `#file:` or by having them open in your editor.
2. **Paste the phase's Prompt block directly into Copilot Chat**, same as
   with Claude — the prompts in this doc are written to be tool-agnostic.
3. **Copilot free tier has a monthly premium-request cap** — larger phases
   (5, 4b) that touch many files cost more requests than small ones (0a,
   0b). If you're near your monthly limit, save the biggest phases for
   next month rather than running out mid-phase.
4. **Always review the diff before accepting** — Copilot applies edits
   directly to your files; use your editor's built-in diff/undo, and commit
   to git *before* starting each phase so you always have a clean rollback
   point (`git commit -am "before phase 3"` as a habit).
5. **Run your test suite from Copilot's terminal integration** right after
   it edits files, in the same session — don't wait until later to
   discover a phase broke `npm test`.

---

## Setting up your Claude Project (instructions + knowledge docs)

Since you're already using a Project for this: yes, update it — right now
you likely have generic or empty instructions, and re-uploading the whole
zip every conversation wastes context.

**Project instructions** — replace with something like:
```
This project is "Study Lamp," a Next.js 14 + TypeScript + Tailwind +
Firebase (Auth + Firestore, free Spark plan) video-bookmark/learning-
tracker app, deployed on Vercel's free tier. Three content tiers: shared
admin-curated library (playlists/{id}/videos/{id}), personal per-user
state on shared videos (users/{uid}/videoStates/{id} — progress, favorite,
watchLater, priority), and fully student-owned personal playlists
(users/{uid}/personalPlaylists/{id}/videos/{id}). Security rules enforce
private-by-path: only the owner or an admin can read/write personal data.
Sharing uses a denormalized shares/{token} doc so public/unlisted links
work without exposing the underlying protected collections.

Always check firestore.rules for permission implications before proposing
a data-model change. Keep Firestore read/write volume low (debounce
autosaves, avoid onSnapshot where a one-time getDocs suffices) — this must
stay within Firebase's free-tier daily quota. Prefer editing existing
files/patterns over introducing new dependencies or parallel
implementations of something that already exists.
```

**Documents to add to the Project's knowledge:**
- `study-lamp-roadmap.md` (this file) — so any new chat knows the plan and
  which phase number you're referring to.
- `src/types/index.ts` — the single source of truth for the whole data
  model; almost every phase touches something typed here.
- `firestore.rules` — required context for any phase involving
  permissions (0b, 1, 4b, 6).
- **Don't** add the full source zip permanently to Project knowledge —
  it'll be stale the moment you make an edit outside that chat, and large,
  mostly-unchanging file dumps eat into the context budget every single
  conversation for marginal benefit. Attach specific current files
  per-conversation instead, as phase 0a/0b's prompts already scope down to.