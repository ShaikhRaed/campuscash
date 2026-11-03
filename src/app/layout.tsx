// The root layout wraps every page. It is the one place for the <html> and <body>
// tags, the fonts, the global stylesheet and the default page title.

import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Mono, Young_Serif } from "next/font/google";
import "./globals.css";

// next/font downloads these at build time and serves them from our own app,
// so visitors' browsers never contact Google.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  subsets: ["latin"],
  weight: "400",
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "CampusCash",
  description:
    "A student-spending demo built on simulated transactions. Portfolio project, not a financial service.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${youngSerif.variable} ${dmMono.variable} antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
