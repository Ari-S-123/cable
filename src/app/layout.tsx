import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Geist, Newsreader, Noto_Sans_Devanagari } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { LiveServicesProvider } from "@/components/live-services-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { LocaleSchema } from "@/lib/contracts";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "C.A.B.L.E",
    template: "%s | C.A.B.L.E",
  },
  description: "Consent-first multilingual voice care coordination prototype.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f0df",
};

/**
 * Provides document-wide fonts, metadata, and visual foundation.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const requestedLocale = (await headers()).get("x-cable-locale");
  const parsedLocale = LocaleSchema.safeParse(requestedLocale);
  const locale = parsedLocale.success ? parsedLocale.data : "en-US";
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const content =
    process.env.INTEGRATION_MODE === "live" && convexUrl !== undefined ? (
      <LiveServicesProvider convexUrl={convexUrl}>
        {children}
      </LiveServicesProvider>
    ) : (
      children
    );
  return (
    <html
      lang={locale}
      className={`${geist.variable} ${newsreader.variable} ${devanagari.variable}`}
      suppressHydrationWarning
    >
      <body>
        <TooltipProvider>{content}</TooltipProvider>
        <Toaster position="bottom-center" richColors />
      </body>
    </html>
  );
}
