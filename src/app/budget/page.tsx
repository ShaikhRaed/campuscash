import type { Metadata } from "next";
import { Dashboard } from "@/components/Dashboard";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = { title: "Budget timeline · CampusCash" };

export default function BudgetPage() {
  return (
    <>
      <Dashboard />
      <SiteFooter />
    </>
  );
}
