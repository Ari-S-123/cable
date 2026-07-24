import type { ReactNode } from "react";

import {
  AppNavigation,
  type NavigationItem,
} from "@/components/app-navigation";
import { SkipLink } from "@/components/skip-link";
import type { Locale, Role } from "@/lib/contracts";

/** Provides responsive role navigation and a constrained reading canvas. */
export function AppShell({
  locale,
  userRole,
  items,
  children,
}: Readonly<{
  locale: Locale;
  userRole: Role;
  items: readonly NavigationItem[];
  children: ReactNode;
}>) {
  return (
    <div className="min-h-screen">
      <SkipLink
        label={locale === "hi-IN" ? "मुख्य सामग्री पर जाएँ" : undefined}
      />
      <AppNavigation locale={locale} userRole={userRole} items={items} />
      <main
        id="main-content"
        className="reflow-safe px-4 py-8 sm:px-6 md:ml-64 md:px-10 md:py-12"
      >
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
