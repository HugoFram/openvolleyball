# Acceptance report

The application was built from the supplied specification against an empty repository. Automated tests use disposable synthetic data; the three original example tournaments remain unchanged. Alpha.2 also uses a separate read-only diagnostic of locally approved scans, with copies kept outside version control.

## Named backups: 2.0.0-alpha.9

- **76 unit tests pass.** Backup tests additionally check a chosen Unicode name,
  automatic `.openvolley` extension, rejection of invalid names, and preservation
  of an existing backup when the same name is chosen again.
- The targeted **packaged export workflow passes** with the renamed Exports et
  backup page and Créer un backup du tournoi button. It exercises the save dialog,
  exact custom backup folder name, cancellation, duplicate-name error, CSV export
  and reopening the backup with unchanged tournament state.
- Existing backups are never overwritten or merged. Their folder name is chosen
  by the user; the tournament name and identifiers inside remain unchanged.
- Scanning and recognition models remain unchanged. The full 19-workflow packaged
  regression suite passed in alpha.8; alpha.9 reruns the affected export workflow.

Manual check: click Créer un backup du tournoi, edit the suggested name, choose
its location, and reopen the resulting `.openvolley` folder. Try the same name
again and confirm the existing copy is retained.

## V2 tournament snapshots and player CSV: 2.0.0-alpha.8

- **76 unit/domain/storage/model/PDF tests and 19 packaged Electron workflows
  pass.** New tests cover complete snapshot preservation and independent reopening,
  unchanged originals, repeated snapshots, destinations inside the original or
  aliased to it, failed-copy cleanup, and five-column CSV escaping/UTF-8/levels.
- The packaged UI has exactly two action buttons in Exports et diagnostic. The
  tests exercise both native location dialogs, cancellation with no file or state
  changes, custom CSV filename, and reopening a snapshot through the ordinary
  tournament-opening workflow. Results, document bytes, original/aligned scans,
  history, identifiers and revision are retained.
- Scanning, recognition models and the optional advanced reader pack are unchanged.
  The existing score/registration scanning, printing and tournament lifecycle
  workflows still pass. Experimental recognition status is retained.
- A snapshot does not include the active session lock. Copies are published only
  after successful completion and never merged into an existing snapshot. The
  source tournament is not modified by either export.

Manual acceptance checklist:

1. Open Exports et diagnostic and confirm only the snapshot and CSV buttons remain.
2. Choose a snapshot destination, then open its dated `.openvolley` folder through
   Ouvrir un autre tournoi; check teams, results, progression, PDFs and scans.
3. Export the CSV with a chosen filename; check all five columns, accents, optional
   empty fields and levels N/R/D/U. Cancel each dialog once and confirm nothing is
   created or changed.

## V2 experimental native registration reader: 2.0.0-alpha.7

- **72 unit/domain/storage/model/PDF tests pass**, including pack integrity,
  path constraints, local authenticated requests, incomplete generation rejection,
  cancellation, and native crop pixel preservation.
- **18 packaged Electron workflows pass**: the existing 17 plus an optional real
  Qwen3.5 / llama.cpp workflow. It installs the local pack through the UI, cancels
  during handwriting processing, resumes cut/rotated half sheets, verifies reader
  provenance, corrects text, saves an actual team and reloads it. Browser network
  access is disabled. Existing scores, progression, bracket and print paths pass.
- Native GPU replay on all 104 exported fields: 45/61 eligible nonempty strings
  exact (73.8%), names 19/24, emails 8/12, blanks 39/39. Four mismatched/clipped
  labels excluded; no training on the reviewed registrations. The **75% requirement
  is not met**. Writer-independent accuracy remains unproven.
- Processor-only native startup and two nonempty fields plus one blank complete
  successfully. It is substantially slower (about 55 seconds recognition for this
  tiny smoke test); this is a compatibility check, not an accuracy benchmark.
- Packaged model verification confirms the public generic integrated reader,
  zero private training fields, and all eight runtime file hashes. No private
  model, handwriting sample, source model chunks or training dependencies are
  included. The optional native pack is separate and hash-verified.
- Portable launcher smoke passes: disposable tournament, progression and bracket,
  normal close. Production dependency audit reports zero vulnerabilities.

Manual acceptance checklist:

1. Confirm **Expérimental** appears in the navigation and on Feuilles scannées.
2. Install the unpacked local reader folder, disconnect Internet, import ordinary
   cursive registration half sheets and compare every proposed string to its crop.
3. Cancel during reading, resume, correct names and emails, save the team and reopen
   the tournament. Existing approved scans must keep their corrected values.
4. Try processor-only mode on a short batch, then return to the integrated reader.
5. Scan and approve a score sheet; confirm scores and downstream progression still
   require the normal explicit approval.

Detailed comparison and limits: [registration reader report](REGISTRATION-READERS.md).

## V2 registration personalization: 2.0.0-alpha.6

- **67 domain/storage/PDF/model tests**, **six training/privacy-policy tests** and
  **17 Electron workflows** pass. All 17 also pass against the final packaged app;
  both rotated/cut registration workflows use its real local personalized reader.
  The generic public build's 17 workflows pass as well.
- The portable Windows launcher opens a disposable example, shows progression
  and bracket, and closes normally. Its eight selected registration model files
  match their manifests inside app.asar; task prefixes and the 61-field local model
  are verified. No raw private samples, source model chunks or native ONNX library
  are packaged. Runtime dependency audit: zero findings.
- A prior six-sheet adaptation is evaluated on two reserved sheets: exact fields
  7/23 → 12/23, emails 1/7 → 3/7 and email character errors 32 → 8. This limited
  cross-sheet transfer does not prove independent-writer accuracy. Complete
  conditions and limits are in [the aggregate report](reports/registration-alpha6-transfer.json).
- The final local model then fits 61 usable fields from all eight sheets. Replaying
  that same batch matches all 61 usable fields and all 39 blanks; this is training
  fit, explicitly separated from the reserved-sheet comparison. Four inconsistent
  or clipped fields remain counted as errors in the complete-batch report.
- Personalized weights and corrected private strings remain outside the public
  source repository. Explicit local-build configuration selects a private model;
  the normal public source build retains the generic model. Export-policy tests
  reject attempts to write private weights into public model assets.
- Revised branded two-per-page registration forms were rendered with Poppler and
  visually reviewed. Both halves match, and email columns gain 17% width while old
  saved forms retain their own geometry. App/Python preprocessing matches exactly
  on all 104 supplied crops. Original 106 registration-export files, 104 reviewed
  score-export files, 34 example files and the accepted digit weights retain hashes.

## V2 recognition and referee layout: 2.0.0-alpha.2

- **56 domain/storage/PDF tests** pass. New checks cover faint ink normalization,
  center of mass, tally exclusion, recovery of ink below a guide, explicit
  ambiguity, compact paper area and layout-independent sporting identity.
- **13 Electron tests** pass. The scan test includes handwritten digits plus tally
  marks, a legacy-template layout refresh, manual resolution of uncertain reads,
  an impossible-score warning, immutable original predictions across a draft,
  reviewed crop export and a full-score evaluation of that export.
- All 13 also pass against the packaged application, using its embedded local
  handwriting model and WASM runtime. Runtime dependencies have zero audit findings.
- A controlled comparison on 1,000 MNIST digits in each of four simulated
  conditions reports numeric errors separately from explicit review cases. It is
  not a field-accuracy estimate. See [the report](reports/digits-alpha2-controlled.json).
- A separate diagnostic on **52 locally approved whole scores** found 12 wrong
  numeric suggestions with alpha.1; alpha.2 produces 46 correct, 1 wrong and 5
  explicit review flags. The batch helped diagnose clipped lower pen strokes and
  was used during development, so it is **not independent validation**. No source
  scans, names or detailed real labels are distributed. The source tournament's
  JSON and the 34 original example files retain their hashes.
- The five-team and single-match A4 layouts were rendered and visually checked.
  Final-score boxes occupy less than 15% of the densest group cell. Existing print
  tests still require real nonblank page content.

## V2 offline scan milestone: 2.0.0-alpha.1

- **51 domain/storage/PDF tests** pass. Scan-specific coverage includes immutable
  input, one-revision multi-match approval, durable provenance, repeated approval
  rejection, partial/invalid/conflicting scores, changed fixtures, stale sheets,
  roster limits and page geometry.
- **13 Electron tests** pass, including the ten existing lifecycle/printing tests
  and three new scan workflows. The scan workflows also passed four consecutive
  repetitions with random form IDs after tightening multi-code detection.
- All 13 also pass against the packaged application inside `app.asar`, including
  its embedded WASM runtime and handwriting model. The 34 original example files
  retain their SHA-256 hashes; the runtime dependency audit reports no findings.
- The v2 single-file Windows launcher also passed its smoke test: it opened a
  disposable copy of the example, displayed its progression/bracket and closed.
- Real MNIST handwritten digits are embedded in printed score boxes and the PDF
  is rotated. The bundled worker reads them without external network requests;
  scores stay empty until review and approval. Reimporting the source creates no
  duplicates, and the original/provenance remain in the saved tournament.
- Two separate QR registration forms on one A4 are identified independently;
  N/R/U checkbox marks are read locally, Unicode names are reviewed into a valid
  three-player roster, and the second form remains pending.
- A two-court five-team PDF imports both pages with the right form IDs. JPEG
  import, missing QR codes, manual association, a review draft surviving reload,
  blank cells and stale IPC revisions are exercised too.
- Representative branded A4 group and one/two-per-page registration PDFs were
  rendered with Poppler and visually checked. Print-content tests remain active.
- These tests establish workflow correctness, **not handwriting accuracy on real
  tournament scans**. A physical scanner and multiple-writer trial remains on the
  [manual acceptance checklist](V2-OFFLINE.md).

## Version 1.3 automated evidence

- **47 domain, storage and PDF tests** (`npm test`). Includes the exact 17-team/28-result split and a synthetic 23-team state with **104 recorded results**, completed Principale groups 2/3 and a completed Consolante knockout before creation of the eight-team Principale final.
- **10 real Electron GUI/printing tests** (`npm run test:ui`). Native chooser selections are stubbed; renderer, IPC, domain, package writes, PDFs and reloads are real. Renderer exceptions fail the suite.
- All ten also pass against the **packaged application inside app.asar**. The single-file portable launcher was additionally started, opened a copied example, displayed its progression/bracket and closed normally (`node scripts/smoke-portable.mjs`).
- TypeScript validation and production build: `npm run build`.
- Runtime dependency audit: `npm audit --omit=dev` reports **zero vulnerabilities**. The full audit includes eight moderate findings in the electron-builder development dependency chain; no vulnerable runtime dependency is shipped from that chain.
- Actual generated PDF page counts/dimensions are parsed with pdf-lib. Representative A4 pages were rasterized with Poppler and visually reviewed. The actual Imprimer button path renders complete PDF pages through PDF.js at 200 DPI before printing the resulting HTML. Tests check decoded page pixels, embedded image resources and one/two-page output, rather than relying on page count alone. The resulting print PDFs were rasterized and inspected.

## Version 1.3 bracket editing

Ten new domain tests cover immutable previous-phase ranks (including shared places), first-round swaps in 4/8/16-team draws, qualification/graph identity preservation, unaffected Consolante results, PDF invalidation, dependency progression, 3/5/6/7-team exemptions, rejection after play, invalid teams, same-match side swaps and persistence. A desktop test opens an older bracket without rank snapshots, performs keyboard and mouse selection, swaps a bye beneficiary, verifies the updated PDF text and associations, reloads, records a result and verifies both UI and direct-command lockout.

## Version 1.2.1 table layout

Cell text is vertically centred as a wrapped block, including headers and filled registration forms. Match table rows are capped at exactly 5 cm (141.732 PDF points). Representative single-match, three-team, five-team and registration sheets are rasterized and visually reviewed; pagination and real print-content tests remain in force. Existing group/final PDFs receive a new layout fingerprint on open.

## Version 1.2 print/layout coverage

One-page five-team/single-court sheets and two-page five-team/two-court sheets; paired team columns followed by score columns at least one third wider; actual PDF text positions for footer URL, phase identity and absence of application branding. Two desktop tests invoke the real Imprimer button and replace only the final physical printer call with Chromium printToPDF, checking all page images are decoded, nonblank and included in the printed output. The dedicated print renderer has no access to tournament mutation APIs. The supplied ICO is retained byte-for-byte; its PNG derivative is used in the app.

## Version 1.1 change coverage

Nine added tests cover roster bounds and letter mapping; exact ratio ranking; two consecutive result-seeded group phases independent of player strength; decisive grouping ties; court restrictions; optional final referees and PDF fingerprints; historical one-point scores with new two-point scoring; website validation; portable logos, links and registration PDFs on every page. The desktop suite exercises letter typing, printable blank forms, full roster printing, general rankings, previous-rank badges and automatic final sheets as teams advance. Printing UI calls are intercepted in repeatable tests; the content-based Electron print tests exercise the actual application route.

## Traceability

| ID | Implemented behavior and verification |
|---|---|
| A01 | Native directory choosers for creation/opening, visible editable destination, no overwrite, recents/removal, cancel/invalid-open preservation. Unicode paths, duplicate destination, active lock and absent folder covered by storage/GUI tests. Native chooser selection itself is a manual OS check. |
| A02 | Both categories, 3–4-player rosters enforced on creation/update, N/R/D/U levels, duplicate normalization, averages and stable focus. Existing rosters remain editable during draft preparation; confirmed-category rosters lock. Domain/GUI tests. |
| A03 | Explicit sample generation, 90-team overflow test, unique names and player IDs, category separation. No generation on open. |
| A04 | Default 4 and 4→5→3→4 recommendation tests; immediate options, no refresh action. |
| A05 | 3/4/5 groups, initial balancing, subsequent result-based snake seeding and manual exchanges; draft confirmation and historical phase independence. Domain/GUI tests. |
| A06 | Every unordered pair once, no simultaneous participant/court conflict. Five/two courts: five synchronized pairs and actual PDF page counts **2×5**. Single-court schedules retain all matches on a single page, including ten-match five-team groups. |
| A07 | Two-court option only for five-team groups; second field absent while unchecked; named court persistence and draft exchange GUI test. Enlarged UI/brackets inspected. |
| A08 | PDFs generated before confirmation commit; associated portable paths; readable French headers, plain team bullets and balanced writing areas; actual A4 parsing and raster inspection. Group arbitration changes refresh its sheet. Physical printing remains manual. |
| A09 | Blur-save once per valid pair, zero, 21/25, overtime, incomplete/invalid preservation, explicit correction. Domain and GUI tests. |
| A10 | Fixed wins/played then difference/played ranking, general cross-group table, completion and serialization. Residual tied ranks are shared until a relevant qualification/seeding choice. |
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
| A21 | Portable Windows x64 executable, user-supplied volleyball icon, bundled PDF fonts/licenses, three sample packages, operator guide and rebuild commands. Packaged application verification uses the same desktop suite with `OV_PACKAGED_EXE`. |

The immutable original examples keep their original schedules and sporting allocations. Opening a working copy updates its PDF associations; standings and future decisions follow the new fixed ranking policy.

## Known limitations

1. **Legacy migration:** no old package was available. Inspection is read-only; unknown packages are refused without alteration. A faithful migration must be implemented against a representative supplied source. Historical forfeit policy is consequently not claimed as legacy-compatible.
2. **Printing:** stored-PDF rendering through the desktop print engine is tested. A physical printer, its driver, paper margins and the operator’s default PDF viewer require a site check. Windows’ native dialog may still report that its own preview is unsupported; the application prepares a complete rendered view before printing. This is distinct from blank page output.
3. **Platforms:** Windows x64 is the built/tested distribution. macOS/Linux binaries are not supplied. The executable is unsigned.
4. **Correction policy:** changing a group result with descendants conservatively archives the descendants and relevant split, even if a more selective recalculation could retain them. The confirmation explains this; originals remain recoverable.
5. **Field sizes:** the common bracket engine allows 2–64 with byes; 4/8/16 have dedicated end-to-end coverage. No claim of manual 32/64 visual acceptance is made.
6. **Single writer:** no concurrent package editing or shared network-database workflow. Packages have a live-session lock.
7. **Roster changes:** existing teams can be edited while only drafts exist. Adding teams after a draft requires deleting that draft and generating a new distribution, preserving its fixed capacities.

## Concise manual checklist

- [ ] Launch the portable executable; create a disposable tournament using the actual **Parcourir** directory dialog, including a Unicode/spaced path. Cancel once and try a duplicate destination.
- [ ] Register one team in each category, type N/R/D/U without losing focus and verify that only three or four players can be saved.
- [ ] Create with a logo and website. Generate groups, swap two teams, toggle two courts only in a five-team group, confirm and print a branded A4 sheet on the actual site printer.
- [ ] With five teams on one court, verify ten matches on one page; with two courts, verify two pages of five matches. Check paired team columns, wider scores, the larger logo and footer URL; test Imprimer directly on the Brother printer.
- [ ] Print blank registration forms at one and two per page; complete a final and print an individual team’s roster from its ranking row.
- [ ] Create a subsequent group phase and verify previous-rank badges, result-based seeding, general ranking and numbered decisive tie selectors.
- [ ] Open an unplayed final match: referee blank/optional; Afficher/Imprimer already available; later-round sheets update after semifinals.
- [ ] Enter 21–0 and a valid 25-point overtime result; verify an invalid/partial pair leaves saved results intact.
- [ ] Open a copy of example 01 and split eight/nine. Open example 02 and create the eight-team Principale final from groups 3 without affecting Consolante.
- [ ] Before a final starts, compare # badges with the previous general ranking. Use Échanger des équipes, select two first-round teams, then Terminer les échanges. Reopen and verify the draw, exemptions and PDFs; record one result and confirm swaps are locked.
- [ ] Play semifinals, final and Petite finale; correct an upstream score, read/confirm the consequences and replay the invalidated matches.
- [ ] Close/reopen, switch A→B→A, and verify phase 3, results, tie decisions, documents and correction history.

For a packaged rerun after `npm run package`:

```powershell
$env:OV_PACKAGED_EXE = (Resolve-Path 'release/win-unpacked/Open Volleyball.exe').Path
npm run test:ui
Remove-Item Env:OV_PACKAGED_EXE
```

The unpacked executable and portable wrapper contain the same packaged application. The wrapper is additionally launch-checked separately.
