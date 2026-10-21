import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ContextMenuProvider } from "../components/ui/ContextMenu";
import type { ReactNode } from "react";

/**
 * Global providers: one query client (short stale time — a library desk is
 * a multi-operator environment), the right-click menu, and toasts.
 */

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 8_000 } },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ContextMenuProvider>
        {children}
        <Toaster richColors position="bottom-right" />
      </ContextMenuProvider>
    </QueryClientProvider>
  );
}
