// The page at "/". All the interaction lives in <Dashboard />, a client component.
// Next.js still pre-renders its first view (week 10) to HTML for a fast first load.

import { Dashboard } from "@/components/Dashboard";
import { SiteFooter } from "@/components/SiteFooter";

export default function DashboardPage() {
  return (
    <>
      <Dashboard />
      <SiteFooter />
    </>
  );
}
