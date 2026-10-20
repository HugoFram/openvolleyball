import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument, degrees } from "pdf-lib";
import { makeRegistrationSheet } from "../../electron/registration-pdf";
import { createTournament } from "../../src/domain/engine";
import { encode } from "../../electron/store";

for (const format of [
  "pdf",
  "jpeg",
  ...(process.env.OV_REGISTRATION_READER_PACK ? ["native"] : []),
])
  test(`Cut registration halves (${format}): rotated batch, local handwritten text, independent levels, review and durable team creation`, async () => {
    test.setTimeout(180000);
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "OV-cut-roster-")),
      folder = path.join(parent, "Teams.openvolley");
    await fs.mkdir(path.join(folder, "history"), { recursive: true });
    const t = createTournament("Coupe des équipes"),
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
    const filled = await PDFDocument.load(
      await fs.readFile(path.join(folder, sheet.file)),
    );
    for (const form of sheet.forms!) {
      const texts: Record<string, string> = {
        teamName: form === sheet.forms![0] ? "Blue Team" : "Red Team",
        "player0:name": "Anna",
        "player1:name": "Bob",
        "player2:name": "Leo",
        "player0:email": "anna@example.com",
        "player0:club": "Volley",
      };
      for (const field of form.fields) {
        if (texts[field.key]) {
          const [x, y, w, h] = field.rect;
          const image = await sharp(
            Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 3}" height="${h * 3}"><rect width="100%" height="100%" fill="white"/><text x="5" y="${h * 2}" font-family="Segoe Print" font-size="${field.key.endsWith("email") ? 33 : 43}" fill="#111">${texts[field.key]}</text></svg>`,
            ),
          )
            .png()
            .toBuffer();
          filled.getPage(0).drawImage(await filled.embedPng(image), {
            x,
            y: 841.89 - y - h,
            width: w,
            height: h,
          });
        }
        if (field.choices && /^player[012]:level$/.test(field.key)) {
          const i = Number(field.key[6]),
            level = (
              form === sheet.forms![0] ? ["N", "R", "U"] : ["R", "D", "N"]
            )[i];
          const [x, y, w, h] = field.choices.find(
            (c) => c.value === level,
          )!.rect;
          filled.getPage(0).drawLine({
            start: { x: x + 1, y: 841.89 - y - 1 },
            end: { x: x + w - 1, y: 841.89 - y - h + 1 },
            thickness: 1,
          });
          filled.getPage(0).drawLine({
            start: { x: x + 1, y: 841.89 - y - h + 1 },
            end: { x: x + w - 1, y: 841.89 - y - 1 },
            thickness: 1,
          });
        }
      }
    }
    // Cut along the exact midpoint, then scan in reverse order/orientation.
    await fs.mkdir("test-results", { recursive: true });
    await fs.writeFile(
      "test-results/registration-filled.pdf",
      await filled.save(),
    );
    const scan = await PDFDocument.create();
    for (const index of [1, 0]) {
      const half = await scan.embedPage(filled.getPage(0), {
        left: 0,
        right: 595.28,
        bottom: index ? 0 : 841.89 / 2,
        top: index ? 841.89 / 2 : 841.89,
      });
      const page = scan.addPage([595.28, 841.89 / 2]);
      page.drawPage(half);
      page.setRotation(degrees(index ? 180 : 90));
    }
    const input = path.join(parent, "Cut halves.pdf");
    await fs.writeFile(input, await scan.save());
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
      const external: string[] = [];
      page.on("request", (r) => {
        if (/^https?:/.test(r.url())) external.push(r.url());
      });
      await page.context().setOffline(true);
      await page.evaluate(
        (folder) => window.volley.call("open", { path: folder }),
        folder,
      );
      await page.reload();
      let inputs = [input];
      if (format === "jpeg") {
        // Render the actual filled print document, then simulate a cropped half
        // and another half on an off-centre full A4 scanner bed.
        await fs.writeFile(path.join(folder, sheet.file), await filled.save());
        await app.evaluate(({ app }) => {
          app.on("browser-window-created", (_e, w) => {
            w.webContents.print = (_options, callback) => {
              void w.webContents
                .executeJavaScript(
                  "document.querySelector('.print-page img').src",
                )
                .then((src) => {
                  (globalThis as any).registrationPrint = src;
                  callback?.(true, "");
                });
            };
          });
        });
        const printed = await page.evaluate(
          (id) => window.volley.call("print-document", { id }),
          sheet.id,
        );
        expect(printed.ok).toBe(true);
        const src = await app.evaluate(
          () => (globalThis as any).registrationPrint,
        );
        const bytes = Buffer.from(src.split(",")[1], "base64"),
          meta = await sharp(bytes).metadata(),
          half = Math.floor(meta.height! / 2);
        const lower = await sharp(bytes)
          .extract({
            left: 0,
            top: half,
            width: meta.width!,
            height: meta.height! - half,
          })
          .png()
          .toBuffer();
        const lowerBed = path.join(parent, "Lower half on A4.jpg"),
          upperFile = path.join(parent, "Upper half.jpg");
        await sharp({
          create: {
            width: meta.width! + 240,
            height: meta.height! + 100,
            channels: 3,
            background: "white",
          },
        })
          .composite([{ input: lower, left: 120, top: 600 }])
          .rotate(270)
          .jpeg({ quality: 90 })
          .toFile(lowerBed);
        await sharp(bytes)
          .extract({ left: 0, top: 0, width: meta.width!, height: half })
          .rotate(180)
          .jpeg({ quality: 90 })
          .toFile(upperFile);
        inputs = [lowerBed, upperFile];
      }
      await app.evaluate(({ dialog }, input) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: input,
        });
      }, inputs);
      await page
        .getByRole("button", { name: "Feuilles scannées", exact: true })
        .click();
      await expect(page.getByRole("note")).toContainText(
        "Fonction expérimentale",
      );
      if (format === "native") {
        await app.evaluate(({ dialog }, folder) => {
          dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: [folder],
          });
        }, process.env.OV_REGISTRATION_READER_PACK!);
        await page
          .getByRole("button", {
            name: "Installer le lecteur avancé…",
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("combobox", { name: "Lecteur des inscriptions" }),
        ).toHaveValue("advanced", { timeout: 90000 });
        await app.evaluate(({ dialog }, inputs) => {
          dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: inputs,
          });
        }, inputs);
      }
      await page
        .getByRole("button", { name: "Importer des scans", exact: true })
        .click();
      if (format === "pdf" || format === "native") {
        if (format === "native")
          await expect(page.getByRole("status")).toContainText("Inscription", {
            timeout: 30000,
          });
        await page
          .getByRole("button", { name: "Interrompre l’analyse", exact: true })
          .click();
        await expect(
          page.getByRole("button", {
            name: "Interrompre l’analyse",
            exact: true,
          }),
        ).toBeHidden();
        await page
          .getByRole("button", { name: "Reprendre l’analyse", exact: true })
          .click();
      }
      await expect(page.getByText("Analyse en cours…")).toBeHidden({
        timeout: 150000,
      });
      if (format === "native")
        await page.screenshot({
          path: "docs/screenshots/scans.png",
          fullPage: true,
        });
      const state = await page.evaluate(() =>
        window.volley.call<any>("session"),
      );
      await fs.mkdir("test-results", { recursive: true });
      await fs.writeFile(
        "test-results/registration-cut-state.json",
        JSON.stringify(state.value.tournament.scanPages, null, 2),
      );
      expect(state.value.tournament.scanSources[0].error).toBeUndefined();
      expect(state.value.tournament.scanPages).toHaveLength(2);
      expect(state.value.tournament.teams).toHaveLength(0);
      for (let i = 0; i < 2; i++) {
        const result = state.value.tournament.scanPages.find(
          (s: any) => s.formId === sheet.forms![i].id,
        );
        const debugImage = await page.evaluate(
          (id) => window.volley.call<any>("scan-image", { id }),
          result.id,
        );
        await fs.writeFile(
          `test-results/registration-half-${i}.png`,
          Buffer.from(debugImage.value),
        );
        expect(result.aligned).toBe(true);
        expect(result.note).not.toContain("indisponible");
        expect(result.values.teamName.reader).toBe(
          format === "native" ? "local-vlm-v1" : "trocr-fr-v3",
        );
        expect(result.values.teamName.value).toMatch(i ? /Red/i : /Blue/i);
        expect(result.values["player0:name"].value).toMatch(/Anna/i);
        expect(result.values["player0:email"].value.length).toBeGreaterThan(3);
        expect(result.values["player3:name"].value).toBe("");
        expect(
          [0, 1, 2].map((j) => result.values[`player${j}:level`].value),
        ).toEqual(i ? ["R", "D", "N"] : ["N", "R", "U"]);
        const image = await page.evaluate(
          (id) => window.volley.call<any>("scan-image", { id }),
          result.id,
        );
        const metadata = await sharp(Buffer.from(image.value)).metadata();
        expect(metadata.width).toBe(1191);
        expect(metadata.height).toBe(842);
      }
      await page.locator(".scan-item").filter({ hasText: "Fiche 2" }).click();
      await expect(page.getByLabel("Équipe", { exact: true })).toHaveValue(
        /Red/i,
      );
      await page.getByLabel("Équipe", { exact: true }).fill("Les Rouges");
      await page
        .getByLabel("Joueur 1 · email", { exact: true })
        .fill("anna@example.com");
      for (let i = 0; i < 3; i++)
        await page
          .getByLabel(`Joueur ${i + 1} · name`, { exact: true })
          .fill(["Anaïs", "Zoé", "Émilie"][i]);
      await page
        .getByRole("button", { name: "Enregistrer l’équipe", exact: true })
        .click();
      await expect(
        page.getByText("Équipe enregistrée.", { exact: true }),
      ).toBeVisible();
      await page.reload();
      const saved = await page.evaluate(() =>
        window.volley.call<any>("session"),
      );
      expect(saved.value.tournament.teams[0].name).toBe("Les Rouges");
      expect(saved.value.tournament.teams[0].players[0].email).toBe(
        "anna@example.com",
      );
      expect(
        saved.value.tournament.teams[0].players.map((p: any) => p.level),
      ).toEqual([2, 1, 3]);
      expect(
        saved.value.tournament.scanPages.filter(
          (s: any) => s.status === "approved",
        ),
      ).toHaveLength(1);
      const edited = await page.evaluate(
        (t) =>
          window.volley.call<any>("command", {
            packageId: t.id,
            revision: t.revision,
            command: {
              type: "team",
              team: {
                ...t.teams[0],
                name: "Nom actuel différent",
                players: t.teams[0].players.map((p: any, i: number) =>
                  i ? p : { ...p, name: "Nom administratif" },
                ),
              },
            },
          }),
        saved.value.tournament,
      );
      expect(edited.ok).toBe(true);
      saved.value.tournament = edited.value.tournament;
      await page.reload();
      await page
        .getByRole("button", { name: "Feuilles scannées", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Exporter les scores relus",
          exact: true,
        }),
      ).toBeHidden();
      const beforeExport = await fs.readFile(
        path.join(folder, "tournament.json"),
      );
      const originalSource = await fs.readFile(
        path.join(folder, saved.value.tournament.scanSources[0].file),
      );
      await app.evaluate(({ dialog }, parent) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [parent],
        });
      }, parent);
      await page
        .getByRole("button", {
          name: "Exporter les inscriptions relues",
          exact: true,
        })
        .click();
      await expect(
        page.getByText(/13 champs d’inscription exportés/),
      ).toBeVisible();
      const exportedFolder = (await fs.readdir(parent)).find((f) =>
        f.startsWith("inscriptions-relues-"),
      )!;
      const exported = JSON.parse(
        await fs.readFile(
          path.join(parent, exportedFolder, "inscriptions.json"),
          "utf8",
        ),
      );
      expect(exported.format).toBe("open-volleyball-reviewed-registrations");
      expect(exported.sheets).toBe(1);
      expect(exported.samples).toHaveLength(13);
      expect(
        exported.samples.find((s: any) => s.field === "teamName").text,
      ).toBe("Les Rouges");
      expect(
        exported.samples.find((s: any) => s.field === "player0:name"),
      ).toMatchObject({
        text: "Anaïs",
        suggested: expect.stringMatching(/^anna$/i),
        kind: "name",
      });
      expect(
        exported.samples.find((s: any) => s.field === "player1:name").text,
      ).toBe("Zoé");
      expect(
        exported.samples.find((s: any) => s.field === "player2:name").text,
      ).toBe("Émilie");
      expect(
        exported.samples.find((s: any) => s.field === "player0:email").text,
      ).toBe("anna@example.com");
      expect(
        exported.samples.find((s: any) => s.field === "player3:name").text,
      ).toBe("");
      expect(new Set(exported.samples.map((s: any) => s.sheetGroup)).size).toBe(
        1,
      );
      expect(
        new Set(exported.samples.map((s: any) => s.captureGroup)).size,
      ).toBe(1);
      for (const sample of exported.samples) {
        const crop = await sharp(
          await fs.readFile(path.join(parent, exportedFolder, sample.file)),
        ).metadata();
        expect(crop.width).toBeGreaterThan(50);
        expect(crop.height).toBeGreaterThan(25);
      }
      // The approved sheet was the LOWER half: the exported raw handwriting
      // must match its local rectangle, rather than A4 coordinates or half one.
      const selectedScan = saved.value.tournament.scanPages.find(
        (s: any) => s.status === "approved",
      );
      const selectedForm = sheet.forms!.find(
        (f) => f.id === selectedScan.formId,
      )!;
      const field = selectedForm.fields.find((f) => f.key === "teamName")!;
      const teamSample = exported.samples.find(
        (s: any) => s.field === "teamName",
      );
      const normalized = Buffer.from(
        (
          await page.evaluate(
            (id) => window.volley.call<any>("scan-image", { id }),
            selectedScan.id,
          )
        ).value,
      );
      const [x, y, w, h] = field.rect,
        top = selectedForm.region?.[1] || 0;
      const left = Math.floor(x * 2),
        localTop = Math.floor((y - top) * 2);
      const expectedCrop = await sharp(normalized)
        .extract({
          left,
          top: localTop,
          width: Math.ceil((x + w) * 2) - left,
          height: Math.ceil((y - top + h) * 2) - localTop,
        })
        .removeAlpha()
        .raw()
        .toBuffer();
      const actualCrop = await sharp(
        await fs.readFile(path.join(parent, exportedFolder, teamSample.file)),
      )
        .removeAlpha()
        .raw()
        .toBuffer();
      expect(actualCrop).toEqual(expectedCrop);
      expect(await fs.readFile(path.join(folder, "tournament.json"))).toEqual(
        beforeExport,
      );
      expect(
        await fs.readFile(
          path.join(folder, saved.value.tournament.scanSources[0].file),
        ),
      ).toEqual(originalSource);
      await app.evaluate(({ dialog }) => {
        dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
      });
      const canceledExport = await page.evaluate(
        (t) =>
          window.volley.call("scan-export-registrations", {
            packageId: t.id,
            revision: t.revision,
          }),
        saved.value.tournament,
      );
      expect(canceledExport.value).toBeNull();
      expect(external).toEqual([]);
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
