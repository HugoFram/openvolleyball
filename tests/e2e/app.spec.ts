import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
import { encode } from "../../electron/store";
import { applyCommand, getPhase } from "../../src/domain/engine";
import {
  registered,
  groupPhase,
  playPhase,
  splitTournament,
  finals,
} from "../helpers";
let app: ElectronApplication, page: Page, parent: string;
let rendererErrors: string[] = [];
test.beforeEach(async () => {
  rendererErrors = [];
  parent = await fs.mkdtemp(path.join(os.tmpdir(), "OV UI Épreuve "));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: process.env.OV_PACKAGED_EXE,
    args: [
      ...(process.env.OV_PACKAGED_EXE ? [] : ["."]),
      `--user-data-dir=${path.join(parent, "profile")}`,
    ],
    env,
  });
  if (process.env.OV_PACKAGED_EXE)
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
  page = await app.firstWindow();
  page.on("pageerror", (error) => rendererErrors.push(error.message));
  await page.waitForLoadState("domcontentloaded");
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, parent);
  await app.evaluate(({ app, shell }) => {
    (globalThis as any).printed = [];
    (globalThis as any).viewed = [];
    shell.openPath = async (file) => {
      (globalThis as any).viewed.push(file);
      return "";
    };
    app.on("browser-window-created", (_event, w) => {
      w.webContents.print = (options, callback) => {
        (globalThis as any).printed.push(options);
        const failure = (globalThis as any).failPrint;
        (globalThis as any).failPrint = false;
        callback?.(!failure, failure ? "Test printer unavailable" : "");
      };
    });
  });
});
test.afterEach(async () => {
  await app?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await fs
    .rm(parent, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    })
    .catch(() => {});
  expect(rendererErrors).toEqual([]);
});
const dismiss = async () => {
  const toast = page.locator(".toast");
  if (await toast.isVisible()) await toast.getByRole("button").click();
};
async function create(n = 17) {
  await page.getByRole("button", { name: "Parcourir", exact: true }).click();
  await expect(
    page.getByPlaceholder("Choisir un dossier sur votre ordinateur"),
  ).toHaveValue(parent);
  await page
    .getByLabel("Nom du tournoi", { exact: true })
    .fill("Tournoi des Alpes – Démo");
  await page
    .getByRole("button", { name: "Créer le tournoi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Inscriptions" }),
  ).toBeVisible();
  await page.getByLabel("Nombre", { exact: true }).fill(String(n));
  await page
    .getByRole("button", { name: "Générer des équipes", exact: true })
    .click();
  await expect(page.locator(".team-card")).toHaveCount(n);

  await dismiss();
  await page.getByRole("button", { name: "Progression", exact: true }).click();
  await page
    .getByRole("button", { name: "Préparer les groupes initiaux" })
    .click();
  await expect(
    page.getByLabel("Équipes par groupe", { exact: true }),
  ).toHaveValue("4");
  for (const size of ["5", "3", "4"]) {
    await page
      .getByLabel("Équipes par groupe", { exact: true })
      .selectOption(size);
    await expect(page.getByLabel("Structure des groupes")).not.toHaveValue("");
  }
  await resolveTies();
  await page
    .getByRole("button", { name: "Générer les groupes", exact: true })
    .click();
  await expect(page.locator(".draft-card")).toHaveCount(n === 17 ? 4 : 1);
}
async function random() {
  await dismiss();
  await page
    .getByRole("button", { name: "Générer des scores aléatoires", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Générer les scores", exact: true })
    .click();
  await expect(page.locator(".busy")).toHaveCount(0);
  await dismiss();
}
async function resolveTies() {
  await expect(page.getByRole("dialog")).toBeVisible();
  const structure = page.getByLabel("Structure des groupes");
  if (await structure.count()) await expect(structure).toHaveValue(/\d/);
  const panels = page.locator(".tie-panel");
  for (let k = 0; k < (await panels.count()); k++) {
    const selects = panels.nth(k).locator("select");
    for (let i = 0; i < (await selects.count()); i++) {
      const values = await selects
        .nth(i)
        .locator("option")
        .evaluateAll((xs) =>
          xs.map((x) => (x as HTMLOptionElement).value).filter(Boolean),
        );
      await selects.nth(i).selectOption(values[i]);
    }
  }
}
test("A01–A12: desktop creation, courts, blur scores, exact 28 results, split, branch groups and reload", async () => {
  await create();
  const first = page.locator(".draft-card").first();
  await expect(first.locator(".court-fields input")).toHaveCount(1);
  await expect(
    page.locator(".draft-card").nth(1).getByLabel("Deux terrains"),
  ).toHaveCount(0);
  await first.getByLabel("Deux terrains").check();
  await expect(first.locator(".court-fields input")).toHaveCount(2);
  await first.getByLabel("Groupe 1 terrain 2").fill("Terrain Érable 12");
  await first.getByLabel("Deux terrains").uncheck();
  await expect(first.locator(".court-fields input")).toHaveCount(1);
  await first.getByLabel("Deux terrains").check();
  const groupA = page
      .locator(".draft-card")
      .nth(0)
      .locator(".draft-team-list button")
      .first(),
    groupB = page
      .locator(".draft-card")
      .nth(1)
      .locator(".draft-team-list button")
      .first();
  const a = await groupA.innerText();
  await groupA.click();
  await groupB.click();
  await expect(groupA).not.toHaveText(a);
  await page
    .getByRole("button", { name: "Confirmer les groupes", exact: true })
    .click();
  await expect(page.locator(".score-panel")).toHaveCount(4);
  await dismiss();
  const inputs = page.locator(".score-table input");
  await inputs.nth(0).fill("21");
  await expect(inputs.nth(0)).toBeFocused();
  await inputs.nth(1).fill("0");
  await page.locator("h1").click();
  await expect(inputs.nth(0)).toHaveAttribute("readonly", "");
  await expect(inputs.nth(1)).toHaveValue("0");
  const r = await page.evaluate(() => window.volley.call<any>("session"));
  expect(
    r.value.tournament.phases[0].matches.filter((m: any) => m.score).length,
  ).toBe(1);
  await random();
  await expect(page.locator(".phase-title .status")).toHaveText("Terminée");
  const after = await page.evaluate(() => window.volley.call<any>("session"));
  expect(after.value.tournament.phases[0].matches).toHaveLength(28);
  expect(after.value.tournament.documents).toHaveLength(4);
  await page.getByRole("button", { name: "Classements", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Classement général", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".standings").first().locator("tbody tr"),
  ).toHaveCount(17);
  await page
    .getByRole("button", { name: "Créer Principale / Consolante", exact: true })
    .click();
  await page.getByLabel("Nombre en Principale").fill("8");
  await resolveTies();
  await page.getByRole("button", { name: "Confirmer la répartition" }).click();
  await expect(page.locator(".lane")).toHaveCount(2);
  for (const lane of ["principale", "consolante"]) {
    await page
      .locator(`.lane.${lane}`)
      .getByRole("button", { name: "Groupes", exact: true })
      .click();
    await resolveTies();
    await page
      .getByRole("button", { name: "Générer les groupes", exact: true })
      .click();
    await expect(page.locator(".draft-card").first()).toContainText(
      "Classement précédent",
    );
    await expect(page.locator(".draft-card .level-badge").first()).toHaveText(
      /^#\d+/,
    );
    await page
      .getByRole("button", { name: "Confirmer les groupes", exact: true })
      .click();
    await random();
  }
  await page
    .locator(".lane.principale")
    .getByRole("button", { name: "Groupes", exact: true })
    .click();
  await resolveTies();
  await page
    .getByRole("button", { name: "Générer les groupes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmer les groupes", exact: true })
    .click();
  await random();
  await page.screenshot({
    path: "test-results/progression.png",
    fullPage: true,
  });
  const beforeReload = await page.evaluate(() =>
    window.volley.call<any>("session"),
  );
  await page.reload();
  await expect(page.locator(".lane.principale .phase-node")).toHaveCount(2);
  await page
    .locator(".lane.principale .phase-node")
    .filter({ hasText: "Groupes 3" })
    .click();
  await expect(page.locator(".phase-title")).toContainText("Groupes 3");
  const reopened = await page.evaluate(() =>
    window.volley.call<any>("session"),
  );
  expect(reopened.value.tournament).toEqual(beforeReload.value.tournament);
  await page
    .locator(".lane.principale")
    .getByRole("button", { name: "Phase finale", exact: true })
    .click();
  await resolveTies();
  await page.getByRole("button", { name: "Confirmer le tableau" }).click();
  await expect(page.locator(".bracket-card")).toHaveCount(8);
  const initialFinals = (
    await page.evaluate(() => window.volley.call<any>("session"))
  ).value.tournament;
  const ko = initialFinals.phases.at(-1);
  expect(
    initialFinals.documents.filter((d: any) => d.phaseId === ko.id),
  ).toHaveLength(8);
  const oldFinalDoc = initialFinals.documents.find(
    (d: any) =>
      d.matchId === ko.matches.find((m: any) => m.round === 2 && !m.bronze).id,
  );
  await page
    .locator(".bracket-card")
    .first()
    .click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Générer la feuille" }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Afficher", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Imprimer", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Arbitre", { exact: true })).toHaveValue("");
  await page.getByLabel("Score 1", { exact: true }).fill("21");
  await page.getByLabel("Score 2", { exact: true }).fill("9");
  await page
    .getByRole("button", { name: "Enregistrer la rencontre", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await random();
  const playedFinals = (
    await page.evaluate(() => window.volley.call<any>("session"))
  ).value.tournament;
  expect(
    playedFinals.documents.find((d: any) => d.matchId === oldFinalDoc.matchId)
      .sourceHash,
  ).not.toBe(oldFinalDoc.sourceHash);
  await page.screenshot({ path: "test-results/bracket-8.png", fullPage: true });
  await page
    .getByRole("button", { name: "Classement final", exact: true })
    .click();
  await expect(page.locator(".final-ranking>div")).toHaveCount(8);
  await page
    .locator(".final-ranking")
    .getByRole("button", { name: "Imprimer la fiche", exact: true })
    .first()
    .click();
  await expect
    .poll(
      async () => await app.evaluate(() => (globalThis as any).printed.length),
    )
    .toBe(1);
  const printed = (
    await page.evaluate(() => window.volley.call<any>("session"))
  ).value.tournament.documents.at(-1);
  expect(printed.kind).toBe("team-registration");
  await page.getByRole("button", { name: "Tableau", exact: true }).click();
  await page.locator(".bracket-card").first().click();
  await page.getByLabel("Score 1", { exact: true }).fill("9");
  await page.getByLabel("Score 2", { exact: true }).fill("21");
  await page.getByRole("button", { name: "Appliquer la correction" }).click();
  await expect(
    page.getByRole("dialog", { name: "Confirmer la correction" }),
  ).toContainText("dépendant");
  await page
    .getByRole("button", { name: "Corriger et appliquer les conséquences" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const corrected = (
    await page.evaluate(() => window.volley.call<any>("session"))
  ).value.tournament;
  expect(corrected.archives.length).toBe(1);
  expect(corrected.phases.at(-1).status).toBe("En cours");
  await random();
  await expect(page.locator(".phase-title .status")).toHaveText("Terminée");
});
test("A02/A07/A09/A19: field focus, incomplete edits, canceled and invalid package switching", async () => {
  await page.getByLabel("Nom du tournoi", { exact: true }).fill("Focus");
  await page
    .getByPlaceholder("Choisir un dossier sur votre ordinateur")
    .fill(parent);
  await page
    .getByRole("button", { name: "Créer le tournoi", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ajouter une équipe", exact: true })
    .click();
  await page.getByLabel("Nom de l’équipe", { exact: true }).fill("Les Étoiles");
  await page.getByLabel("Nom joueur 1", { exact: true }).fill("Éloïse");
  await page.getByLabel("Niveau joueur 1", { exact: true }).focus();
  await page.keyboard.press("N");
  await expect(page.getByLabel("Niveau joueur 1", { exact: true })).toHaveValue(
    "3",
  );
  await expect(
    page.getByLabel("Niveau joueur 1", { exact: true }),
  ).toBeFocused();
  await page.getByLabel("Nom joueur 2", { exact: true }).fill("Ana");
  await page.getByLabel("Nom joueur 3", { exact: true }).fill("Zoé");
  await page
    .getByRole("button", { name: "Enregistrer l’équipe", exact: true })
    .click();
  await expect(page.locator(".team-card")).toHaveCount(1);
  const before = await page.evaluate(() => window.volley.call<any>("session"));
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  await page
    .getByRole("button", { name: "Ouvrir un autre tournoi", exact: true })
    .click();
  expect(
    (await page.evaluate(() => window.volley.call<any>("session"))).value
      .tournament.id,
  ).toBe(before.value.tournament.id);
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, parent);
  await page
    .getByRole("button", { name: "Ouvrir un autre tournoi", exact: true })
    .click();
  await expect(page.locator(".toast.error")).toContainText("tournament.json");
  expect(
    (await page.evaluate(() => window.volley.call<any>("session"))).value
      .tournament.id,
  ).toBe(before.value.tournament.id);
});
test("A01/A09/A19: invalid edits block switching, A→B→A restores full state, stale writes rejected", async () => {
  await create(5);
  await page
    .getByRole("button", { name: "Confirmer les groupes", exact: true })
    .click();
  const inputs = page.locator(".score-table input");
  await inputs.nth(0).fill("21");
  await inputs.nth(1).fill("20");
  await page.locator("h1").click();
  await expect(page.locator(".row-error")).toContainText("écart");
  const before = await page.evaluate(() => window.volley.call<any>("session"));
  await page
    .getByRole("button", { name: "Ouvrir un autre tournoi", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Modifications non enregistrées" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Rester / Annuler" }).click();
  expect(
    (await page.evaluate(() => window.volley.call<any>("session"))).value
      .tournament.id,
  ).toBe(before.value.tournament.id);
  await inputs.nth(1).fill("0");
  await page.locator("h1").click();
  await expect(inputs.nth(0)).toHaveAttribute("readonly", "");
  const valid = await page.evaluate(() => window.volley.call<any>("session"));
  await page
    .getByRole("button", { name: "Créer un autre tournoi", exact: true })
    .click();
  await page.getByLabel("Nom du tournoi", { exact: true }).fill("Tournoi B");
  await page
    .getByPlaceholder("Choisir un dossier sur votre ordinateur")
    .fill(parent);
  await page
    .getByRole("button", { name: "Créer le tournoi", exact: true })
    .click();
  await expect(page.locator(".team-card")).toHaveCount(0);
  const bid = (await page.evaluate(() => window.volley.call<any>("session")))
    .value.tournament.id;
  expect(bid).not.toBe(valid.value.tournament.id);
  const stale = await page.evaluate(
    ({ packageId, revision }) =>
      window.volley.call("command", {
        packageId,
        revision,
        command: { type: "demo-teams", category: "Femmes", count: 5 },
      }),
    {
      packageId: valid.value.tournament.id,
      revision: valid.value.tournament.revision,
    },
  );
  expect(stale.ok).toBe(false);
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, valid.value.path);
  await page
    .getByRole("button", { name: "Ouvrir un autre tournoi", exact: true })
    .click();
  const reopened = (
    await page.evaluate(() => window.volley.call<any>("session"))
  ).value;
  expect(reopened.tournament).toEqual(valid.value.tournament);
  await page.locator(".phase-node").click();
  await expect(page.locator(".score-table input").nth(1)).toHaveValue("0");
});
test("A14: named selectors appear for decisive ties and disappear for irrelevant ties", async () => {
  let t = groupPhase(registered(8), "Commun", [4, 4]);
  const pid = t.phases[0].id;
  for (const g of t.phases[0].groups) {
    const [a, b, c, d] = g.teamIds;
    for (const m of getPhase(t, pid).matches.filter(
      (m) => m.groupId === g.id,
    )) {
      const winner =
        m.a === d
          ? m.b
          : m.b === d
            ? m.a
            : [a, b].includes(m.a!) && [a, b].includes(m.b!)
              ? a
              : [b, c].includes(m.a!) && [b, c].includes(m.b!)
                ? b
                : c;
      t = applyCommand(t, {
        type: "score",
        phaseId: pid,
        matchId: m.id,
        score: m.a === winner ? [21, 10] : [10, 21],
      });
    }
  }
  const folder = path.join(parent, "Égalités.openvolley");
  await fs.mkdir(folder);
  await fs.mkdir(path.join(folder, "history"));
  await fs.mkdir(path.join(folder, "documents"));
  await fs.writeFile(path.join(folder, "tournament.json"), encode(t));
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, folder);
  await page
    .getByRole("button", { name: "Ouvrir un tournoi existant", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Créer Principale / Consolante", exact: true })
    .click();
  await expect(page.locator(".tie-panel select")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "Confirmer la répartition" }),
  ).toBeDisabled();
  await page.getByLabel("Nombre en Principale", { exact: true }).fill("6");
  await expect(page.locator(".tie-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Confirmer la répartition" }).click();
  await expect(page.locator(".lane")).toHaveCount(2);
  await expect(page.locator(".tie-panel label")).toHaveCount(0);
  await page
    .locator(".lane.principale")
    .getByRole("button", { name: "Phase finale", exact: true })
    .click();
  await expect(page.locator(".tie-panel select")).toHaveCount(6);
  await resolveTies();
  await page.getByRole("button", { name: "Confirmer le tableau" }).click();
  await expect(page.locator(".bracket-card")).toHaveCount(4);
});
for (const count of [4, 16])
  test(`A15/A16/A20: ${count}-team connected bracket, full card and keyboard access, enlarged scaling`, async () => {
    let t = groupPhase(registered(count + 4));
    t = playPhase(t, t.phases[0].id);
    t = splitTournament(t, count);
    t = finals(t, "Principale", count);
    const folder = path.join(parent, "Tableau.openvolley");
    await fs.mkdir(folder);
    await fs.mkdir(path.join(folder, "documents"));
    await fs.mkdir(path.join(folder, "history"));
    await fs.writeFile(path.join(folder, "tournament.json"), encode(t));
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, folder);
    await page
      .getByRole("button", { name: "Ouvrir un tournoi existant", exact: true })
      .click();
    await page.locator(".lane.principale .phase-node").click();
    await expect(page.locator(".bracket-card")).toHaveCount(count);
    await expect(page.locator(".bracket-lines path")).toHaveCount(
      (count / 2 - 1) * 2 + 2,
    );
    await page.locator(".bracket-card").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25),
    );
    await page.locator(".bracket-panel").scrollIntoViewIfNeeded();
    await expect(page.locator(".bracket-scroll")).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 2,
    );
    expect(overflow).toBe(false);
    await page
      .locator(".bracket-card")
      .first()
      .click({ position: { x: 7, y: 7 } });
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("button", { name: "Fermer", exact: true })
      .last()
      .click();
    await page
      .locator(".bracket-panel")
      .screenshot({ path: `test-results/bracket-${count}-zoom125.png` });
  });

test("Branding, letter-only levels, 3–4-player limits and one/two-per-page registration printing", async () => {
  const logo = path.resolve("assets/volleyball.png");
  await page
    .getByLabel("Nom du tournoi", { exact: true })
    .fill("Tournoi avec logo");
  await page
    .getByPlaceholder("Choisir un dossier sur votre ordinateur")
    .fill(parent);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, logo);
  await page
    .getByRole("button", { name: "Parcourir le logo", exact: true })
    .click();
  await expect(page.getByLabel("Fichier du logo")).toHaveValue(logo);
  await page
    .getByLabel("Site web", { exact: true })
    .fill("volley.example/club");
  await page
    .getByRole("button", { name: "Créer le tournoi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Inscriptions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Règlement", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    /Package|package|LE TOURNOI EN TOUTE/,
  );
  await page
    .getByRole("button", { name: "Ajouter une équipe", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("N : National");
  await expect(
    page.getByRole("button", { name: "Retirer joueur 1" }),
  ).toBeDisabled();
  await page.getByLabel("Nom de l’équipe", { exact: true }).fill("Les Étoiles");
  for (let i = 1; i <= 3; i++)
    await page
      .getByLabel(`Nom joueur ${i}`, { exact: true })
      .fill(`Éloïse ${i}`);
  for (const [letter, value] of [
    ["U", "0"],
    ["N", "3"],
    ["R", "2"],
    ["D", "1"],
  ]) {
    await page.getByLabel("Niveau joueur 1", { exact: true }).focus();
    await page.keyboard.press(letter);
    await expect(
      page.getByLabel("Niveau joueur 1", { exact: true }),
    ).toHaveValue(value);
  }
  await page
    .getByLabel("E-mail joueur 1", { exact: true })
    .fill("eloise@example.org");
  await page.getByLabel("Club joueur 1", { exact: true }).fill("Les Alpes");
  await page
    .getByRole("button", { name: "Ajouter un joueur", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ajouter un joueur", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Retirer joueur 4", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enregistrer l’équipe", exact: true })
    .click();
  const stored = (await page.evaluate(() => window.volley.call<any>("session")))
    .value;
  expect(stored.tournament.teams[0].players).toHaveLength(3);
  expect(stored.tournament.branding.website).toBe(
    "https://volley.example/club",
  );
  expect(stored.tournament.branding.logo).toMatch(/^data:image\/png;base64,/);
  await dismiss();
  await page.screenshot({ path: "docs/screenshots/registration.png" });
  await page
    .getByRole("button", { name: "Fiches d’inscription vierges", exact: true })
    .click();
  await page.getByLabel("Fiches par page", { exact: true }).selectOption("2");
  await page.getByLabel("Nombre de pages", { exact: true }).fill("2");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Afficher", exact: true })
    .click();
  await expect
    .poll(
      async () => await app.evaluate(() => (globalThis as any).viewed.length),
    )
    .toBe(1);
  const saved = (await page.evaluate(() => window.volley.call<any>("session")))
    .value;
  const doc = saved.tournament.documents.at(-1);
  expect(doc.kind).toBe("blank-registration");
  const pdf = await PDFDocument.load(
    await fs.readFile(path.join(saved.path, doc.file)),
  );
  expect(pdf.getPageCount()).toBe(2);
  for (const pdfPage of pdf.getPages())
    expect(
      pdfPage.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict).keys()
        .length,
    ).toBeGreaterThan(0);
  await page.getByLabel("Fiches par page", { exact: true }).selectOption("1");
  await app.evaluate(() => {
    (globalThis as any).failPrint = true;
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Imprimer", exact: true })
    .click();
  await expect(page.locator(".toast.error")).toContainText(
    "Test printer unavailable",
  );
  await expect
    .poll(async () =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
    )
    .toBe(1);
  await dismiss();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Imprimer", exact: true })
    .click();
  await expect
    .poll(
      async () => await app.evaluate(() => (globalThis as any).printed.length),
    )
    .toBe(2);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  await page.reload();
  const reopened = (
    await page.evaluate(() => window.volley.call<any>("session"))
  ).value;
  expect(reopened.tournament.branding).toEqual(stored.tournament.branding);
  expect(reopened.tournament.documents).toHaveLength(3);
});

test("Bracket ranks and first-round team swaps persist, update byes and PDFs, then lock after the first result", async () => {
  let t = groupPhase(registered(9));
  t = playPhase(t, t.phases[0].id);
  t = splitTournament(t, 5);
  t = finals(t, "Principale", 5);
  const p = t.phases.at(-1)!,
    first = p.matches.filter((m) => m.round === 0 && !m.bronze),
    bye = first.find((m) => m.bye)!,
    fixture = first.find((m) => !m.bye)!;
  const a = (bye.a || bye.b)!,
    b = fixture.a!;
  const ranks = { ...p.previousRanks };
  // Older tournaments lack rank snapshots: the UI must derive them from the saved source phase.
  delete p.previousRanks;
  const folder = path.join(parent, "Échanges.openvolley");
  await fs.mkdir(folder);
  await fs.mkdir(path.join(folder, "history"));
  await fs.mkdir(path.join(folder, "documents"));
  await fs.writeFile(path.join(folder, "tournament.json"), encode(t));
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, folder);
  await page
    .getByRole("button", { name: "Ouvrir un tournoi existant", exact: true })
    .click();
  await page.locator(".lane.principale .phase-node").click();
  const nameA = p.teamNames[a],
    nameB = p.teamNames[b];
  const rankOf = (name: string) =>
    page
      .locator(".bracket-team-line")
      .filter({
        has: page.locator(".bracket-team-name").filter({ hasText: name }),
      })
      .first()
      .locator(".bracket-rank");
  await expect(rankOf(nameA)).toHaveText(`#${ranks[a]}`);
  await expect(rankOf(nameB)).toHaveText(`#${ranks[b]}`);
  const before = (await page.evaluate(() => window.volley.call<any>("session")))
    .value;
  const priorDoc = before.tournament.documents.find(
    (d: any) => d.matchId === fixture.id,
  );
  await page
    .getByRole("button", { name: "Échanger des équipes", exact: true })
    .click();
  const pick = (name: string, rank: number) =>
    page.getByRole("button", {
      name: `Échanger ${name}, rang précédent ${rank}`,
      exact: true,
    });
  await pick(nameA, ranks[a]).focus();
  await page.keyboard.press("Enter");
  await expect(pick(nameA, ranks[a])).toHaveAttribute("aria-pressed", "true");
  await page
    .locator(".bracket-panel")
    .screenshot({ path: "docs/screenshots/bracket-swaps.png" });
  await pick(nameA, ranks[a]).click();
  await expect(pick(nameA, ranks[a])).toHaveAttribute("aria-pressed", "false");
  await pick(nameA, ranks[a]).click();
  await pick(nameB, ranks[b]).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.volley.call<any>("session"))).value
          .tournament.revision,
    )
    .toBe(before.tournament.revision + 1);
  const changed = (
    await page.evaluate(() => window.volley.call<any>("session"))
  ).value;
  const ko = changed.tournament.phases.find((x: any) => x.id === p.id);
  expect(ko.matches.find((m: any) => m.id === fixture.id).a).toBe(a);
  const downstream = ko.matches.find((m: any) =>
    m.refs?.some((r: any) => r.type === "winner" && r.id === bye.id),
  );
  expect([downstream.a, downstream.b]).toContain(b);
  const doc = changed.tournament.documents.find(
    (d: any) => d.matchId === fixture.id,
  );
  expect(doc.id).not.toBe(priorDoc.id);
  expect(doc.sourceHash).not.toBe(priorDoc.sourceHash);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(await fs.readFile(path.join(changed.path, doc.file))),
    useWasm: false,
  });
  try {
    const pdf = await task.promise;
    const text = (await (await pdf.getPage(1)).getTextContent()).items
      .map((i: any) => i.str || "")
      .join(" ");
    expect(text).toContain(nameA);
    expect(text).not.toContain(nameB);
  } finally {
    await task.destroy();
  }
  await expect(pick(nameA, ranks[a]).locator(".bracket-rank")).toHaveText(
    `#${ranks[a]}`,
  );
  await page
    .getByRole("button", { name: "Terminer les échanges", exact: true })
    .click();
  await page.reload();
  await page.locator(".lane.principale .phase-node").click();
  const reopened = (
    await page.evaluate(() => window.volley.call<any>("session"))
  ).value;
  expect(reopened.tournament).toEqual(changed.tournament);
  await expect(rankOf(nameA)).toHaveText(`#${ranks[a]}`);
  await page
    .locator("button.bracket-card")
    .filter({ hasText: nameA })
    .filter({ hasText: p.teamNames[fixture.b!] })
    .click();
  await page.getByLabel("Score 1", { exact: true }).fill("21");
  await page.getByLabel("Score 2", { exact: true }).fill("8");
  await page
    .getByRole("button", { name: "Enregistrer la rencontre", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Échanger des équipes", exact: true }),
  ).toBeDisabled();
  const saved = (await page.evaluate(() => window.volley.call<any>("session")))
    .value;
  const blocked = await page.evaluate(
    ({ packageId, revision, command }) =>
      window.volley.call("command", { packageId, revision, command }),
    {
      packageId: saved.tournament.id,
      revision: saved.tournament.revision,
      command: { type: "bracket-swap", phaseId: p.id, teamA: a, teamB: b },
    },
  );
  expect(blocked.ok).toBe(false);
  expect(blocked.error).toContain("verrouillé");
  await dismiss();
  await page
    .locator(".bracket-panel")
    .screenshot({ path: "docs/screenshots/bracket-ranks.png" });
});

test("Exports page contains only snapshot and player CSV actions; dialogs cancel cleanly and a full snapshot reopens independently", async () => {
  const folder = path.join(parent, "Tournoi original.openvolley");
  await fs.mkdir(folder);
  await fs.mkdir(path.join(folder, "history"));
  await fs.mkdir(path.join(folder, "scans"));
  const grouped = groupPhase(registered(3));
  const t = playPhase(grouped, grouped.phases[0].id);
  Object.assign(t.teams[0].players[0], {
    name: 'Élodie "Été"',
    email: "elodie@example.com",
    club: "Léman; Volley",
    level: 3,
  });
  const scan = Buffer.from("disposable original scan");
  const { createHash } = await import("node:crypto");
  t.schema = 2;
  t.scanSources = [
    {
      id: "source",
      name: "Original.png",
      file: "scans/original.png",
      hash: createHash("sha256").update(scan).digest("hex"),
      importedAt: new Date().toISOString(),
      processed: true,
    },
  ];
  t.scanPages = [
    {
      id: "page",
      sourceId: "source",
      page: 1,
      image: "scans/aligned.png",
      status: "ignored",
      values: {},
    },
  ];
  await fs.writeFile(path.join(folder, "scans/original.png"), scan);
  await fs.writeFile(
    path.join(folder, "scans/aligned.png"),
    "disposable aligned scan",
  );
  await fs.writeFile(path.join(folder, "tournament.json"), encode(t));
  await fs.writeFile(
    path.join(folder, "history/revision-original.json"),
    encode(t),
  );
  const opened = await page.evaluate(
    (folder) => window.volley.call<any>("open", { path: folder }),
    folder,
  );
  expect(opened.ok).toBe(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Exports et backup", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Exports et backup", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".content button")).toHaveCount(2);
  await expect(page.locator(".content table, .content .stats-row")).toHaveCount(
    0,
  );
  const snapshot = page.getByRole("button", {
    name: "Créer un backup du tournoi",
    exact: true,
  });
  const csvButton = page.getByRole("button", {
    name: "Exporter les joueurs (CSV)",
    exact: true,
  });
  const before = await fs.readFile(path.join(folder, "tournament.json"));
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: "" });
  });
  await snapshot.click();
  await expect(snapshot).toBeEnabled();
  await csvButton.click();
  await expect(csvButton).toBeEnabled();
  expect(await fs.readFile(path.join(folder, "tournament.json"))).toEqual(
    before,
  );
  await expect(page.locator(".toast")).toHaveCount(0);

  const output = path.join(parent, "Exports à conserver");
  await fs.mkdir(output);
  const csvPath = path.join(output, "Mes joueurs été.csv");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async (...args: unknown[]) => {
      (globalThis as any).csvDialog = args.at(-1);
      return { canceled: false, filePath: file };
    };
  }, csvPath);
  await csvButton.click();
  await expect(page.getByText(/joueurs exportés :/)).toBeVisible();
  const csv = await fs.readFile(csvPath, "utf8");
  expect(csv).toContain('"Élodie ""Été"""');
  expect(csv).toContain(';"N";"elodie@example.com";"Léman; Volley"');
  expect(csv.split("\r\n")).toHaveLength(
    t.teams.reduce((n, team) => n + team.players.length, 0) + 2,
  );
  const csvDialog = await app.evaluate(() => (globalThis as any).csvDialog);
  expect(csvDialog.defaultPath).toMatch(/joueurs\.csv$/);
  expect(csvDialog.filters[0].extensions).toEqual(["csv"]);
  await dismiss();
  const copy = path.join(output, "Avant les finales – été.openvolley");
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async (...args: unknown[]) => {
      (globalThis as any).snapshotDialog = args.at(-1);
      return { canceled: false, filePath: target };
    };
  }, copy);
  await snapshot.click();
  await expect(page.getByText(/Backup créé :/)).toBeVisible();
  expect(await fs.readdir(output)).toContain(
    "Avant les finales – été.openvolley",
  );
  expect(
    (await app.evaluate(() => (globalThis as any).snapshotDialog)).filters[0]
      .extensions,
  ).toEqual(["openvolley"]);
  expect(
    await fs.access(path.join(copy, ".openvolleyball.lock")).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
  expect(await fs.readFile(path.join(folder, "tournament.json"))).toEqual(
    before,
  );
  expect(await fs.readFile(path.join(copy, "scans/original.png"))).toEqual(
    scan,
  );
  expect(
    await fs.readFile(path.join(copy, "history/revision-original.json")),
  ).toEqual(
    await fs.readFile(path.join(folder, "history/revision-original.json")),
  );
  for (const d of opened.value.tournament.documents)
    expect(await fs.readFile(path.join(copy, d.file))).toEqual(
      await fs.readFile(path.join(folder, d.file)),
    );
  await dismiss();
  await snapshot.click();
  await expect(page.getByRole("alert")).toContainText("existe déjà");
  await dismiss();
  await page.screenshot({
    path: "docs/screenshots/exports.png",
    fullPage: true,
  });
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, copy);
  await page
    .getByRole("button", { name: "Ouvrir un autre tournoi", exact: true })
    .click();
  await expect(
    page.getByText("Tournoi ouvert.", { exact: true }),
  ).toBeVisible();
  const restored = await page.evaluate(() =>
    window.volley.call<any>("session"),
  );
  expect(restored.value.path).toBe(copy);
  expect(restored.value.tournament).toEqual(opened.value.tournament);
  expect(await fs.readFile(path.join(folder, "tournament.json"))).toEqual(
    before,
  );
});
