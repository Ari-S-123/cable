import { Link2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** Renders the compact C.A.B.L.E chain-link identity. */
export function BrandMark({ className }: Readonly<{ className?: string }>) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
        <Link2 aria-hidden="true" className="size-4" />
      </span>
      <span className="font-display text-xl tracking-[0.16em]">C.A.B.L.E</span>
    </span>
  );
}
