import path from "node:path";
import fs from "node:fs/promises";
import { pdfDocument, printHeader } from "./pdf-base";
import { atomicWrite } from "./store";
import { check, id } from "../src/domain/engine";
import { levelLetter, levelLegend } from "../src/domain/levels";
import type { Category, Document, Team, Tournament } from "../src/domain/types";
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
  for (let page = 0; page < pages; page++) {
    doc.addPage();
    printHeader(doc, t);
    for (let form = 0; form < perPage; form++) {
      const y = 115 + form * 335;
      doc
        .font("Bold")
        .fontSize(13)
        .fillColor("#172b25")
        .text(`Fiche d’inscription - ${category}`, 36, y, { lineBreak: false });
      doc
        .font("Regular")
        .fontSize(11)
        .text(`Équipe : ${team?.name || ""}`, 36, y + 27, {
          width: 523,
          height: 28,
        });
      if (!team)
        doc
          .strokeColor("#76867e")
          .moveTo(88, y + 47)
          .lineTo(559, y + 47)
          .stroke();
      doc
        .fontSize(8)
        .text(levelLegend, 36, y + 60, { width: 523, lineBreak: false });
      const top = y + 82,
        widths = [150, 44, 180, 149],
        xs = [36];
      widths.forEach((w) => xs.push(xs.at(-1)! + w));
      const row = perPage === 2 ? 43 : 116,
        bottom = top + 26 + 4 * row;
      doc.font("Bold").fontSize(9);
      ["Nom du joueur", "Niveau", "E-mail", "Club"].forEach((label, i) =>
        doc.text(label, xs[i] + 6, top + 8, {
          width: widths[i] - 12,
          lineBreak: false,
        }),
      );
      doc.strokeColor("#76867e").lineWidth(0.6);
      xs.forEach((x) => doc.moveTo(x, top).lineTo(x, bottom).stroke());
      doc.moveTo(36, top).lineTo(559, top).stroke();
      for (let i = 0; i <= 4; i++)
        doc
          .moveTo(36, top + 26 + i * row)
          .lineTo(559, top + 26 + i * row)
          .stroke();
      for (let i = 0; i < 4; i++) {
        const player = team?.players[i];
        if (!player) continue;
        doc.font("Regular").fontSize(perPage === 2 ? 9 : 10);
        [
          player.name,
          levelLetter(player.level),
          player.email,
          player.club,
        ].forEach((value, j) =>
          doc.text(value, xs[j] + 6, top + 26 + i * row + 10, {
            width: widths[j] - 12,
            height: row - 16,
            ellipsis: true,
          }),
        );
      }
    }
    doc
      .font("Regular")
      .fontSize(8)
      .fillColor("#52665a")
      .text(`${page + 1}/${pages}`, 36, 806, {
        width: 523,
        align: "right",
        lineBreak: false,
      });
  }
  doc.end();
  const file = `documents/inscription-${team?.id || category}-${perPage}-${pages}-r${t.revision}.pdf`;
  await fs.mkdir(path.join(folder, "documents"), { recursive: true });
  await atomicWrite(path.join(folder, file), await bytes);
  return {
    id: id(),
    kind: team ? "team-registration" : "blank-registration",
    teamId: team?.id,
    category,
    file,
    revision: t.revision,
    pages,
  };
}
