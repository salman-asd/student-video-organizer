import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getBackToPlaylistHref, shouldUsePlaylistSidebar } from "./watchPage";

describe("getBackToPlaylistHref", () => {
  it("routes shared videos back to the library playlist page", () => {
    assert.equal(getBackToPlaylistHref("playlist-123", null), "/playlists/playlist-123");
  });

  it("routes personal videos back to the owner's playlist editor", () => {
    assert.equal(getBackToPlaylistHref("playlist-456", "owner-1"), "/my-playlists/playlist-456?owner=owner-1");
  });
});

describe("shouldUsePlaylistSidebar", () => {
  it("keeps playlist visible on larger screens and hides it on tiny ones", () => {
    assert.equal(shouldUsePlaylistSidebar(false, 1280), false);
    assert.equal(shouldUsePlaylistSidebar(true, 1280), true);
    assert.equal(shouldUsePlaylistSidebar(true, 375), false);
  });
});
