import {
  Activity,
  CalendarDays,
  HeartHandshake,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Locale, Role } from "@/lib/contracts";

const sectionIcons = {
  activity: Activity,
  appointments: CalendarDays,
  people: Users,
  preferences: Settings2,
  settings: Settings2,
  shared: HeartHandshake,
  updates: HeartHandshake,
} as const;

/** Supported secondary role destinations rendered by the shared section view. */
export type RoleSection = keyof typeof sectionIcons;

/** Localized, synthetic-safe copy for a secondary role destination. */
export type RoleSectionCopy = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyBody: string;
}>;

/** Renders a no-data secondary surface without implying that fixtures are live records. */
export function RoleSectionPage({
  locale,
  userRole,
  section,
  copy,
}: Readonly<{
  locale: Locale;
  userRole: Role;
  section: RoleSection;
  copy: RoleSectionCopy;
}>) {
  const Icon = sectionIcons[section];
  const liveConfigured = process.env.INTEGRATION_MODE === "live";
  const boundary =
    locale === "hi-IN"
      ? "केवल सक्रिय संबंध और वर्तमान सहमति से अनुमत जानकारी यहाँ दिखाई जा सकती है।"
      : "Only information allowed by an active relationship and current consent can appear here.";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {copy.eyebrow}
          </p>
          <h1 className="mt-2 text-4xl sm:text-5xl">{copy.title}</h1>
          <p className="mt-3 max-w-2xl text-lg leading-8 text-muted-foreground">
            {copy.description}
          </p>
        </div>
        <Badge variant="outline" className="border-primary/25 bg-card">
          <ShieldCheck aria-hidden="true" />
          {liveConfigured
            ? locale === "hi-IN"
              ? "लाइव, सहमति-सीमित"
              : "Live, consent-filtered"
            : locale === "hi-IN"
              ? "कोई कृत्रिम रिकॉर्ड नहीं"
              : "No synthetic records"}
        </Badge>
      </div>

      <Card className="mt-9 border-dashed bg-card/70">
        <CardHeader>
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon aria-hidden="true" className="size-6" />
          </div>
          <CardTitle className="text-2xl">{copy.emptyTitle}</CardTitle>
          <CardDescription className="max-w-2xl text-base leading-7">
            {copy.emptyBody}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <ShieldCheck aria-hidden="true" />
            <AlertTitle>
              {userRole === "elder"
                ? locale === "hi-IN"
                  ? "आपका नियंत्रण"
                  : "You remain in control"
                : locale === "hi-IN"
                  ? "सर्वर-लागू दायरा"
                  : "Server-enforced scope"}
            </AlertTitle>
            <AlertDescription>{boundary}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
