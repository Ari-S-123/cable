import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DemoExperience } from "@/components/demo/demo-experience";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/contracts";
import { getDemoScenarios } from "@/lib/demo/scenarios";

export const metadata: Metadata = {
  title: "Synthetic Hindi-to-English demo",
  description:
    "A deterministic, browser-only C.A.B.L.E consent and approval demonstration.",
};

/** Renders deterministic fixtures into a browser-only state machine with no live adapters. */
export default async function DemoPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale: candidate } = await params;
  if (!routing.locales.includes(candidate as Locale)) notFound();
  return (
    <DemoExperience
      locale={candidate as Locale}
      scenarios={getDemoScenarios()}
    />
  );
}
