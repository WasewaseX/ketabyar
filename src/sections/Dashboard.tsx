import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowLeft, BookCopy, BookOpen, Clock3, RotateCcw, ScanLine, UserPlus, UsersRound,
  CalendarPlus, UserCog,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { dashboard, reservations } from "../data/repositories/library";
import { useAuthStore } from "../store/authStore";
import { useUiStore } from "../store/uiStore";
import { useContextMenu } from "../components/ui/ContextMenu";
import { PageLoader } from "../components/ui/primitives";
import { ArtClock, ArtMedal, ArtQuill, ArtReading } from "../components/ui/art";
import { daysLate, formatDisplayDate } from "../utils/dates";
import { cn } from "../utils/cn";

/**
 * The operator's landing page: today's shape of the library — counts, the
 * circulation rhythm, the overdue priority queue, ready holds, and the
 * collection snapshot.
 */

const DAILY_QUOTES = [
  { quote: "کتابخانه، حافظهٔ یک ملت است.", translation: "" },
  { quote: "A room without books is like a body without a soul.", translation: "Cicero" },
  { quote: "خواندن، دریاست برای اندیشیدن.", translation: "" },
  { quote: "There is no friend as loyal as a book.", translation: "Hemingway" },
  { quote: "کتاب بهترین یارِ خاموش است.", translation: "" },
];

function Panel({ title, subtitle, viewAll, onNavigate, children, className }: {
  title: string;
  subtitle?: string;
  viewAll?: string;
  onNavigate?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-[300px] flex-col rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]", className)}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold">{title}</p>
          {subtitle ? <p className="text-[11px] text-ink/50 dark:text-ivory/50">{subtitle}</p> : null}
        </div>
        {viewAll && onNavigate ? (
          <button onClick={onNavigate} className="flex shrink-0 items-center gap-1 text-xs font-bold text-accent hover:underline dark:text-accent-dark">
            {viewAll}
            <ArrowLeft size={12} className="rtl:block ltr:hidden" />
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function LoanThumb({ cover, title, dark }: { cover?: string | null; title: string; dark?: boolean }) {
  return cover ? (
    <img src={cover} alt="" className="h-10 w-8 shrink-0 rounded-md object-cover shadow-sm" />
  ) : (
    <span className={cn("flex h-10 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-[8px] font-bold", dark ? "bg-[#17211f] text-white/70" : "bg-accent/15 text-accent dark:text-accent-dark")}>
      {title.slice(0, 10)}
    </span>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showContextMenu } = useContextMenu();
  const user = useAuthStore((state) => state.user);
  const locale = useUiStore((state) => state.preferences.locale);

  const dashQuery = useQuery({ queryKey: ["dashboard"], queryFn: dashboard });
  const resQuery = useQuery({ queryKey: ["reservations-dashboard"], queryFn: reservations });

  const data = dashQuery.data;
  const loading = dashQuery.isLoading;

  const quote = DAILY_QUOTES[Math.floor(Date.now() / 86_400_000) % DAILY_QUOTES.length];
  const readyList = (resQuery.data ?? []).filter((item) => item.status === "ready").slice(0, 5);

  const activityData = (data?.activity ?? []).map((point) => ({
    day: new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : locale === "ar" ? "ar-DZ" : "en-US", { weekday: "short", day: "numeric", month: "short" }).format(new Date(point.date)),
    checkouts: point.count,
  }));

  const rhythm = (data?.circulationRhythm ?? []).map((slot) => ({ ...slot }));
  const onLoan = data?.onLoan ?? 0;
  const copies = data?.copies ?? 0;
  const utilisation = copies > 0 ? Math.min(100, Math.round((onLoan / copies) * 100)) : 0;
  const pct = (n: number) => `${copies > 0 ? Math.min(100, Math.round((n / copies) * 100)) : 0}%`;

  if (loading && !data) return <PageLoader label={t("dashboard.loading", "Preparing the dashboard…")} />;

  const metrics = [
    { icon: BookOpen, value: data?.titles ?? 0, label: t("dashboard.metrics.titles", "Titles"), sub: t("dashboard.metrics.registered", "registered"), tone: "accent", danger: false },
    { icon: BookCopy, value: copies, label: t("dashboard.metrics.copies", "Copies"), sub: t("dashboard.metrics.physical", "physical items"), tone: "copper", danger: false },
    { icon: RotateCcw, value: onLoan, label: t("dashboard.metrics.borrowed", "On loan"), sub: t("dashboard.metrics.activeLoans", "active loans"), tone: "copper", danger: false },
    { icon: UsersRound, value: data?.members ?? 0, label: t("dashboard.metrics.members", "Members"), sub: t("dashboard.metrics.activeAccounts", "active accounts"), tone: "accent", danger: false },
    { icon: Clock3, value: data?.overdue ?? 0, label: t("dashboard.metrics.overdue", "Overdue"), sub: t("dashboard.metrics.attention", "need attention"), tone: "danger", danger: (data?.overdue ?? 0) > 0 },
  ];

  return (
    <div
      onContextMenu={(event) =>
        showContextMenu(event, [
          { id: "refresh", label: t("dashboard.refresh", "Refresh dashboard data"), variant: "accent", onClick: () => { void queryClient.invalidateQueries(); } },
          { id: "d1", divider: true },
          { id: "catalog", label: t("dashboard.gotoCatalog", "Go to catalog"), onClick: () => navigate("/catalog") },
          { id: "members", label: t("dashboard.gotoMembers", "Go to members"), onClick: () => navigate("/members") },
          { id: "res", label: t("dashboard.gotoReservations", "Go to reservations"), onClick: () => navigate("/reservations") },
          { id: "inv", label: t("dashboard.gotoInventory", "Go to inventory"), onClick: () => navigate("/inventory") },
          { id: "d2", divider: true },
          { id: "addmember", label: t("members.addMember", "Add member"), icon: UserPlus, onClick: () => navigate("/members?action=add-member") },
          { id: "addbook", label: t("catalog.addBook", "Add book"), icon: ScanLine, onClick: () => navigate("/catalog?action=add-book") },
        ], { title: t("dashboard.title", "Dashboard") })
      }
    >
      {/* Greeting */}
      <div className="relative mb-5 overflow-hidden rounded-[var(--radius-card)] border border-ink/8 bg-white p-6 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
        <div className="pointer-events-none absolute -end-10 -top-16 h-56 w-72 rounded-full bg-accent/10 blur-2xl dark:bg-accent-dark/15" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold">
              {t("dashboard.welcome", "Welcome back, {{name}}", { name: user?.full_name ?? t("nav.role", "Librarian") })}
            </h1>
            <p className="mt-1 text-sm text-ink/55 dark:text-ivory/55">{t("dashboard.subtitle", "Here is the library's pulse today.")}</p>
          </div>
          <div className="max-w-xs rounded-2xl bg-ivory px-4 py-3 text-center dark:bg-white/5">
            <p className="text-[13px] font-semibold leading-relaxed">{quote.quote}</p>
            {quote.translation ? <p className="mt-1 text-[10px] text-copper">— {quote.translation}</p> : null}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", metric.danger ? "bg-red-600/10 text-red-600" : metric.tone === "accent" ? "bg-accent/10 text-accent dark:text-accent-dark" : "bg-copper/12 text-copper")}>
              <metric.icon size={17} />
            </span>
            <p className="mt-3 font-display text-2xl font-bold tabular-nums">{metric.value.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}</p>
            <p className="text-xs font-semibold">{metric.label}</p>
            <p className="text-[10px] text-ink/45 dark:text-ivory/45">{metric.sub}</p>
          </div>
        ))}
      </div>

      {/* Panels */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Panel title={t("dashboard.circulationRhythm", "Circulation rhythm")} subtitle={t("dashboard.rhythmHelp", "Checkouts vs returns, 8 to 18")}>
          <ResponsiveContainer width="100%" height="88%">
            <AreaChart data={rhythm} margin={{ left: -25, right: 6, top: 6 }}>
              <defs>
                <linearGradient id="gradCheckouts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a4d40" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#1a4d40" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradReturns" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c06b3e" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#c06b3e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "currentColor", opacity: 0.55 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 11 }} />
              <Area type="monotone" dataKey="checkouts" stroke="var(--color-accent)" strokeWidth={2} fill="url(#gradCheckouts)" />
              <Area type="monotone" dataKey="returns" stroke="#c06b3e" strokeWidth={2} fill="url(#gradReturns)" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title={t("dashboard.recentBorrowings", "Recent borrowings")} viewAll={t("dashboard.viewAll", "View all")} onNavigate={() => navigate("/loans")}>
          {(data?.recentLoans?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 opacity-70">
              <ArtReading />
              <p className="text-xs text-ink/50 dark:text-ivory/50">{t("dashboard.noActiveLoans", "No loans yet today")}</p>
            </div>
          ) : (
            <ul className="flex-1 space-y-2 overflow-y-auto">
              {(data?.recentLoans ?? []).slice(0, 5).map((loan) => (
                <li key={loan.id}>
                  <button className="flex w-full items-center gap-2.5 rounded-xl p-1.5 text-start hover:bg-ink/5 dark:hover:bg-white/5" onClick={() => navigate("/loans")}>
                    <LoanThumb cover={loan.cover_path} title={loan.title ?? ""} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{loan.title}</span>
                      <span className="block text-[11px] text-ink/50 dark:text-ivory/50">
                        {t("circulation.barcode", "Barcode")}: {loan.barcode} · {loan.member_name}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t("dashboard.overdueQueue", "Overdue priority queue")} viewAll={t("dashboard.manageOverdue", "Manage")} onNavigate={() => navigate("/loans")}>
          {(data?.overdueLoans?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 opacity-70">
              <ArtMedal />
              <p className="text-xs text-ink/50 dark:text-ivory/50">{t("dashboard.noOverdueLoans", "Nothing overdue. Well run!")}</p>
            </div>
          ) : (
            <ul className="flex-1 space-y-2 overflow-y-auto">
              {(data?.overdueLoans ?? []).slice(0, 5).map((loan) => (
                <li key={loan.id}>
                  <button className="flex w-full items-center gap-2.5 rounded-xl p-1.5 text-start hover:bg-ink/5 dark:hover:bg-white/5" onClick={() => navigate("/loans")}>
                    <LoanThumb cover={loan.cover_path} title={loan.title ?? ""} dark />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{loan.title}</span>
                      <span className="block text-[11px] text-ink/50 dark:text-ivory/50">{loan.member_name} · {formatDisplayDate(loan.due_at)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-600/10 px-2 py-0.5 text-[10px] font-bold text-red-600">
                      <AlertTriangle size={10} />
                      {t("dashboard.daysLate", "{{count}}d late", { count: daysLate(loan.due_at) })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t("dashboard.reservationsReady", "Ready for pickup")} viewAll={t("dashboard.goHoldShelf", "Hold shelf")} onNavigate={() => navigate("/reservations")}>
          {readyList.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 opacity-70">
              <ArtClock />
              <p className="text-xs text-ink/50 dark:text-ivory/50">{t("dashboard.noHoldsReady", "No holds waiting on the shelf")}</p>
            </div>
          ) : (
            <ul className="flex-1 space-y-2 overflow-y-auto">
              {readyList.map((item) => (
                <li key={item.id}>
                  <button className="flex w-full items-center gap-2.5 rounded-xl p-1.5 text-start hover:bg-ink/5 dark:hover:bg-white/5" onClick={() => navigate("/reservations")}>
                    <span className="flex h-10 w-8 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent dark:text-accent-dark"><BookOpen size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{item.title}</span>
                      <span className="block text-[11px] text-ink/50 dark:text-ivory/50">{item.member_name}</span>
                    </span>
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent dark:text-accent-dark">{t("dashboard.ready", "Ready")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t("dashboard.activityOverview", "Activity overview")} className="xl:col-span-2">
          <ResponsiveContainer width="100%" height="88%">
            <AreaChart data={activityData} margin={{ left: -25, right: 6, top: 6 }}>
              <defs>
                <linearGradient id="gradActivity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c06b3e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#c06b3e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.55 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 11 }} />
              <Area type="monotone" dataKey="checkouts" stroke="#c06b3e" strokeWidth={2.5} fill="url(#gradActivity)" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title={t("dashboard.collectionSnapshot", "Collection snapshot")} subtitle={t("dashboard.snapshotHelp", "Where the physical stock is right now")}>
          <ul className="flex-1 space-y-3 pt-1">
            {[
              { label: t("dashboard.snapshotAvailable", "Available"), value: Math.max(copies - onLoan, 0), tone: "bg-accent dark:bg-accent-dark" },
              { label: t("dashboard.snapshotOnLoan", "On loan"), value: onLoan, tone: "bg-copper" },
              { label: t("dashboard.snapshotOnHold", "On hold"), value: readyList.length, tone: "bg-[#2f5d8a]" },
              { label: t("dashboard.snapshotOverdue", "Overdue"), value: data?.overdue ?? 0, tone: "bg-red-500" },
            ].map((bar) => (
              <li key={bar.label}>
                <div className="mb-1 flex justify-between text-[11px] font-semibold">
                  <span>{bar.label}</span>
                  <span className="tabular-nums text-ink/55 dark:text-ivory/55">{bar.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink/8 dark:bg-white/10">
                  <div className={cn("h-full rounded-full transition-all", bar.tone)} style={{ width: pct(bar.value) }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="border-t border-ink/8 pt-2 text-[11px] text-ink/50 dark:border-white/8 dark:text-ivory/50">
            {t("dashboard.snapshotUtilisation", "Utilisation")}: {utilisation}%
          </p>
        </Panel>

        <Panel title={t("dashboard.quickActions", "Quick actions")}>
          <div className="relative flex-1">
            <div className="pointer-events-none absolute -bottom-4 -start-4 opacity-25"><ArtQuill className="h-24" /></div>
            <div className="grid h-full grid-cols-2 gap-2">
              <ActionCard icon={ScanLine} label={t("dashboard.scanIsbn", "Scan ISBN")} sub={t("dashboard.addBook", "Add a book")} onClick={() => navigate("/catalog?action=add-book")} />
              <ActionCard icon={UserPlus} label={t("dashboard.addMember", "Add member")} sub={t("dashboard.addMemberSub", "Register a borrower")} onClick={() => navigate("/members?action=add-member")} />
              <ActionCard icon={CalendarPlus} label={t("dashboard.newReservation", "New reservation")} sub={t("dashboard.newReservationSub", "Hold a title")} onClick={() => navigate("/reservations?action=new-reservation")} />
              <ActionCard icon={UserCog} label={t("dashboard.addUser", "Add staff user")} sub={t("dashboard.addUserSub", "Desk accounts")} onClick={() => navigate("/settings?tab=users&action=add-user")} />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ActionCard({ icon: Icon, label, sub, onClick }: { icon: typeof ScanLine; label: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-1.5 rounded-xl border border-ink/8 p-3 text-start transition hover:border-accent/40 hover:bg-accent/5 dark:border-white/8 dark:hover:border-accent-dark/40 dark:hover:bg-accent-dark/5"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent dark:bg-accent-dark/15 dark:text-accent-dark">
        <Icon size={15} />
      </span>
      <span className="text-[12.5px] font-bold leading-tight">{label}</span>
      <span className="text-[10px] text-ink/50 dark:text-ivory/50">{sub}</span>
    </button>
  );
}
