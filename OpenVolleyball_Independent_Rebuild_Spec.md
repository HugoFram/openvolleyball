# Open Volleyball — Independent Rebuild Product Specification

**Version:** 1.0 — 18 October 2026  
**Purpose:** Standalone brief for a fresh Codex Work implementation, independent of AgentsOrchestrator and independent of the existing application's implementation.  
**Language of the end-user application:** French.  
**Technology choice:** Left entirely to the implementation agent. No framework, language, database, operating system, build tool, hosting platform, or development environment is prescribed by this specification.

## 1. Product mission and scope

Build **Open Volleyball**, a user-friendly application for preparing, conducting, scoring, and documenting local volleyball tournaments from registration through the final standings. The operator needs to run a tournament in real time, on site, without losing results, repeatedly copying scores between screens, or struggling with technical controls.

The application must support:

1. Creating, opening, switching, and safely saving portable tournament packages.
2. Registering teams and their players, including player skill levels.
3. Generating balanced initial groups and an intelligible round-robin schedule, with one or two courts per group and match referees.
4. Creating printable match sheets; entering or generating scores; maintaining standings; and completing phases.
5. Splitting qualified teams into **Principale** and **Consolante** after the common initial groups.
6. Creating any number of subsequent group phases independently in either branch.
7. Creating and playing elimination brackets (including semifinals, final, and third-place match where applicable).
8. Navigating the entire tournament from **one unified, chronological, branching progression view**.
9. Correcting past results safely, reopening a tournament without data loss, and creating the next phase from the right data.

**Out of scope unless separately agreed:** public tournament websites, user accounts, cloud synchronization, online multiplayer scoring, payments, subscriptions, public APIs, or a generalized sports platform. Do not spend implementation effort reproducing the former orchestration system.

### Core domain terms

- **Tournament / tournoi:** One named tournament package, with one or more competition categories.
- **Category / catégorie:** At minimum **Hommes** and **Femmes**, with independent registration, group phases, qualifications, and final standings. Do not mix category results.
- **Team / équipe:** Registered team with a unique display name within its category, its own players, and a calculated strength indicator.
- **Player / joueur:** Person on a team, with a name, optional contact/club details, and a skill level.
- **Group / groupe:** Three, four, or five teams playing each other once within a group phase.
- **Phase:** A confirmed, persistent stage of a competition: initial groups, subsequent groups, or elimination finals. Draft preparation precedes confirmation.
- **Principale / Consolante:** Independent competitive paths formed after the common initial group phase.
- **Round / tour:** A set of knockout matches, e.g. *Demi-finales*, *Finale*, *Petite finale*. Rounds are **inside one final phase**, not individual nodes in the tournament-wide navigator.
- **Package:** Portable durable storage for tournament identity, registrations, all results, phases, documents, and audit/correction history.

## 2. Operator workflow (the golden journey)

1. Launch the application; **create a tournament** (name and chosen destination) or **open an existing tournament**, including a recent one.
2. Choose **Hommes** or **Femmes**; register teams and players, or explicitly generate sample teams for exploration.
3. Review/edit player levels, validate registration, and prepare the initial groups.
4. Choose **Équipes par groupe**, review suggested group structures, configure the phase target **Victoire en [21/25] points**, generate balanced groups, optionally swap team assignments, assign courts, and confirm the phase.
5. Automatically produce the match sheets. Preview or print them only when the operator explicitly requests it.
6. Enter and automatically save scores while matches take place, or trigger eligible random results for a demo. Observe correct group rankings and phase completion.
7. From the unified progression navigator, create the **Principale / Consolante** split, choose the number of teams in Principale, resolve any *relevant* ranking ties through clear team selectors, and confirm the split.
8. For each branch independently, create further group phases (phase 2, phase 3, and beyond) **or** create a final elimination phase when permitted. Confirm groups, play matches, and revisit historical results.
9. Navigate to a final phase, view the **connected rightward knockout bracket**, click anywhere on a match card, edit or inspect its score/court/referee/sheet in a separate popup, and see winners and applicable semifinal losers advance.
10. Close and reopen the package; verify scores, rankings, groups, paths, phase statuses, knockout participants, document associations, and corrections are intact. Switch to another package and back without restarting.

A normal workflow must not require hand-entering special text syntax, manual database manipulation, hidden developer modes, rebuilding the application, or navigating to a different branch before seeing the common tournament progression.

## 3. Tournament creation and package management

### 3.1 Start screen

Offer **Créer ou ouvrir un tournoi**, with:

- Tournament name.
- Destination folder and a *visibly labelled* **Parcourir** button that opens a folder chooser (not a file chooser). The selected path is visible and editable where appropriate.
- **Créer le package**.
- **Packages récents**, with **Ouvrir le récent**, browse/open existing package, and ability to remove an inaccessible/stale item from the recent list without deleting its files.
- Distinct affordances for choosing a destination *for a new package* versus opening an *existing package*.

Canceling a chooser must not change the selected package or create files. Paths containing Unicode or spaces must work. Missing, inaccessible, malformed, or conflicting destinations must yield understandable errors. Never overwrite a preexisting tournament package silently.

### 3.2 Open another tournament

Show **Ouvrir un autre package** in the active tournament. Opening a valid new package must replace the full active session atomically: title, category, teams, phases, UI selection, courts, matches, rankings, PDF links, and pending actions. If the picker is canceled or the selected package is invalid, retain the current working tournament. Before switching, finish valid pending saves against the *old* package. For incomplete or invalid pending edits, require a clear choice rather than discarding them or saving into the next package.

### 3.3 Portability, integrity, and history

The user should be able to move/copy a complete tournament package, reopen it later, and continue without network connectivity. Documents should remain associated with the correct package. Use transactional/atomic persistence so a crash or interrupted operation cannot silently leave half-created phases or half-applied results. Preserve immutable identifiers independently of editable team names. Maintain creation and modification timestamps and enough revision/audit information to explain changes.

**Legacy comparison:** The previous application used `.openvolley` tournament folders/packages. If legacy examples are supplied, provide a safe **read-only import or migration** workflow to make them testable; internal storage may use any technology. Never mutate source fixtures. Preserve identifiable teams, categories, phase hierarchy, match results, qualification, referees/courts, and history where representable; disclose any incompatible fields rather than discarding them silently.

## 4. Categories, team registration, and players

- Support separate **Hommes** and **Femmes** competitions inside one tournament. Each category has its own teams and progresses independently.
- Each team has an editable name, a persistent unique identifier, and a roster of players. Name uniqueness is **within its category**; normalize for duplicate detection while preserving displayed accents and casing. Allow teams to be marked withdrawn with safe downstream treatment, without deleting their historical results.
- Player records include **name**, optional **email**, optional **club**, and an integer skill/level. Historical product data has level values **0–3** and teams with **three or four players**; support those real scenarios. Do not arbitrarily fix the roster size at two or require optional details.
- Display an aggregate **team strength/level indicator** calculated from its players (the observed product uses a numeric average). Use it to assist group balancing. Show each group's average strength during preparation.
- A level field must **retain focus when a character is typed**. Normal click, Tab, arrow-key, Enter, and other standard navigation still work; do not auto-jump to another field after a valid entry.
- Registration is editable during preparation and locks or becomes controlled once confirmed group results depend on it. Later changes must not retroactively alter confirmed phase history without an explicit supported correction workflow.
- Validate missing required names, duplicate teams, invalid player levels, and impossible tournament group structures with localized actionable messages.

### 4.1 User-triggered test data

Provide **Générer des équipes** (or a clearly identifiable equivalent) in the ordinary distributed application. It must be discoverable without hidden modes. Generated names are short, unique within the tournament/category, and collision-free against previously registered teams. Once predefined names are exhausted, use **Team 1**, **Team 2**, etc., skipping collisions. Generated teams and players must have real distinct identities. Never rename real registered teams to avoid a collision. Generation occurs **only when explicitly requested**, never on opening a real tournament.

## 5. Group structures, generation, and courts

### 5.1 Structure selection

- Group capacities are **3, 4, or 5 teams**; allow combinations such as `5+5+5+5+3`, `4+4+4+4`, or a mixed distribution when those totals fit the registered teams.
- Label the preferred size **exactly `Équipes par groupe`** (accent required). Initial preference is **4** unless a different saved value exists.
- After teams are validated, calculate feasible structures immediately, without an **Actualiser les structures** button. Recalculate on *every* preferred-size change.
- Auto-select a recommended valid structure maximizing the number of groups of the requested size; retain a deliberate valid manual selection when consistent with the updated preference and never leave an invalid stale choice.
- Present readable structure options (e.g. `5+5+4+4`) and count of groups/teams. Prevent impossible combinations and avoid destructive recalculation of already confirmed phases.
- Expose the scoring target in a separate, non-overlapping row **below** size and structure: **`Victoire en [21 or 25] points`**. This must control actual match validation, score generation, and documents. Never silently rewrite an in-progress phase when the target changes.

### 5.2 Group assignment and draft review

- **Générer les groupes** creates a *draft*, not a confirmed phase. Distribute teams into valid-capacity groups while balancing average team strength as sensibly as the available information permits.
- Render group cards with **Groupe N**, its average strength, a list of teams with individual strength indicators, and configured courts.
- Permit user-controlled team swaps between groups before confirmation (two-click source/destination or an equally accessible interaction). Swap actions should preserve each group's capacity. Provide mouse and keyboard access.
- Re-generation must be explicit, and it must not erase previously confirmed groups or match results.

### 5.3 Court controls

- Place **Deux terrains** in the group-card heading alongside group number and average level.
- Immediately below display `Terrain : [first court field] [optional second court field]`.
- The **second field is completely invisible when unchecked**; hiding it means removing it from layout, not merely disabling/greying it.
- Inputs may be compact but must accept useful **multi-character** identifiers. They must not overlap, spill into another card, or collide with labels at normal or enlarged display scaling.
- Persist court names with the phase and use them in scheduled matches and PDFs.

### 5.4 Round-robin scheduling

For an N-team group, produce one match per unordered pair: **3 teams → 3 matches; 4 → 6; 5 → 10**. Preserve a stable, meaningful **printed match order**, assignments to the configured court(s), and referee information.

For two courts, schedule compatible matches in parallel when feasible, without placing one team in two simultaneous matches; group five on two courts must produce **two pages of five matches** across its match sheets, corresponding to the ten actual matches. The historical five-team two-court schedule uses five synchronized pairs of matches and has one resting team available to referee each pair. Never invent extra matches, truncate a complete round-robin, or silently reuse a team in simultaneous fixtures. If a referee cannot be assigned under chosen constraints, show the gap for explicit operator resolution rather than fabricating a referee.

Confirmation persists the phase, groups, teams, courts, match schedule, referee assignments, target, and state as one coherent operation.

## 6. Match scoring, standings, and phase lifecycle

### 6.1 Score entry

- Display matches in **printed order**, with team names, court and referee where appropriate.
- Each match has two score fields in the shown Team A/Team B order. **Automatically save a complete valid pair when leaving a score field**, not on every keystroke. `0` is a valid numeric score, not missing input.
- Do not display routine **Enregistrer** or **Forfait** buttons beside group score fields.
- Validate scores against the selected **21/25-point target** and the actual approved competition rules. Support legitimate extended scores above the target where the rules allow them (existing example: **30–28** for a 25-point final). Do **not** silently invent a new margin or overtime rule; the exact rule must be made explicit before acceptance.
- Incomplete or invalid edits cannot overwrite an existing valid result. Explain the affected row and reason. A repeated focus-loss event cannot duplicate persistence or repeatedly advance the tournament.
- Update the winner, group ranking, dependent qualification and view state after a successful save. If a save fails, provide visible error feedback; do not claim success.
- Corrections to saved scores are possible through an explicit supported path and retain enough history to identify the prior value and consequences.

### 6.2 Rankings

- Show for each group: teams, matches played, wins/losses, relevant competition points, points scored/conceded, point difference, and ranking/position.
- Previously established product mechanics award **2 ranking points for a win and 1 for a loss**; rankings compare applicable competition points, then point difference, then an explicit manual ordering if the existing ranking criteria leave a meaningful tie. Keep the actual comparator visible and consistent.
- For forfeits inherited from older tournament data, maintain their historical meaning and impact on standings; removing a routine score-entry button must not erase historical forfeit records. Any new visible forfeit-management workflow requires a separately explicit product decision.
- Distinguish *within-group rank* from *cross-group qualification/seeding rank*. In particular, compare teams from 3/4/5-team groups using defined rules rather than pretending all groups played the same number of matches.

### 6.3 Phase states and completion

Every phase has a durable status: **Préparation**, **En cours**, **Terminée**. A phase becomes completed when all required matches are valid and the phase-completion/confirmation criteria are fulfilled. Expose any remaining prerequisites. Its results and ranking remain accessible after completion and after app restart. A completed phase enables eligible successor creation; it never spontaneously creates later phases. Disabling random-scoring or completion actions after successful completion can be correct behavior.

### 6.4 Random scores for demonstrations

Provide a discoverable, explicit **Générer des scores aléatoires** action in the ordinary application. It generates **valid scores only for eligible unplayed matches** by default, obeys 21/25 targets and knockout dependencies, and commits via the same validation/persistence/standings path as manual entry. Never silently replace existing real scores. If overwrite is ever offered, make it a separate, clearly destructive action with confirmation and proper downstream invalidation.

## 7. Qualification into Principale and Consolante

After the **common initial group phase** has completed, offer a visible **Créer Principale / Consolante** action. The operator selects **Nombre en Principale** using a numeric control wide enough to show its value and spinner arrows at ordinary/enlarged display scaling.

Qualification must:

- Determine eligible teams using the standings and the established group-finish/cross-group comparison policy.
- Assign each team to exactly one of **Principale** or **Consolante**; preserve the source phase and qualification provenance.
- Respect the requested Principale count and show how many teams remain in Consolante.
- Prevent duplicates, inconsistent partial splits, or multiple splits from double-clicking. Show a specific blocker if the initial phase, count, result set or tie decisions are incomplete.
- Persist and reopen the split, with each lane subsequently independent.

### 7.1 Ties — structured decision UI

Do **not** ask users to type opaque strings such as `Team 14 > Team 7` or `Ordre manuel : Équipe A > Équipe B`. When a genuinely relevant qualification/seeding tie remains:

1. Identify the tied teams by name and show the pertinent standings metrics and **why** a decision affects the requested next phase.
2. Offer a dropdown, radio choices, or a clear ordered-selection control to select the preferred team/order.
3. Validate every required choice and persist it against the **correct source phase and decision context**.
4. Never reuse an earlier phase's tie decision as an implicit decision for a later phase.
5. Do **not** require decisions for an exact statistical tie that cannot affect the qualification boundary or required seeding.

An irrelevant tie is not a reason to block a valid split/final. An unresolved *relevant* tie should block with actionable, specific guidance, not a generic `Impossible ...` error. Do not invent arbitrary ordering by team name or insertion time where a genuine human tie choice is required.

## 8. Later group phases and branch progression

- After splitting, the operator can create another **group phase** in Principale or Consolante independently.
- Group phase numbering begins with common `Phase groupes 1`, then a lane's `Phase groupes 2`, `Phase groupes 3`, etc. There is **no hard-coded maximum**.
- A new group phase uses the eligible teams of that branch, derives its source from the last completed phase, offers a structure/court/target draft, supports intentional team rearrangement, confirms schedules, and allows scoring and completion.
- History and phase IDs must stay distinct: phase 3 must never masquerade as phase 2, show `à démarrer` after actual completion, or display another phase's teams or scorecards.
- Historical completed phases remain browsable and read-only except through an intentional correction operation.
- Permit a final elimination phase after the last eligible completed non-final phase. Once a branch's final phase is completed, don't offer another normal successor in that branch.
- **Create phase** operations must be transactional, idempotent and explicit: either succeed and appear immediately in the navigator or fail with the first actionable unmet prerequisite.

## 9. Final elimination phase / Tableau

### 9.1 Creation and seeding

- From a completed eligible group phase, offer **Phase finale** and let the user choose a valid field size suited to the available participants (existing model has supported **2, 4, 8, 16, 32, 64** participants; support at least **4, 8, 16** end to end).
- Qualify and seed teams deterministically from the **current branch's latest relevant completed phase**, not from an old phase or another branch. Resolve only material ties through the structured selector above.
- Present clear eligibility/seeding prerequisites. Don't create a duplicate bracket on repeated clicks.
- Support byes, provided they obey actual competition rules. An unresolved or missing participant is never a playable match.
- A completed Consolante knockout and its saved results must remain intact while a Principale knockout is created.

### 9.2 Round structure

- A typical four-team bracket contains **Demi-finales**, **Finale** and **Petite finale** (third-place match). Semifinal winners feed the final; semifinal losers feed the third-place match.
- For larger fields, support earlier rounds feeding rightward and the same correct winner dependencies. Provide third-place placement only where that is part of the selected tournament structure.
- Allow per-round match target (21 or 25) consistent with existing rules; historical evidence shows semifinal target **21**, final and third-place target **25**. These are meaningful example defaults, not permission to silently revise an ongoing round.
- Updating a completed upstream result must detect already-played downstream matches. Obtain explicit corrective confirmation; safely invalidate/recompute affected participants/results, preserve history and avoid orphaned winner advancement.

### 9.3 Conventional knockout visualization

Use a **left-to-right, visibly connected tournament tree**:

- Each match is a rounded rectangular card containing **only the two team names** (or clear byes/TBD indications). Scores, referee, court and document controls are **not inside the bracket cards**.
- Lines are drawn **outside** rectangles and visibly connect the correct match-card borders across rounds. Semifinal winners converge on the final; applicable losing branches feed the Petite finale. No dangling decorative strokes inside cards.
- Align rows and connector elbows for readability; ensure non-overlap and sensible spacing for 4-, 8-, and 16-team trees; allow horizontal scrolling when needed.
- **The entire card**—background and padding as well as names—is clickable, and keyboard accessible. Clicking opens the correct match-details popup for played or unplayed eligible matches.
- The popup shows both teams, saved/current scores, **Terrain**, **Arbitre**, match state, winner/result, and **Générer la feuille**, **Voir/Afficher**, **Imprimer** where applicable, plus appropriate explicit save/correction controls. Closing it returns to the same bracket location.

## 10. The tournament-wide Progression navigator — primary UI

**Progression is the central way to navigate all phases.** It must not be hidden under `Principale → Progression` or `Consolante → Progression`, nor require a preliminary branch selection to see both lanes.

Conceptually:

```text
                          PRINCIPALE
                   [Groupes 2] -> [Groupes 3] -> ... -> [Phase finale]
[Groupes initiaux] -<
                   [Groupes 2] -----------------> [Phase finale]
                          CONSOLANTE
```

Requirements:

- Show common initial groups **once**, branching into **Principale** and **Consolante** on one shared screen.
- Each lane's nodes progress **chronologically by phase dependencies**, left to right, independently of IDs, creation timestamps, or which tab is selected.
- Render **every** persisted group phase (including phase 3+) with its correct status.
- Render **one `Phase finale` node per lane**. Semifinals, final, and third-place match are subrounds within that node's **Tableau** details, not separate tournament-level nodes.
- Every node is clickable, opening the **correct phase's** group cards/preparation, scores, rankings, or final bracket. Preserve a clear return-to-progression path. A selected node may open its detail inline, below, or on a dedicated page—Codex may choose the presentation so long as the shared navigator stays the primary source of navigation.
- When the last nonfinal phase is eligible for progression, show **Groupes** and **Phase finale** creation choices immediately to its right, scoped to that lane. Explain ineligibility rather than silently disabling/ignoring actions.
- Avoid redundant overarching Principale/Consolante tabs and duplicate nested Progression tabs. Branch labels remain visible as lane headings.

## 11. PDF match sheets, documents, and printing

### 11.1 Generation and location

- On **group confirmation**, automatically generate all group match sheets for the confirmed configuration. This never automatically starts a physical print job.
- The active package has a deterministic, discoverable **documents** location. Do not show or depend on a separate **Dossier de sortie** field.
- Per group/sheet, keep **Afficher** and **Imprimer**, linked to the correct stored/current PDF. Remove the redundant **Générer le PDF** group-card action. An actual generation failure must show an actionable error; don't claim a document is ready.
- Show a single **Imprimante** selector above group cards or the relevant document area; don't repeat the selected printer name under every PDF action. Preserve selected printer on view refresh.
- For knockout matches, the separate details popup may offer a sheet-generation action as well as view/print; the existing final-phase sheet behavior was satisfactory and should be retained.

### 11.2 Required A4 layout

Match sheets use readable French headings, group/court identification, target points, readable team list, match order, referee assignments and useful ranking/context. Team list is a **plain bulleted list** (not a boxed table).

The match table has exactly these five headers, in this order and **with accents**:

**Équipe A | Score A | Score B | Équipe B | Arbitre**

Allocate large, **balanced writable areas** in both score columns for handwritten tally marks and result notation. Use generously tall rows filling most of the usable page height, not a small table marooned at the top of an otherwise blank sheet. Prefer white/unshaded cells. Keep team/referee text legible, including long and Unicode names. For five-team groups scheduled on two courts, output **two A4 pages, five matches on each page**. For five teams on one court, preserve all ten matches without artificially dropping games; for three-team groups include all three. Inspect representative rendered pages, not just PDF text extraction.

The system must never silently print without operator action, lose a PDF association after reopen, or display a stale document from another tournament.

## 12. Feedback, safety, and usability

- **French-first** interface. Preserve exact labels: **Équipes par groupe**, **Générer les groupes**, **Victoire en [21/25] points**, **Deux terrains**, **Terrain**, **Créer Principale / Consolante**, **Nombre en Principale**, **Générer des scores aléatoires**, **Progression**, **Phase finale**, **Tableau**, **Afficher**, **Imprimer**, **Parcourir**.
- Normal information such as `Tournoi ouvert. Saisissez une équipe.` or `PDF créé` must not remain as prominent persistent **red error text** after the operator has progressed elsewhere. Reserve warning/error treatment for actual issues.
- Important controls must never be clipped, overlap, disappear unexpectedly, or spill into neighboring cards under ordinary/enlarged interface scaling. Numeric spinners must visibly display their value and controls.
- Use sufficiently large click targets, keyboard access, predictable focus, readable button names, and proper semantic feedback. Entire knockout cards are hit targets.
- Default application/window icon should be a clear volleyball design whose use is legally permitted, included in the shipped application; avoid a generic framework icon.
- Give clear success/in-progress/error feedback for potentially slow operations such as generating a series of PDF files. Disable duplicate submissions while operations are underway.
- Require deliberate consent before operations that replace valid scores, destroy drafts, alter a completed match's dependencies, or change packages with unsaved invalid edits.
- Offer **Exports et diagnostic** or equivalent for browsing generated material and understandable package/operation problems. Additional export formats are optional until explicitly specified.

## 13. Data and consistency model (conceptual, not a database schema)

The implementation should model, with durable identifiers and relationships:

- Tournament; categories; registrations and player/team level data.
- Initial-group drafts and confirmed phases, teams assigned per group, target and courts.
- Ordered matches, printed positions, simultaneous slots, referee assignment, score state and revision history.
- Group standings, ranking metrics and any manual decisions.
- Qualification split into paths, per-team provenance and source phase.
- Per-path ordered successor group phases and final-phase bracket.
- Knockout seeds, rounds, nodes, upstream winner/loser dependencies, byes, matches and correction consequences.
- Generated documents and their source group/match/version.
- Tournament/package metadata, revision/audit history, phase-confirmation snapshots, and any required compatibility migration metadata.

Invariants include: no team appears twice in one group or in both qualification paths; all matches reference valid teams in the appropriate phase/category; each round-robin pair occurs exactly once; no simultaneous team conflict; score saves update winners/standings transactionally; knockout downstream participants derive from the correct upstream outcome; active navigation references actual persisted phases; archived phase history isn't overwritten by a new draft; changing packages doesn't mix identities or pending writes.

The internal architecture, storage model, UI pattern, and build/deployment approach are explicitly up to the implementing agent.

## 14. Acceptance scenarios (mandatory product-level tests)

The rebuild is not complete just because it compiles or opens. Demonstrate at least these scenarios with **disposable** tournament data; accompany automated tests with actual visual inspection where relevant.

| ID | Scenario and pass condition |
|---|---|
| A01 | Create a named tournament using `Parcourir`; cancel safely; reject inaccessible/conflicting destinations; reopen it and use recent packages. |
| A02 | Register teams in both Hommes and Femmes, with 3–4-player rosters and skill levels. Verify category separation, duplicates, average strengths, and level-field focus retention. |
| A03 | Generate enough demo teams to exhaust predefined names; no duplicates or renaming of real teams; no unrequested generation. |
| A04 | Preferred group size 4 is selected initially; changing 4→5→3→4 recomputes valid structures and recommendation every time without a refresh button. |
| A05 | Confirm groups of 3, 4, 5; manually swap teams; show sensible balance. A confirmed result is never destroyed by altering a new draft. |
| A06 | Five teams on two courts yield exactly ten distinct round-robin matches, sensible parallel slots and two match-sheet pages with **five matches per page**. Single-court cases preserve all games. |
| A07 | Unchecked `Deux terrains` completely hides the second field; enabled fields persist without overlap or spilling at enlarged scaling. |
| A08 | Group validation automatically saves and exposes all correct A4 PDFs; headers and blank writing areas are readable, white, generously sized; user-selected preview/print never prints automatically. |
| A09 | Score 21-point and 25-point matches, including zero for the loser and valid overtime examples; invalid/partial input does not replace valid scores. Blur saves once, not per character. |
| A10 | Standings reflect wins, competition points, point difference and defined tie decisions; completion and reopening preserve status and rankings. |
| A11 | **17-team initial phase in four groups with 28/28 results**: create Principale/Consolante split, e.g. 8 teams in Principale, with visible and correctly sized count control, no silent failure, exact-path persistence and idempotency. |
| A12 | From a split tournament, complete Principale and Consolante group phase 2 independently. Create and complete Principale **phase 3**, reopen, and access **its own** group cards, scores and rankings through the navigator. |
| A13 | From a completed **104-score** tournament state with three Principale group phases and a completed Consolante knockout, create an eligible Principale 8-team final; preserve all scores and Consolante data. Show precise unmet prerequisites otherwise. |
| A14 | Introduce relevant and irrelevant equal-performance ties. Prompt only for relevant ones through explicit named-team controls; decisions apply to the correct source phase and are not reused for later phases. |
| A15 | From the main Progression screen, see initial groups once; Principale and Consolante in proper order; all group phases; **one final node** per lane; node clicks open the correct phase. |
| A16 | Display 4-, 8-, and 16-team knockout trees: external correctly connected match-card lines, full-card click hit area, team-only cards, separate match popup and horizontal scrolling when necessary. |
| A17 | Play semifinals, final and Petite finale; winners/losers advance appropriately. Correct an upstream result after downstream activity and handle invalidation safely with explanation and durable audit. |
| A18 | Generate demo scores only for eligible unplayed matches; don't rewrite recorded results, and preserve consistent ranking/winner progression. |
| A19 | Save/reopen, then switch package A→B→A without restarting. All registered data, scores, rankings, tie choices, documents, completed phases and bracket outcomes survive; no cross-package edits. |
| A20 | Common UI quality: correct French accents/labels, sensible spacing, visible numeric selector, correct `Parcourir`, informative errors and no stale routine red status messages. |
| A21 | Package/distribution: deliver something that can be launched and used as a normal end-user application, with volleyball icon, a short operator guide, working sample tournament and clear instructions for verifying the build. |

### Regression examples available from the previous app

- **E0050 case:** 17 registered teams, four initial groups, all **28** matches scored and initial phase complete; initial `Créer Principale / Consolante` failed silently. This is a regression *test case*, not the expected behavior.
- **E0043 continued case:** 23 teams, common initial groups, Principale/Consolante split, completed second group phases, completed Consolante knockout, plus completed Principale group phase 3. **104/104** group/knockout results were stored. The old UI omitted phase 3 from navigation and couldn't create a Principale knockout. Those are defects to avoid, not rules to recreate.
- **Known legitimate PDF split:** a five-team group playing on two courts has ten matches, printed on two pages of five; don't “fix” it by changing the match schedule.
- **Known knockout example:** two semifinals feed one final plus one third-place match. Scores, court/referee details, and match-sheet actions belong in the match popup, not in the tree.

When the old packages or screenshots are not available in the new session, derive **equivalent synthetic data**; don't depend on an old application installation or reuse its source code. If sample `.openvolley` files are supplied, import them read-only and use a separate copied/converted package for testing.

## 15. Open sporting-policy decisions — don't silently guess

The supplied requirements and saved example establish the overall product but do **not** fully specify every rule. These decisions should be documented in an editable **Tournament Rules** section and surfaced for user confirmation when they materially affect real results:

1. **Score validity and overtime:** precise win-margin/overtime acceptance for targets 21/25 (historical example includes 30–28 in a 25-point final). Do not adopt official rules or reject valid existing scores without checking the intended event rules.
2. **Within-group / cross-group tie policy:** full precedence after competition points and point difference; whether head-to-head or other factors apply; fair comparisons across 3/4/5-team groups. Preserve 2-points-win/1-point-loss base scoring unless user decides otherwise.
3. **Qualification/seeding:** how to rank teams across groups, whether group winners are prioritized, and the precise eligible field-size/bye rules. Use explicit, only-when-relevant manual choices for residual ties.
4. **Referees and parallel courts:** exact assignment policy when no idle team is available; define a permissible fallback rather than silently assigning a competing team.
5. **Forfeits:** how the historical outcome affects scores/rankings and whether a separate management action is required in the independent rebuild.
6. **Legacy import:** whether the user needs full compatibility with the old `.openvolley` package layout, or a lossless one-way import into the new model is sufficient. This decision affects migration effort, not new-tournament behavior.

These are not reasons to omit the main workflow. Implement the core independently and isolate the unresolved policies behind explicit, testable rules. **Ask only when a choice would make saved sporting outcomes ambiguous or irreversible.**

## 16. Instructions to the separate Codex Work session

- Treat this document as the **product and acceptance specification**, not an instruction to reuse existing source, frameworks, tests, or orchestration infrastructure.
- **Choose the most appropriate technology stack yourself** based on UX, maintainability, portability, document generation, data durability, testability, and delivery. Explain the choice and tradeoffs briefly; no stack, database, SDK, operating system, or folder layout is imposed here.
- Design and **implement the application from scratch**, including its UI, domain rules, persistence, printing/PDF features, appropriate automated tests, realistic disposable demo tournament data, and an end-user launchable deliverable.
- Organize implementation into coherent vertical milestones: tournament/registration → groups/scheduling/PDFs → scoring/rankings → qualification/later phases → unified navigation/knockout → corrections/hardening. Demonstrate an end-to-end playable slice early rather than merely scaffolding screens.
- Keep requirements traceable to tests and explicitly identify any deferred acceptance criterion or unanswered sporting-rule decision. Do not claim completion from unit-test count alone.
- Use the final desired experience in this spec, **not the defective E0043/E0050 screenshots**, as the acceptance target. The previous app is reference/test data only and should not dictate implementation technology or preserve known bugs.
- Work autonomously as far as possible; share a succinct summary of implemented features, test outcomes, known gaps, instructions for launching, and a focused manual acceptance checklist for the delivered build.

**Definition of done:** An operator can take a real tournament from registration to both completed paths and finished knockouts, understand all phase transitions visually, produce and use match sheets, correct results safely, reopen or switch packages without loss, and verify the outcome on a packaged end-user application.
