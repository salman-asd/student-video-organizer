# Study Lamp — Student Learning Video Organizer

A learning video **organizer and progress tracker** for a small group of students.
Videos are never uploaded here — every video is an external URL (YouTube or
otherwise); the app only stores metadata, progress, notes, and organization.

Built with Next.js + TypeScript + Tailwind + shadcn-style UI, backed entirely by
**Firebase Authentication + Cloud Firestore on the free Spark plan**, and deployed
to **Netlify's free hosting**.

---

## 1. What's included

- Email/password auth (login, register, logout, password reset)
- Two roles: `admin` and `student`, enforced by Firestore Security Rules
- Shared library (playlists → videos) managed by admins, visible to everyone
- Personal-per-user state: progress, favorites, watch later, priority, notes,
  summaries, timestamp bookmarks, goals — never duplicated per video
- Student pages: Home (filters + sort + search), Continue Learning, Playlists,
  Watch Later, Priority, Favorites, Goals, Video page (player + tabs)
- Admin pages: Dashboard (all users + stats), per-user detail (playlists,
  watch later, priority, favorites, notes, history, goals — all editable),
  playlist editor with **drag-and-drop reorder**, categories/tags manager,
  JSON import, YouTube playlist import
- Drag-and-drop reordering (dnd-kit) for playlist videos, Watch Later, and
  Priority lists, persisted to Firestore
- Light/dark/system theme (stored locally via `next-themes`)
- Responsive layout: collapsible sidebar, 4/3/2/1-column video grid

## 2. What's intentionally NOT included (per spec)

No Firebase Storage, no Cloud Functions, no separate backend, no paid
services of any kind. No video upload/hosting/transcoding. AI
summaries/quizzes/flashcards, spaced repetition, and PWA/offline support are
left as extension points (see `src/types/index.ts` for where they'd plug in)
but are not implemented in this MVP.

---

## 3. Project structure

```
src/
  app/                  Next.js App Router pages (student + admin routes)
  components/
    ui/                 Small local shadcn-style primitives (button, card, ...)
    layout/              Sidebar, Header, AppShell
    auth/                AuthProvider, RequireAuth, RequireAdmin
    video/                VideoCard, VideoGrid, VideoPlayer, VideoActionsBar...
    filters/              FilterBar (home page filtering/sorting)
    dnd/                  SortableList (dnd-kit wrapper used everywhere)
  lib/
    firebase.ts           Firebase client init (Auth + Firestore only)
    firestore/             One module per collection (playlists, videos,
                            userVideoState, notes, bookmarks, users, goals...)
    filterSort.ts          Client-side filter/sort logic
  hooks/                  useVideoLibrary, useDebouncedCallback
  types/index.ts           Full data model + shared types
scripts/importJson.ts     Optional CLI bulk-importer (Firebase Admin SDK)
firestore.rules            Security rules implementing the permission model
firestore.indexes.json
netlify.toml
```

---

## 4. Data model (why it's shaped this way)

```
SHARED (admin-managed, same for everyone)
  playlists/{playlistId}
  playlists/{playlistId}/videos/{videoId}     ← order lives here

PERSONAL (per user, never duplicates the video)
  users/{uid}                                  profile + role + status + stats
  users/{uid}/videoStates/{videoId}             progress, favorite, watchLater,
                                                 priority (all independent!)
  users/{uid}/notes/{videoId}                    private notes
  users/{uid}/summaries/{videoId}                personal summary
  users/{uid}/bookmarks/{videoId}/items/{id}      timestamp bookmarks
  users/{uid}/goals/{goalId}

  categories/{id}, tags/{id}                     global taxonomy, admin-managed
```

A video is stored **once** per playlist, not once per student. Every
student's progress, favorite, watch-later, and priority status is a small
separate document under their own `users/{uid}/videoStates/{videoId}`. This
is what keeps a 300-video library × 20 students well within Firestore's free
read/write quota.

## 5. Firestore free-tier optimizations applied

- No per-video real-time `onSnapshot` listeners — data loads on page mount /
  explicit refresh (`useVideoLibrary` hook), not continuously
- Video progress is saved on **pause, page-leave, video-ended, and a 20s
  interval while playing** — never every second (`VideoPlayer.tsx`)
- Notes/summaries autosave with an 800–900ms debounce, not per keystroke
  (`useDebouncedCallback`)
- Drag-and-drop reorders write once per drop via a single Firestore
  `writeBatch`, not one write per moved item
- Admin dashboard reads a denormalized `users/{uid}.stats` snapshot
  (recomputed on demand via the "Refresh stats" button) instead of fanning
  out into every student's subcollections on every dashboard load
- Theme preference and other UI-only state stay in `localStorage`
  (via `next-themes`), never touching Firestore

---

## 6. Firebase setup (Spark / free plan)

1. Create a Firebase project at https://console.firebase.google.com — do
   **not** upgrade to Blaze; everything here runs on Spark.
2. **Authentication** → Sign-in method → enable **Email/Password**.
3. **Firestore Database** → Create database → start in production mode.
4. Deploy the security rules in `firestore.rules`:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase init firestore   # point it at this project, keep existing files
   firebase deploy --only firestore:rules,firestore:indexes
   ```
5. Project settings → General → "Your apps" → add a **Web app** → copy the
   config values into `.env.local` (see `.env.local.example`).
6. Set `NEXT_PUBLIC_SEED_ADMIN_EMAILS` in `.env.local` to your own email
   (comma-separated for multiple admins). The **first time** that email signs
   up, its Firestore profile is created with `role: "admin"` automatically.
   Anyone else who signs up becomes a `student`. You can promote/demote users
   later by editing their `users/{uid}.role` field directly in the Firebase
   console, or by having an existing admin do it from a future "manage roles"
   action (the Firestore rules already allow admin-only role writes).

### Optional: YouTube playlist import

The "Import YouTube Playlist" admin page calls the free YouTube Data API v3.
Get a key at https://console.cloud.google.com/apis/credentials (enable
"YouTube Data API v3" — this stays within Google's free quota for normal use)
and set `YOUTUBE_API_KEY` in your environment. Without it, admins can still
import via the "Import JSON" page or by adding videos one at a time.

---

## 7. Local development

```bash
npm install
cp .env.local.example .env.local   # fill in your Firebase config
npm run dev
```

Visit `http://localhost:3000`, register an account with your seed-admin
email, and you'll land in the Admin Dashboard. Use **Admin → Playlists → New
Playlist** (or **Import JSON** / **Import YouTube Playlist**) to start
building the shared library.

## 8. Deploying to Netlify (free tier)

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
3. Netlify auto-detects Next.js via `netlify.toml` (uses
   `@netlify/plugin-nextjs`, installed automatically). Build command
   `npm run build`, publish directory `.next` — already set in `netlify.toml`.
4. Add the same environment variables from `.env.local` in
   **Site settings → Environment variables** (including `YOUTUBE_API_KEY` if
   you want that feature, and `NEXT_PUBLIC_SEED_ADMIN_EMAILS`).
5. Deploy. Netlify's free tier comfortably covers a small student-group app
   like this (the YouTube-import API route runs as a Netlify Function under
   the hood, within the free invocation limits).

---

## 9. Extending later

The data model and types were written with these in mind, so they're additive:

- **AI summaries/quizzes/flashcards** — add a new `users/{uid}/aiSummaries/{videoId}`
  collection and a server API route; don't touch the personal `summaries`
  collection, which stays student-authored.
- **PWA/offline** — Firestore's local cache (already enabled in
  `lib/firebase.ts`) is a natural starting point for offline reads.
- **Learning paths / course builder** — could be modeled as an ordered list
  of playlist IDs, reusing the same `SortableList` component.

Keep new features behind the same shared-vs-personal split described in
Section 4 — it's what keeps this affordable on Firebase's free plan.
