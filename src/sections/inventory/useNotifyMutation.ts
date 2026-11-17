import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type InventoryMutationOptions<TVars> = {
  mutationFn: (vars: TVars) => Promise<unknown>;
  successKey: string;
  fallback?: string;
  afterSuccess?: () => void;
};

/**
 * One wrapper for every inventory mutation: toast on success, invalidate
 * everything, surface the error message otherwise.
 */
export function useNotifyMutation<TVars>(
  options: InventoryMutationOptions<TVars>,
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries();
  return useMutation({
    mutationFn: options.mutationFn,
    onSuccess: () => {
      toast.success(t(options.successKey, options.fallback ?? "Done"));
      invalidate();
      options.afterSuccess?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Invalidate every query after a copy/shelf/room change. */
export function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries();
}
