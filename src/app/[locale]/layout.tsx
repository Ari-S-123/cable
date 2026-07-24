import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { routing } from "@/i18n/routing";

/** Statically declares the two locale-prefixed route trees. */
export function generateStaticParams(): readonly Readonly<{
  locale: string;
}>[] {
  return routing.locales.map((locale) => ({ locale }));
}

/** Validates locale params and supplies typed messages to client components. */
export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
