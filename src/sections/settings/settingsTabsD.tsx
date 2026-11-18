import { Database } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Modal } from "../../components/ui/primitives";
import { listUsers, resetPassword } from "../../data/auth";
import { activeBackend } from "../../data/repositories/library";
import { useQuery } from "../../hooks/useLibraryQuery";
import { useUiStore } from "../../store/uiStore";
import { Card, Field, Toggle } from "./settingsShared";

export function UsersTab() {
  const { t } = useTranslation();
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: listUsers });
  const [resetOpen, setResetOpen] = useState(false);
  const [newPin, setNewPin] = useState("");

  return (
    <>
      <Card
        title={t("settings.users.title", "Desk accounts")}
        desc={t(
          "settings.users.pinEditionNote",
          "KetabYar uses a single shared desk PIN — simple and safe for one service desk.",
        )}
      >
        <ul className="space-y-2">
          {(usersQuery.data ?? []).map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-ink/8 px-4 py-3 dark:border-white/8"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-copper text-xs font-bold text-white">
                  {user.full_name.slice(0, 2)}
                </span>
                <div>
                  <p className="text-[13px] font-bold">
                    {user.full_name}{" "}
                    <span className="font-normal text-ink/45 dark:text-ivory/45">
                      @{user.username}
                    </span>
                  </p>
                  <p className="text-[11px] text-ink/50 dark:text-ivory/50">
                    {t("settings.account.roleAdmin", "Administrator")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                className="rounded-lg bg-ink/6 px-3 py-1.5 text-xs font-bold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20"
              >
                {t("settings.users.resetPassword", "Reset PIN")}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Modal
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        title={t("settings.users.resetPasswordTitle", "Reset the desk PIN")}
        size="md"
      >
        <input
          aria-label={t(
            "settings.users.newPinPlaceholder",
            "New PIN (4–8 digits)",
          )}
          className="field-input"
          inputMode="numeric"
          placeholder={t(
            "settings.users.newPinPlaceholder",
            "New PIN (4–8 digits)",
          )}
          value={newPin}
          onChange={(event) =>
            setNewPin(event.target.value.replace(/\D/g, "").slice(0, 8))
          }
        />
        <p className="mt-2 text-[11px] text-ink/45 dark:text-ivory/45">
          {t(
            "settings.users.resetPasswordHelp",
            "Everyone signing in with the old PIN will need the new one.",
          )}
        </p>
        <button
          type="button"
          onClick={async () => {
            try {
              if (!/^\d{4,8}$/.test(newPin))
                throw new Error(
                  t(
                    "settings.account.passwordTooShort",
                    "پین باید ۴ تا ۸ رقم باشد.",
                  ),
                );
              await resetPassword("local", newPin);
              toast.success(t("settings.users.pinReset", "PIN updated"));
              setResetOpen(false);
              setNewPin("");
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : String(error),
              );
            }
          }}
          className="mt-4 w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-white dark:bg-accent-dark"
        >
          {t("settings.users.resetPassword", "Reset PIN")}
        </button>
      </Modal>
    </>
  );
}

/* ── Desktop & data ──────────────────────────────────────────────────── */

export function DesktopTab() {
  const { t } = useTranslation();
  const preferences = useUiStore((state) => state.preferences);
  const updatePreferences = useUiStore((state) => state.updatePreferences);
  const [bootEnabled, setBootEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { isEnabled } = await import("@tauri-apps/plugin-autostart");
        setBootEnabled(await isEnabled());
      } catch {
        /* browser */
      }
    })();
  }, []);

  const toggleBoot = async (value: boolean) => {
    try {
      const autostart = await import("@tauri-apps/plugin-autostart");
      if (value) await autostart.enable();
      else await autostart.disable();
      setBootEnabled(value);
      updatePreferences({ launchOnBoot: value });
    } catch (error) {
      toast.error(String(error));
    }
  };

  const openDataFolder = async () => {
    try {
      const { appDataDir } = await import("@tauri-apps/api/path");
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(await appDataDir());
    } catch {
      /* browser */
    }
  };

  return (
    <>
      <Card title={t("settings.desktop.trayTitle", "Window behaviour")}>
        <div className="space-y-3">
          <Toggle
            checked={preferences.closeToTray}
            onChange={(value) => updatePreferences({ closeToTray: value })}
            label={t(
              "settings.desktop.closeToTray",
              "Close button hides to tray",
            )}
            desc={t(
              "settings.desktop.trayDesc",
              "The app keeps running in the system tray; right-click it to quit.",
            )}
          />
          <Toggle
            checked={bootEnabled}
            onChange={(value) => void toggleBoot(value)}
            label={t("settings.desktop.launchOnBoot", "Start with Windows")}
            desc={t(
              "settings.desktop.startupDesc",
              "Launch KetabYar when this computer boots.",
            )}
          />
        </div>
      </Card>

      <Card title={t("settings.desktop.paginationTitle", "Table density")}>
        <Field
          label={t("settings.desktop.pageSizeLabel", "Rows per page")}
          hint={t(
            "settings.desktop.pageSizeDesc",
            "Applies to catalog, members and activity tables.",
          )}
        >
          <select
            aria-label={t("settings.general.pageSize", "Rows per page")}
            className="field-select max-w-40"
            value={preferences.pageSize}
            onChange={(event) =>
              updatePreferences({ pageSize: Number(event.target.value) })
            }
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      <Card title={t("settings.desktop.storageTitle", "Storage")}>
        <button
          type="button"
          onClick={() => void openDataFolder()}
          className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-ink/6 px-4 py-2 text-sm font-semibold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20"
        >
          <Database size={15} />{" "}
          {t("settings.desktop.openFolder", "Open the data folder")}
        </button>
      </Card>
    </>
  );
}

/* ── About ───────────────────────────────────────────────────────────── */

export function AboutTab({
  onNavigateLegal,
}: {
  onNavigateLegal: (doc: string) => void;
}) {
  const { t } = useTranslation();
  const [version, setVersion] = useState("1.0.3");
  const edition =
    activeBackend === "rust"
      ? t("settings.about.editionRust", "Rust (موتور بومی ketabyar-core)")
      : t(
          "settings.about.editionTs",
          "TypeScript (tauri-plugin-sql در webview)",
        );

  useEffect(() => {
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        setVersion(await getVersion());
      } catch {
        /* keep default */
      }
    })();
  }, []);

  return (
    <>
      <Card>
        <div className="flex items-center gap-4">
          <img
            src="/brand/ketabyar-symbol.png"
            alt="KetabYar"
            className="h-14 w-14 rounded-2xl"
          />
          <div>
            <p className="font-display text-lg font-bold">کتابیار · KetabYar</p>
            <p className="text-xs text-ink/55 dark:text-ivory/55">
              {t(
                "settings.about.tagline",
                "مدیریت کتابخانهٔ دانشگاه — آفلاین، فارسی، راست‌به‌چپ",
              )}
            </p>
          </div>
        </div>
        <dl className="mt-4 space-y-2 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-ink/50 dark:text-ivory/50">
              {t("settings.about.version", "Version")}
            </dt>
            <dd className="font-bold">v{version}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink/50 dark:text-ivory/50">
              {t("settings.about.edition", "Data engine")}
            </dt>
            <dd className="font-bold">{edition}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink/50 dark:text-ivory/50">
              {t("settings.about.database", "Database")}
            </dt>
            <dd>SQLite 3</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink/50 dark:text-ivory/50">
              {t("settings.about.platform", "Platform")}
            </dt>
            <dd>Windows · Tauri 2</dd>
          </div>
        </dl>
      </Card>

      <Card title={t("settings.about.credits", "Credits & legal")}>
        <ul className="mb-4 space-y-1 text-[13px] text-ink/70 dark:text-ivory/70">
          <li>
            {t("settings.about.engineering", "Design & engineering")}: KetabYar
            contributors
          </li>
          <li>
            {t("settings.about.bookData", "Book data")}: Google Books · Open
            Library
          </li>
          <li>{t("settings.about.icons", "Icons")}: Lucide (ISC)</li>
          <li>
            {t("settings.about.fonts", "Fonts")}: Vazirmatn · IBM Plex Sans
            Arabic · Manrope (SIL OFL 1.1)
          </li>
        </ul>
        <div className="flex flex-wrap gap-2">
          {(["terms", "privacy", "licenses"] as const).map((doc) => (
            <button
              type="button"
              key={doc}
              onClick={() => onNavigateLegal(doc)}
              className="rounded-[var(--radius-control)] bg-ink/6 px-4 py-2 text-sm font-semibold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20"
            >
              {t(
                `settings.about.${doc === "terms" ? "terms" : doc === "privacy" ? "privacy" : "licenses"}`,
                doc,
              )}
            </button>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-ink/45 dark:text-ivory/45">
          MIT License · Copyright © 2026 KetabYar contributors
        </p>
      </Card>
    </>
  );
}
