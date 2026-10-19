import { it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { makeSheet } from "../electron/pdf";
import { makeRegistrationSheet } from "../electron/registration-pdf";
import { registered, groupPhase } from "./helpers";
it("Actual PDFs place the website in the footer, omit app branding and use the requested paired column order", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "OV-PDF-layout-"));
  try {
    const t = groupPhase(registered(5)),
      p = t.phases[0];
    t.name = "Coupe des Alpes";
    t.branding = {
      website: "https://volley.example/footer",
      logo:
        "data:image/png;base64," +
        (await fs.readFile("assets/volleyball.png")).toString("base64"),
    };
    const docs = [
      await makeSheet(t, p, folder, path.resolve("assets/fonts"), p.groups[0]),
      await makeRegistrationSheet(
        t,
        folder,
        path.resolve("assets/fonts"),
        "Hommes",
        2,
        1,
      ),
    ];
    for (const [index, d] of docs.entries()) {
      const task = getDocument({
        data: new Uint8Array(await fs.readFile(path.join(folder, d.file))),
        useWasm: false,
      });
      const pdf = await task.promise;
      try {
        expect(pdf.numPages).toBe(1);
        const page = await pdf.getPage(1);
        const content = (await page.getTextContent()).items.filter(
          (item) => "str" in item,
        );
        const text = content.map((item) => item.str).join(" ");
        expect(text).not.toContain("OPEN VOLLEYBALL");
        expect(text).toContain(t.name);
        const urls = content.filter((item) => item.str === t.branding!.website);
        expect(urls).toHaveLength(index === 0 ? 1 : 2);
        expect(urls.at(-1)!.transform[5]).toBeLessThan(50);
        if (index === 1) {
          expect(content.filter((item) => item.str === t.name)).toHaveLength(2);
          expect(urls[0].transform[5] - urls[1].transform[5]).toBeCloseTo(
            841.89 / 2,
            2,
          );
        }
        if (index === 0) {
          const labels = content.filter((item) =>
            ["Équipe 1", "Équipe 2", "Score 1", "Score 2", "Arbitre"].includes(
              item.str,
            ),
          );
          expect(labels.map((item) => item.str)).toEqual([
            "Équipe 1",
            "Équipe 2",
            "Score 1",
            "Score 2",
            "Arbitre",
          ]);
          expect(text).toContain(
            "Hommes - Commun - Phase de groupe 1 - Groupe 1",
          );
          expect(text).not.toMatch(/Score [AB]|Équipe [AB]/);
          const lineYs = labels.map((item) => item.transform[5]);
          expect(new Set(lineYs).size).toBe(1);
        }
      } finally {
        await task.destroy();
      }
    }
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});
