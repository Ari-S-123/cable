import { ArrowLeft, FileQuestion } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Handles unknown routes without revealing whether protected resources exist. */
export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-2xl place-items-center px-4 py-12 text-center">
      <div>
        <FileQuestion
          aria-hidden="true"
          className="mx-auto size-12 text-primary"
        />
        <h1 className="mt-6 text-4xl">Page unavailable</h1>
        <p className="mt-3 text-muted-foreground">
          The address is invalid, or this account is not allowed to view it.
        </p>
        <Button asChild className="mt-7">
          <Link href="/en-US">
            <ArrowLeft aria-hidden="true" />
            Return home
          </Link>
        </Button>
      </div>
    </main>
  );
}
