import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { fetchFacebookVideoOEmbed } from "./facebookGraph";

type FetchArgs = Parameters<typeof fetch>;

describe("fetchFacebookVideoOEmbed", () => {
  const originalFetch = globalThis.fetch;
  let mockImpl: (url: string) => Promise<Response>;

  before(() => {
    globalThis.fetch = ((...args: FetchArgs) => mockImpl(String(args[0]))) as typeof fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  function jsonResponse(body: unknown, ok = true) {
    return new Response(JSON.stringify(body), { status: ok ? 200 : 500 });
  }

  function htmlResponse(html: string) {
    return new Response(html, { status: 200 });
  }

  it("strips a leading engagement-stats prefix from the fallback caption instead of using it as the title", async () => {
    mockImpl = async (url) => {
      if (url.includes("graph.facebook.com")) {
        return jsonResponse({
          html: `<blockquote><p>10M views · 682K reactions | The Actual Video Title</p>Posted by <a href="https://facebook.com/creator">Creator Name</a></blockquote>`,
        });
      }
      // No usable OG tags — forces the fallback-html caption to be used.
      return htmlResponse(`<html><head></head><body>no meta tags here</body></html>`);
    };

    const metadata = await fetchFacebookVideoOEmbed("https://www.facebook.com/reel/9876543210/");
    assert.ok(metadata);
    assert.equal(metadata?.title, "The Actual Video Title");
    assert.equal(metadata?.authorName, "Creator Name");
  });

  it("prefers a clean og:title over a stats-polluted oEmbed title", async () => {
    mockImpl = async (url) => {
      if (url.includes("graph.facebook.com")) {
        return jsonResponse({
          title: "1.2M views · 43K reactions | Some Fallback Title",
          html: `<blockquote><p>Ignored caption</p>Posted by <a>Someone</a></blockquote>`,
        });
      }
      return htmlResponse(
        `<html><head><meta property="og:title" content="Clean Title From OG Tags"></head><body></body></html>`
      );
    };

    const metadata = await fetchFacebookVideoOEmbed("https://www.facebook.com/watch/?v=1234567890");
    assert.equal(metadata?.title, "Clean Title From OG Tags");
  });

  it("never returns a Facebook webpage URL as the thumbnail, and prefers oEmbed's thumbnail_url when it's a real image", async () => {
    mockImpl = async (url) => {
      if (url.includes("graph.facebook.com")) {
        return jsonResponse({
          title: "A video",
          thumbnail_url: "https://www.facebook.com/watch/?v=1234567890", // bogus: a page URL, not an image
        });
      }
      return htmlResponse(
        `<html><head><meta property="og:image" content="https://scontent.fbcdn.net/real-thumb.jpg"></head></html>`
      );
    };

    const metadata = await fetchFacebookVideoOEmbed("https://www.facebook.com/watch/?v=1234567890");
    // The bogus page-URL thumbnail_url must be discarded in favor of the
    // real og:image, never saved as-is.
    assert.equal(metadata?.thumbnailUrl, "https://scontent.fbcdn.net/real-thumb.jpg");
  });

  it("uses a real oEmbed thumbnail_url directly when Facebook provides one", async () => {
    mockImpl = async (url) => {
      if (url.includes("graph.facebook.com")) {
        return jsonResponse({
          title: "A video",
          thumbnail_url: "https://scontent.fbcdn.net/oembed-thumb.jpg",
        });
      }
      return htmlResponse(`<html><head></head></html>`);
    };

    const metadata = await fetchFacebookVideoOEmbed("https://www.facebook.com/watch/?v=1234567890");
    assert.equal(metadata?.thumbnailUrl, "https://scontent.fbcdn.net/oembed-thumb.jpg");
  });
});
