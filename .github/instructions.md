# Video Bookmark Manager — Copilot Project Instructions

## 0. IMPORTANT: How You Must Work

You are working on an existing **Next.js + React + Firebase** application.

This document is the project's source of truth for product requirements and development behavior.

The product has a broad roadmap, but implementation must happen **incrementally**.

### Never implement the entire roadmap at once.

For every task:

1. Inspect the existing repository first.
2. Understand the current implementation.
3. Identify what already works.
4. Reuse existing architecture and components.
5. Identify dependencies of the requested task.
6. Implement only the requested task and its necessary dependencies.
7. Do not implement unrelated future features.
8. Validate the changes.
9. Fix errors before considering the task complete.
10. Summarize what changed.

Do not rewrite working functionality without a clear reason.

Do not replace existing technologies unless explicitly requested.

---

# 1. Product Vision

This application is a **video-only bookmark manager and learning organizer**.

The product allows users to:

* Save video URLs.
* Automatically detect video platforms.
* Automatically retrieve video metadata where possible.
* Create playlists.
* Add videos manually.
* Import external playlists.
* Reorder and organize videos.
* Track watched/unwatched state.
* Track watch progress where supported.
* Use Watch Later.
* Favorite videos.
* Set video priority.
* Add notes.
* Share videos.
* Share playlists.
* Make content private, unlisted, or public.
* Continue watching unfinished videos.
* Organize learning content through a dashboard.

The application does **not** host videos.

Videos remain on their original platforms.

The product should feel like:

> **A modern bookmark manager specifically designed for videos.**

It is not intended to become a social network.

---

# 2. Existing Technology

The project already uses:

* Next.js
* React
* Firebase Authentication
* Firebase Firestore
* Existing UI/template/design system

Before adding anything:

* Inspect `package.json`.
* Inspect the existing `app`/`pages` structure.
* Inspect components.
* Inspect Firebase configuration.
* Inspect authentication.
* Inspect Firestore access.
* Inspect existing API/server actions.
* Inspect existing styling/theme system.

Reuse existing libraries whenever possible.

### Do not:

* Replace Next.js.
* Replace React.
* Replace Firebase.
* Replace the existing UI system.
* Introduce unnecessary state-management libraries.
* Introduce unnecessary dependencies.
* Create duplicate components/services.

---

# 3. Product Hierarchy

Keep the product simple.

There is **NO CHANNEL SYSTEM in the MVP**.

Do not introduce:

* Channels
* Followers
* Following
* Subscriptions
* Creator profiles
* Social feeds
* Comments
* Likes
* Social networking

The core hierarchy is:

```text
User
│
├── Saved Videos
│
├── Playlists
│     └── Playlist Videos
│
├── Favorites
│
├── Watch Later
│
├── Watch Progress
│
├── Tags
│
└── Notes
```

A video can exist independently.

A video can belong to multiple playlists.

---

# 4. Core Entities

The primary entities are:

```text
User
Video
Playlist
PlaylistVideo
VideoState
Tag
VideoTag
Share
WatchProgress
```

Keep external video metadata separate from user-specific state whenever practical.

---

# 5. Video Model

A video represents an external video bookmark.

Example:

```text
Video

id
ownerId
platform
externalVideoId
originalUrl
canonicalUrl

title
thumbnailUrl
description

creatorName
creatorId

duration
publishedAt

createdAt
updatedAt
```

Do not store the actual video file.

Do not download the video.

Do not re-host the video.

---

# 6. User-Specific Video State

The following information belongs to the user, not the global external video metadata:

```text
VideoState

userId
videoId

isFavorite
isWatched
watchLater

priority

progressSeconds
durationSeconds
progressPercentage
completed

lastWatchedAt
lastOpenedAt

notes

createdAt
updatedAt
```

A user can have different state for the same external video.

---

# 7. Supported Platforms

Initial platform providers:

* YouTube
* YouTube Shorts
* Facebook
* Vimeo
* Generic/Other

The architecture must be extensible.

Use a provider abstraction where appropriate:

```text
VideoPlatformProvider

├── YouTubeProvider
├── FacebookProvider
├── VimeoProvider
└── GenericProvider
```

Each provider may implement:

```text
detectUrl()
normalizeUrl()
extractVideoId()
fetchVideoMetadata()
detectPlaylist()
fetchPlaylistMetadata()
fetchPlaylistVideos()
getWatchUrl()
getEmbedUrl()
```

Do not place all platform logic into one giant conditional.

---

# 8. Adding a Video

Users can add a video by pasting a URL.

Example:

```text
https://www.youtube.com/watch?v=xxxxx
```

Workflow:

```text
Paste URL
    ↓
Detect platform
    ↓
Validate URL
    ↓
Normalize URL
    ↓
Extract external ID
    ↓
Fetch metadata
    ↓
Show preview
    ↓
Edit title if desired
    ↓
Choose playlist(s)
    ↓
Save
```

Automatically retrieve where possible:

* Title
* Thumbnail
* Description
* Creator
* Duration
* Published date
* Platform
* External video ID

If metadata retrieval fails:

> Allow the user to save the URL manually.

Never make metadata retrieval a requirement for saving a valid bookmark.

---

# 9. Automatic Title Fetching

The title should automatically populate when a user adds a supported video URL.

Example:

```text
Paste URL

[ https://youtube.com/watch?v=123 ]

Fetching metadata...

Title:
[ Automatically detected title ]

Thumbnail:
[ Automatically detected thumbnail ]

[Save Video]
```

Allow the user to override the detected title.

User-provided custom title should not destroy the underlying external metadata.

---

# 10. Metadata Security

External API calls must not expose API keys to the browser.

Preferred architecture:

```text
React UI
   ↓
Next.js Server Action / API Route
   ↓
Platform Provider
   ↓
Metadata
   ↓
Firestore
```

Validate all external URLs.

Protect server-side fetching against SSRF.

Use allowlists/validated provider domains where appropriate.

Implement reasonable:

* Timeouts
* Error handling
* Retry behavior
* Rate limiting
* Caching

Do not make unnecessary external requests.

---

# 11. Duplicate Detection

Duplicate detection is required.

For supported platforms, the primary identity should be:

```text
platform + externalVideoId
```

Normalize URLs before comparing them.

Different URLs pointing to the same video should generally resolve to the same video.

Example:

```text
This video is already saved.

Already in:
• JavaScript
• Frontend
• Watch Later

[Add to Playlist]
```

Do not silently create duplicate video records.

---

# 12. Playlist Creation

Users can create playlists in three primary ways.

## Method 1 — Empty Playlist

User clicks:

```text
Create Playlist
```

Then enters:

* Title
* Description
* Visibility

The playlist starts empty.

---

## Method 2 — Manual Video Addition

User creates a playlist and adds videos one at a time.

Example:

```text
Create Playlist
       ↓
JavaScript Course
       ↓
Add Video
       ↓
Paste Video URL
       ↓
Metadata fetched
       ↓
Add to playlist
```

Users can continue adding individual videos.

---

## Method 3 — Import External Playlist

User pastes a playlist/collection URL.

Example:

```text
https://www.youtube.com/playlist?list=XXXXX
```

Workflow:

```text
Paste Playlist URL
       ↓
Detect provider
       ↓
Detect playlist
       ↓
Fetch playlist metadata
       ↓
Fetch videos
       ↓
Create local playlist
       ↓
Import videos
       ↓
Complete
```

The imported playlist becomes a **local playlist**.

Preserve original playlist order when possible.

Do not continuously synchronize with the original playlist unless a future feature explicitly requires synchronization.

---

# 13. External Playlist Import

For supported providers, import:

* Playlist title
* Description
* Thumbnail
* Videos
* Video order
* Video metadata

For each video:

* Detect duplicate.
* Reuse existing video when appropriate.
* Create missing video records.
* Create playlist relationship.
* Preserve order.

Example:

```text
Importing JavaScript Course

████████████░░░░ 80%

96 / 120 videos

✓ 90 imported
↻ 4 already existed
⚠ 2 unavailable
```

One failed video must not fail the entire import.

If the provider does not officially support playlist retrieval, show a clear error.

Do not use unauthorized methods to bypass platform restrictions.

---

# 14. Playlist Model

Example:

```text
Playlist

id
ownerId

title
description
thumbnailUrl

visibility

createdAt
updatedAt
```

Visibility:

```text
private
unlisted
public
```

---

# 15. PlaylistVideo Relationship

Do not duplicate videos for every playlist.

Use a relationship:

```text
PlaylistVideo

id
ownerId
playlistId
videoId

sortOrder

addedAt
```

This allows:

```text
One Video
   ↓
Multiple Playlists
```

Example:

```text
Video A

├── JavaScript
├── Frontend
├── Web Development
└── Watch Later
```

---

# 16. Playlist CRUD

Users can:

* Create
* View
* Edit
* Delete
* Duplicate

their own playlists.

Users can:

* Add videos.
* Remove videos.
* Reorder videos.
* Add existing saved videos.
* Add new videos.

Only the owner can modify the playlist.

---

# 17. Playlist Ordering

Every playlist should support:

### Custom order

Drag and drop.

### Sorting

Provide useful temporary sorting options:

* Custom
* Newest added
* Oldest added
* Title A-Z
* Title Z-A
* Watched first
* Unwatched first
* Priority
* Duration

Do not destroy the saved custom order when applying a temporary sort/filter.

---

# 18. Video Actions

Every video should provide useful actions:

```text
▶ Watch
✓ Watched / Unwatched
♡ Favorite
⏱ Watch Later
⭐ Priority
📋 Add to Playlist
🔗 Share
⋮ More
```

Use the existing design system.

Do not overcrowd the card.

Primary action should be watching the video.

---

# 19. Watch on Original Platform

Every video must provide a clear platform-specific watch action.

Examples:

```text
▶ Watch on YouTube
▶ Watch on Facebook
▶ Watch on Vimeo
▶ Watch Original Video
```

Use the detected platform to generate the correct label.

Open the canonical/original URL.

Prefer a new tab/window.

Never imply that the application hosts the video.

---

# 20. Video Player

When official embedding is available, use the platform's official player.

For YouTube:

* Play/pause
* Volume
* Mute
* Seek
* Progress
* Fullscreen
* Player menu

must work where supported.

### Important existing bug

The current implementation may not display the YouTube volume control.

Before changing the player:

1. Inspect the current YouTube embed.
2. Check iframe/player configuration.
3. Check player parameters.
4. Check CSS.
5. Check overlays.
6. Check container sizing.
7. Check whether another element is covering the controls.

Do not build a fake volume control if the official YouTube player already provides one.

Fix the existing implementation if the control is accidentally hidden.

For other providers, use their official embed mechanism.

If embedding is unavailable:

```text
Thumbnail

▶ Watch on Facebook
```

Do not bypass embedding restrictions.

---

# 21. Watch Progress

Track progress where technically possible.

Example:

```text
WatchProgress

userId
videoId

progressSeconds
durationSeconds
percentage

completed

lastWatchedAt
updatedAt
```

Do not write progress to Firestore on every second.

Throttle/debounce updates.

For unsupported providers, fall back to manual watched/unwatched state.

---

# 22. Watched / Unwatched

Users can manually mark videos:

```text
Watched
Unwatched
```

If supported player progress reaches a reasonable completion threshold, automatically mark as watched.

The user must still be able to change it manually.

---

# 23. Continue Watching

Create a Continue Watching section.

Show videos that:

* Have non-zero progress.
* Are not completed.
* Were recently watched/opened.

Example:

```text
Continue Watching

JavaScript Async/Await

████████░░ 80%

▶ Continue
```

When supported, resume from the saved position.

If the provider does not support seeking, open normally.

---

# 24. Watch Later

Watch Later is a special personal collection.

Users can:

* Add videos.
* Remove videos.
* Reorder.
* Mark watched.
* Mark unwatched.
* Favorite.
* Set priority.
* Open video.

A user should not need to manually create a playlist just to use Watch Later.

---

# 25. Favorites

Users can favorite videos.

Favorite is independent from:

* Playlist membership
* Watch Later
* Watched state
* Priority
* Progress

A video can have all of these states simultaneously.

---

# 26. Priority

Support:

```text
None
Low
Medium
High
```

Priority is user-specific.

Users can:

* Set priority.
* Change priority.
* Filter by priority.
* Sort by priority.

---

# 27. Notes

Users can add private notes to videos.

Example:

```text
Review the explanation around 24:30.

Important concept for my project.
```

Notes are private by default.

Never expose private notes on shared/public pages.

---

# 28. Sharing

Users can share:

* Individual videos.
* Playlists.

Visibility:

### Private

Only owner.

### Anyone With Link

Anyone with the unique link.

Not discoverable publicly.

### Public

Anyone can view.

May appear in future public discovery.

---

# 29. Share Video

Every video should have:

```text
[Share]
```

Share dialog:

```text
Share Video

Visibility

○ Private
○ Anyone with link
○ Public

Share URL

[Copy Link]
```

Shared video page is read-only.

Show:

* Thumbnail/player
* Title
* Platform
* Creator
* Description if public
* Watch on original platform

Never expose private:

* Notes
* Internal state
* Personal progress
* Favorites
* Watch Later
* Priority
* Private metadata

---

# 30. Share Playlist

Every playlist should have:

```text
[Share]
```

Shared playlist page should show:

* Title
* Description
* Thumbnail
* Video count
* Videos
* Ordering
* Platform
* Watch buttons

Each video should provide:

```text
▶ Watch on YouTube
```

or its appropriate platform.

Shared pages are read-only.

Only the owner can modify the original playlist.

---

# 31. Share URL Security

Never use predictable sequential IDs as the only protection for unlisted resources.

Use secure, random share tokens where appropriate.

Example:

```text
/share/v/7xK92LmP
/share/p/9Hd72LmQ
```

Changing visibility from:

```text
public → private
```

must prevent unauthorized access.

Changing:

```text
unlisted → private
```

must invalidate/disable the sharing mechanism as appropriate.

---

# 32. Public Content Security

Public pages may expose only intentionally public information.

Never expose:

* Private notes
* Personal progress
* Watch Later state
* Favorite state
* Priority
* Internal Firebase IDs
* Private playlists
* Private user information

User-specific state remains private.

---

# 33. Dashboard

The dashboard should focus on what the user needs to watch next.

Recommended layout:

```text
My Dashboard

[+ Add Video]
[Create Playlist]
[Import Playlist]

Continue Watching
────────────────────

Watch Later
────────────────────

High Priority
────────────────────

Favorites
────────────────────

Recently Added
────────────────────

My Playlists
────────────────────
```

The dashboard should be useful rather than just displaying statistics.

---

# 34. Dashboard Statistics

Optional lightweight statistics:

```text
Videos
Playlists
Watched
Unwatched
Favorites
Watch Later
```

Do not build advanced analytics in the MVP.

---

# 35. Playlist Detail Page

Example:

```text
JavaScript Course

120 videos
42 watched
78 unwatched

[Add Video]
[Import]
[Share]

Sort: Custom
Filter: All

────────────────────────────

1. Introduction
   YouTube
   ✓ Watched

2. Variables
   YouTube
   65% progress

3. Functions
   YouTube
   Unwatched
```

Support:

* Search within playlist.
* Sorting.
* Filtering.
* Drag-and-drop.
* Bulk actions.

---

# 36. Bulk Actions

Users should be able to select multiple videos.

Actions:

* Add to playlist.
* Remove from playlist.
* Mark watched.
* Mark unwatched.
* Favorite.
* Unfavorite.
* Add to Watch Later.
* Remove from Watch Later.
* Set priority.
* Remove priority.
* Delete.

Ask for confirmation before destructive operations.

---

# 37. Firestore Suggested Structure

Use a structure compatible with the existing project.

Possible collections:

```text
users
videos
playlists
playlistVideos
videoStates
tags
videoTags
shares
watchProgress
```

Do not blindly implement this exact structure if the existing application has a better established pattern.

Optimize for actual Firestore query patterns.

---

# 38. Firestore Security Rules

Security is mandatory.

Users must only be able to modify their own resources.

### Videos

Owner can:

* Create
* Read
* Update
* Delete

Other users cannot access private video records.

### Playlists

Owner can:

* Create
* Read
* Update
* Delete

### PlaylistVideos

Only playlist owner can modify relationships.

### VideoState

Only the owning user can read/write personal state.

### WatchProgress

Only the owning user can read/write.

### Notes

Only the owning user can read/write.

### Shares

Only the owner can create/change/delete shares.

### Public resources

Public read access should expose only intended public data.

Do not rely only on frontend authorization.

---

# 39. Authentication

Use existing Firebase Authentication.

Required:

* Register
* Login
* Logout
* Password reset
* Authentication state
* Protected routes

If the existing project already supports these, reuse them.

Do not rewrite authentication unnecessarily.

---

# 40. User Roles

If the existing project requires roles, support:

```text
student
admin
```

Do not introduce channels or creator roles.

Role checks must be enforced server-side/through Firestore rules where applicable.

---

# 41. Admin Features

Admin functionality is separate from normal user functionality.

Potential admin features:

* User management
* Content moderation
* Import management
* System statistics
* Platform/provider configuration
* Error monitoring

Do not expose admin pages to normal users.

Do not implement unnecessary admin features until requested.

---

# 42. Import Tools

Import tools should support:

### JSON video import

Example:

```json
[
  {
    "url": "https://www.youtube.com/watch?v=123",
    "title": "Example Video"
  },
  {
    "url": "https://vimeo.com/123456"
  }
]
```

Process:

```text
Validate
↓
Detect platform
↓
Detect duplicate
↓
Fetch metadata
↓
Preview
↓
Select
↓
Import
```

Invalid entries should not fail the entire import.

---

# 43. External Playlist Import

Support importing playlists from platforms that provide supported playlist APIs.

Initially prioritize YouTube.

The system should convert the external playlist into a local playlist.

Example:

```text
External YouTube Playlist
          ↓
      Import
          ↓
Local Playlist
          ↓
Local Videos
          ↓
User controls everything
```

After import:

* Reorder.
* Remove.
* Add.
* Favorite.
* Watch Later.
* Mark watched.
* Set priority.
* Share.

No automatic synchronization unless explicitly implemented later.

---

# 44. Search

Basic search should cover:

* Video title
* Creator
* Playlist title
* Tags

Filters:

* Platform
* Playlist
* Watched/unwatched
* Favorite
* Watch Later
* Priority

Do not introduce a dedicated search service unless the application's scale requires it.

Keep search implementation replaceable.

---

# 45. Responsive UI

The application must work on:

* Desktop
* Tablet
* Mobile

Mobile must support:

* Add video
* Create playlist
* Browse playlist
* Watch video
* Mark watched
* Favorite
* Watch Later
* Share
* Reorder where practical

Do not make desktop-only assumptions.

---

# 46. UI Principles

The interface should feel like a polished consumer productivity application.

Avoid:

* Generic admin-dashboard appearance.
* Excessive forms.
* Excessive dialogs.
* Too many visible buttons.
* Unnecessary configuration.

Use:

* Clear hierarchy.
* Good spacing.
* Skeleton loading.
* Empty states.
* Error states.
* Toasts.
* Confirmation dialogs.
* Context menus.
* Responsive cards.
* Accessible controls.

Primary actions should be obvious.

---

# 47. Loading and Error Handling

Every asynchronous operation should handle:

```text
Loading
Success
Error
Empty
```

Examples:

```text
Fetching video information...

Fetching playlist...

Importing 42 videos...

Unable to retrieve metadata.

Unable to import playlist.
```

Never leave the user with a silent failure.

---

# 48. Data Integrity

Protect against:

* Duplicate videos.
* Duplicate playlist relationships.
* Invalid URLs.
* Missing metadata.
* Deleted videos.
* Deleted playlists.
* Broken external URLs.
* Invalid share tokens.
* Unauthorized Firestore access.

Use transactions/batches where appropriate.

---

# 49. Performance

Do not make excessive Firestore reads/writes.

Important:

* Paginate large video lists.
* Avoid writing watch progress every second.
* Batch bulk imports.
* Batch Firestore operations where appropriate.
* Cache external metadata.
* Lazy-load heavy player components where appropriate.
* Avoid loading entire playlists when only a page is needed.

---

# 50. Accessibility

Support:

* Keyboard navigation.
* Focus states.
* Semantic buttons/links.
* Accessible labels.
* Screen-reader-friendly controls.
* Sufficient contrast.
* Dialog focus management.

Do not rely on icons alone for important actions.

---

# 51. Testing Requirements

Each implemented feature should be tested.

At minimum:

### Video

* Add video.
* Invalid URL.
* Metadata success.
* Metadata failure.
* Duplicate detection.
* Delete video.

### Playlist

* Create.
* Edit.
* Delete.
* Add video.
* Remove video.
* Reorder.
* Sort.

### Import

* Valid playlist.
* Invalid playlist.
* Partial failure.
* Duplicate videos.
* Empty playlist.

### Sharing

* Private.
* Unlisted.
* Public.
* Invalid share token.
* Revoked share.
* Unauthorized modification.

### Watch State

* Watched.
* Unwatched.
* Progress.
* Continue Watching.
* Watch Later.
* Favorites.
* Priority.

### Security

Test that one user cannot access another user's private resources.

---

# 52. Definition of Done

A feature is complete only when:

* UI works.
* Data persists.
* Authentication works.
* Authorization works.
* Firestore rules are correct.
* Loading states work.
* Error states work.
* Mobile layout works.
* TypeScript passes.
* Build passes.
* Tests pass where applicable.
* Existing features still work.
* No unnecessary dependencies were added.

---

# 53. Development Phases

Implement in this order.

## Phase 0 — Repository Audit

Before coding:

* Inspect project.
* Inspect Firebase.
* Inspect authentication.
* Inspect Firestore.
* Inspect existing UI.
* Inspect routing.
* Inspect existing player.
* Inspect existing tests.

Do not make unnecessary changes.

---

## Phase 1 — Data Layer

Implement/verify:

* User model.
* Video model.
* Playlist model.
* PlaylistVideo relationship.
* VideoState.
* WatchProgress.
* Share model.
* Tags.

Implement/verify Firestore indexes and security rules.

---

## Phase 2 — Authentication and Authorization

Implement/verify:

* Auth state.
* Protected routes.
* User profile.
* Student/admin roles if required.
* Firestore ownership checks.

---

## Phase 3 — Personal Videos

Implement:

* Add video.
* Metadata.
* Platform detection.
* Video list.
* Video detail.
* Edit.
* Delete.
* Duplicate detection.

---

## Phase 4 — Personal Playlists

Implement:

* Create.
* Edit.
* Delete.
* Add videos.
* Remove videos.
* Reorder.
* Sort.
* Filter.

---

## Phase 5 — External Playlist Import

Implement:

* Paste playlist URL.
* Detect provider.
* Retrieve playlist.
* Preview.
* Import.
* Progress.
* Partial failures.
* Duplicate handling.

---

## Phase 6 — Watch Management

Implement:

* Watched.
* Unwatched.
* Progress.
* Continue Watching.
* Watch Later.
* Favorites.
* Priority.

---

## Phase 7 — Sharing

Implement:

* Private.
* Anyone with link.
* Public.
* Share video.
* Share playlist.
* Secure share tokens.
* Public/shared pages.
* Revoking access.

---

## Phase 8 — Player

Verify/fix:

* YouTube player.
* Volume control.
* Seek.
* Progress.
* Fullscreen.
* Continue position.
* Official embeds.

Then support other platforms where practical.

---

## Phase 9 — Dashboard

Implement:

* Continue Watching.
* Watch Later.
* Favorites.
* Priority.
* Recently Added.
* Playlists.
* Lightweight statistics.

---

## Phase 10 — Search and Organization

Implement:

* Search.
* Filters.
* Tags.
* Notes.
* Playlist search.
* Bulk actions.

---

## Phase 11 — Admin and Import Tools

Only implement required admin functionality.

Do not overbuild the admin panel.

---

## Phase 12 — Final QA

Perform:

* TypeScript check.
* Production build.
* Test suite.
* Firestore rule review.
* Authentication review.
* Authorization review.
* Mobile review.
* Accessibility review.
* Performance review.
* External API error review.
* Share-token security review.
* YouTube player review.

---

# 54. Future Features — DO NOT IMPLEMENT YET

These are intentionally outside the current MVP unless explicitly requested:

* Channel system.
* Followers.
* Following.
* Subscriptions.
* Comments.
* Social feed.
* Likes.
* Collaborative playlists.
* Browser extension.
* Native mobile app.
* AI summaries.
* AI tagging.
* AI recommendations.
* Semantic search.
* Advanced recommendation engine.
* Creator monetization.
* Subscription billing.
* Video hosting.
* Video uploading.
* Video downloading.
* Automatic playlist synchronization.
* Advanced analytics.
* Notifications.

The architecture should remain extensible, but these features must not be implemented prematurely.

---

# 55. Important Product Boundary

This application is a **video bookmark manager**.

It is NOT:

* A video hosting service.
* A video downloader.
* A social network.
* A YouTube replacement.
* A creator platform.

The application stores external URLs and permitted metadata.

The user watches the video through:

1. An officially supported embedded player, or
2. The original external platform.

Never bypass platform restrictions.

---

# 56. Copilot Agent Task Protocol

When the user gives you a task, follow this protocol.

## Step 1 — Read

Read:

* This file.
* Relevant source files.
* Relevant types.
* Relevant Firebase code.
* Relevant components.

## Step 2 — Inspect

Determine:

* What already exists.
* What is missing.
* What can be reused.
* What needs modification.
* What data changes are required.

## Step 3 — Plan

Before large changes, produce a short implementation plan:

```text
Plan:
1. ...
2. ...
3. ...
```

Do not create unnecessary architecture.

## Step 4 — Implement

Implement only the requested task and required dependencies.

Do not jump ahead.

## Step 5 — Validate

Run appropriate:

* TypeScript checks.
* Lint.
* Tests.
* Build.
* Firestore rule validation where available.

Fix issues caused by your changes.

## Step 6 — Review

Check:

* Security.
* Mobile.
* Accessibility.
* Error handling.
* Loading states.
* Existing functionality.

## Step 7 — Report

Finish with:

```text
Implemented:
- ...

Files changed:
- ...

Data changes:
- ...

Security changes:
- ...

Validation:
- ...

Known limitations:
- ...

Next recommended task:
- ...
```

Do not automatically implement the next task.

---

# 57. Scope Discipline

If a task says:

> Implement playlist CRUD.

Do not automatically implement:

* Sharing.
* Watch progress.
* Favorites.
* AI.
* Dashboard.
* Import.

If those are dependencies, implement only the minimum necessary foundation.

If requirements are ambiguous, inspect the repository and existing architecture first.

Only ask for clarification when implementation cannot safely proceed without it.

---

# 58. Existing Code Takes Priority

When this specification conflicts with an existing implementation detail:

1. Preserve the product requirement.
2. Preserve working architecture when possible.
3. Avoid unnecessary rewrites.
4. Explain the conflict.
5. Choose the smallest safe change.

Do not replace a working component simply because a different implementation is theoretically cleaner.

---

# 59. Final Quality Standard

The finished application should feel:

* Fast.
* Clean.
* Modern.
* Simple.
* Reliable.
* Secure.
* Mobile-friendly.

The primary experience should be:

```text
Find a video
      ↓
Copy URL
      ↓
Paste URL
      ↓
Metadata automatically detected
      ↓
Save
      ↓
Add to playlist
      ↓
Watch later
      ↓
Continue watching
      ↓
Mark watched
      ↓
Favorite / prioritize
      ↓
Share video or playlist
```

The most important principle:

> **Make saving and organizing videos effortless, while keeping ownership, privacy, sharing, and watch state reliable.**
