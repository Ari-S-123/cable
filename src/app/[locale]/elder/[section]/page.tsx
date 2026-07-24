import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import type { NavigationItem } from "@/components/app-navigation";
import {
  RoleSectionPage,
  type RoleSection,
  type RoleSectionCopy,
} from "@/components/role-section-page";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/contracts";

const supportedSections = [
  "shared",
  "people",
  "activity",
  "preferences",
] as const satisfies readonly RoleSection[];

const sectionCopy: Readonly<
  Record<Locale, Record<(typeof supportedSections)[number], RoleSectionCopy>>
> = {
  "en-US": {
    shared: {
      eyebrow: "Your disclosures",
      title: "What I shared",
      description:
        "Review the exact facts, recipients, channels, purpose, and expiry attached to each permission.",
      emptyTitle: "Nothing has been shared",
      emptyBody:
        "A private check-in does not appear here. A record is shown only after a clear, version-bound consent decision.",
    },
    people: {
      eyebrow: "Care circle",
      title: "My people",
      description:
        "See active caregivers and verified provider destinations connected to your care circle.",
      emptyTitle: "No authorized people to show",
      emptyBody:
        "Live membership and verified contact records appear only after WorkOS and Convex are configured.",
    },
    activity: {
      eyebrow: "Coordination history",
      title: "Activity",
      description:
        "See redacted status changes without exposing private transcripts or hidden health details.",
      emptyTitle: "No live activity yet",
      emptyBody:
        "Completed consent, approval, and delivery state changes will be listed here in chronological order.",
    },
    preferences: {
      eyebrow: "Accessible experience",
      title: "Preferences",
      description:
        "Language, time zone, captions, contrast, motion, and text-size choices are stored with your account.",
      emptyTitle: "Live preferences are not connected",
      emptyBody:
        "The interface already honors browser accessibility settings. Account-level choices require a configured live session.",
    },
  },
  "hi-IN": {
    shared: {
      eyebrow: "आपके प्रकटीकरण",
      title: "मैंने क्या साझा किया",
      description:
        "हर अनुमति से जुड़े सटीक तथ्य, प्राप्तकर्ता, माध्यम, उद्देश्य और समाप्ति समय देखें।",
      emptyTitle: "कुछ साझा नहीं किया गया",
      emptyBody:
        "निजी चेक-इन यहाँ नहीं दिखता। स्पष्ट और संस्करण-बद्ध सहमति के बाद ही रिकॉर्ड दिखाई देता है।",
    },
    people: {
      eyebrow: "देखभाल-वृत्त",
      title: "मेरे लोग",
      description:
        "अपने देखभाल-वृत्त से जुड़े सक्रिय देखभालकर्ताओं और सत्यापित प्रदाता संपर्कों को देखें।",
      emptyTitle: "दिखाने के लिए कोई अधिकृत व्यक्ति नहीं",
      emptyBody:
        "WorkOS और Convex कॉन्फ़िगर होने के बाद ही लाइव सदस्यता और सत्यापित संपर्क दिखाई देते हैं।",
    },
    activity: {
      eyebrow: "समन्वय इतिहास",
      title: "गतिविधि",
      description:
        "निजी ट्रांसक्रिप्ट या छिपे स्वास्थ्य विवरण दिखाए बिना स्थिति में बदलाव देखें।",
      emptyTitle: "अभी कोई लाइव गतिविधि नहीं",
      emptyBody:
        "पूरी हुई सहमति, मंज़ूरी और वितरण स्थिति यहाँ समय के क्रम में दिखाई देगी।",
    },
    preferences: {
      eyebrow: "सुलभ अनुभव",
      title: "प्राथमिकताएँ",
      description:
        "भाषा, समय क्षेत्र, कैप्शन, कंट्रास्ट, गति और टेक्स्ट आकार की पसंद आपके खाते से जुड़ती है।",
      emptyTitle: "लाइव प्राथमिकताएँ जुड़ी नहीं हैं",
      emptyBody:
        "इंटरफ़ेस ब्राउज़र की सुलभता सेटिंग का पालन करता है। खाते की पसंद के लिए कॉन्फ़िगर किया हुआ लाइव सत्र चाहिए।",
    },
  },
};

/** Generates the finite locale and elder-section route set. */
export function generateStaticParams(): readonly Readonly<{
  locale: Locale;
  section: (typeof supportedSections)[number];
}>[] {
  return routing.locales.flatMap((locale) =>
    supportedSections.map((section) => ({ locale, section })),
  );
}

/** Renders one validated elder navigation destination. */
export default async function ElderSection({
  params,
}: Readonly<{
  params: Promise<{ locale: string; section: string }>;
}>) {
  const values = await params;
  if (
    !routing.locales.includes(values.locale as Locale) ||
    !supportedSections.includes(
      values.section as (typeof supportedSections)[number],
    )
  ) {
    notFound();
  }
  const locale = values.locale as Locale;
  const section = values.section as (typeof supportedSections)[number];
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
      <RoleSectionPage
        locale={locale}
        userRole="elder"
        section={section}
        copy={sectionCopy[locale][section]}
      />
    </AppShell>
  );
}
