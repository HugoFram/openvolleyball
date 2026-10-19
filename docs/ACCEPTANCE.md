# Acceptance report

The application was built from the supplied specification against an empty repository. All test data is disposable and synthetic; no old tournament fixture was supplied or modified.

## Automated evidence

- **26 domain, storage and PDF tests** (`npm test`). Includes the exact 17-team/28-result split and a synthetic 23-team state with **104 recorded results**, completed Principale groups 2/3 and a completed Consolante knockout before creation of the eight-team Principale final.
- **7 real Electron GUI/printing tests** (`npm run test:ui`). Native chooser selections are stubbed; renderer, IPC, domain, package writes, PDFs and reloads are real. Renderer exceptions fail the suite.
- All seven also pass against the **packaged application inside app.asar**. The single-file portable launcher was additionally started, opened a copied example, displayed its progression/bracket and closed normally (`node scripts/smoke-portable.mjs`).
- TypeScript validation and production build: `npm run build`.
- Runtime dependency audit: `npm audit --omit=dev` reports **zero vulnerabilities**. The full audit includes eight moderate findings in the electron-builder development dependency chain; no vulnerable runtime dependency is shipped from that chain.
- Actual generated PDF page counts/dimensions are parsed with pdf-lib. Representative A4 pages were rasterized with Poppler and visually reviewed. The two-page PDF was also rendered through Electron’s print engine to a two-page PDF and inspected.

## Traceability

| ID | Implemented behavior and verification |
|---|---|
| A01 | Native directory choosers for creation/opening, visible editable destination, no overwrite, recents/removal, cancel/invalid-open preservation. Unicode paths, duplicate destination, active lock and absent folder covered by storage/GUI tests. Native chooser selection itself is a manual OS check. |
| A02 | Both categories, 3–4-player variable rosters, 0–3 levels, duplicate normalization, averages and stable focus. Existing rosters remain editable during draft preparation; confirmed-category rosters lock. Domain/GUI tests. |
| A03 | Explicit sample generation, 90-team overflow test, unique names and player IDs, category separation. No generation on open. |
| A04 | Default 4 and 4→5→3→4 recommendation tests; immediate options, no refresh action. |
| A05 | 3/4/5 groups, balancing and manual exchanges; draft confirmation and historical phase independence. Domain/GUI tests. |
| A06 | Every unordered pair once, no simultaneous participant/court conflict. Five/two courts: five synchronized pairs and actual PDF page counts **2×5**. Single-court schedules retain all matches. |
| A07 | Second court input absent from the DOM while unchecked; named court persistence and draft exchange GUI test. Enlarged UI/brackets inspected. |
| A08 | PDFs generated before confirmation commit; associated portable paths; readable French headers, plain team bullets and balanced writing areas; actual A4 parsing and raster inspection. Group arbitration changes refresh its sheet. Physical printing remains manual. |
| A09 | Blur-save once per valid pair, zero, 21/25, overtime, incomplete/invalid preservation, explicit correction. Domain and GUI tests. |
| A10 | 2/1 ranking points, score difference, normalized cross-group comparison, completion and serialization. Residual tied ranks are shared until a relevant qualification/seeding choice. |
| A11 | Exact 17 teams, four groups, 28/28 results; eight/nine split; duplicate confirmation idempotency. Domain and full GUI workflow. |
| A12 | Both second phases, Principale third phase and correct historical-node access after reload. Domain/GUI tests. |
| A13 | Exact synthetic 104-score state produces an eight-team final from Principale phase 3, preserving Consolante data byte-for-byte at the aggregate level. Shipped example 02 reproduces the state. |
| A14 | Relevant/irrelevant tie tests, named ordered selectors, required distinct choices, phase/context isolation. GUI test changes split boundary 4→6 to remove an irrelevant tie, then prompts again for final seeding. |
| A15 | Initial phase once, chronological source-linked lanes, phase 3 visible, one final node per lane and correct clicks. GUI tests and screenshots. |
| A16 | 4/8/16 connected trees, entire-card clicks and Enter key, separate popup, horizontal scroll. 4/16 tested at 125% zoom. |
| A17 | Semifinal winners/losers feed final/bronze. Explicit GUI correction announces downstream invalidation; archived old scores survive. Additional tests remove stale sheets even for unplayed dependent fixtures, and archive both branches after common-phase correction. |
| A18 | Random scores fill only eligible unplayed matches; same score validation and invariants; repeated completion is a no-op. Domain/GUI tests. |
| A19 | Atomic snapshots, checksums, backups/history, reload, A→B→A, stale package-write rejection, incomplete-edit guard, canceled/invalid open retention. Simulated disk-full replacement failure preserves old durable/in-memory state. |
| A20 | French labels/accents, visible numeric spinners, scalable card layout, local feedback, focus trapping and keyboard navigation. GUI inspection at normal/125% scaling. |
| A21 | Portable Windows x64 executable, original volleyball icon, bundled PDF fonts/licenses, three sample packages, operator guide and rebuild commands. Packaged application verification uses the same desktop suite with `OV_PACKAGED_EXE`. |

## Known limitations

1. **Legacy migration:** no old package was available. Inspection is read-only; unknown packages are refused without alteration. A faithful migration must be implemented against a representative supplied source. Historical forfeit policy is consequently not claimed as legacy-compatible.
2. **Printing:** stored-PDF rendering through the desktop print engine is tested. A physical printer, its driver, paper margins and the operator’s default PDF viewer require a site check.
3. **Platforms:** Windows x64 is the built/tested distribution. macOS/Linux binaries are not supplied. The executable is unsigned.
4. **Correction policy:** changing a group result with descendants conservatively archives the descendants and relevant split, even if a more selective recalculation could retain them. The confirmation explains this; originals remain recoverable.
5. **Field sizes:** the common bracket engine allows 2–64 with byes; 4/8/16 have dedicated end-to-end coverage. No claim of manual 32/64 visual acceptance is made.
6. **Single writer:** no concurrent package editing or shared network-database workflow. Packages have a live-session lock.
7. **Roster changes:** existing teams can be edited while only drafts exist. Adding teams after a draft requires deleting that draft and generating a new distribution, preserving its fixed capacities.

## Concise manual checklist

- [ ] Launch the portable executable; create a disposable tournament using the actual **Parcourir** directory dialog, including a Unicode/spaced path. Cancel once and try a duplicate destination.
- [ ] Register one team in each category, edit a level without losing focus, then confirm the proposed sporting rules with the event organizer.
- [ ] Generate groups, swap two teams, toggle two courts, confirm and inspect/print an A4 sheet on the actual site printer.
- [ ] Enter 21–0 and a valid 25-point overtime result; verify an invalid/partial pair leaves saved results intact.
- [ ] Open a copy of example 01 and split eight/nine. Open example 02 and create the eight-team Principale final from groups 3 without affecting Consolante.
- [ ] Play semifinals, final and Petite finale; correct an upstream score, read/confirm the consequences and replay the invalidated matches.
- [ ] Close/reopen, switch A→B→A, and verify phase 3, results, tie decisions, documents and correction history.

For a packaged rerun after `npm run package`:

```powershell
$env:OV_PACKAGED_EXE = (Resolve-Path 'release/win-unpacked/Open Volleyball.exe').Path
npm run test:ui
Remove-Item Env:OV_PACKAGED_EXE
```

The unpacked executable and portable wrapper contain the same packaged application. The wrapper is additionally launch-checked separately.
