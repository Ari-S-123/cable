import "server-only";

import { parseServerEnvironment } from "@/lib/env/schema";

/** Lazily validates server environment variables without breaking secret-free builds. */
export function getServerEnvironment(): ReturnType<
  typeof parseServerEnvironment
> {
  return parseServerEnvironment(process.env);
}
