import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument, degrees } from "pdf-lib";
import digits from "../fixtures/mnist-digits.json" with { type: "json" };
import { registered, groupPhase } from "../helpers";
import { makeSheet } from "../../electron/pdf";
import { makeRegistrationSheet } from "../../electron/registration-pdf";
import { encode } from "../../electron/store";
import type { Tournament } from "../../src/domain/types";
import { applyCommand, createTournament } from "../../src/domain/engine";

test("Offline scanned scores: real handwritten digits, rotation, review, duplicate protection and durable approval", async () => {
  test.setTimeout(180000);
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "OV-scans-")),
    folder = path.join(parent, "Scan.openvolley");
  await fs.mkdir(path.join(folder, "history"), { recursive: true });
  const t = groupPhase(registered(3)),
    p = t.phases[0];
  const sheet = await makeSheet(
    t,
    p,
    folder,
    path.resolve("assets/fonts"),
    p.groups[0],
  );
  t.documents = [sheet];
  t.paperForms = sheet.forms;
  await fs.writeFile(path.join(folder, "tournament.json"), encode(t));
  const pdf = await PDFDocument.load(
      await fs.readFile(path.join(folder, sheet.file)),
    ),
    pdfPage = pdf.getPage(0),
    first = p.matches[0];
  for (const side of [0, 1] as const) {
    const field = sheet.forms![0].fields.find(
      (f) => f.matchId === first.id && f.side === side,
    )!;
    const text = side === 0 ? "21" : "17";
    for (let i = 0; i < 2; i++) {
      const data = Buffer.from(
          digits[text[i] as keyof typeof digits],
          "base64",
        ),
        rgba = Buffer.alloc(28 * 28 * 4);
      data.forEach((v, n) => {
        rgba[n * 4] = rgba[n * 4 + 1] = rgba[n * 4 + 2] = 255 - v;
        rgba[n * 4 + 3] = 255;
      });
      const png = await sharp(rgba, {
        raw: { width: 28, height: 28, channels: 4 },
      })
        .png()
        .toBuffer();
      const image = await pdf.embedPng(png),
        [x, y, w, h] = field.digits![i];
      pdfPage.drawImage(image, {
        x: x + 3,
        y: pdfPage.getHeight() - y - h + 3,
        width: w - 6,
        height: h - 6,
      });
    }
  }
  pdfPage.setRotation(degrees(90));
  const input = path.join(parent, "Handwritten rotated.pdf");
  await fs.writeFile(input, await pdf.save());
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.OV_PACKAGED_EXE,
    args: [
      ...(process.env.OV_PACKAGED_EXE ? [] : ["."]),
      `--user-data-dir=${path.join(parent, "profile")}`,
    ],
    env,
  });
  const errors: string[] = [],
    external: string[] = [];
  try {
    const page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (/^https?:/.test(r.url())) external.push(r.url());
    });
    await page.waitForLoadState("domcontentloaded");
    const opened = await page.evaluate(
      (folder) => window.volley.call("open", { path: folder }),
      folder,
    );
    expect(opened.ok).toBe(true);
    await page.reload();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, input);
    await page
      .getByRole("button", { name: "Feuilles scannées", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Importer des scans", exact: true })
      .click();
    await expect(page.getByText("Analyse en cours…")).toBeHidden({
      timeout: 90000,
    });
    const state = await page.evaluate(async () =>
      window.volley.call<any>("session"),
    );
    await page.screenshot({
      path: "test-results/scan-score-debug.png",
      fullPage: true,
    });
    expect(state.value.tournament.scanSources[0].error).toBeUndefined();
    expect(state.value.tournament.scanPages).toHaveLength(1);
    expect(state.value.tournament.scanPages[0].formId).toBe(sheet.forms![0].id);
    expect(state.value.tournament.scanPages[0].note).toBeUndefined();
    await expect(
      page.getByLabel(`${first.order} · Score 1`, { exact: true }),
    ).toHaveValue("21");
    await expect(
      page.getByLabel(`${first.order} · Score 2`, { exact: true }),
    ).toHaveValue("17");
    expect(
      state.value.tournament.phases[0].matches.every(
        (m: any) => m.score === null,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/scans-review.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Valider les résultats", exact: true })
      .click();
    await expect(
      page.getByText("Résultats validés.", { exact: true }),
    ).toBeVisible();
    const accepted = await page.evaluate(async () =>
      window.volley.call<any>("session"),
    );
    expect(accepted.value.tournament.phases[0].matches[0].score).toEqual([
      21, 17,
    ]);
    expect(accepted.value.tournament.scanPages[0].status).toBe("approved");
    await page
      .getByRole("button", { name: "Importer des scans", exact: true })
      .click();
    await expect(page.getByText("Analyse en cours…")).toBeHidden();
    const duplicate = await page.evaluate(async () =>
      window.volley.call<any>("session"),
    );
    expect(duplicate.value.tournament.scanSources).toHaveLength(1);
    expect(duplicate.value.tournament.scanPages).toHaveLength(1);
    const stored = JSON.parse(
      await fs.readFile(path.join(folder, "tournament.json"), "utf8"),
    ).data as Tournament;
    expect(stored.scanPages![0].accepted![`${first.id}:0`]).toBe("21");
    expect(stored.audit.at(-1)!.action).toBe("scan-approved");
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await fs.rm(parent, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});

test("Batch scan imports two-court pages plus JPEG, supports manual association and preserves a review draft on reload", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "OV-batch-scans-")),
    folder = path.join(parent, "Batch.openvolley");
  await fs.mkdir(path.join(folder, "history"), { recursive: true });
  let t = applyCommand(registered(5), {
    type: "draft",
    category: "Hommes",
    lane: "Commun",
    structure: [5],
    target: 21,
  });
  const pid = t.phases[0].id,
    groups = structuredClone(t.phases[0].groups);
  groups[0].courts = ["A", "B"];
  t = applyCommand(t, {
    type: "draft-update",
    phaseId: pid,
    groups,
    target: 21,
  });
  t = applyCommand(t, { type: "confirm", phaseId: pid });
  const p = t.phases[0],
    sheet = await makeSheet(
      t,
      p,
      folder,
      path.resolve("assets/fonts"),
      p.groups[0],
    );
  t.documents = [sheet];
  t.paperForms = sheet.forms;
  await fs.writeFile(path.join(folder, "tournament.json"), encode(t));
  const jpeg = path.join(parent, "Manual.jpg");
  await sharp({
    create: { width: 1000, height: 1414, channels: 3, background: "white" },
  })
    .jpeg()
    .toFile(jpeg);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.OV_PACKAGED_EXE,
    args: [
      ...(process.env.OV_PACKAGED_EXE ? [] : ["."]),
      `--user-data-dir=${path.join(parent, "profile")}`,
    ],
    env,
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(
      (folder) => window.volley.call("open", { path: folder }),
      folder,
    );
    await page.reload();
    await app.evaluate(
      ({ dialog }, files) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: files,
        });
      },
      [path.join(folder, sheet.file), jpeg],
    );
    await page
      .getByRole("button", { name: "Feuilles scannées", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Importer des scans", exact: true })
      .click();
    await expect(page.getByText("Analyse en cours…")).toBeHidden({
      timeout: 60000,
    });
    const state = await page.evaluate(async () =>
      window.volley.call<any>("session"),
    );
    expect(state.value.tournament.scanSources).toHaveLength(2);
    expect(state.value.tournament.scanPages).toHaveLength(3);
    expect(
      state.value.tournament.scanPages.filter((s: any) => s.formId),
    ).toHaveLength(2);
    expect(
      state.value.tournament.scanPages.every((s: any) =>
        Object.values(s.values).every((v: any) => !v.value),
      ),
    ).toBe(true);
    const unknown = state.value.tournament.scanPages.find(
      (s: any) => !s.formId,
    );
    await page.locator(".scan-item").filter({ hasText: "Manual.jpg" }).click();
    await page
      .getByLabel("Associer à une feuille imprimée")
      .selectOption(sheet.forms![0].id);
    await page
      .getByRole("button", { name: "Associer la feuille", exact: true })
      .click();
    await page.getByRole("button", { name: "Associer", exact: true }).click();
    const mid = Object.keys(sheet.forms![0].participants)[0],
      m = p.matches.find((m) => m.id === mid)!;
    await page.getByLabel(`${m.order} · Score 1`, { exact: true }).fill("21");
    await page.getByLabel(`${m.order} · Score 2`, { exact: true }).fill("17");
    await page
      .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
      .click();
    await expect(
      page.getByText("Brouillon enregistré.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Feuilles scannées", exact: true })
      .click();
    await page.locator(".scan-item").filter({ hasText: "Manual.jpg" }).click();
    await expect(
      page.getByLabel(`${m.order} · Score 1`, { exact: true }),
    ).toHaveValue("21");
    const saved = await page.evaluate(async () =>
      window.volley.call<any>("session"),
    );
    expect(
      saved.value.tournament.phases[0].matches.every((m: any) => !m.score),
    ).toBe(true);
    const rejected = await page.evaluate(
      async (args) => window.volley.call("scan-approve", args),
      { packageId: t.id, revision: t.revision, id: unknown.id, accepted: {} },
    );
    expect(rejected.ok).toBe(false);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await fs.rm(parent, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});

test("Two registration forms on one scan are identified separately and reviewed into a valid roster", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "OV-roster-scans-")),
    folder = path.join(parent, "Roster.openvolley");
  await fs.mkdir(path.join(folder, "history"), { recursive: true });
  const t = createTournament("Inscriptions"),
    sheet = await makeRegistrationSheet(
      t,
      folder,
      path.resolve("assets/fonts"),
      "Femmes",
      2,
      1,
    );
  t.documents = [sheet];
  t.paperForms = sheet.forms;
  await fs.writeFile(path.join(folder, "tournament.json"), encode(t));
  const marked = await PDFDocument.load(
    await fs.readFile(path.join(folder, sheet.file)),
  );
  for (let i = 0; i < 3; i++) {
    const field = sheet.forms![0].fields.find(
      (f) => f.key === `player${i}:level`,
    )!;
    const [x, y, w, h] = field.choices!.find(
      (c) => c.value === ["N", "R", "U"][i],
    )!.rect;
    marked.getPage(0).drawLine({
      start: { x: x + 1, y: 841.89 - y - 1 },
      end: { x: x + w - 1, y: 841.89 - y - h + 1 },
      thickness: 1,
    });
    marked.getPage(0).drawLine({
      start: { x: x + 1, y: 841.89 - y - h + 1 },
      end: { x: x + w - 1, y: 841.89 - y - 1 },
      thickness: 1,
    });
  }
  const input = path.join(parent, "Registrations.pdf");
  await fs.writeFile(input, await marked.save());
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.OV_PACKAGED_EXE,
    args: [
      ...(process.env.OV_PACKAGED_EXE ? [] : ["."]),
      `--user-data-dir=${path.join(parent, "profile")}`,
    ],
    env,
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(
      (folder) => window.volley.call("open", { path: folder }),
      folder,
    );
    await page.reload();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, input);
    await page
      .getByRole("button", { name: "Feuilles scannées", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Importer des scans", exact: true })
      .click();
    await expect(page.getByText("Analyse en cours…")).toBeHidden({
      timeout: 60000,
    });
    const state = await page.evaluate(async () =>
      window.volley.call<any>("session"),
    );
    await page.screenshot({
      path: "test-results/scan-registration-debug.png",
      fullPage: true,
    });
    const sourceImage = await page.evaluate(
      async (id) => window.volley.call<any>("scan-image", { id }),
      state.value.tournament.scanPages[0].id,
    );
    await fs.writeFile(
      "test-results/registration-raster.png",
      Buffer.from(sourceImage.value),
    );
    expect(state.value.tournament.scanSources[0].error).toBeUndefined();
    expect(state.value.tournament.scanPages).toHaveLength(2);
    expect(
      new Set(state.value.tournament.scanPages.map((s: any) => s.formId)),
    ).toEqual(new Set(sheet.forms!.map((f) => f.id)));
    await page.locator(".scan-item").filter({ hasText: "Fiche 1" }).click();
    await page.getByLabel("Équipe", { exact: true }).fill("Les Aigles");
    for (let i = 1; i <= 3; i++) {
      await page
        .getByLabel(`Joueur ${i} · name`, { exact: true })
        .fill(["Anaïs", "Zoé", "Émilie"][i - 1]);
      await expect(
        page.getByLabel(`Joueur ${i} · level`, { exact: true }),
      ).toHaveValue(["N", "R", "U"][i - 1]);
    }
    await page
      .getByRole("button", { name: "Enregistrer l’équipe", exact: true })
      .click();
    await expect(
      page.getByText("Équipe enregistrée.", { exact: true }),
    ).toBeVisible();
    const accepted = await page.evaluate(async () =>
      window.volley.call<any>("session"),
    );
    expect(
      accepted.value.tournament.teams[0].players.map((p: any) => p.level),
    ).toEqual([3, 2, 0]);
    expect(accepted.value.tournament.teams[0].category).toBe("Femmes");
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await fs.rm(parent, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
