import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
import sharp from "sharp";
import { encode } from "../../electron/store";
import { registered } from "../helpers";
import { applyCommand } from "../../src/domain/engine";
for (const courts of [1, 2])
  test(`Imprimer renders nonblank content through the real print path: five teams, ${courts} court(s)`, async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "OV-print-content-"),
    );
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
      let t = registered(5);
      t.name = "Épreuve impression — cinq équipes";
      t.branding = {
        website: "https://volley.example/impression",
        logo:
          "data:image/png;base64," +
          (await fs.readFile("assets/volleyball.png")).toString("base64"),
      };
      t = applyCommand(t, {
        type: "draft",
        category: "Hommes",
        lane: "Commun",
        structure: [5],
        target: 21,
      });
      const phase = t.phases[0];
      if (courts === 2) {
        const groups = structuredClone(phase.groups);
        groups[0].courts.push("B");
        t = applyCommand(t, {
          type: "draft-update",
          phaseId: phase.id,
          groups,
          target: 21,
        });
      }
      t = applyCommand(t, { type: "confirm", phaseId: phase.id });
      const folder = path.join(parent, "Épreuve.openvolley");
      await fs.mkdir(folder);
      await fs.mkdir(path.join(folder, "history"));
      await fs.mkdir(path.join(folder, "documents"));
      await fs.writeFile(path.join(folder, "tournament.json"), encode(t));
      await app.evaluate(({ app }) => {
        (globalThis as any).capture = undefined;
        (globalThis as any).printFailure = undefined;
        app.on("browser-window-created", (_event, w) => {
          w.webContents.print = (options, callback) => {
            void (async () => {
              try {
                const content = await w.webContents.executeJavaScript(
                  `({ready:document.documentElement.dataset.printReady,pages:Array.from(document.querySelectorAll('.print-page img')).map(img=>({src:img.src,width:img.naturalWidth,height:img.naturalHeight,complete:img.complete}))})`,
                );
                const bytes = await w.webContents.printToPDF({
                  pageSize: "A4",
                  preferCSSPageSize: true,
                  printBackground: true,
                  margins: { top: 0, bottom: 0, left: 0, right: 0 },
                });
                (globalThis as any).capture = {
                  options,
                  content,
                  pdf: bytes.toString("base64"),
                };
                callback?.(true, "");
              } catch (error) {
                (globalThis as any).printFailure = String(error);
                callback?.(false, String(error));
              }
            })();
          };
        });
      });
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      const opened = await page.evaluate(
        (folder) => window.volley.call<any>("open", { path: folder }),
        folder,
      );
      expect(opened.ok).toBe(true);
      await page.reload();
      await page.locator(".phase-node").click();
      await page
        .locator(".score-panel")
        .getByRole("button", { name: "Imprimer", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            app.evaluate(
              () =>
                (globalThis as any).capture !== undefined ||
                (globalThis as any).printFailure !== undefined,
            ),
          { timeout: 30000 },
        )
        .toBe(true);
      const { capture, failure } = await app.evaluate(() => ({
        capture: (globalThis as any).capture,
        failure: (globalThis as any).printFailure,
      }));
      expect(failure).toBeUndefined();
      expect(capture.content.ready).toBe("true");
      expect(capture.content.pages).toHaveLength(courts);
      expect(capture.options.pageSize).toBe("A4");
      expect(capture.options.margins.marginType).toBe("none");
      for (const image of capture.content.pages) {
        expect(image.complete).toBe(true);
        expect(image.width).toBeGreaterThan(1600);
        expect(image.height).toBeGreaterThan(2300);
        const pixels = await sharp(
          Buffer.from(image.src.split(",")[1], "base64"),
        ).stats();
        expect(pixels.channels.some((c) => c.stdev > 8)).toBe(true);
      }
      const bytes = Buffer.from(capture.pdf, "base64");
      await fs.mkdir("test-results", { recursive: true });
      await fs.writeFile(`test-results/print-${courts}-court.pdf`, bytes);
      const actual = await PDFDocument.load(bytes);
      expect(actual.getPageCount()).toBe(courts);
      for (const printedPage of actual.getPages())
        expect(
          printedPage.node
            .Resources()!
            .lookup(PDFName.of("XObject"), PDFDict)
            .keys().length,
        ).toBeGreaterThan(0);
      await expect
        .poll(async () =>
          app.evaluate(
            ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
          ),
        )
        .toBe(1);
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
