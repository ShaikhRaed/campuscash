"use client";

// The "remote control" for the simulated semester. It holds no data itself: it
// shows what it is told and reports button presses to its parent.

import type { SimulatedProfile } from "@/data/profiles";

interface TimelineControlsProps {
  profiles: SimulatedProfile[];
  profileId: string;
  week: number;
  totalWeeks: number;
  isPlaying: boolean;
  eventCount: number;
  duplicatesIgnored: number;
  onProfileChange: (id: string) => void;
  onWeekChange: (week: number) => void;
  onTogglePlay: () => void;
  onReplay: () => void;
  onRedeliver: () => void;
}

const buttonClass =
  "rounded-sm border border-ink px-3 py-1.5 text-sm font-medium transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-soft disabled:hover:bg-transparent";

export function TimelineControls({
  profiles,
  profileId,
  week,
  totalWeeks,
  isPlaying,
  eventCount,
  duplicatesIgnored,
  onProfileChange,
  onWeekChange,
  onTogglePlay,
  onReplay,
  onRedeliver,
}: TimelineControlsProps) {
  return (
    <section
      aria-label="Semester timeline controls"
      className="rounded-sm border border-rule bg-surface p-4"
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <label className="text-sm">
          <span className="block font-medium">Simulated student</span>
          <select
            value={profileId}
            onChange={(e) => onProfileChange(e.target.value)}
            className="mt-1 rounded-sm border border-ink bg-surface px-2 py-1.5"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.student.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={week <= 1}
            onClick={() => onWeekChange(week - 1)}
          >
            Back
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={week >= totalWeeks}
            onClick={() => onWeekChange(week + 1)}
          >
            Next week
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!isPlaying && week >= totalWeeks}
            onClick={onTogglePlay}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button type="button" className={buttonClass} onClick={onReplay}>
            Replay from week 1
          </button>
        </div>

        <label className="min-w-48 flex-1 text-sm">
          <span className="flex justify-between font-medium">
            <span>Timeline</span>
            <span className="font-mono tabular-nums">
              Week {week} of {totalWeeks}
            </span>
          </span>
          <input
            type="range"
            min={1}
            max={totalWeeks}
            value={week}
            onChange={(e) => onWeekChange(Number(e.target.value))}
            className="mt-2 w-full accent-forest"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3 text-sm">
        <p aria-live="polite" className="text-ink-soft">
          <span className="font-mono tabular-nums">{eventCount}</span> events
          applied ·{" "}
          <span className="font-mono tabular-nums">{duplicatesIgnored}</span>{" "}
          duplicates ignored
        </p>
        <button
          type="button"
          onClick={onRedeliver}
          className="font-medium underline underline-offset-4"
        >
          Simulate a double delivery of this week
        </button>
      </div>
    </section>
  );
}
