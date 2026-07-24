import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import type { NavigationItem } from "@/components/app-navigation";
import { LiveVoiceCheckin } from "@/components/live-voice-checkin";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/contracts";

/** Authenticated live browser-voice page; deterministic mode remains isolated in `/demo`. */
export default async function ElderCheckin({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale: candidate } = await params;
  if (!routing.locales.includes(candidate as Locale)) notFound();
  const locale = candidate as Locale;
  setRequestLocale(locale);
  const t = await getTranslations("Elder");
  const base = `/${locale}/elder`;
  const items: readonly NavigationItem[] = [
    { label: t("navCheckin"), href: base, icon: "checkin" },
    { label: t("navShared"), href: `${base}/shared`, icon: "shared" },
    { label: t("navPeople"), href: `${base}/people`, icon: "people" },
    { label: t("navActivity"), href: `${base}/activity`, icon: "activity" },
    {
      label: t("navPreferences"),
      href: `${base}/preferences`,
      icon: "preferences",
    },
  ];

  return (
    <AppShell locale={locale} userRole="elder" items={items}>
      {process.env.INTEGRATION_MODE === "live" ? (
        <LiveVoiceCheckin locale={locale} />
      ) : (
        <Alert>
          <AlertTitle>
            {locale === "hi-IN"
              ? "लाइव वॉइस कॉन्फ़िगर नहीं है"
              : "Live voice is not configured"}
          </AlertTitle>
          <AlertDescription>
            {locale === "hi-IN"
              ? "कृत्रिम डेमो का उपयोग करें; यह किसी वेंडर या लाइव डेटा से नहीं जुड़ता।"
              : "Use the synthetic demo; it does not connect to a vendor or live data."}
          </AlertDescription>
        </Alert>
      )}
    </AppShell>
  );
}
