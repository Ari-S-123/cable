import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import type { NavigationItem } from "@/components/app-navigation";
import { AppShell } from "@/components/app-shell";
import { LiveCaregiverWorkspace } from "@/components/live-caregiver-workspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/contracts";

/** Authenticated, consent-filtered caregiver workspace backed by live Convex data. */
export default async function CaregiverHome({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale: candidate } = await params;
  if (!routing.locales.includes(candidate as Locale)) notFound();
  const locale = candidate as Locale;
  setRequestLocale(locale);
  const t = await getTranslations("Caregiver");
  const base = `/${locale}/caregiver`;
  const items: readonly NavigationItem[] = [
    { label: t("navToday"), href: base, icon: "today" },
    { label: t("navUpdates"), href: `${base}/updates`, icon: "updates" },
    {
      label: t("navAppointments"),
      href: `${base}/appointments`,
      icon: "appointments",
    },
    { label: t("navPeople"), href: `${base}/people`, icon: "people" },
    { label: t("navActivity"), href: `${base}/activity`, icon: "activity" },
    { label: t("navSettings"), href: `${base}/settings`, icon: "preferences" },
  ];
  if (
    process.env.INTEGRATION_MODE !== "live" ||
    process.env.NEXT_PUBLIC_CONVEX_URL === undefined
  ) {
    return (
      <AppShell locale={locale} userRole="caregiver" items={items}>
        <Alert>
          <AlertTitle>Live services are not configured</AlertTitle>
          <AlertDescription>
            Set INTEGRATION_MODE=live and configure the WorkOS and Convex
            variables to use this authenticated workspace. The synthetic demo
            remains available at /{locale}/demo.
          </AlertDescription>
        </Alert>
      </AppShell>
    );
  }
  return (
    <LiveCaregiverWorkspace
      locale={locale}
      items={items}
      globalActionsEnabled={process.env.EXTERNAL_ACTIONS_ENABLED === "true"}
      twilioEnabled={process.env.TWILIO_ENABLED === "true"}
    />
  );
}
