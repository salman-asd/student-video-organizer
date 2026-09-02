# Facebook video/collection support — setup notes

## Environment variables (server-side only, never exposed to the browser)

Add to your deployment's environment (e.g. `.env.local` for local dev):

```
# Required for fetching a single Facebook video's title/thumbnail/author.
# This is an APP token (App ID + App Secret joined with "|"), not a user
# token — no one has to log into Facebook. Create an app at
# https://developers.facebook.com/apps to get these two values.
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret

# Same App ID as above, duplicated into a NEXT_PUBLIC_ var so it's
# available to the browser bundle. Required for reliable in-app Facebook
# video/Reel PLAYBACK (not metadata fetching) — Meta retired anonymous,
# automated Facebook embeds on 3 Nov 2025, and the "Embedded Video
# Player" plugin (components/video/FacebookEmbed.tsx) can silently fail
# to render anything at all without an App ID initialized on the SDK.
# An App ID is not a secret (it's the same value that appears in every
# Facebook "Login" button and every embed snippet Facebook itself
# generates) — only FACEBOOK_APP_SECRET above needs to stay server-side.
NEXT_PUBLIC_FACEBOOK_APP_ID=your_app_id

# Only required if you want to support importing a Facebook Page's video
# collection/playlist (the "Import Playlist / Collection" flow). Needs a
# Page access token with video read permission for that specific Page.
# If this is omitted, single-video add/import still works fully; only
# collection import will show a clear "not configured" error.
FACEBOOK_PAGE_ACCESS_TOKEN=your_page_access_token
```

Without `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET`, Facebook videos still work
end-to-end — they just fall back to the same manual title/thumbnail entry
the app already uses for any URL it can't fetch metadata for. Nothing is
blocked by missing credentials; capability only gets richer once they're set.

Without `NEXT_PUBLIC_FACEBOOK_APP_ID` specifically, in-app **playback**
(not metadata) is unreliable — the video/Reel plugin often renders
nothing at all rather than erroring, which shows up as a permanently
black player until FacebookEmbed's 6-second timeout falls back to an
"Open video in a new tab" link. Setting this one var is the single most
effective fix if videos are adding fine (title/thumbnail show up) but
won't actually play in-app.

## One thing outside this diff: `next.config`'s image domains

This zip only contained the `src/` directory, so `next.config.js`
(or `.ts`/`.mjs`, wherever it lives in your project root) wasn't included
here. Facebook thumbnail URLs returned by the Graph API's oEmbed endpoint
come from Facebook's CDN (`scontent*.fbcdn.net`, `platform-lookaside.fbsbx.com`),
which `next/image` will reject unless it's allow-listed. Add a pattern like:

```js
images: {
  remotePatterns: [
    // ...your existing patterns (i.ytimg.com, etc.)
    { protocol: "https", hostname: "*.fbcdn.net" },
    { protocol: "https", hostname: "platform-lookaside.fbsbx.com" },
  ],
},
```

If you'd rather not touch `next.config`, everything still works with
plain `<img>` — the app doesn't require `next/image` for user-facing
thumbnails, but you'll lose Next's automatic optimization for those images.

## What was and wasn't implemented

Done: single Facebook video add (personal + shared library), automatic
platform detection, Graph API–backed metadata fetch with graceful fallback
to manual entry, Facebook collection import (personal playlists, mirroring
the YouTube playlist import flow), in-app playback via Facebook's public
iframe embed, and short-link (`fb.watch`, `/share/v/`) recognition.

Not implemented (left as follow-up, since they weren't asked for and would
each be their own change): admin/shared-library *collection* import UI
(only personal playlists got the "Import Playlist / Collection" page — the
shared-library admin side still only has single-video add, same as today),
and watch-progress tracking for Facebook videos (Facebook's embed has no
postMessage API the way YouTube's iframe does, so position/percentage
tracking isn't possible without Facebook's JS SDK, which would need a
separate design conversation about loading a third-party SDK app-wide).
