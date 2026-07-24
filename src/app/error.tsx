"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Renders a redacted recoverable error without exposing provider or request details. */
export default function ApplicationError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    const correlation = error.digest ?? "client-boundary";
    console.error("C.A.B.L.E render failure", { correlation });
  }, [error]);

  return (
    <main className="mx-auto grid min-h-[70vh] max-w-2xl place-items-center px-4 py-12">
      <Alert variant="destructive" className="p-6">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>That screen could not be loaded</AlertTitle>
        <AlertDescription className="mt-2">
          No action was sent. Try the screen again; contact the demo operator if
          the problem continues.
        </AlertDescription>
        <Button className="mt-5" variant="outline" onClick={reset}>
          Try again
        </Button>
      </Alert>
    </main>
  );
}
