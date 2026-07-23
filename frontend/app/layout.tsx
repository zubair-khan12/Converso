import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Converso — Voice AI for every business",
  description:
    "Build, ground, and deploy AI voice agents that answer the phone, know your business, and book the meeting.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn(display.variable, body.variable, "font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  );
}
