import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";
import { cn } from "@/lib/utils";

/* Inter for everything you read and operate — it was drawn for screen UI, and
   its wide weight range keeps labels, body copy and data on one family.
   Plus Jakarta Sans carries the headings: geometric enough to feel like a
   product brand, humanist enough not to fight Inter underneath it. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Converso — AI voice and chat agents for every business",
  description:
    "Build, ground, and deploy AI agents that answer your phone and the chat on your website, know your business, and book the meeting.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn(inter.variable, jakarta.variable, "font-sans")}>
      <body>{children}</body>
    </html>
  );
}
