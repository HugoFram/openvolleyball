import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { printHeader, printFooter, pdfDocument } from "./pdf-base";
import { MAX_TABLE_ROW_HEIGHT, tableText } from "./pdf-table";
import { atomicWrite } from "./store";
import { id } from "../src/domain/engine";
import { paperCode, paperMarkers } from "./paper";
import type { PaperForm, Rect } from "../src/domain/scans";
import { scoreFixtureKey } from "../src/domain/scans";
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
export function sheetFingerprint(
  t: Tournament,
  p: Phase,
  g?: Group,
  m?: Match,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        layout: 6,
        branding: t.branding,
        name: t.name,
        category: p.category,
        lane: p.lane,
        number: p.number,
        group: g,
        matches: (g ? p.matches.filter((x) => x.groupId === g.id) : [m!]).map(
          (x) => ({
            id: x.id,
            a: x.a,
            b: x.b,
            court: x.court,
            referee:
              p.kind === "knockout" &&
              x.referee === "Arbitre externe à désigner"
                ? ""
                : x.referee,
            target: x.target,
          }),
        ),
        names: p.teamNames,
      }),
    )
    .digest("hex");
}
export function groupPages(p: Phase, g: Group): PdfPage[] {
  const matches = p.matches
    .filter((m) => m.groupId === g.id)
    .sort((a, b) => a.order - b.order);
  if (g.teamIds.length === 5 && g.courts.length === 2)
    return g.courts
      .map((court) => ({
        court,
        matches: matches.filter((m) => m.court === court),
      }))
      .filter((x) => x.matches.length);
  return [{ court: g.courts.join(" / "), matches }];
}
export const sheetColumns = [
  { label: "Équipe 1", width: 91 },
  { label: "Équipe 2", width: 91 },
  { label: "Score 1", width: 125 },
  { label: "Score 2", width: 125 },
  { label: "Arbitre", width: 91 },
] as const;
export async function makeSheet(
  t: Tournament,
  p: Phase,
  folder: string,
  fontDir: string,
  g?: Group,
  m?: Match,
): Promise<Document> {
  const pages = g ? groupPages(p, g) : [{ matches: [m!], court: m!.court }];
  const { doc, bytes } = pdfDocument(
    t,
    fontDir,
    `${t.name} - ${g?.name || "Phase finale"}`,
  );
  const names = p.teamNames;
  const documentId = id();
  const sourceHash = sheetFingerprint(t, p, g, m);
  const forms: PaperForm[] = [];
  const name = (x: string | null) => (x ? names[x] || x : "À déterminer");
  pages.forEach((page, index) => {
    doc.addPage();
    printHeader(doc, t);
    paperMarkers(doc);
    const form: PaperForm = {
      id: id(),
      documentId,
      tournamentId: t.id,
      version: 1,
      page: index + 1,
      kind: "scores",
      category: p.category,
      phaseId: p.id,
      groupId: g?.id,
      label: `${p.category} · ${p.lane} · ${g ? `Groupes ${p.number} · ${g.name}` : `Rencontre ${m!.order}`} · Terrain ${page.court}`,
      sourceHash,
      qr: [485, 161, 64, 64],
      fields: [],
      participants: Object.fromEntries(
        page.matches.map((m) => [m.id, [m.a, m.b]]),
      ),
    };
    forms.push(form);
    form.fixtureKey = scoreFixtureKey(t, form);
    paperCode(doc, form);
    doc
      .font("Bold")
      .fillColor("#172f4b")
      .fontSize(11)
      .text(
        `${p.category} - ${p.lane} - ${g ? `Phase de groupe ${p.number} - ${g.name}` : m?.bronze ? "Petite finale" : "Phase finale - Rencontre " + m!.order}`,
        36,
        105,
        { width: 520 },
      );
    doc
      .font("Regular")
      .fontSize(11)
      .text(
        `Terrain : ${page.court}   |   Victoire en ${g ? p.target : m!.target} points   |   Écart : 2`,
        36,
        137,
      );
    doc.fontSize(9).fillColor("#465b73").text("Équipes", 36, 163);
    const teamIds = g ? g.teamIds : ([m?.a, m?.b].filter(Boolean) as string[]);
    let y = 180;
    for (const tid of teamIds) {
      doc
        .fillColor("#172f4b")
        .fontSize(10)
        .text(`• ${name(tid)}`, 42, y, {
          width: 425,
          height: 28,
          ellipsis: true,
        });
      y += 24;
    }
    const top = Math.max(245, y + 15);
    const widths = sheetColumns.map((column) => column.width);
    const xs = [36];
    widths.forEach((w) => xs.push(xs.at(-1)! + w));
    const headers = sheetColumns.map((column) => column.label);
    doc.font("Bold").fontSize(10);
    headers.forEach((h, i) =>
      tableText(doc, h, xs[i], top, widths[i], 32, "center"),
    );
    const rowHeight = Math.min(
      MAX_TABLE_ROW_HEIGHT,
      (770 - top - 32) / page.matches.length,
    );
    const bottom = top + 32 + rowHeight * page.matches.length;
    doc.strokeColor("#788aa1").lineWidth(0.6);
    xs.forEach((x) => doc.moveTo(x, top).lineTo(x, bottom).stroke());
    doc.moveTo(36, top).lineTo(559, top).stroke();
    doc
      .moveTo(36, top + 32)
      .lineTo(559, top + 32)
      .stroke();
    page.matches.forEach((match, j) => {
      const ry = top + 32 + j * rowHeight;
      doc
        .font("Regular")
        .fontSize(page.matches.length > 6 ? 9 : 10)
        .fillColor("#172f4b");
      tableText(doc, name(match.a), xs[0], ry, widths[0], rowHeight);
      tableText(doc, name(match.b), xs[1], ry, widths[1], rowHeight);
      for (const side of [0, 1] as const) {
        const cx = xs[2 + side],
          boxWidth = 14,
          boxHeight = Math.min(18, rowHeight - 12),
          scoreLeft = cx + widths[2 + side] - 6 - boxWidth * 3,
          scoreTop = ry + rowHeight - 5 - boxHeight;
        const digits: Rect[] = [0, 1, 2].map((n) => [
          scoreLeft + n * boxWidth,
          scoreTop,
          boxWidth,
          boxHeight,
        ]);
        doc
          .save()
          .font("Regular")
          .fontSize(6.5)
          .fillColor("#465b73")
          .text("Final", scoreLeft, scoreTop - 9, { lineBreak: false })
          .strokeColor("#b0bac5")
          .lineWidth(0.4);
        for (const r of digits) doc.rect(...r).stroke();
        doc.restore();
        form.fields.push({
          key: `${match.id}:${side}`,
          label: `Score ${side + 1}`,
          matchId: match.id,
          side,
          rect: [scoreLeft - 2, scoreTop - 2, boxWidth * 3 + 4, boxHeight + 4],
          digits,
        });
      }
      doc.fontSize(9);
      tableText(
        doc,
        p.kind === "knockout" && match.referee === "Arbitre externe à désigner"
          ? ""
          : names[match.referee] || match.referee,
        xs[4],
        ry,
        widths[4],
        rowHeight,
      );
      doc
        .moveTo(36, ry + rowHeight)
        .lineTo(559, ry + rowHeight)
        .stroke();
    });
    doc
      .font("Regular")
      .fontSize(8)
      .fillColor("#465b73")
      .text(
        "Zone libre : comptage des points. Cases « Final » : score terminé, un chiffre par case.",
        36,
        776,
        { width: 523, lineBreak: false },
      )
      .text(
        "Classement : victoires / matchs joués, puis différence de points / matchs joués.",
        36,
        790,
        { width: 523, lineBreak: false },
      );
    printFooter(doc, t, index + 1, pages.length);
  });
  doc.end();
  const file = `documents/${p.id}-${g?.id || m!.id}-r${t.revision}.pdf`;
  await fs.mkdir(path.join(folder, "documents"), { recursive: true });
  await atomicWrite(path.join(folder, file), await bytes);
  return {
    id: documentId,
    forms,
    phaseId: p.id,
    groupId: g?.id,
    matchId: m?.id,
    file,
    revision: t.revision,
    pages: pages.length,
    sourceHash,
  };
}
