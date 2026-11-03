// The top of every page: a notice that the data is simulated, and navigation that keeps
// the main sandbox separate from the experiments.

import Link from "next/link";
import type { StudentProfile } from "@/lib/types";

const SECTIONS = [
  { id: "workbench", label: "Workbench", href: "/" },
  { id: "budget", label: "Budget timeline", href: "/budget" },
  { id: "how-it-works", label: "How it works", href: "/how-it-works" },
  { id: "review", label: "Anomaly model", href: "/review", experiment: true },
  { id: "ask", label: "Campus Q&A", href: "/ask", experiment: true },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

interface MastheadProps {
  student?: StudentProfile;
  current: SectionId;
}

export function Masthead({ student, current }: MastheadProps) {
  return (
    <header>
      <p className="bg-forest-deep px-4 py-1.5 text-center text-[13px] text-white">
        Simulated demo. Every student, merchant and transaction here is made up. No real accounts
        are connected, nothing is bought and no money moves.
      </p>

      <div className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-baseline justify-between gap-x-8 gap-y-1 px-4 pt-3 sm:px-6">
          <p className="font-mono text-sm font-medium">
            CampusCash <span className="font-normal text-ink-soft">/ authorization sandbox</span>
          </p>
          {student && (
            <p className="text-sm text-ink-soft">
              Simulated student: <span className="font-medium text-ink">{student.name}</span>
            </p>
          )}
          <nav aria-label="Main" className="w-full">
            <ul className="-mb-px mt-1 flex flex-wrap gap-x-5 text-sm">
              {SECTIONS.map((section) => {
                const isCurrent = section.id === current;
                return (
                  <li key={section.id}>
                    <Link
                      href={section.href}
                      aria-current={isCurrent ? "page" : undefined}
                      className={`inline-block border-b-2 py-2 ${isCurrent ? "border-ink font-medium" : "border-transparent text-ink-soft hover:text-ink"}`}
                    >
                      {section.label}
                      {"experiment" in section && (
                        <span className="ml-1.5 font-mono text-[10px] text-ink-soft uppercase">Experiment</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}
