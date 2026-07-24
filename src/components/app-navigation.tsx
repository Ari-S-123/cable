"use client";

import {
  Activity,
  CalendarDays,
  CheckCircle2,
  HeartHandshake,
  Menu,
  MessageCircleHeart,
  Settings2,
  Users,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { Locale, Role } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const iconMap = {
  checkin: Volume2,
  shared: HeartHandshake,
  people: Users,
  activity: Activity,
  preferences: Settings2,
  today: CheckCircle2,
  updates: MessageCircleHeart,
  appointments: CalendarDays,
} as const;

/** A single role-specific navigation destination. */
export type NavigationItem = Readonly<{
  label: string;
  href: string;
  icon: keyof typeof iconMap;
}>;

/** Shared role navigation rendered as a desktop rail and accessible mobile sheet. */
export function AppNavigation({
  locale,
  userRole,
  items,
}: Readonly<{
  locale: Locale;
  userRole: Role;
  items: readonly NavigationItem[];
}>) {
  const pathname = usePathname();
  const roleLabel =
    userRole === "elder"
      ? locale === "hi-IN"
        ? "बुज़ुर्ग अनुभव"
        : "Elder experience"
      : "Caregiver workspace";

  const links = (
    <nav aria-label={roleLabel} className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = iconMap[item.icon];
        const current = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              current
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon aria-hidden="true" className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar/95 px-4 py-6 backdrop-blur md:flex md:flex-col">
        <Link href={`/${locale}`} aria-label="C.A.B.L.E home">
          <BrandMark />
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {roleLabel}
        </p>
        <div className="mt-8 flex-1">{links}</div>
        <LocaleSwitcher locale={locale} pathname={pathname} />
      </aside>

      <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:hidden">
        <Link href={`/${locale}`} aria-label="C.A.B.L.E home">
          <BrandMark className="[&>span:last-child]:text-base" />
        </Link>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label={locale === "hi-IN" ? "मेनू खोलें" : "Open menu"}
            >
              <Menu aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-[min(88vw,22rem)] bg-sidebar p-5"
          >
            <SheetHeader className="text-left">
              <SheetTitle>{roleLabel}</SheetTitle>
              <SheetDescription>
                {locale === "hi-IN"
                  ? "अपना C.A.B.L.E क्षेत्र चुनें।"
                  : "Choose a C.A.B.L.E area."}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6">{links}</div>
            <div className="mt-6 border-t pt-4">
              <LocaleSwitcher locale={locale} pathname={pathname} />
            </div>
          </SheetContent>
        </Sheet>
      </header>
    </>
  );
}
