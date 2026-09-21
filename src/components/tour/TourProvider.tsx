"use client";

// driver.js ships light-only CSS; the theme overrides live in globals.css (.driver-popover.sl-tour).
import "driver.js/dist/driver.css";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { deleteField, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";
import { db } from "@/lib/firebase";
import { trackLearningEvent } from "@/lib/analytics";
import { availableSteps, isDialogOpen, isMobileViewport, isTourOfferable, prefersReducedMotion, visibleTourEl } from "@/lib/tour/dom";
import { readMirror, recordFor, shouldAutoRunWelcome, writeMirror } from "@/lib/tour/tourState";
import { TOURS, TOUR_LIST } from "@/lib/tour/tours";
import type { TourDef, TourId, TourRecordLike, TourStatus } from "@/lib/tour/types";

interface TourContextValue {
  /** Start a tour. `force` re-runs a finished tour; from another page it navigates first. */
  startTour: (id: TourId, opts?: { force?: boolean }) => void;
  /** True when this tour's chip should be shown on the current page (offerable + not yet seen). */
  isOffered: (id: TourId) => boolean;
  dismiss: (id: TourId) => void;
  resetAll: () => Promise<void>;
  activeTourId: TourId | null;
}

const TourContext = React.createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = React.useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toMillis(value: unknown): number {
  const v = value as { toMillis?: () => number } | undefined;
  return typeof v?.toMillis === "function" ? v.toMillis() : 0;
}

/** Waits until the first anchored, non-drawer step is on screen (pages render data asynchronously). */
async function waitForAnchors(def: TourDef, timeoutMs = 2000): Promise<boolean> {
  const first = def.steps.find((s) => s.target && s.needs !== "sidebar" && !s.mobileOnly);
  if (!first?.target) return true;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (visibleTourEl(first.target)) return true;
    await sleep(120);
  }
  return !!visibleTourEl(first.target);
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [records, setRecords] = React.useState<Record<string, TourRecordLike | undefined>>({});
  const [activeTourId, setActiveTourId] = React.useState<TourId | null>(null);
  // Bumped to make isOffered() re-evaluate after the page has rendered its anchors.
  const [, setTick] = React.useState(0);

  const driverRef = React.useRef<{ destroy: () => void; isActive: () => boolean } | null>(null);
  const silentDestroyRef = React.useRef(false);
  const pendingRef = React.useRef<TourId | null>(null);
  const autoTriedRef = React.useRef<Set<string>>(new Set());
  // `run` is defined before `startTour`; a ref lets a finished tour chain into the next one.
  const startTourRef = React.useRef<(id: TourId, opts?: { force?: boolean }) => void>(() => {});

  // Merge profile-stored records with the localStorage mirror (mirror wins when newer/exists).
  React.useEffect(() => {
    if (!user || !profile) return;
    const merged: Record<string, TourRecordLike | undefined> = {};
    for (const def of TOUR_LIST) {
      const remote = profile.tours?.[def.id] as TourRecordLike | undefined;
      const local = readMirror(user.uid, def.id);
      merged[def.id] = local ?? remote;
    }
    setRecords(merged);
  }, [user, profile]);

  const persist = React.useCallback(
    async (def: TourDef, status: TourStatus, step: number) => {
      if (!user) return;
      const record: TourRecordLike = { v: def.version, status, step };
      setRecords((current) => ({ ...current, [def.id]: record }));
      writeMirror(user.uid, def.id, record);
      try {
        await updateDoc(doc(db, "users", user.uid), { [`tours.${def.id}`]: { ...record, at: serverTimestamp() } });
      } catch {
        /* the mirror keeps it for this device; never block the UI on a tour write */
      }
      if (status !== "dismissed") {
        void trackLearningEvent(user.uid, status === "completed" ? "tour_completed" : "tour_skipped", { tourId: def.id, step });
      }
    },
    [user],
  );

  const closeDrawer = () => window.dispatchEvent(new CustomEvent("sl:sidebar", { detail: "close" }));
  const openDrawer = () => window.dispatchEvent(new CustomEvent("sl:sidebar", { detail: "open" }));

  const destroyActive = React.useCallback((silent: boolean) => {
    const d = driverRef.current;
    if (!d) return;
    silentDestroyRef.current = silent;
    try { d.destroy(); } catch { /* already gone */ }
  }, []);

  const run = React.useCallback(
    async (def: TourDef) => {
      if (!user || isDialogOpen()) return false;
      const isMobile = isMobileViewport();
      const steps = availableSteps(def, isMobile);
      if (steps.filter((s) => s.target).length < 2 && def.id !== "welcome") return false;
      if (steps.length === 0) return false;

      destroyActive(true);
      const { driver } = await import("driver.js");

      let finished = false;
      let lastIndex = 0;

      // Moves to another step, opening/closing the mobile drawer around sidebar steps.
      const goTo = async (d: ReturnType<typeof driver>, from: number, to: number) => {
        if (isMobile) {
          const needsNow = steps[to]?.needs === "sidebar";
          const hadBefore = steps[from]?.needs === "sidebar";
          if (needsNow && !hadBefore) { openDrawer(); await sleep(300); }
          else if (!needsNow && hadBefore) { closeDrawer(); await sleep(220); }
        }
        d.moveTo(to);
      };

      const d = driver({
        steps: steps.map((s) => ({
          element: s.target ? () => visibleTourEl(s.target!) as Element : undefined,
          popover: { title: s.title, description: s.body, side: s.side, align: s.align },
        })),
        showProgress: true,
        progressText: "{{current}} of {{total}}",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: def.doneLabel ?? "Done",
        allowClose: true,
        stagePadding: 6,
        stageRadius: 10,
        popoverClass: "sl-tour",
        skipMissingElement: true,
        animate: !prefersReducedMotion(),
        smoothScroll: !prefersReducedMotion(),
        onHighlighted: (_el, _step, opts) => { lastIndex = opts.index ?? lastIndex; },
        onNextClick: (_el, _step, opts) => {
          if (opts.index === undefined) return;
          void goTo(opts.driver, opts.index, opts.index + 1);
        },
        onPrevClick: (_el, _step, opts) => {
          if (opts.index === undefined || opts.index === 0) return;
          void goTo(opts.driver, opts.index, opts.index - 1);
        },
        onDoneClick: (_el, _step, opts) => {
          finished = true;
          void persist(def, "completed", lastIndex);
          opts.driver.destroy();
          // The final button can lead into the next tour (welcome → AI settings → interests).
          // Closing with ✕/Esc never chains: that is the user saying "stop".
          if (def.next) startTourRef.current(def.next, { force: true });
        },
        onDestroyed: () => {
          driverRef.current = null;
          setActiveTourId(null);
          if (isMobile) closeDrawer();
          const silent = silentDestroyRef.current;
          silentDestroyRef.current = false;
          // Closing with ✕ / Esc / overlay counts as "skipped"; navigating away or replacing
          // the tour is silent (the user didn't decide anything).
          if (!finished && !silent) void persist(def, "skipped", lastIndex);
        },
      });

      driverRef.current = d;
      setActiveTourId(def.id);
      void trackLearningEvent(user.uid, "tour_started", { tourId: def.id, steps: steps.length });
      d.drive();
      return true;
    },
    [user, destroyActive, persist],
  );

  const startTour = React.useCallback(
    (id: TourId, opts?: { force?: boolean }) => {
      const def = TOURS[id];
      if (!opts?.force && recordFor(records, def)) return;
      if (isDialogOpen()) { toast.info("Close the open dialog first, then start the tour."); return; }
      if (!def.matches(pathname)) {
        // Wrong page: go there, and start once it has rendered (see the pathname effect below).
        pendingRef.current = id;
        router.push(def.route.includes("[") ? "/dashboard" : def.route);
        return;
      }
      void (async () => {
        await waitForAnchors(def);
        if (!(await run(def)) ) toast.info("There's nothing to tour on this page yet.");
      })();
    },
    [records, pathname, router, run],
  );

  startTourRef.current = startTour;

  // Leaving the page ends any running tour (its anchors are gone); then start a pending one.
  // Depends on `pathname` ONLY (through refs): re-running when `run`/`user` identity changes
  // would destroy a tour that is in progress.
  const runRef = React.useRef(run);
  runRef.current = run;
  React.useEffect(() => {
    destroyActive(true);
    const pending = pendingRef.current;
    if (pending && TOURS[pending].matches(pathname)) {
      pendingRef.current = null;
      void (async () => {
        await waitForAnchors(TOURS[pending]);
        await runRef.current(TOURS[pending]);
      })();
    }
    // Chips depend on anchors that appear after render.
    const t1 = setTimeout(() => setTick((n) => n + 1), 600);
    const t2 = setTimeout(() => setTick((n) => n + 1), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Welcome tour: auto-runs once for new accounts that finished onboarding, on the dashboard.
  React.useEffect(() => {
    if (!user || !profile || pathname !== "/dashboard") return;
    if (new URLSearchParams(window.location.search).has("notour")) return;
    const def = TOURS.welcome;
    if (autoTriedRef.current.has(user.uid)) return;
    const ok = shouldAutoRunWelcome({
      records,
      def,
      createdAtMs: toMillis(profile.createdAt),
      onboardingDone: !!profile.onboardingCompletedAt,
      now: Date.now(),
    });
    if (!ok) return;
    autoTriedRef.current.add(user.uid);
    // No cancel-on-cleanup here: `records` changes right after the profile loads and would cancel
    // this before it ever ran (and autoTriedRef would then block a retry). Instead re-check that
    // we are still on the dashboard once the waits are over.
    void (async () => {
      await sleep(700); // let first paint + the dashboard's data settle
      if (window.location.pathname !== "/dashboard") return;
      await waitForAnchors(def);
      if (window.location.pathname === "/dashboard" && !driverRef.current) await run(def);
    })();
  }, [user, profile, pathname, records, run]);

  const isOffered = React.useCallback(
    (id: TourId) => {
      const def = TOURS[id];
      if (!def.matches(pathname) || recordFor(records, def)) return false;
      if (activeTourId) return false;
      return isTourOfferable(def, isMobileViewport());
    },
    [pathname, records, activeTourId],
  );

  const dismiss = React.useCallback((id: TourId) => { void persist(TOURS[id], "dismissed", 0); }, [persist]);

  const resetAll = React.useCallback(async () => {
    if (!user) return;
    destroyActive(true);
    TOUR_LIST.forEach((def) => writeMirror(user.uid, def.id, null));
    setRecords({});
    try { await updateDoc(doc(db, "users", user.uid), { tours: deleteField() }); } catch { /* ignore */ }
  }, [user, destroyActive]);

  // Never leave an overlay behind if the provider unmounts (e.g. sign-out).
  React.useEffect(() => () => destroyActive(true), [destroyActive]);

  const value = React.useMemo<TourContextValue>(
    () => ({ startTour, isOffered, dismiss, resetAll, activeTourId }),
    [startTour, isOffered, dismiss, resetAll, activeTourId],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

