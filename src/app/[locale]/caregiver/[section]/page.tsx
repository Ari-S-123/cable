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
  "updates",
  "appointments",
  "people",
  "activity",
  "settings",
] as const satisfies readonly RoleSection[];

const sectionCopy: Readonly<
  Record<Locale, Record<(typeof supportedSections)[number], RoleSectionCopy>>
> = {
  "en-US": {
    updates: {
      eyebrow: "Consent-scoped inbox",
      title: "Care updates",
      description:
        "Only current disclosures addressed to you appear here; private drafts and transcripts never do.",
      emptyTitle: "No updates need review",
      emptyBody:
        "New immutable disclosure versions will appear after the elder grants current, recipient-specific permission.",
    },
    appointments: {
      eyebrow: "Human-approved coordination",
      title: "Appointments",
      description:
        "Review proposed appointment coordination before any verified provider destination is contacted.",
      emptyTitle: "No appointment actions",
      emptyBody:
        "C.A.B.L.E does not book, cancel, or contact a provider without a current disclosure and explicit caregiver approval.",
    },
    people: {
      eyebrow: "Authorized relationships",
      title: "People",
      description:
        "Manage active care-circle members and allow-listed, independently verified provider contacts.",
      emptyTitle: "No live relationships to show",
      emptyBody:
        "Memberships come from WorkOS. Provider destinations must be seeded or verified before they can be selected.",
    },
    activity: {
      eyebrow: "Append-only evidence",
      title: "Activity",
      description:
        "Review redacted consent, approval, validation, and delivery transitions for this care circle.",
      emptyTitle: "No operational activity",
      emptyBody:
        "Audit entries appear after authorized live operations. Sensitive content is represented by hashes and opaque identifiers.",
    },
    settings: {
      eyebrow: "Care-circle controls",
      title: "Settings",
      description:
        "Control provider-contact permissions, alert preferences, schedules, and the circle external-action switch.",
      emptyTitle: "Live settings are unavailable",
      emptyBody:
        "Connect an authorized caregiver session before modifying care-circle configuration.",
    },
  },
  "hi-IN": {
    updates: {
      eyebrow: "सहमति-सीमित इनबॉक्स",
      title: "देखभाल अपडेट",
      description:
        "केवल आपको भेजे गए वर्तमान प्रकटीकरण यहाँ आते हैं; निजी ड्राफ्ट और ट्रांसक्रिप्ट कभी नहीं।",
      emptyTitle: "समीक्षा के लिए कोई अपडेट नहीं",
      emptyBody:
        "बुज़ुर्ग की वर्तमान, प्राप्तकर्ता-विशिष्ट अनुमति के बाद नया अपरिवर्तनीय प्रकटीकरण यहाँ दिखेगा।",
    },
    appointments: {
      eyebrow: "मानव-मंज़ूर समन्वय",
      title: "अपॉइंटमेंट",
      description:
        "किसी सत्यापित प्रदाता से संपर्क से पहले प्रस्तावित अपॉइंटमेंट समन्वय की समीक्षा करें।",
      emptyTitle: "कोई अपॉइंटमेंट कार्रवाई नहीं",
      emptyBody:
        "वर्तमान प्रकटीकरण और स्पष्ट देखभालकर्ता मंज़ूरी के बिना C.A.B.L.E बुकिंग, रद्दीकरण या संपर्क नहीं करता।",
    },
    people: {
      eyebrow: "अधिकृत संबंध",
      title: "लोग",
      description:
        "सक्रिय देखभाल-वृत्त सदस्यों और अनुमति-सूची के सत्यापित प्रदाता संपर्कों को प्रबंधित करें।",
      emptyTitle: "दिखाने के लिए कोई लाइव संबंध नहीं",
      emptyBody:
        "सदस्यता WorkOS से आती है। प्रदाता पते चुनने से पहले पहले से जोड़े या सत्यापित होने चाहिए।",
    },
    activity: {
      eyebrow: "अपरिवर्तनीय प्रमाण",
      title: "गतिविधि",
      description:
        "इस देखभाल-वृत्त की छँटी हुई सहमति, मंज़ूरी, नीति-जाँच और वितरण स्थिति देखें।",
      emptyTitle: "कोई संचालन गतिविधि नहीं",
      emptyBody:
        "अधिकृत लाइव कार्रवाई के बाद ऑडिट प्रविष्टियाँ दिखेंगी। संवेदनशील सामग्री हैश और अपारदर्शी पहचान से दर्शाई जाती है।",
    },
    settings: {
      eyebrow: "देखभाल-वृत्त नियंत्रण",
      title: "सेटिंग",
      description:
        "प्रदाता संपर्क अनुमति, अलर्ट पसंद, समय-सारिणी और बाहरी कार्रवाई स्विच नियंत्रित करें।",
      emptyTitle: "लाइव सेटिंग उपलब्ध नहीं हैं",
      emptyBody:
        "देखभाल-वृत्त कॉन्फ़िगरेशन बदलने से पहले अधिकृत देखभालकर्ता सत्र जोड़ें।",
    },
  },
};

/** Generates the finite locale and caregiver-section route set. */
export function generateStaticParams(): readonly Readonly<{
  locale: Locale;
  section: (typeof supportedSections)[number];
}>[] {
  return routing.locales.flatMap((locale) =>
    supportedSections.map((section) => ({ locale, section })),
  );
}

/** Renders one validated caregiver navigation destination. */
export default async function CaregiverSection({
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

  return (
    <AppShell locale={locale} userRole="caregiver" items={items}>
      <RoleSectionPage
        locale={locale}
        userRole="caregiver"
        section={section}
        copy={sectionCopy[locale][section]}
      />
    </AppShell>
  );
}
