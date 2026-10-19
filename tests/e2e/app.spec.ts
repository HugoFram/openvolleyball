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
    .getByRole("button", { name: "Créer le package", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Les équipes entrent en jeu" }),
  ).toBeVisible();
  await page.getByLabel("Nombre", { exact: true }).fill(String(n));
  await page
    .getByRole("button", { name: "Générer des équipes", exact: true })
    .click();
  await expect(page.locator(".team-card")).toHaveCount(n);
  await page.getByRole("button", { name: "Règlement", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmer ce règlement", exact: true })
    .click();
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
    await page
      .getByRole("button", { name: "Générer les groupes", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmer les groupes", exact: true })
      .click();
    await random();
  }
  await page
    .locator(".lane.principale")
    .getByRole("button", { name: "Groupes", exact: true })
    .click();
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
  await page
    .locator(".bracket-card")
    .first()
    .click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Score A", { exact: true }).fill("21");
  await page.getByLabel("Score B", { exact: true }).fill("9");
  await page
    .getByRole("button", { name: "Enregistrer la rencontre", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await random();
  await page.screenshot({ path: "test-results/bracket-8.png", fullPage: true });
  await page
    .getByRole("button", { name: "Classement final", exact: true })
    .click();
  await expect(page.locator(".final-ranking>div")).toHaveCount(8);
  await page.getByRole("button", { name: "Tableau", exact: true }).click();
  await page.locator(".bracket-card").first().click();
  await page.getByLabel("Score A", { exact: true }).fill("9");
  await page.getByLabel("Score B", { exact: true }).fill("21");
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
    .getByRole("button", { name: "Créer le package", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ajouter une équipe", exact: true })
    .click();
  await page.getByLabel("Nom de l’équipe", { exact: true }).fill("Les Étoiles");
  await page.getByLabel("Nom joueur 1", { exact: true }).fill("Éloïse");
  await page.getByLabel("Niveau joueur 1", { exact: true }).fill("3");
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
    .getByRole("button", { name: "Ouvrir un autre package", exact: true })
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
    .getByRole("button", { name: "Ouvrir un autre package", exact: true })
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
    .getByRole("button", { name: "Ouvrir un autre package", exact: true })
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
    .getByRole("button", { name: "Créer le package", exact: true })
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
    .getByRole("button", { name: "Ouvrir un autre package", exact: true })
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
    .getByRole("button", { name: "Ouvrir un package existant", exact: true })
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
      .getByRole("button", { name: "Ouvrir un package existant", exact: true })
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
