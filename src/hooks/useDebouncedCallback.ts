"use client";
import * as React from "react";

/** Debounces a callback (e.g. autosave for notes/summary) to avoid a
 *  Firestore write on every keystroke. */
export function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, delayMs = 800) {
  const fnRef = React.useRef(fn);
  fnRef.current = fn;
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout>>();

  return React.useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => fnRef.current(...args), delayMs);
    },
    [delayMs]
  );
}
