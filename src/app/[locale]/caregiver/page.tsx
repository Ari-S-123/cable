import { Inbox, LockKeyhole, ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import type { NavigationItem } from "@/components/app-navigation";
import {
  CaregiverCopilot,
  type CareWorkspaceState,
} from "@/components/caregiver-copilot";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/contracts";

const emptyWorkspace: CareWorkspaceState = {
  careEventId: "none",
  eventVersion: 0,
  consentCoverage: { status: "missing", recipientLabels: [], channels: [] },
  proposals: [],
};

/** Consent-filtered caregiver inbox with optional proposal-only CopilotKit UI. */
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
  const liveConfigured = process.env.INTEGRATION_MODE === "live";

  return (
    <CaregiverCopilot enabled={liveConfigured} workspace={emptyWorkspace}>
      <AppShell locale={locale} userRole="caregiver" items={items}>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Caregiver workspace
            </p>
            <h1 className="mt-2 text-4xl sm:text-5xl">{t("title")}</h1>
            <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-primary/25 bg-card px-3 py-1"
          >
            <LockKeyhole aria-hidden="true" />
            Consent-filtered
          </Badge>
        </div>

        <div className="mt-9 grid gap-5 sm:grid-cols-3">
          {[
            ["Needs review", "0"],
            ["Waiting for elder", "0"],
            ["Delivery attention", "0"],
          ].map(([label, count]) => (
            <Card key={label}>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 font-display text-4xl">{count}</p>
                </div>
                <Inbox aria-hidden="true" className="size-6 text-primary" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Alert className="mt-6 border-primary/20 bg-card p-6">
          <ShieldCheck aria-hidden="true" className="size-5" />
          <AlertTitle>{t("emptyTitle")}</AlertTitle>
          <AlertDescription>{t("emptyBody")}</AlertDescription>
        </Alert>
      </AppShell>
    </CaregiverCopilot>
  );
}
