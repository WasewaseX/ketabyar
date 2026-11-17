import { useTranslation } from "react-i18next";
import {
  AreaChartCard,
  BarChartCard,
  PieChartCard,
  reportConditionLabel,
  reportMemberStatusLabel,
  reportRoleLabel,
  reportStatusLabel,
} from "./ReportsShared";

type Datum = { name: string; value: number };
type Labelled = { label: string; n: number };
type ChartRefs = (key: string, element: HTMLDivElement | null) => void;

/** Inventory tab: copy status, condition health, category share, formats. */
export function InventoryCharts({
  copyStatusData,
  conditionsData,
  inventoryCategoriesData,
  itemTypesData,
  registerChart,
}: {
  copyStatusData: Labelled[];
  conditionsData: Labelled[];
  inventoryCategoriesData: Datum[];
  itemTypesData: Datum[];
  registerChart: ChartRefs;
}) {
  const { t } = useTranslation();
  return (
    <>
      <BarChartCard
        name="copyStatusDist"
        registerChart={registerChart}
        title={t("reports.charts.copyStatusDist", "Copy status distribution")}
        data={copyStatusData.map((row) => ({
          name: reportStatusLabel(t, row.label),
          value: row.n,
        }))}
        xKey="name"
        bars={[
          {
            dataKey: "value",
            fill: "var(--color-accent)",
            barSize: 26,
          },
        ]}
      />
      <BarChartCard
        name="conditionHealth"
        registerChart={registerChart}
        title={t("reports.charts.conditionHealth", "Condition health")}
        data={conditionsData.map((row) => ({
          name: reportConditionLabel(t, row.label),
          value: row.n,
        }))}
        xKey="name"
        bars={[
          {
            dataKey: "value",
            fill: "#c06b3e",
            barSize: 26,
          },
        ]}
      />
      <BarChartCard
        name="categoryShare"
        registerChart={registerChart}
        title={t("reports.charts.categoryShare", "Inventory by category")}
        data={inventoryCategoriesData}
        xKey="name"
        layout="vertical"
        bars={[
          {
            dataKey: "value",
            fill: "#2f5d8a",
            barSize: 18,
            radius: [0, 6, 6, 0],
          },
        ]}
      />
      <BarChartCard
        name="formatHoldingsCount"
        registerChart={registerChart}
        title={t("reports.charts.formatHoldingsCount", "Holdings by format")}
        data={itemTypesData}
        xKey="name"
        bars={[
          {
            dataKey: "value",
            fill: "#6d3fa8",
            barSize: 28,
          },
        ]}
      />
    </>
  );
}

/** Members tab: roles, active departments, member status, joins over time. */
export function MembersCharts({
  rolesData,
  activeDepartments,
  memberStatusData,
  memberJoinsData,
  registerChart,
}: {
  rolesData: Datum[];
  activeDepartments: { name: string; count: number }[];
  memberStatusData: Datum[];
  memberJoinsData: { name: string; joins: number }[];
  registerChart: ChartRefs;
}) {
  const { t } = useTranslation();
  return (
    <>
      <BarChartCard
        name="membersByRole"
        registerChart={registerChart}
        title={t("reports.charts.membersByRole", "Members by role")}
        data={rolesData.map((row) => ({
          name: reportRoleLabel(t, row.name),
          value: row.value,
        }))}
        xKey="name"
        bars={[
          {
            dataKey: "value",
            fill: "var(--color-accent)",
            barSize: 26,
          },
        ]}
      />
      <BarChartCard
        name="activeDepts"
        registerChart={registerChart}
        title={t("reports.charts.activeDepts", "Most active departments")}
        data={activeDepartments}
        xKey="name"
        layout="vertical"
        bars={[
          {
            dataKey: "count",
            fill: "#c06b3e",
            barSize: 18,
            radius: [0, 6, 6, 0],
          },
        ]}
      />
      <PieChartCard
        name="memberStatus"
        registerChart={registerChart}
        title={t("reports.charts.memberStatus", "Member status")}
        data={memberStatusData.map((row) => ({
          name: reportMemberStatusLabel(t, row.name),
          value: row.value,
        }))}
      />
      <AreaChartCard
        name="memberJoins"
        registerChart={registerChart}
        title={t("reports.charts.memberJoins", "New members over time")}
        data={memberJoinsData}
        xKey="name"
        seriesKey="joins"
        color="#1b9277"
        gradientId="gradJoins"
        tickFontSize={10}
      />
    </>
  );
}
