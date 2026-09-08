export type WatchProgressIndicatorState = "none" | "partial" | "complete";

export interface WatchProgressIndicator {
  state: WatchProgressIndicatorState;
  percent: number;
  label: string;
  icon: "check" | "none";
}

export function getWatchProgressIndicator(watchedPercentage: number): WatchProgressIndicator {
  const percent = Math.max(0, Math.min(100, Number.isFinite(watchedPercentage) ? watchedPercentage : 0));

  if (percent >= 100) {
    return {
      state: "complete",
      percent: 100,
      label: "100%",
      icon: "check",
    };
  }

  if (percent > 0) {
    return {
      state: "partial",
      percent,
      label: `${percent}%`,
      icon: "none",
    };
  }

  return {
    state: "none",
    percent: 0,
    label: "0%",
    icon: "none",
  };
}
