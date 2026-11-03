// The page at "/": the authorization sandbox workbench.

import { SiteFooter } from "@/components/SiteFooter";
import { Workbench } from "@/components/workbench/Workbench";

export default function WorkbenchPage() {
  return (
    <>
      <Workbench />
      <SiteFooter />
    </>
  );
}
