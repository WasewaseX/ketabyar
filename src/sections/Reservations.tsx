import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useContextMenu } from "../components/ui/ContextMenu";
import { PageLoader } from "../components/ui/primitives";
import { PageTitle } from "../components/ui/shared";
import { reservations as fetchReservations } from "../data/repositories/library";
import { useQuery } from "../hooks/useLibraryQuery";
import type { Reservation } from "../types";
import { ReservationDetailsModal } from "./reservations/ReservationDetailsModal";
import {
  ReservationsBulkBar,
  ReservationsEmpty,
  ReservationsTable,
  ReservationsToolbar,
} from "./reservations/ReservationsControls";
import { ReservationWizard } from "./reservations/ReservationWizard";
import {
  useHoldActions,
  useReservationFilters,
} from "./reservations/useReservationsData";

/** The holds shelf: staff-managed pickup requests. */
export function ReservationsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { showContextMenu } = useContextMenu();
  const queryClient = useQueryClient();

  const [term, setTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "ready" | "queued" | "cancelled"
  >("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Reservation | null>(null);
  const [expiryDraft, setExpiryDraft] = useState("");

  const resQuery = useQuery({
    queryKey: ["reservations-page"],
    queryFn: fetchReservations,
  });
  const all = resQuery.data;

  /* Deep links (?action=new-reservation, ?book_id=…) are one-shot: the wizard
    is derived from the URL so it also opens when the palette fires mid-page,
    and the param is consumed immediately so back/reload never re-fires it. */
  const wizardRequested = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (
      params.get("action") === "new-reservation" ||
      params.get("action") === "add-reservation" ||
      Boolean(params.get("book_id"))
    );
  }, [location.search]);
  const [wizardOpenState, setWizardOpenState] = useState(wizardRequested);
  const wizardOpen = wizardRequested || wizardOpenState;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("action") || params.get("book_id"))
      history.replaceState(null, "", location.pathname);
  }, [location.pathname, location.search]);

  const closeWizard = () => {
    setWizardOpenState(false);
    if (wizardRequested) navigate(location.pathname, { replace: true });
  };

  const invalidate = () => void queryClient.invalidateQueries();
  const { visible, counts } = useReservationFilters(all, term, statusFilter);
  const { act, confirmAct } = useHoldActions(t, invalidate);

  if (resQuery.isLoading)
    return <PageLoader label={t("reservations.loading", "Loading holds…")} />;

  const allSelected =
    visible.length > 0 && visible.every((item) => selectedIds.has(item.id));

  return (
    <div>
      <PageTitle
        title={t("reservations.title", "Reservations")}
        detail={t("reservations.subtitle", "The hold shelf and its queue.")}
        action={
          <button
            type="button"
            onClick={() => setWizardOpenState(true)}
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-accent-dark"
          >
            <Plus size={16} />
            {t("reservations.newReservation", "New reservation")}
          </button>
        }
      />

      <ReservationsToolbar
        term={term}
        setTerm={setTerm}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        counts={counts}
      />

      {visible.length === 0 ? (
        <ReservationsEmpty />
      ) : (
        <ReservationsTable
          visible={visible}
          allSelected={allSelected}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          onOpen={(reservation) => {
            setDetails(reservation);
            setExpiryDraft(reservation.expires_at?.slice(0, 10) ?? "");
          }}
          act={act}
          confirmAct={confirmAct}
          showContextMenu={showContextMenu}
        />
      )}

      {selectedIds.size > 0 ? (
        <ReservationsBulkBar
          visible={visible}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          invalidate={invalidate}
        />
      ) : null}

      <ReservationDetailsModal
        details={details}
        expiryDraft={expiryDraft}
        setExpiryDraft={setExpiryDraft}
        act={act}
        onClose={() => setDetails(null)}
      />

      {wizardOpen ? <ReservationWizard onClose={closeWizard} /> : null}
    </div>
  );
}
