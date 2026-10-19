import path from "node:path";
import fs from "node:fs/promises";
import { pdfDocument, printHeader, printFooter } from "./pdf-base";
import { MAX_TABLE_ROW_HEIGHT, tableText } from "./pdf-table";
import { atomicWrite } from "./store";
import { check, id } from "../src/domain/engine";
import { levelLetter, levelLegend } from "../src/domain/levels";
import type { Category, Document, Team, Tournament } from "../src/domain/types";
import type { PaperForm, Rect } from "../src/domain/scans";
import { paperCode, paperMarkers } from "./paper";
export async function makeRegistrationSheet(
  t: Tournament,
  folder: string,
  fontDir: string,
  category: Category,
  perPage: 1 | 2,
  pages: number,
  team?: Team,
): Promise<Document> {
  check(
    [1, 2].includes(perPage) &&
      Number.isInteger(pages) &&
      pages >= 1 &&
      pages <= 50,
    "Choisissez 1 ou 2 fiches par page et de 1 à 50 pages.",
  );
  const { doc, bytes } = pdfDocument(
    t,
    fontDir,
    `${t.name} - Fiche d’inscription`,
  );
  const documentId = id(),
    forms: PaperForm[] = [];
  for (let page = 0; page < pages; page++) {
    doc.addPage();
    for (let form = 0; form < perPage; form++) {
      const height = perPage === 2 ? 841.89 / 2 : 841.89,
        offset = form * height,
        y = 115 + offset;
      doc.save().translate(0, offset);
      printHeader(doc, t);
      paperMarkers(doc, height);
      printFooter(doc, t, page + 1, pages, height - 35.89);
      doc.restore();
      const paper: PaperForm = {
        id: id(),
        documentId,
        tournamentId: t.id,
        version: 1,
        page: page + 1,
        kind: "registration",
        category,
        teamId: team?.id,
        label: `Inscription · ${category} · ${team?.name || `Fiche ${page * perPage + form + 1}`}`,
        qr: [485, y - 4, 64, 64],
        region: [0, offset, 595.28, height],
        fields: [],
        participants: {},
      };
      forms.push(paper);
      paperCode(doc, paper);
      paper.fields.push({
        key: "teamName",
        label: "Équipe",
        rect: [91, y + 27, 386, 23],
      });
      doc
        .font("Bold")
        .fontSize(13)
        .fillColor("#172f4b")
        .text(`Fiche d’inscription - ${category}`, 36, y, { lineBreak: false });
      doc
        .font("Regular")
        .fontSize(11)
        .text(`Équipe : ${team?.name || ""}`, 36, y + 27, {
          width: 435,
          height: 28,
        });
      if (!team)
        doc
          .strokeColor("#788aa1")
          .moveTo(88, y + 47)
          .lineTo(478, y + 47)
          .stroke();
      doc
        .fontSize(8)
        .text(levelLegend, 36, y + 60, { width: 523, lineBreak: false });
      const top = y + 82,
        widths = [150, 44, 180, 149],
        xs = [36];
      widths.forEach((w) => xs.push(xs.at(-1)! + w));
      const row = Math.min(MAX_TABLE_ROW_HEIGHT, perPage === 2 ? 38 : 116),
        bottom = top + 26 + 4 * row;
      doc.font("Bold").fontSize(9);
      ["Nom du joueur", "Niveau", "E-mail", "Club"].forEach((label, i) =>
        tableText(doc, label, xs[i], top, widths[i], 26),
      );
      doc.strokeColor("#788aa1").lineWidth(0.6);
      xs.forEach((x) => doc.moveTo(x, top).lineTo(x, bottom).stroke());
      doc.moveTo(36, top).lineTo(559, top).stroke();
      for (let i = 0; i <= 4; i++)
        doc
          .moveTo(36, top + 26 + i * row)
          .lineTo(559, top + 26 + i * row)
          .stroke();
      for (let i = 0; i < 4; i++) {
        ["name", "level", "email", "club"].forEach((field, j) => {
          const choices =
            field === "level" && !team
              ? ["N", "R", "D", "U"].map((value, n) => ({
                  value,
                  rect: [
                    xs[j] + 4 + (n % 2) * 21,
                    top + 26 + i * row + row / 2 - 11 + Math.floor(n / 2) * 14,
                    6,
                    6,
                  ] as Rect,
                }))
              : undefined;
          paper.fields.push({
            key: `player${i}:${field}`,
            label: `Joueur ${i + 1} · ${field}`,
            rect: [xs[j] + 3, top + 26 + i * row + 3, widths[j] - 6, row - 6],
            choices,
          });
          if (choices)
            for (const choice of choices) {
              const [x, y, w, h] = choice.rect;
              doc
                .save()
                .strokeColor("#788aa1")
                .lineWidth(0.5)
                .rect(x, y, w, h)
                .stroke()
                .font("Regular")
                .fontSize(6)
                .fillColor("#172f4b")
                .text(choice.value, x + 8, y - 1, { lineBreak: false });
              doc.restore();
            }
        });
        const player = team?.players[i];
        if (!player) continue;
        doc.font("Regular").fontSize(perPage === 2 ? 9 : 10);
        [
          player.name,
          levelLetter(player.level),
          player.email,
          player.club,
        ].forEach((value, j) =>
          tableText(doc, value, xs[j], top + 26 + i * row, widths[j], row),
        );
      }
    }
    if (perPage === 2)
      doc
        .save()
        .dash(3, { space: 4 })
        .strokeColor("#a4afbb")
        .lineWidth(0.4)
        .moveTo(36, 841.89 / 2)
        .lineTo(559, 841.89 / 2)
        .stroke()
        .restore();
  }
  doc.end();
  const file = `documents/inscription-${team?.id || category}-${perPage}-${pages}-r${t.revision}.pdf`;
  await fs.mkdir(path.join(folder, "documents"), { recursive: true });
  await atomicWrite(path.join(folder, file), await bytes);
  return {
    id: documentId,
    forms,
    kind: team ? "team-registration" : "blank-registration",
    teamId: team?.id,
    category,
    file,
    revision: t.revision,
    pages,
  };
}
