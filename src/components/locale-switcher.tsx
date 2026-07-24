import { Languages } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/contracts";

/** Links to the equivalent route in the other supported locale. */
export function LocaleSwitcher({
  locale,
  pathname,
}: Readonly<{ locale: Locale; pathname: string }>) {
  const nextLocale = locale === "en-US" ? "hi-IN" : "en-US";
  const suffix = pathname.replace(/^\/(?:en-US|hi-IN)/u, "");
  return (
    <Button asChild variant="ghost" size="sm">
      <Link
        href={`/${nextLocale}${suffix}`}
        hrefLang={nextLocale}
        aria-label={locale === "en-US" ? "हिंदी में देखें" : "View in English"}
      >
        <Languages aria-hidden="true" />
        {locale === "en-US" ? "हिंदी" : "English"}
      </Link>
    </Button>
  );
}
