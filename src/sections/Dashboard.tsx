import { useQueryClient } from "@tanstack/react-query";
import { ScanLine, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useContextMenu } from "../components/ui/ContextMenu";
import { PageLoader } from "../components/ui/primitives";
import { dashboard, reservations } from "../data/repositories/library";
import { useQuery } from "../hooks/useLibraryQuery";
import { useUiStore } from "../store/uiStore";
import { DashboardPanels } from "./dashboard/DashboardPanels";

/**
 * Dashboard root: queries, the daily quote state and the right-click menu
 * live here; every panel is rendered by dashboard/DashboardPanels.
 */
export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showContextMenu } = useContextMenu();
  const locale = useUiStore((state) => state.preferences.locale);

  const dashQuery = useQuery({ queryKey: ["dashboard"], queryFn: dashboard });
  const resQuery = useQuery({
    queryKey: ["reservations-dashboard"],
    queryFn: reservations,
  });

  const data = dashQuery.data;
  const loading = dashQuery.isLoading;

  const readyList = (resQuery.data ?? [])
    .filter((item) => item.status === "ready")
    .slice(0, 5);

  if (loading && !data)
    return (
      <PageLoader label={t("dashboard.loading", "Preparing the dashboard…")} />
    );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the contextmenu event also fires from the keyboard menu key on this region
    <div
      onContextMenu={(event) =>
        showContextMenu(
          event,
          [
            {
              id: "refresh",
              label: t("dashboard.refresh", "Refresh dashboard data"),
              variant: "accent",
              onClick: () => {
                void queryClient.invalidateQueries();
              },
            },
            { id: "d1", divider: true },
            {
              id: "catalog",
              label: t("dashboard.gotoCatalog", "Go to catalog"),
              onClick: () => navigate("/catalog"),
            },
            {
              id: "members",
              label: t("dashboard.gotoMembers", "Go to members"),
              onClick: () => navigate("/members"),
            },
            {
              id: "res",
              label: t("dashboard.gotoReservations", "Go to reservations"),
              onClick: () => navigate("/reservations"),
            },
            {
              id: "inv",
              label: t("dashboard.gotoInventory", "Go to inventory"),
              onClick: () => navigate("/inventory"),
            },
            { id: "d2", divider: true },
            {
              id: "addmember",
              label: t("members.addMember", "Add member"),
              icon: UserPlus,
              onClick: () => navigate("/members?action=add-member"),
            },
            {
              id: "addbook",
              label: t("catalog.addBook", "Add book"),
              icon: ScanLine,
              onClick: () => navigate("/catalog?action=add-book"),
            },
          ],
          { title: t("dashboard.title", "Dashboard") },
        )
      }
    >
      <DashboardPanels data={data} locale={locale} readyList={readyList} />
    </div>
  );
}
