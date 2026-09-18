"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Thin top-of-page progress bar for Next.js App Router client-side
 * navigation (sidebar/nav links), similar to Vercel's own dashboard.
 *
 * Next 14's App Router doesn't expose route-change events directly, so
 * this listens for clicks on same-origin, same-tab <a> links anywhere in
 * the app, starts the bar immediately (before the click even resolves),
 * and finishes it once `usePathname()` reports the new route. This is
 * navigation-only feedback — in-page action buttons use the `loading`
 * prop on <Button> instead (see components/ui/button.tsx), so the rest of
 * the page stays interactive and there's no global overlay.
 */
export function RouteProgressBar() {
  const pathname = usePathname();
  const [visible, setVisible] = React.useState(false);
  const [width, setWidth] = React.useState(0);
  const timersRef = React.useRef<number[]>([]);

  const clearTimers = React.useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }, []);

  const start = React.useCallback(() => {
    clearTimers();
    setVisible(true);
    setWidth(8);
    timersRef.current.push(window.setTimeout(() => setWidth(35), 60));
    timersRef.current.push(window.setTimeout(() => setWidth(58), 250));
    timersRef.current.push(window.setTimeout(() => setWidth(75), 700));
  }, [clearTimers]);

  // Route changed -> whatever navigation was in flight is done.
  React.useEffect(() => {
    clearTimers();
    setWidth((w) => (w > 0 ? 100 : w));
    const hide = window.setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 200);
    timersRef.current.push(hide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  React.useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      let node = event.target as HTMLElement | null;
      while (node && node.tagName !== "A") node = node.parentElement;
      const anchor = node as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      start();
    }

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      clearTimers();
    };
  }, [start, clearTimers]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5">
      <div
        className="h-full bg-accent transition-[width] duration-300 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
