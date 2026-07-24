import { defineRouting } from "next-intl/routing";

/** Supported application locales, intentionally limited to reviewed MVP flows. */
export const locales = ["en-US", "hi-IN"] as const;

/** Locale-aware route configuration shared by navigation and request parsing. */
export const routing = defineRouting({
  locales,
  defaultLocale: "en-US",
  localePrefix: "always",
});

/** Locale supported by the C.A.B.L.E MVP. */
export type AppLocale = (typeof locales)[number];
