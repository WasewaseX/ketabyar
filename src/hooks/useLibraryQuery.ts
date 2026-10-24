import { useEffect } from "react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import type { UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * The app-wide `useQuery` — drop-in identical to tanstack's, except that a
 * FAILED query can never render as a silent empty screen.
 *
 * v1.2.4 audit finding: every section checked `isLoading` only, so a failed
 * query (disk error, locked database, engine hiccup) rendered a confidently
 * empty library with zero feedback — the same "nothing loads" experience
 * class as the v1.2.2 login deadlock. This wrapper is the single choke
 * point: every read query in the app surfaces its failure as a toast while
 * keeping the exact tanstack return contract.
 *
 * The toast fires on the idle→error transition; react-query keeps the same
 * error object across refetch failures, so a persistent error does not
 * spam toasts on every window refocus.
 */

export function useQuery<TQueryFnData = unknown, TError = Error, TData = TQueryFnData>(
  options: UseQueryOptions<TQueryFnData, TError, TData>,
): UseQueryResult<TData, TError> {
  const query = useTanstackQuery<TQueryFnData, TError, TData>(options);

  useEffect(() => {
    if (query.isError) {
      const error: unknown = query.error;
      const message = error instanceof Error && error.message ? error.message : String(error);
      toast.error(message || "خطای ناشناخته در بارگذاری داده‌ها");
    }
  }, [query.isError, query.error]);

  return query;
}
