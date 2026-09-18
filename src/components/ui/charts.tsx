"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Dependency-free SVG charts.
 *
 * Recharts isn't installed, and the roadmap only suggested it as an option
 * ("or whatever this app already uses elsewhere — check first"). This app
 * uses none, so rather than add a ~100KB dependency for three small visuals,
 * these are plain SVG built against the existing design tokens (accent /
 * secondary / border), which also means they inherit the light/dark themes
 * for free instead of needing a Recharts theme override.
 *
 * All three are presentational and take pre-computed numbers — no data
 * fetching, no date math — so they stay trivially testable and reusable.
 */

// ── Sparkline: trend over time (weekly activity) ────────────────────────────

export function Sparkline({
  values,
  labels,
  height = 48,
  className,
  ariaLabel,
}: {
  values: number[];
  labels?: string[];
  height?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const width = 100;
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => ({
    x: index * stepX,
    y: height - (value / max) * (height - 6) - 3,
  }));

  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-12 w-full"
        role="img"
        aria-label={ariaLabel ?? "Trend over time"}
      >
        <polygon points={area} className="fill-accent/15" />
        <polyline
          points={line}
          fill="none"
          className="stroke-accent"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={1.6} className="fill-accent" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {labels && (
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          {labels.map((label, i) => <span key={i}>{label}</span>)}
        </div>
      )}
    </div>
  );
}

// ── Bar chart: comparison across categories ─────────────────

export interface BarDatum {
  label: string;
  value: number;
  /** Optional secondary value rendered as the lighter track behind the bar —
   *  used for "watched vs total" so a bar reads as progress, not just a count. */
  total?: number;
}

export function BarChart({
  data,
  max,
  className,
  ariaLabel,
  formatValue,
}: {
  data: BarDatum[];
  max?: number;
  className?: string;
  ariaLabel?: string;
  formatValue?: (value: number) => string;
}) {
  const computedMax = Math.max(1, ...data.map((d) => Math.max(d.value, d.total ?? 0)));
  const ceiling = max ?? computedMax;

  return (
    <div className={cn("space-y-2", className)} role="img" aria-label={ariaLabel ?? "Comparison by category"}>
      {data.map((datum) => {
        const percent = Math.min(100, Math.round((datum.value / ceiling) * 100));
        const totalPercent = datum.total ? Math.min(100, Math.round((datum.total / ceiling) * 100)) : null;
        return (
          <div key={datum.label} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">{datum.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatValue ? formatValue(datum.value) : datum.value}
                {datum.total ? ` / ${datum.total}` : ""}
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
              {totalPercent !== null && (
                <div className="absolute inset-y-0 left-0 rounded-full bg-border" style={{ width: `${totalPercent}%` }} />
              )}
              <div className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Donut: completion split ─────────────────

export function DonutChart({
  segments,
  size = 132,
  thickness = 14,
  centerLabel,
  centerSubLabel,
  className,
  ariaLabel,
}: {
  segments: Array<{ label: string; value: number; className?: string }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSubLabel?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  // Precompute each arc's dash offset so the ring renders in one pass.
  let consumed = 0;
  const arcs = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const fraction = total > 0 ? segment.value / total : 0;
      const arc = {
        ...segment,
        dash: fraction * circumference,
        offset: -consumed * circumference,
        fraction,
      };
      consumed += fraction;
      return arc;
    });

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0 -rotate-90"
        role="img"
        aria-label={ariaLabel ?? "Completion breakdown"}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className="stroke-secondary"
        />
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={thickness}
            strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
            strokeDashoffset={arc.offset}
            strokeLinecap="butt"
            className={arc.className ?? "stroke-accent"}
          />
        ))}
      </svg>

      <div className="min-w-0 space-y-1.5">
        {centerLabel && (
          <div>
            <p className="text-2xl font-semibold leading-none">{centerLabel}</p>
            {centerSubLabel && <p className="mt-1 text-[11px] text-muted-foreground">{centerSubLabel}</p>}
          </div>
        )}
        <ul className="space-y-1">
          {segments.map((segment) => (
            <li key={segment.label} className="flex items-center gap-2 text-xs">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", segment.className ?? "bg-accent")} />
              <span className="truncate text-muted-foreground">{segment.label}</span>
              <span className="ml-auto shrink-0 tabular-nums font-medium">{segment.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
