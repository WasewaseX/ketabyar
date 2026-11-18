import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  RotateCcw,
  Trash2,
  Zap,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { GROQ_MODELS_ENDPOINT } from "../../config/endpoints";
import {
  clearCirculation,
  deleteAllLibraryData,
  books as fetchBooks,
} from "../../data/repositories/library";
import { useLibrarySettingsStore } from "../../store/librarySettingsStore";
import { useUiStore } from "../../store/uiStore";
import { enrichAllBooks, findEnrichableBooks } from "../../utils/enrichment";
import { Card, Toggle } from "./settingsShared";

export function DatabaseTab() {
  const { t } = useTranslation();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const [dangerVisible, setDangerVisible] = useState(false);

  /** Localized confirm wrapper — one line per confirmation site. */
  const confirmKeyed = (key: string, fallback: string) =>
    window.confirm(t(key, fallback));

  const clearLoans = async () => {
    if (
      !confirmKeyed(
        "settings.database.clearLoansConfirm",
        "Delete ALL loans (open and returned)? Copies return to the shelves.",
      )
    )
      return;
    try {
      await clearCirculation();
      window.alert(
        t("settings.database.clearLoansSuccess", "Loan history cleared."),
      );
    } catch (error) {
      window.alert(
        t(
          "settings.database.clearLoansFailed",
          "Could not clear loans: {{message}}",
          { message: String(error) },
        ),
      );
    }
  };

  const factoryReset = async () => {
    if (
      !confirmKeyed(
        "settings.database.factoryResetConfirm1",
        "FIRST CONFIRMION — this deletes every book, member, loan, hold, fine, shelf and notification in this database.",
      )
    )
      return;
    if (
      !confirmKeyed(
        "settings.database.factoryResetConfirm2",
        "SECOND CONFIRMATION — absolutely sure? There is no undo.",
      )
    )
      return;
    try {
      await deleteAllLibraryData();
      localStorage.removeItem("ketabyar-preferences");
      window.alert(
        t(
          "settings.database.factoryResetSuccess",
          "The library is empty again. Reloading…",
        ),
      );
      window.location.reload();
    } catch (error) {
      window.alert(String(error));
    }
  };

  return (
    <>
      <Card title={t("settings.database.infoTitle", "Database")}>
        <dl className="space-y-2 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-ink/50 dark:text-ivory/50">
              {t("settings.database.infoName", "Library")}
            </dt>
            <dd className="font-medium">{settings.library_name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink/50 dark:text-ivory/50">
              {t("settings.database.infoEngine", "Engine")}
            </dt>
            <dd className="font-medium">SQLite (fully offline)</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink/50 dark:text-ivory/50">
              {t("settings.database.infoLocation", "File location")}
            </dt>
            <dd className="font-mono text-xs" dir="ltr">
              %APPDATA%\ir.ketabyar.library\ketabyar.db
            </dd>
          </div>
        </dl>
      </Card>

      <Card
        title={t("settings.database.dangerTitle", "Danger zone")}
        desc={t(
          "settings.database.dangerDesc",
          "These actions wipe real data. Take a backup first.",
        )}
      >
        {!dangerVisible ? (
          <button
            type="button"
            onClick={() => setDangerVisible(true)}
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-red-600/10 px-4 py-2 text-sm font-bold text-red-600"
          >
            <CircleAlert size={15} />{" "}
            {t("settings.database.dangerShowBtn", "Show destructive actions")}
          </button>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void clearLoans()}
              className="inline-flex w-full items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-start hover:bg-amber-500/10"
            >
              <span className="text-[13px] font-semibold text-amber-700 dark:text-amber-400">
                {t("settings.database.clearLoansTitle", "Clear all loans")}
              </span>
              <Trash2 size={15} className="text-amber-600" />
            </button>
            <button
              type="button"
              onClick={() => void factoryReset()}
              className="inline-flex w-full items-center justify-between rounded-xl border border-red-600/40 bg-red-600/5 px-4 py-3 text-start hover:bg-red-600/10"
            >
              <span className="text-[13px] font-semibold text-red-600">
                {t(
                  "settings.database.factoryResetTitle",
                  "Factory reset — delete ALL library data",
                )}
              </span>
              <RotateCcw size={15} className="text-red-600" />
            </button>
          </div>
        )}
      </Card>
    </>
  );
}

/* ── Integrations & AI ───────────────────────────────────────────────── */

/* ── Integrations & AI: three cards, each with its own local state ── */

function GroqCard({
  preferences,
  updatePreferences,
}: {
  preferences: ReturnType<typeof useUiStore.getState>["preferences"];
  updatePreferences: ReturnType<
    typeof useUiStore.getState
  >["updatePreferences"];
}) {
  const { t } = useTranslation();
  const [keyVisible, setKeyVisible] = useState(false);
  const [testState, setTestState] = useState<"idle" | "ok" | "bad" | "fail">(
    "idle",
  );

  const testGroq = async () => {
    try {
      const response = await fetch(GROQ_MODELS_ENDPOINT, {
        headers: { Authorization: `Bearer ${preferences.groqApiKey}` },
      });
      setTestState(
        response.ok
          ? "ok"
          : response.status === 401 || response.status === 403
            ? "bad"
            : "fail",
      );
    } catch {
      setTestState("fail");
    }
    window.setTimeout(() => setTestState("idle"), 6000);
  };

  return (
    <>
      <Card
        title={t("settings.integrations.groqTitle", "Groq AI enrichment")}
        desc={t(
          "settings.integrations.aiDesc",
          "Optional: an AI pass that fills Persian titles, blurbs and Dewey estimates during autofill.",
        )}
      >
        <Toggle
          checked={preferences.groqEnabled}
          onChange={(value) => updatePreferences({ groqEnabled: value })}
          label={t(
            "settings.integrations.groqToggleLabel",
            "Enable Groq enrichment",
          )}
          desc={t(
            "settings.integrations.groqToggleDesc",
            "Fast Llama 3 metadata generation.",
          )}
        />
        {preferences.groqEnabled ? (
          <div className="mt-3 grid gap-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  aria-label={t(
                    "settings.integrations.groqPlaceholder",
                    "gsk_…",
                  )}
                  className="field-input pe-10"
                  type={keyVisible ? "text" : "password"}
                  placeholder={t(
                    "settings.integrations.groqPlaceholder",
                    "gsk_…",
                  )}
                  defaultValue={preferences.groqApiKey}
                  onBlur={(event) =>
                    updatePreferences({ groqApiKey: event.target.value.trim() })
                  }
                />
                <button
                  type="button"
                  onClick={() => setKeyVisible((value) => !value)}
                  className="absolute inset-y-0 end-3 my-auto text-ink/45"
                  aria-label={t(
                    "settings.secrets.toggleVisibility",
                    "Toggle visibility",
                  )}
                >
                  {keyVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => void testGroq()}
                className="rounded-[var(--radius-control)] bg-ink/6 px-4 text-sm font-bold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20"
              >
                {t("settings.integrations.groqTest", "Test")}
              </button>
            </div>
            {testState === "ok" ? (
              <p className="flex items-center gap-1.5 text-xs font-bold text-accent dark:text-accent-dark">
                <CheckCircle2 size={13} />{" "}
                {t("settings.integrations.groqOk", "Key works")}
              </p>
            ) : null}
            {testState === "bad" ? (
              <p className="text-xs font-bold text-red-600">
                {t(
                  "settings.integrations.groqInvalidKey",
                  "Invalid key — get one at console.groq.com",
                )}
              </p>
            ) : null}
            {testState === "fail" ? (
              <p className="text-xs font-bold text-red-600">
                {t(
                  "settings.integrations.groqTestFailed",
                  "Could not reach Groq.",
                )}
              </p>
            ) : null}
            <p className="text-[11px] text-ink/45 dark:text-ivory/45">
              {t(
                "settings.integrations.groqHelp",
                "Your key stays on this device.",
              )}
            </p>
          </div>
        ) : null}
      </Card>
    </>
  );
}

function BulkEnrichCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const preferences = useUiStore((state) => state.preferences);

  const [enriching, setEnriching] = useState(false);
  const [enrichLog, setEnrichLog] = useState<
    { title: string; status: string; message: string }[]
  >([]);
  const cancelRef = useRef(false);
  const bulkEnrich = async () => {
    if (
      !window.confirm(
        t(
          "settings.integrations.enrichConfirm",
          "Look up missing metadata online for every incomplete record? This uses Google Books / Open Library.",
        ),
      )
    )
      return;
    setEnriching(true);
    cancelRef.current = false;
    setEnrichLog([]);
    try {
      const allBooks = await fetchBooks("", "");
      const targets = findEnrichableBooks(allBooks);
      if (targets.length === 0) {
        toast.info(
          t(
            "settings.integrations.enrichNone",
            "Nothing to enrich — the catalog is complete.",
          ),
        );
        setEnriching(false);
        return;
      }
      let done = 0;
      await enrichAllBooks(
        targets,
        {
          groqApiKey:
            preferences.groqEnabled && preferences.groqApiKey
              ? preferences.groqApiKey
              : undefined,
        },
        (progress) => {
          done += 1;
          setEnrichLog((log) =>
            [
              {
                title: progress.book.title,
                status: progress.status,
                message: progress.message,
              },
              ...log,
            ].slice(0, 40),
          );
          toast.info(
            t(
              "settings.integrations.enrichProgress",
              "{{done}} of {{total}} processed",
              { done, total: targets.length },
            ),
            { id: "enrich-progress" },
          );
        },
        () => cancelRef.current,
      );
      toast.success(
        t("settings.integrations.enrichDone", "Bulk enrichment finished"),
      );
      void queryClient.invalidateQueries();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setEnriching(false);
    }
  };

  return (
    <>
      <Card
        title={t("settings.integrations.enrichTitle", "Bulk enrichment")}
        desc={t(
          "settings.integrations.enrichDesc",
          "Fills ONLY blank fields — never overwrites your data.",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void bulkEnrich()}
            disabled={enriching}
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-accent-dark"
          >
            <Zap size={15} />{" "}
            {enriching
              ? t("settings.integrations.enrichRunning", "Working…")
              : t("settings.integrations.enrichStart", "Start bulk enrichment")}
          </button>
          {enriching ? (
            <button
              type="button"
              onClick={() => (cancelRef.current = true)}
              className="rounded-[var(--radius-control)] bg-red-600/10 px-4 py-2 text-sm font-bold text-red-600"
            >
              {t("settings.integrations.enrichCancel", "Cancel")}
            </button>
          ) : null}
        </div>
        {enrichLog.length > 0 ? (
          <ul className="mt-3 max-h-52 space-y-1 overflow-y-auto rounded-xl bg-ink/4 p-3 text-[11px] dark:bg-white/5">
            {enrichLog.map((entry, index) => (
              <li key={index} className="flex justify-between gap-2">
                <span className="truncate font-semibold">{entry.title}</span>
                <span
                  className={
                    entry.status === "success"
                      ? "text-accent dark:text-accent-dark"
                      : entry.status === "skipped"
                        ? "text-ink/45"
                        : "text-red-500"
                  }
                >
                  {entry.message}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}

export function IntegrationsTab() {
  const { t } = useTranslation();
  const preferences = useUiStore((state) => state.preferences);
  const updatePreferences = useUiStore((state) => state.updatePreferences);

  return (
    <>
      <GroqCard
        preferences={preferences}
        updatePreferences={updatePreferences}
      />
      <Card
        title={t(
          "settings.integrations.lookupTitle",
          "External catalog lookup",
        )}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle
            checked={preferences.googleBooksEnabled}
            onChange={(value) =>
              updatePreferences({ googleBooksEnabled: value })
            }
            label={t("settings.integrations.googleTitle", "Google Books")}
            desc={t(
              "settings.integrations.googleDesc",
              "Primary metadata + covers.",
            )}
          />
          <Toggle
            checked={preferences.openLibraryEnabled}
            onChange={(value) =>
              updatePreferences({ openLibraryEnabled: value })
            }
            label={t("settings.integrations.openLibraryTitle", "Open Library")}
            desc={t(
              "settings.integrations.openLibraryDesc",
              "Dewey numbers + fallback covers.",
            )}
          />
        </div>
      </Card>
      <BulkEnrichCard />
    </>
  );
}
