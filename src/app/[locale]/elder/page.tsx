import {
  CalendarClock,
  ChevronRight,
  LockKeyhole,
  MessageSquareText,
  Mic,
  ShieldCheck,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import type { NavigationItem } from "@/components/app-navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/contracts";

/** Large-control elder home that does not expose any synthetic event as live data. */
export default async function ElderHome({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale: candidate } = await params;
  if (!routing.locales.includes(candidate as Locale)) notFound();
  const locale = candidate as Locale;
  setRequestLocale(locale);
  const t = await getTranslations("Elder");
  const c = await getTranslations("Common");
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
  const liveConfigured = process.env.INTEGRATION_MODE === "live";

  return (
    <AppShell locale={locale} userRole="elder" items={items}>
      <div className="elder-surface">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <Badge variant="outline" className="mb-4 border-primary/30 bg-card">
              <LockKeyhole aria-hidden="true" />
              {c("private")}
            </Badge>
            <h1 className="text-4xl sm:text-5xl">{t("title")}</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
        </div>

        <Card className="mt-9 border-primary/20 bg-primary text-primary-foreground shadow-xl shadow-primary/10">
          <CardContent className="grid gap-7 p-7 sm:p-9 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">
                {t("privacyTitle")}
              </p>
              <h2 className="mt-3 text-3xl text-primary-foreground sm:text-4xl">
                {t("start")}
              </h2>
              <p className="mt-3 max-w-xl text-base leading-7 text-primary-foreground/80">
                {t("privacyBody")}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="min-h-14 px-7 text-base"
              >
                <Link
                  href={liveConfigured ? `${base}/check-in` : `/${locale}/demo`}
                >
                  <Mic aria-hidden="true" className="size-5" />
                  {t("start")}
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
              >
                <Link
                  href={
                    liveConfigured
                      ? `${base}/check-in?mode=text`
                      : `/${locale}/demo`
                  }
                >
                  <MessageSquareText aria-hidden="true" />
                  {t("textAlternative")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CalendarClock
                  aria-hidden="true"
                  className="size-5 text-primary"
                />
                <Badge variant="secondary">
                  {liveConfigured ? "Live" : c("synthetic")}
                </Badge>
              </div>
              <CardDescription>{t("nextCheckin")}</CardDescription>
              <CardTitle className="text-2xl">
                {liveConfigured ? t("nextCheckinValue") : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <ShieldCheck
                  aria-hidden="true"
                  className="size-5 text-primary"
                />
                <ChevronRight
                  aria-hidden="true"
                  className="size-5 text-muted-foreground"
                />
              </div>
              <CardDescription>{t("lastOutcome")}</CardDescription>
              <CardTitle className="text-2xl">
                {t("lastOutcomeValue")}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Alert className="mt-6 p-5">
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>{c("notEmergency")}</AlertTitle>
          <AlertDescription>
            {liveConfigured
              ? t("privacyBody")
              : locale === "hi-IN"
                ? "लाइव सेवा कॉन्फ़िगर नहीं है। ऊपर का बटन सुरक्षित कृत्रिम डेमो खोलता है।"
                : "Live services are not configured. The button opens the isolated synthetic demo."}
          </AlertDescription>
        </Alert>
      </div>
    </AppShell>
  );
}
