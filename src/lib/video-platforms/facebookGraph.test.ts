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

  it("parses the real-world 'stats | title | page' shape into a clean title and a page-name author fallback", async () => {
    // This is the exact structure reported in the wild: a stats segment
    // combining two stats with "·", a mixed-script (Latin + Devanagari)
    // title with hashtags, and a trailing Page name — all HTML-entity
    // encoded, including hex numeric refs for non-ASCII characters and
    // the middle dot itself.
    const rawTitle =
      "354K views &#xb7; 4.3K reactions | sauth indian hindi movie, " +
      "&#x928;&#x94d;&#x92f;&#x942; &#x938;&#x93e;&#x909;&#x925; &#x907;&#x902;&#x921;&#x93f;&#x92f;&#x928; " +
      "&#x939;&#x93f;&#x902;&#x926;&#x940; &#x92e;&#x942;&#x935;&#x940; #movies #sauthsuperhitmovie " +
      "#hindimovie #newsauthmove | Trending 123";

    mockImpl = async (url) => {
      if (url.includes("graph.facebook.com")) {
        return jsonResponse({}); // no author_name, no html — matches the real report
      }
      return htmlResponse(`<html><head><meta property="og:title" content="${rawTitle}"></head></html>`);
    };

    const metadata = await fetchFacebookVideoOEmbed("https://www.facebook.com/reel/1610944483802791/");
    assert.ok(metadata);
    // Stats segment gone, Devanagari properly decoded (not raw &#x...;),
    // and the trailing "| Trending 123" page segment reattached at the
    // end as the requested "<title> | <authorName>" display format,
    // instead of either staying stuck to the raw title or being dropped.
    assert.equal(
      metadata?.title,
      "sauth indian hindi movie, न्यू साउथ इंडियन हिंदी मूवी #movies #sauthsuperhitmovie #hindimovie #newsauthmove | Trending 123"
    );
    assert.equal(metadata?.authorName, "Trending 123");
  });

  it("strips a leading engagement-stats prefix and formats the title as '<title> | <authorName>'", async () => {
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
    assert.equal(metadata?.title, "The Actual Video Title | Creator Name");
    assert.equal(metadata?.authorName, "Creator Name");
  });

  it("prefers a clean og:title over a stats-polluted oEmbed title, with no '| author' suffix when no author was found", async () => {
    mockImpl = async (url) => {
      if (url.includes("graph.facebook.com")) {
        return jsonResponse({
          title: "1.2M views · 43K reactions | Some Fallback Title",
          html: `<blockquote><p>Ignored caption</p></blockquote>`, // no "Posted by" here
        });
      }
      return htmlResponse(
        `<html><head><meta property="og:title" content="Clean Title From OG Tags"></head><body></body></html>`
      );
    };

    const metadata = await fetchFacebookVideoOEmbed("https://www.facebook.com/watch/?v=1234567890");
    // No author resolved from any source, so no "| author" suffix.
    assert.equal(metadata?.title, "Clean Title From OG Tags");
    assert.equal(metadata?.authorName, null);
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
