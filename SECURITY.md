# Security Policy — KetabYar

## Supported versions

Only the **latest published release** receives security fixes:

| Version | Supported |
| --- | --- |
| 1.1.1 (and any later release) | ✅ |
| ≤ 1.1.0 | ❌ — upgrade to the latest release |

## Reporting a vulnerability

Please report vulnerabilities **privately** through GitHub:
**Security → Report a vulnerability** at
<https://github.com/WasewaseX/ketabyar/security/advisories/new>.

Do **not** open a public issue for something you believe is exploitable.
Include, where possible: affected version, Windows version, steps to
reproduce, and your assessment of impact.

You can expect an acknowledgement within **7 days** and a status update at
least every 14 days until the issue is resolved or closed. Fixes land in the
next release and are credited in the release notes unless you prefer
otherwise.

## Scope and design context

KetabYar is an **offline** desktop application: library data (members, loans,
reservations, catalog) lives in a local SQLite database and never leaves the
machine. There is no account system, no telemetry and no analytics. When
assessing reports, note that:

- The only network traffic is **optional** catalog enrichment: the app can
  query Google Books and Open Library with a title or ISBN, and — only if the
  operator enables it in Settings → Integrations — the Groq API with the
  operator's own key. The Content-Security-Policy in `src-tauri/tauri.conf.json`
  restricts outbound `connect-src` to those hosts.
- Local data protection is expected to come from the operating environment
  (Windows user session, disk encryption). The application does not implement
  its own database encryption; reports about "anyone with disk access can read
  the database" are accepted as feature requests for at-rest encryption rather
  than vulnerabilities.
- The default desk PIN (**6767**) is a convenience lock, not an
  authentication boundary, and is documented as such in the README and the
  in-app legal pages.

## Hardening notes for operators

- Change the default PIN immediately after first login (Settings → General →
  Desk account).
- Back up the library (Settings → Backup) to a location outside the
  installation folder.
- Keep the app updated: installers are published only on the
  [GitHub Releases page](https://github.com/WasewaseX/ketabyar/releases) of
  this repository. KetabYar has no auto-update channel; if you obtained an
  installer elsewhere, it is not ours.
