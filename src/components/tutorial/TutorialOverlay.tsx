import {
  BookOpen,
  CalendarClock,
  Library,
  type LucideIcon,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/authStore";
import { useTutorialStore } from "../../store/tutorialStore";
import { useUiStore } from "../../store/uiStore";
import { cn } from "../../utils/cn";
import { Modal } from "../ui/primitives";

/** The guided tour: one screen per feature area, replayable from Settings › General. */
const STEPS: { icon: LucideIcon; titleKey: string; bodyKey: string }[] = [
  {
    icon: BookOpen,
    titleKey: "tutorial.s1.title",
    bodyKey: "tutorial.s1.body",
  },
  {
    icon: Library,
    titleKey: "tutorial.s2.title",
    bodyKey: "tutorial.s2.body",
  },
  {
    icon: Users,
    titleKey: "tutorial.s3.title",
    bodyKey: "tutorial.s3.body",
  },
  {
    icon: CalendarClock,
    titleKey: "tutorial.s4.title",
    bodyKey: "tutorial.s4.body",
  },
  {
    icon: ShieldCheck,
    titleKey: "tutorial.s5.title",
    bodyKey: "tutorial.s5.body",
  },
  {
    icon: Settings,
    titleKey: "tutorial.s6.title",
    bodyKey: "tutorial.s6.body",
  },
];

/** Auto-open at most once per app session, after login + onboarding. */
let autoOpenedThisSession = false;

export function TutorialOverlay() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const onboardingComplete = useUiStore(
    (state) => state.preferences.onboardingComplete,
  );
  const tutorialSeen = useUiStore((state) => state.preferences.tutorialSeen);
  const open = useTutorialStore((state) => state.open);
  const step = useTutorialStore((state) => state.step);
  const close = useTutorialStore((state) => state.close);
  const next = useTutorialStore((state) => state.next);
  const back = useTutorialStore((state) => state.back);

  useEffect(() => {
    if (!user || !onboardingComplete || tutorialSeen || autoOpenedThisSession)
      return;
    autoOpenedThisSession = true;
    useTutorialStore.getState().start();
  }, [user, onboardingComplete, tutorialSeen]);

  const finish = () => {
    close();
    useUiStore.getState().updatePreferences({ tutorialSeen: true });
  };

  if (!open) return null;
  const current = STEPS[step];
  const Icon = current.icon;
  const last = step === STEPS.length - 1;

  return (
    <Modal isOpen onClose={finish} title={t(current.titleKey)}>
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/12 text-accent dark:bg-accent-dark/20 dark:text-accent-dark">
          <Icon size={26} />
        </div>
        <p className="text-sm leading-6 text-ink/70 dark:text-ivory/70">
          {t(current.bodyKey)}
        </p>
        <div className="flex justify-center gap-1.5">
          {STEPS.map((s, index) => (
            <span
              key={s.titleKey}
              className={cn(
                "h-1.5 rounded-full transition-all",
                index === step
                  ? "w-5 bg-accent dark:bg-accent-dark"
                  : "w-1.5 bg-ink/20 dark:bg-ivory/20",
              )}
            />
          ))}
        </div>
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={finish}
            className="text-xs font-semibold text-ink/50 hover:text-ink dark:text-ivory/50 dark:hover:text-ivory"
          >
            {t("tutorial.skip")}
          </button>
          <div className="flex gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => back()}
                className="rounded-[var(--radius-control)] bg-ink/6 px-4 py-2 text-sm font-semibold text-ink dark:bg-ivory/10 dark:text-ivory"
              >
                {t("tutorial.back")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => (last ? finish() : next(STEPS.length))}
              className="rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-white dark:bg-accent-dark"
            >
              {t(last ? "tutorial.finish" : "tutorial.next")}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-ink/40 dark:text-ivory/40">
          {t("tutorial.stepOf", {
            current: step + 1,
            total: STEPS.length,
          })}
        </p>
      </div>
    </Modal>
  );
}
