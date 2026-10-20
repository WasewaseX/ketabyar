import { useMemo } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { ArrowLeft, FileText, ShieldCheck, Scale } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Three "alike" legal documents (Terms, Privacy, Licenses) rendered by one shared layout and
 * selected by the `:doc` route param. Linked from Settings → About → Legal.
 */

interface LegalSection {
  heading: string;
  body: string[];
}
interface LegalDoc {
  key: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  sections: LegalSection[];
}

const YEAR = "2026";
const UPSTREAM = "Warraq";
const UPSTREAM_URL = "https://github.com/mohaneddz/Warraq";

function buildDocs(): Record<string, LegalDoc> {
  const terms: LegalDoc = {
    key: "terms",
    title: "Terms of Service",
    subtitle: "The conditions governing your use of KetabYar.",
    icon: FileText,
    sections: [
      {
        heading: "1. Grant of use",
        body: [
          `KetabYar is offline library-management software. Subject to the license accompanying your copy, you may install and use it on your own computers to operate your library.`,
          "Each copy is licensed for use by the institution that obtained it and its authorized library staff.",
        ],
      },
      {
        heading: "2. Restrictions",
        body: [
          "You may NOT copy, redistribute, sublicense, sell, rent, publish, or otherwise make the software available to third parties except as permitted by the license accompanying your copy and applicable law.",  
          "You may not remove or alter any copyright, branding, or authorship notices.",
        ],
      },
      {
        heading: "3. Legal consequences",
        body: [
          "Any distribution, reproduction, or commercial exploitation of KetabYar beyond the granted license constitutes a breach of these terms and an infringement of intellectual-property rights, and may result in legal consequences.",
        ],
      },
      {
        heading: "4. Data responsibility",
        body: [
          "Your institution is responsible for the library data it enters and for maintaining its own backups. The software is provided \"as is\", without warranty of any kind, to the extent permitted by applicable law.",
        ],
      },
      {
        heading: "5. Contact",
        body: [
          "For permissions, licensing, or any question about these terms, contact your KetabYar distributor or the upstream project at " + UPSTREAM_URL + "/.",
        ],
      },
    ],
  };

  const privacy: LegalDoc = {
    key: "privacy",
    title: "Privacy Policy",
    subtitle: "How KetabYar handles the data you store in it.",
    icon: ShieldCheck,
    sections: [
      {
        heading: "1. What data is stored",
        body: [
          "KetabYar stores the library records you enter: catalogue items, members, loans, reservations, shelves, and audit logs. All of this data is kept in a local SQLite database on this computer.",
        ],
      },
      {
        heading: "2. Where it lives",
        body: [
          "Your library data never leaves this machine. KetabYar is fully offline: it reads and writes only to the local database on this computer and does not send your library data to any server or to the software publisher.",
        ],
      },
      {
        heading: "3. Third-party lookups",
        body: [
          "When you enrich a catalogue record, the title or ISBN you look up is sent to the external metadata providers you enable (Google Books, Open Library, Library of Congress, and Crossref). Only the search query is shared, never your members' personal data.",
        ],
      },
      {
        heading: "4. Personal data of members",
        body: [
          "Member names, contact details, and borrowing history are used solely to operate the library. They are never sold or shared with third parties. Handle this data in accordance with your institution's own data-protection obligations.",
        ],
      },
      {
        heading: "5. Local preferences",
        body: [
          "Interface preferences (theme, language, page size, API keys) are stored locally on this device only.",
        ],
      },
    ],
  };

  const licenses: LegalDoc = {
    key: "licenses",
    title: "Open Source Licenses",
    subtitle: "The software KetabYar is built with.",
    icon: Scale,
    sections: [
      {
        heading: "KetabYar license",
        body: [
          `KetabYar is built on the open-source ${UPSTREAM} project (© Warraq Contributors, PolyForm Noncommercial License 1.0.0) with substantial additional modifications. See the LICENSE file that ships with the application for details.`,
        ],
      },
      {
        heading: "Bundled open-source components",
        body: [
          "KetabYar gratefully builds on open-source projects, each under its own license:",
          "• React: MIT License",
          "• Tauri: MIT / Apache-2.0",
          "• Vite: MIT License",
          "• Tailwind CSS: MIT License",
          "• TanStack Query: MIT License",
          "• Recharts: MIT License",
          "• lucide-react (icons): ISC License",
          "• @tauri-apps/plugin-sql (local SQLite): MIT License",
          "• Vazirmatn font: SIL Open Font License 1.1",
          "• i18next / react-i18next: MIT License",
          "• Zustand: MIT License",
          "• PapaParse: MIT License",
          "• date-fns: MIT License",
        ],
      },
      {
        heading: "Notices",
        body: [
          "The MIT, ISC, and Apache-2.0 licenses require preservation of their copyright and permission notices, which are retained in the respective packages under node_modules and in the distributed build.",
        ],
      },
    ],
  };

  return { terms, privacy, licenses };
}

export function LegalPage() {
  const { doc } = useParams<{ doc: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const docs = useMemo(() => buildDocs(), []);

  const current = doc ? docs[doc] : undefined;
  if (!current) return <Navigate to="/legal/terms" replace />;

  const Icon = current.icon;
  const tabs = [docs.terms, docs.privacy, docs.licenses];

  return (
    <div className="max-w-3xl w-full mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-[#122222]/60 dark:text-white/60 hover:text-emerald mb-5 cursor-pointer"
      >
        <ArrowLeft size={15} /> {t("common.back", "Back")}
      </button>

      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-11 h-11 rounded-xl bg-emerald/10 text-emerald dark:bg-emerald-light/10 dark:text-emerald-light flex items-center justify-center shrink-0">
          <Icon size={22} />
        </div>
        <div>
          <h1 className="font-display text-[26px] font-bold text-[#122222] dark:text-white leading-tight">{current.title}</h1>
          <p className="text-[13px] text-[#122222]/60 dark:text-white/60">{current.subtitle}</p>
        </div>
      </div>

      {/* Tabs between the three documents */}
      <div className="flex gap-1.5 border-b border-black/5 dark:border-white/5 mb-6 mt-4">
        {tabs.map((d) => (
          <button
            key={d.key}
            onClick={() => navigate(`/legal/${d.key}`)}
            className={`px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
              d.key === current.key
                ? "border-emerald text-emerald dark:text-emerald-light"
                : "border-transparent text-[#122222]/50 dark:text-white/50 hover:text-[#122222] dark:hover:text-white"
            }`}
          >
            {d.title}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="bg-white dark:bg-[#1d2926] border border-black/5 dark:border-white/5 rounded-2xl shadow-card p-6 space-y-6">
        {current.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-bold text-[15px] text-[#122222] dark:text-white mb-2">{s.heading}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="text-[13px] leading-relaxed text-[#122222]/75 dark:text-white/75 mb-1.5 whitespace-pre-line">{p}</p>
            ))}
          </section>
        ))}
        <p className="text-[11px] text-[#122222]/40 dark:text-white/40 pt-4 border-t border-black/5 dark:border-white/5">
          © {YEAR} KetabYar — built on open-source software. All rights reserved by their respective owners.
        </p>
      </div>
    </div>
  );
}
