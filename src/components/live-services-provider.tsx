"use client";

import {
  AuthKitProvider,
  useAccessToken,
  useAuth,
} from "@workos-inc/authkit-nextjs/components";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

/** Adapts the AuthKit Next.js hooks to Convex's authenticated-client contract. */
function useAuthFromAuthKit() {
  const { user, loading: authLoading } = useAuth();
  const { getAccessToken, loading: tokenLoading } = useAccessToken();
  const fetchAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      return (await getAccessToken()) ?? null;
    } catch {
      return null;
    }
  }, [getAccessToken]);
  return useMemo(
    () => ({
      isLoading: authLoading || tokenLoading,
      isAuthenticated: user !== null,
      fetchAccessToken,
    }),
    [authLoading, fetchAccessToken, tokenLoading, user],
  );
}

/** Supplies live AuthKit identity and its fresh access token to Convex React. */
export function LiveServicesProvider({
  convexUrl,
  children,
}: Readonly<{ convexUrl: string; children: ReactNode }>) {
  const [convex] = useState(() => new ConvexReactClient(convexUrl));
  return (
    <AuthKitProvider>
      <ConvexProviderWithAuth client={convex} useAuth={useAuthFromAuthKit}>
        {children}
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}
