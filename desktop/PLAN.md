# Estimate Pro for Windows (this folder is not published with the site)

**21 Nov 2026 — first build for the owner's own use:** an Electron window on the live app (`main.js`), built by `.github/workflows/windows-app.yml` on windows-latest → installer and portable .exe as the run's artifact. No code signing, no Store, live site (the service worker keeps it working offline). The Tauri plan below stays as the smaller alternative for the public release.

## Earlier plan

## What works today
The site is an installable app (manifest + service worker). On Windows: open it in Edge or Chrome → ⋯ → Apps → Install.
It gets its own window, Start-menu entry and works offline. It counts as one device of the licence (label "Windows PC · Edge (installed app)").

## The Windows application (.exe / .msi)
Recommended: **Tauri 2** wrapper (uses the WebView2 that Windows 10/11 already has; installer about 5–10 MB).
Electron is the fallback (about 90 MB) if WebView2 gives trouble with WebGL2 or the service worker.

1. `desktop/src-tauri` — window 1280 × 800, title "Estimate Pro", icon from `icon-512.png`, user agent suffix `EstimateProDesktop/<version>`
   (js/ui-devices.js already labels that as "Windows app").
2. Content: the app files bundled inside the installer (works with no internet from the first start); the server calls go to Supabase as on the web.
   Updates: Tauri updater reading a `latest.json` published with each release — or simply load the live site and let the service worker update.
3. Build: GitHub Actions on `windows-latest`, started by hand (workflow_dispatch) → `.msi` and `.exe` as a release download.
   Pushing a workflow file needs a token with the `workflow` permission.
4. Native extras worth adding later: open / save DXF and PDF through the Windows file dialogs, file association for `.epcad`, printing, a tray icon.

## Licence
Same sign-in as the web. Device limit: the Windows app is one device (server/devices.sql). A "Windows + phone" licence is simply a limit of 2.
Offline: the app keeps working with the last verified licence for N days (to decide — suggested 15), then asks to go online once.

## Decisions for the owner
- Publisher name on the installer and whether to buy a code-signing certificate (without one Windows SmartScreen warns "unknown publisher"; about ₹8–25 thousand a year).
- Bundle the files (true offline, needs an updater) or load the live site (always current, needs internet for the first start).
- Offline grace period in days.
- Microsoft Store listing (one-time developer fee) or direct download only.
