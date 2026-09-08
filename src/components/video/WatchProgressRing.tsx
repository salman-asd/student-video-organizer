import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const GREEN = "#22c55e";
const GREEN_SOFT = "rgba(34, 197, 94, 0.18)";
const YELLOW = "#facc15";
const YELLOW_SOFT = "rgba(250, 204, 21, 0.18)";

export function WatchProgressRing({
  watchedPercentage,
  size = 28,
  className,
}: {
  watchedPercentage: number;
  size?: number;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, Number.isFinite(watchedPercentage) ? watchedPercentage : 0));
  const showRing = percent > 0;
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (percent / 100) * circumference;

  if (!showRing) return null;

  const isComplete = percent >= 100;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full border border-white/70 bg-background/90 shadow-sm backdrop-blur-sm",
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={isComplete ? "Video watched" : `${percent}% watched`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isComplete ? GREEN_SOFT : YELLOW_SOFT}
          strokeWidth="4"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isComplete ? GREEN : YELLOW}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 180ms ease" }}
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        {isComplete ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={3} />
        ) : (
          <span className="text-[8px] font-semibold leading-none text-foreground">{Math.round(percent)}%</span>
        )}
      </div>
    </div>
  );
}
