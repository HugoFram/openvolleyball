import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { PDFDocument } from "pdf-lib";
import { decode } from "../../electron/store";
test("Stored two-page PDF renders through the desktop print engine without a physical print", async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "OV-print-"));
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
      `--user-data-dir=${profile}`,
    ],
    env,
  });
  try {
    const folder = path.resolve(
      "examples/01 - 17 équipes - qualification à faire.openvolley",
    );
    const t = decode(
      await fs.readFile(path.join(folder, "tournament.json"), "utf8"),
    );
    const g = t.phases[0].groups.find((g) => g.teamIds.length === 5)!;
    const d = t.documents.find((d) => d.groupId === g.id)!;
    const output = await app.evaluate(
      async ({ BrowserWindow }, file) => {
        const w = new BrowserWindow({
          show: false,
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        try {
          await w.loadFile(file);
          await new Promise((resolve) => setTimeout(resolve, 500));
          return (
            await w.webContents.printToPDF({
              pageSize: "A4",
              printBackground: false,
            })
          ).toString("base64");
        } finally {
          w.destroy();
        }
      },
      path.join(folder, d.file),
    );
    const bytes = Buffer.from(output, "base64");
    await fs.mkdir("test-results", { recursive: true });
    await fs.writeFile("test-results/print-engine.pdf", bytes);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    expect(path.dirname(profile)).toBe(os.tmpdir());
    await fs
      .rm(profile, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      })
      .catch(() => {});
  }
});
