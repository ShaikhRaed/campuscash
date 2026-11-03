// The top of every page: a notice that the data is simulated, the logo, the sample
// student, and navigation.

import Link from "next/link";
import type { StudentProfile } from "@/lib/types";

const SECTIONS = [
  { id: "dashboard", label: "Dashboard", href: "/" },
  { id: "review", label: "Review", href: "/review" },
  { id: "ask", label: "Ask", href: "/ask" },
  { id: "how-it-works", label: "How it works", href: "/how-it-works" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

interface MastheadProps {
  student?: StudentProfile;
  current: SectionId;
}

export function Masthead({ student, current }: MastheadProps) {
  return (
    <header>
      <p className="bg-ink px-4 py-2 text-center text-[13px] text-paper">
        Simulated demo. Every student, merchant and transaction here is made up.
        No real accounts are connected and no money moves.
      </p>

      <div className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 pt-5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-7 w-7 shrink-0"
            >
              <rect x="3" y="1.5" width="2.2" height="21" rx="1" fill="#16261e" />
              <path d="M5.2 3.5 22 9 5.2 14.5z" fill="#b5381a" />
            </svg>
            <span className="font-display text-2xl">CampusCash</span>
          </div>

          {student && (
            <p className="text-sm text-ink-soft">
              Sample student:{" "}
              <span className="font-semibold text-ink">{student.name}</span>
              <span className="hidden sm:inline">
                {" "}
                · {student.year}, {student.major}
              </span>
            </p>
          )}

          <nav aria-label="Main" className="w-full">
            <ul className="-mb-px flex items-end gap-5 text-sm sm:items-baseline sm:gap-7">
              {SECTIONS.map((section) => {
                const isCurrent = section.id === current;
                return (
                  <li key={section.id}>
                    <Link
                      href={section.href}
                      aria-current={isCurrent ? "page" : undefined}
                      className={`inline-block border-b-2 pb-3 ${isCurrent ? "border-pennant font-semibold" : "border-transparent text-ink-soft hover:text-ink"}`}
                    >
                      {section.label}
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
