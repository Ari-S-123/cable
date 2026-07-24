import {
  ArrowRight,
  Check,
  Languages,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { withAuth } from "@workos-inc/authkit-nextjs";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SkipLink } from "@/components/skip-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { routing } from "@/i18n/routing";
import { RoleSchema, type Locale } from "@/lib/contracts";

/** Creates localized landing metadata without indexing the synthetic prototype. */
export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const { locale } = await params;
  if (!routing.locales.includes(locale as Locale)) return {};
  const translations = await getTranslations({ locale, namespace: "Landing" });
  return {
    title: translations("metaTitle"),
    description: translations("metaDescription"),
  };
}

/** Warm editorial landing page explaining the three independent decisions. */
export default async function LandingPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale: candidate } = await params;
  if (!routing.locales.includes(candidate as Locale)) notFound();
  const locale = candidate as Locale;
  setRequestLocale(locale);
  const t = await getTranslations("Landing");
  const authentication =
    process.env.INTEGRATION_MODE === "live" ? await withAuth() : undefined;
  const parsedRole = RoleSchema.safeParse(authentication?.role);
  const role = parsedRole.success ? parsedRole.data : undefined;
  const workspaceHref = role === undefined ? undefined : `/${locale}/${role}`;
  const hasIncompleteMembership =
    authentication?.user !== null &&
    authentication?.user !== undefined &&
    (authentication.organizationId === undefined || role === undefined);
  const decisions = [
    {
      index: "01",
      title: t("confirmTitle"),
      body: t("confirmBody"),
      icon: Check,
    },
    {
      index: "02",
      title: t("consentTitle"),
      body: t("consentBody"),
      icon: LockKeyhole,
    },
    {
      index: "03",
      title: t("approveTitle"),
      body: t("approveBody"),
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="paper-grain min-h-screen overflow-hidden">
      <SkipLink
        label={locale === "hi-IN" ? "मुख्य सामग्री पर जाएँ" : undefined}
      />
      <header className="mx-auto flex min-h-20 max-w-7xl items-center justify-between px-4 sm:px-8">
        <BrandMark />
        <div className="flex items-center gap-2">
          <LocaleSwitcher locale={locale} pathname={`/${locale}`} />
          {authentication?.user === null || authentication === undefined ? (
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              {/* OAuth initiation requires a document navigation, not Next.js RSC navigation. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/login">{t("signIn")}</a>
            </Button>
          ) : (
            <>
              {workspaceHref !== undefined ? (
                <Button asChild className="hidden sm:inline-flex">
                  <Link href={workspaceHref}>{t("openWorkspace")}</Link>
                </Button>
              ) : null}
              <form action="/logout" method="post">
                <Button type="submit" variant="outline">
                  <LogOut aria-hidden="true" />
                  {t("signOut")}
                </Button>
              </form>
            </>
          )}
        </div>
      </header>

      <main id="main-content" className="reflow-safe">
        {hasIncompleteMembership ? (
          <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-8">
            <Alert className="border-destructive/40 bg-destructive/5 p-5">
              <ShieldCheck aria-hidden="true" className="size-5" />
              <AlertTitle>{t("membershipRequiredTitle")}</AlertTitle>
              <AlertDescription>
                {t("membershipRequiredBody", {
                  email: authentication.user.email,
                })}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}
        <section className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-12 sm:px-8 lg:grid-cols-[1.12fr_0.88fr] lg:items-center lg:py-24">
          <div className="relative z-10 max-w-3xl">
            <Badge
              variant="outline"
              className="mb-6 border-primary/30 bg-card/70 px-3 py-1 text-primary"
            >
              <Sparkles aria-hidden="true" />
              {t("eyebrow")}
            </Badge>
            <h1 className="max-w-4xl text-5xl leading-[0.98] sm:text-6xl lg:text-7xl">
              {t("headline")}
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              {t("subhead")}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="shadow-lg shadow-primary/10">
                <Link href={`/${locale}/demo`}>
                  {t("openDemo")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={workspaceHref ?? `/${locale}/elder`}>
                  {workspaceHref === undefined
                    ? t("exploreElder")
                    : t("openWorkspace")}
                </Link>
              </Button>
            </div>
            <p className="mt-5 flex items-start gap-2 text-sm text-muted-foreground">
              <LockKeyhole
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
              {t("reassurance")}
            </p>
          </div>

          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute -inset-16 -z-10 rounded-full bg-accent/10 blur-3xl"
            />
            <Card className="rotate-[1.5deg] border border-border/70 bg-card/85 py-0 shadow-2xl shadow-foreground/10 backdrop-blur">
              <CardContent className="p-7 sm:p-9">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                      {t("sampleLabel")}
                    </p>
                    <h2 className="mt-2 text-3xl">{t("sampleTitle")}</h2>
                  </div>
                  <div className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Languages aria-hidden="true" className="size-6" />
                  </div>
                </div>
                <div className="mt-8 rounded-2xl bg-secondary/60 p-5">
                  <p lang="hi-IN" className="font-devanagari text-lg leading-8">
                    “मंगलवार की अपॉइंटमेंट मेरी सवारी के समय से टकरा रही है।”
                  </p>
                </div>
                <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  {t("exactTranslation")}
                  <span className="h-px flex-1 bg-border" />
                </div>
                <div className="rounded-2xl border bg-background/80 p-5">
                  <p className="text-base leading-7">
                    “My Tuesday appointment conflicts with my ride.”
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge variant="secondary">{t("consentBound")}</Badge>
                    <Badge variant="outline">SHA-256</Badge>
                    <Badge variant="outline">en-US</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="border-y bg-card/55">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-8 lg:py-20">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                {t("methodEyebrow")}
              </p>
              <h2 className="mt-3 text-4xl sm:text-5xl">{t("methodTitle")}</h2>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border bg-border lg:grid-cols-3">
              {decisions.map((decision) => (
                <article
                  key={decision.index}
                  className="min-h-64 bg-background p-7 sm:p-8"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-2xl text-muted-foreground">
                      {decision.index}
                    </span>
                    <decision.icon
                      aria-hidden="true"
                      className="size-5 text-primary"
                    />
                  </div>
                  <h3 className="mt-10 text-2xl">{decision.title}</h3>
                  <p className="mt-3 leading-7 text-muted-foreground">
                    {decision.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-8">
          <Alert className="border-accent/40 bg-accent/10 p-5">
            <ShieldCheck aria-hidden="true" className="size-5" />
            <AlertTitle>{t("safetyTitle")}</AlertTitle>
            <AlertDescription>{t("safetyBody")}</AlertDescription>
          </Alert>
        </section>
      </main>
    </div>
  );
}
