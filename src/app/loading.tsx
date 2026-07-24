import { Skeleton } from "@/components/ui/skeleton";

/** Displays a stable, motion-free application loading state. */
export default function Loading() {
  return (
    <main
      className="mx-auto max-w-5xl space-y-6 px-4 py-12"
      aria-busy="true"
      aria-label="Loading C.A.B.L.E"
    >
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-16 w-full max-w-2xl" />
      <div className="grid gap-5 sm:grid-cols-2">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </main>
  );
}
