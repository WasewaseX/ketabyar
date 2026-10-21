import { ArrowRight, FileText, Scale, ShieldCheck } from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "../utils/cn";

/**
 * Legal documents: terms of service, privacy statement, and the open-source
 * license inventory. Written to be truthful about what KetabYar is — local,
 * offline software with optional metadata lookups.
 */

const YEAR = new Date().getFullYear();

const TABS = [
  { id: "terms", label: "Terms of Service", icon: FileText },
  { id: "privacy", label: "Privacy Policy", icon: ShieldCheck },
  { id: "licenses", label: "Open Source Licenses", icon: Scale },
] as const;

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-6 font-display text-base font-bold first:mt-0">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[13.5px] leading-relaxed text-ink/75 dark:text-ivory/75">{children}</p>;
}

function TermsDoc() {
  return (
    <>
      <H>1. Grant of use</H>
      <P>
        KetabYar is offline software for managing a university or institutional library. The institution that
        obtains a copy may install and use it on its own computers for its own library operations, together with
        the staff it authorises. The software is provided under the MIT license; see the Open Source Licenses
        tab and the LICENSE file shipped with the application for the exact terms.
      </P>
      <H>2. Restrictions</H>
      <P>
        You must keep the copyright and license notices intact in any copy of the software or its source. If you
        redistribute the software, the MIT license text must accompany it. Third-party components remain under
        their own licenses as listed on the Licenses tab.
      </P>
      <H>3. Your data is your responsibility</H>
      <P>
        KetabYar stores everything in a local SQLite database file on the machine where it runs. The institution
        owns its data and is responsible for keeping backups. The Backup &amp; Restore screen exists exactly for
        that purpose; the authors accept no liability for data loss.
      </P>
      <H>4. No warranty</H>
      <P>
        The software is provided "as is", without warranty of any kind, express or implied — including fitness
        for a particular purpose. To the maximum extent permitted by law, the authors are not liable for any
        claim or damages arising from the use of the software.
      </P>
      <H>5. Contact</H>
      <P>
        Questions about these terms can be raised through the project repository:
        {" "}<a className="font-semibold text-accent underline dark:text-accent-dark" href="https://github.com/WasewaseX/ketabyar" target="_blank" rel="noreferrer">github.com/WasewaseX/ketabyar</a>.
      </P>
    </>
  );
}

function PrivacyDoc() {
  return (
    <>
      <H>What is stored, and where</H>
      <P>
        KetabYar keeps its entire catalogue — titles, copies, members, loans, reservations, shelf map, audit
        trail, and settings — in a local SQLite database inside the operating system's application-data folder
        (%APPDATA%\ir.ketabyar.library on Windows). Nothing is uploaded anywhere: the application has no server
        component and works with the network cable unplugged.
      </P>
      <H>Optional network requests</H>
      <P>
        Two cataloguing helpers may reach the internet, and only when used: metadata lookup (a title or ISBN is
        sent to Google Books and/or Open Library to fetch bibliographic details) and, if explicitly enabled with
        a personal key, AI-assisted enrichment through the Groq API. Member personal data is never transmitted.
      </P>
      <H>How member data is used</H>
      <P>
        Member records exist solely to operate the library: identifying borrowers, tracking loans and holds, and
        recording fines. The institution running KetabYar remains the data controller for its members and must
        meet its own data-protection obligations.
      </P>
      <H>Local preferences and keys</H>
      <P>
        Interface preferences — including any API key you enter for the optional enrichment service — stay on the
        device, in local storage and the local database. Clearing the data through Settings removes them.
      </P>
    </>
  );
}

function LicensesDoc() {
  return (
    <>
      <H>KetabYar</H>
      <P>
        KetabYar — a Persian, RTL-first desktop library system — is original software released under the MIT
        License. Copyright © {YEAR} KetabYar contributors. It shares no code with any prior project: from
        version 1.0.3 the entire application layer was written from scratch.
      </P>
      <H>Bundled open-source software</H>
      <P>
        KetabYar is built on top of excellent open-source projects. Their licenses (MIT, Apache-2.0, ISC, BSD,
        and the SIL Open Font License for the fonts) are preserved in the distributed build:
      </P>
      <ul className="mb-3 grid list-disc gap-1 ps-5 text-[13.5px] text-ink/75 dark:text-ivory/75">
        <li>React, React Router, TanStack Query, Zustand, i18next — MIT</li>
        <li>Tauri and its official plugins (MIT / Apache-2.0)</li>
        <li>Vite, Tailwind CSS, TypeScript — MIT / Apache-2.0</li>
        <li>Recharts, lucide-react (ISC), cmdk, sonner, date-fns, Zod — MIT</li>
        <li>jsPDF, jsPDF-AutoTable, JSZip, PapaParse, ExcelJS — MIT</li>
        <li>Vazirmatn, IBM Plex Sans Arabic, Manrope fonts — SIL OFL 1.1</li>
      </ul>
      <P>
        Full license texts for every bundled package ship inside the installed application under
        <code className="mx-1 rounded bg-ink/5 px-1.5 py-0.5 text-xs dark:bg-white/10">node_modules/&lt;package&gt;/LICENSE</code>
        and are summarised in the THIRD-PARTY-NOTICES.md file of the source repository.
      </P>
    </>
  );
}

export function LegalPage() {
  const { doc } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (doc !== "terms" && doc !== "privacy" && doc !== "licenses") {
    return <Navigate to="/legal/terms" replace />;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={() => navigate(-1)}
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-ink/60 transition hover:text-ink dark:text-ivory/60 dark:hover:text-ivory"
      >
        <ArrowRight size={15} />
        {t("common.back", "بازگشت")}
      </button>

      <div className="mb-5 flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => navigate(`/legal/${tab.id}`)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
              doc === tab.id
                ? "bg-accent text-white dark:bg-accent-dark"
                : "bg-ink/5 text-ink/60 hover:bg-ink/10 dark:bg-white/5 dark:text-ivory/60 dark:hover:bg-white/10",
            )}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-[var(--radius-card)] border border-ink/8 bg-white p-7 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
        {doc === "terms" ? <TermsDoc /> : doc === "privacy" ? <PrivacyDoc /> : <LicensesDoc />}
      </div>

      <p className="mt-4 text-center text-xs text-ink/45 dark:text-ivory/45">
        © {YEAR} KetabYar — built on open-source software. All rights reserved by their respective owners.
      </p>
    </div>
  );
}
