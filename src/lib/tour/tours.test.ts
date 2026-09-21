import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { availableSteps, isTourOfferable } from "./dom";
import { AUTO_RUN_MAX_ACCOUNT_AGE_MS, recordFor, shouldAutoRunWelcome, shouldOfferChip } from "./tourState";
import { TOUR_LIST, TOURS, allTourTargets, tourForPath } from "./tours";

const SRC_ROOT = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name) && !full.includes(join("lib", "tour", "tours.ts"))) out.push(full);
  }
  return out;
}

describe("tour registry", () => {
  it("has unique ids and at least two steps per tour", () => {
    const ids = TOUR_LIST.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const tour of TOUR_LIST) assert.ok(tour.steps.length >= 2, tour.id);
  });

  it("every step has a title and body", () => {
    for (const tour of TOUR_LIST) for (const step of tour.steps) {
      assert.ok(step.title.trim(), `${tour.id}: title`);
      assert.ok(step.body.trim(), `${tour.id}: body`);
    }
  });

  it("every anchor a tour targets exists in the source (guards against silently dead steps)", () => {
    const sources = walk(SRC_ROOT).map((file) => readFileSync(file, "utf8"));
    for (const target of allTourTargets()) {
      const found = sources.some((text) => text.includes(`"${target}"`));
      assert.ok(found, `no data-tour anchor "${target}" found under src/`);
    }
  });

  it("route matching picks the right tour and never confuses import/detail/watch", () => {
    assert.equal(tourForPath("/dashboard")?.id, "welcome");
    assert.equal(tourForPath("/playlists")?.id, "playlists");
    assert.equal(tourForPath("/playlists/abc")?.id, "playlist-detail");
    assert.equal(tourForPath("/playlists/import"), null);
    assert.equal(tourForPath("/playlists/abc/def")?.id, "watch");
    assert.equal(tourForPath("/goals")?.id, "goals");
    assert.equal(tourForPath("/settings/ai")?.id, "settings-ai");
    assert.equal(tourForPath("/settings/interests")?.id, "settings-interests");
    assert.equal(tourForPath("/settings/categories"), null);
  });
});

describe("tour chaining", () => {
  it("welcome → settings-ai → settings-interests, every `next` exists, and there are no cycles", () => {
    assert.equal(TOURS.welcome.next, "settings-ai");
    assert.equal(TOURS["settings-ai"].next, "settings-interests");
    assert.equal(TOURS["settings-interests"].next, undefined);
    for (const tour of TOUR_LIST) {
      const seen = new Set<string>([tour.id]);
      let cursor = tour.next;
      while (cursor) {
        assert.ok(TOURS[cursor], `${tour.id}: next "${cursor}" does not exist`);
        assert.ok(!seen.has(cursor), `${tour.id}: chain loops at "${cursor}"`);
        seen.add(cursor);
        cursor = TOURS[cursor].next;
      }
    }
  });

  it("a chained tour's page is reachable by route (so the provider can navigate to it)", () => {
    for (const tour of TOUR_LIST) if (tour.next) {
      const target = TOURS[tour.next];
      assert.ok(!target.route.includes("["), `${tour.next} needs a concrete route to navigate to`);
      assert.ok(target.matches(target.route), `${tour.next}: route does not match its own matcher`);
    }
  });
});

describe("availableSteps", () => {
  const found = (present: string[]) => (name: string) => (present.includes(name) ? {} : null);

  it("drops steps whose anchor is not on screen", () => {
    const steps = availableSteps(TOURS.playlists, false, found(["pl-search", "pl-new"]));
    assert.deepEqual(steps.map((s) => s.target), ["pl-search", "pl-new"]);
  });

  it("keeps un-anchored (centered) steps", () => {
    assert.ok(availableSteps(TOURS.welcome, false, found([])).some((s) => !s.target));
  });

  it("on mobile: includes the menu step and keeps sidebar steps even though the drawer is closed", () => {
    const mobile = availableSteps(TOURS.welcome, true, found(["header-menu"]));
    assert.ok(mobile.some((s) => s.target === "header-menu"));
    assert.ok(mobile.some((s) => s.target === "nav-playlists"));
  });

  it("on desktop: skips the mobile-only menu step", () => {
    const desktop = availableSteps(TOURS.welcome, false, found(["header-menu", "nav-playlists"]));
    assert.ok(!desktop.some((s) => s.target === "header-menu"));
  });

  it("offers a tour only when two anchored steps remain", () => {
    assert.equal(isTourOfferable(TOURS.playlists, false, found(["pl-search"])), false);
    assert.equal(isTourOfferable(TOURS.playlists, false, found(["pl-search", "pl-new"])), true);
  });
});

describe("tour state", () => {
  const def = { id: "welcome" as const, version: 2 };
  const now = Date.UTC(2026, 8, 20);

  it("recordFor ignores records from an older version", () => {
    assert.equal(recordFor({ welcome: { v: 1, status: "completed" } }, def), null);
    assert.ok(recordFor({ welcome: { v: 2, status: "skipped" } }, def));
  });

  it("chip shows until the current version is completed, skipped or dismissed", () => {
    assert.equal(shouldOfferChip({}, def), true);
    assert.equal(shouldOfferChip({ welcome: { v: 1, status: "completed" } }, def), true);
    for (const status of ["completed", "skipped", "dismissed"] as const) {
      assert.equal(shouldOfferChip({ welcome: { v: 2, status } }, def), false);
    }
  });

  it("auto-runs only for new accounts that finished onboarding and never saw the tour", () => {
    const base = { records: {}, def, createdAtMs: now - 24 * 3600 * 1000, onboardingDone: true, now };
    assert.equal(shouldAutoRunWelcome(base), true);
    assert.equal(shouldAutoRunWelcome({ ...base, onboardingDone: false }), false);
    assert.equal(shouldAutoRunWelcome({ ...base, records: { welcome: { v: 2, status: "skipped" } } }), false);
    assert.equal(shouldAutoRunWelcome({ ...base, createdAtMs: now - AUTO_RUN_MAX_ACCOUNT_AGE_MS - 1 }), false);
  });

  it("never auto-runs when the account age is unknown", () => {
    assert.equal(shouldAutoRunWelcome({ records: {}, def, createdAtMs: 0, onboardingDone: true, now }), false);
  });
});
