// Small shared pieces for the workbench.

import type { ReactNode } from "react";
import type { ProcessResult } from "@/lib/authorization/processProposal";
import type { sandboxState } from "@/lib/authorization/demoRuntime";
import type { Decision } from "@/lib/policy/purchasePolicy";

export type SandboxState = NonNullable<ReturnType<typeof sandboxState>>;
export type EvaluationResult = ProcessResult["body"];

export interface Attempt {
  label: string;
  status: number;
  result: EvaluationResult;
}

export const buttonClass =
  "rounded-sm border border-ink-soft bg-surface px-2.5 py-1 text-sm hover:bg-forest-soft disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-soft disabled:hover:bg-surface";
export const primaryButtonClass =
  "rounded-sm bg-forest-deep px-3 py-1.5 text-sm font-medium text-white hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50";
export const fieldClass =
  "mt-0.5 w-full rounded-sm border border-ink-soft bg-surface px-2 py-1 text-sm";

export function Panel({
  step,
  title,
  note,
  children,
  id,
}: {
  step?: number;
  title: string;
  note?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} aria-label={title} className="rounded-sm border border-rule bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-rule bg-paper px-3 py-1.5">
        <h2 className="text-sm font-semibold">
          {step !== undefined && <span className="mr-1.5 font-mono text-ink-soft">{step}.</span>}
          {title}
        </h2>
        {note && <p className="text-xs text-ink-soft">{note}</p>}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function FieldTable({ rows }: { rows: [label: string, value: ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-0.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-soft">{label}</dt>
          <dd className="min-w-0 font-mono text-[13px] break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const DECISION_CLASS: Record<Decision | "REJECTED", string> = {
  ALLOW: "bg-forest text-white",
  CHALLENGE: "bg-marigold text-ink",
  DENY: "bg-pennant text-white",
  REJECTED: "bg-ink-soft text-white",
};

export function DecisionBadge({ decision, large }: { decision: Decision | null; large?: boolean }) {
  const label = decision ?? "REJECTED";
  return (
    <span
      className={`inline-block rounded-sm font-mono font-medium ${large ? "px-3 py-1 text-xl" : "px-1.5 text-xs"} ${DECISION_CLASS[label]}`}
    >
      {label}
    </span>
  );
}

/** Keeps long values readable without hiding that they exist. */
export const shorten = (value: string | null | undefined, keep = 12) =>
  !value ? "–" : value.length > keep ? `${value.slice(0, keep)}…` : value;
