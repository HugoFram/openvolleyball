import PDFDocument from "pdfkit";
import path from "node:path";
import fs from "node:fs/promises";
import { atomicWrite } from "./store";
import { id } from "../src/domain/engine";
import type {
  Document,
  Group,
  Match,
  Phase,
  Tournament,
} from "../src/domain/types";
export interface PdfPage {
  matches: Match[];
  court: string;
}
export function groupPages(p: Phase, g: Group): PdfPage[] {
  const matches = p.matches
    .filter((m) => m.groupId === g.id)
    .sort((a, b) => a.order - b.order);
  if (g.courts.length === 2)
    return g.courts
      .map((court) => ({
        court,
        matches: matches.filter((m) => m.court === court),
      }))
      .filter((x) => x.matches.length);
  if (matches.length <= 6) return [{ court: g.courts[0], matches }];
  const out: PdfPage[] = [];
  for (let i = 0; i < matches.length; i += 5)
    out.push({ court: g.courts[0], matches: matches.slice(i, i + 5) });
  return out;
}
export async function makeSheet(
  t: Tournament,
  p: Phase,
  folder: string,
  fontDir: string,
  g?: Group,
  m?: Match,
): Promise<Document> {
  const pages = g ? groupPages(p, g) : [{ matches: [m!], court: m!.court }];
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 30, bottom: 20, left: 36, right: 36 },
    autoFirstPage: false,
    info: {
      Title: `${t.name} - ${g?.name || "Phase finale"}`,
      Author: "Open Volleyball",
    },
  });
  const chunks: Buffer[] = [];
  const bytes = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.registerFont("Regular", path.join(fontDir, "OVSans-Regular.ttf"));
  doc.registerFont("Bold", path.join(fontDir, "OVSans-Bold.ttf"));
  const names = p.teamNames;
  const name = (x: string | null) => (x ? names[x] || x : "À déterminer");
  pages.forEach((page, index) => {
    doc.addPage();
    doc
      .fillColor("#145b4b")
      .font("Bold")
      .fontSize(10)
      .text("OPEN VOLLEYBALL", 36, 32);
    doc
      .fillColor("#172b25")
      .fontSize(20)
      .text(t.name, 36, 53, { width: 520, height: 50, ellipsis: true });
    doc
      .fontSize(12)
      .text(
        `${p.category} · ${p.lane} · ${g?.name || (m?.bronze ? "Petite finale" : "Phase finale")}`,
        36,
        105,
        { width: 520 },
      );
    doc
      .font("Regular")
      .fontSize(11)
      .text(
        `Terrain : ${page.court}   |   Victoire en ${g ? p.target : m!.target} points   |   Écart : ${p.rules.margin}`,
        36,
        126,
      );
    doc.fontSize(9).fillColor("#45554f").text("Équipes", 36, 151);
    const teamIds = g ? g.teamIds : ([m?.a, m?.b].filter(Boolean) as string[]);
    let y = 168;
    for (const tid of teamIds) {
      doc
        .fillColor("#172b25")
        .fontSize(10)
        .text(`• ${name(tid)}`, 42, y, {
          width: 510,
          height: 28,
          ellipsis: true,
        });
      y += 28;
    }
    const top = Math.max(245, y + 15);
    const widths = [124, 79, 79, 124, 117];
    const xs = [36];
    widths.forEach((w) => xs.push(xs.at(-1)! + w));
    const headers = ["Équipe A", "Score A", "Score B", "Équipe B", "Arbitre"];
    doc.font("Bold").fontSize(10);
    headers.forEach((h, i) =>
      doc.text(h, xs[i] + 5, top + 10, {
        width: widths[i] - 10,
        align: "center",
        lineBreak: false,
      }),
    );
    const rowHeight = (770 - top - 32) / page.matches.length;
    const bottom = top + 32 + rowHeight * page.matches.length;
    doc.strokeColor("#76867e").lineWidth(0.6);
    xs.forEach((x) => doc.moveTo(x, top).lineTo(x, bottom).stroke());
    doc.moveTo(36, top).lineTo(559, top).stroke();
    doc
      .moveTo(36, top + 32)
      .lineTo(559, top + 32)
      .stroke();
    page.matches.forEach((match, j) => {
      const ry = top + 32 + j * rowHeight;
      doc.font("Regular").fontSize(10).fillColor("#172b25");
      doc.text(
        `${String(match.order).padStart(2, "0")} · ${name(match.a)}`,
        xs[0] + 7,
        ry + 12,
        { width: widths[0] - 14, height: rowHeight - 20, ellipsis: true },
      );
      doc.text(name(match.b), xs[3] + 7, ry + 12, {
        width: widths[3] - 14,
        height: rowHeight - 20,
        ellipsis: true,
      });
      doc
        .fontSize(9)
        .text(names[match.referee] || match.referee, xs[4] + 7, ry + 12, {
          width: widths[4] - 14,
          height: rowHeight - 20,
          ellipsis: true,
        });
      doc
        .moveTo(36, ry + rowHeight)
        .lineTo(559, ry + rowHeight)
        .stroke();
    });
    doc
      .font("Regular")
      .fontSize(8)
      .fillColor("#52665a")
      .text(
        "Classement : victoire 2 pts · défaite 1 pt · puis différence de points. Prolongation selon règlement confirmé.",
        36,
        790,
        { width: 523, lineBreak: false },
      );
    doc.text(`Feuille de terrain · ${index + 1}/${pages.length}`, 36, 806, {
      width: 523,
      align: "right",
      lineBreak: false,
    });
  });
  doc.end();
  const file = `documents/${p.id}-${g?.id || m!.id}-r${t.revision}.pdf`;
  await fs.mkdir(path.join(folder, "documents"), { recursive: true });
  await atomicWrite(path.join(folder, file), await bytes);
  return {
    id: id(),
    phaseId: p.id,
    groupId: g?.id,
    matchId: m?.id,
    file,
    revision: t.revision,
    pages: pages.length,
  };
}
