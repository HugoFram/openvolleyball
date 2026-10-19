import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { nativeImage } from "electron";
import type { Tournament } from "../src/domain/types";
import { check, now } from "../src/domain/engine";
import { normalizedScale } from "../src/scan/geometry";
import { localRect } from "../src/scan/handwriting";
import { atomicWrite, type PackageStore } from "./store";

export function reviewedRegistrations(t: Tournament) {
  return (t.scanPages || []).filter(
    (s) =>
      s.status === "approved" &&
      s.aligned === true &&
      t.paperForms?.some(
        (f) =>
          f.id === s.formId &&
          f.kind === "registration" &&
          f.tournamentId === t.id,
      ),
  );
}

/** Export accepted snapshots, never subsequently edited team records. Originals
 * stay untouched. Group hashes support conservative, scan-separated evaluation. */
export async function exportRegistrations(store: PackageStore, folder: string) {
  const t = store.current,
    candidates = reviewedRegistrations(t);
  check(
    candidates.length,
    "Aucune inscription relue avec une image alignée à exporter.",
  );
  await fs.mkdir(folder);
  const samples: object[] = [];
  let skipped = 0,
    sheets = 0;
  for (const scan of candidates) {
    const form = t.paperForms!.find((f) => f.id === scan.formId)!;
    const source = t.scanSources?.find((s) => s.id === scan.sourceId);
    check(
      /^scans\/[a-zA-Z0-9.-]+$/.test(scan.image),
      "Chemin de scan invalide.",
    );
    const image = nativeImage.createFromBuffer(
      await fs.readFile(path.join(store.folder, scan.image)),
    );
    if (image.isEmpty() || !source) {
      skipped++;
      continue;
    }
    const size = image.getSize(),
      scale = normalizedScale(size.width, size.height);
    const sheetGroup = createHash("sha256")
      .update(`${source.hash}:${scan.page}:${form.id}`)
      .digest("hex");
    let count = 0;
    for (const field of form.fields) {
      if (
        field.choices ||
        field.digits ||
        !Object.hasOwn(scan.accepted || {}, field.key)
      )
        continue;
      const [rx, ry, rw, rh] = localRect(form, field.rect);
      const x = Math.floor(rx * scale),
        y = Math.floor(ry * scale),
        right = Math.ceil((rx + rw) * scale),
        bottom = Math.ceil((ry + rh) * scale);
      if (
        x < 0 ||
        y < 0 ||
        right > size.width ||
        bottom > size.height ||
        right <= x ||
        bottom <= y
      ) {
        skipped++;
        continue;
      }
      const file = `inscription-${String(samples.length + 1).padStart(5, "0")}.png`;
      const bytes = image
        .crop({ x, y, width: right - x, height: bottom - y })
        .toPNG();
      await atomicWrite(path.join(folder, file), bytes);
      const original = scan.originalValues?.[field.key];
      samples.push({
        file,
        text: scan.accepted![field.key],
        field: field.key,
        kind: field.key === "teamName" ? "team" : field.key.split(":")[1],
        suggested: original?.value ?? null,
        reader: original?.reader || "unknown",
        issue: original?.issue ?? null,
        captureGroup: source.hash,
        sheetGroup,
        imageSha256: createHash("sha256").update(bytes).digest("hex"),
      });
      count++;
    }
    if (count) sheets++;
  }
  await atomicWrite(
    path.join(folder, "inscriptions.json"),
    JSON.stringify(
      {
        format: "open-volleyball-reviewed-registrations",
        version: 1,
        createdAt: now(),
        sheets,
        samples,
        skipped,
      },
      null,
      2,
    ),
  );
  await atomicWrite(
    path.join(folder, "LISEZ-MOI.txt"),
    "Échantillons d’inscriptions relues — Open Volleyball\n\nChaque image PNG montre un champ manuscrit, y compris les champs laissés vides. inscriptions.json associe l’image au texte validé (text) et à la proposition initiale immuable (suggested). Les niveaux cochés ne sont pas des échantillons de texte.\n\nCet export contient des données personnelles : noms, clubs et e-mails. Il reste sur cet ordinateur ; aucun envoi automatique. Ne le publiez pas dans un dépôt public. Partagez-le uniquement avec les personnes chargées d’améliorer la reconnaissance.\n\nVérifiez que text correspond exactement à ce qui est écrit sur le papier, accents compris. Une correction sportive ou administrative peut différer du manuscrit : excluez alors l’échantillon de l’entraînement. Un texte vide peut aussi correspondre à une erreur manuscrite effacée lors de la relecture.\n\ncaptureGroup identifie un fichier source ; sheetGroup identifie une fiche dans ce fichier. Ces groupes ne sont pas des identifiants d’auteur. Conservez tous les champs d’une même source dans le même lot ; séparez aussi les auteurs lorsque connus pour une évaluation honnête. Les images restent brutes pour pouvoir tester le prétraitement. Les scans originaux et les données du tournoi ne sont pas modifiés.\n",
  );
  return { path: folder, count: samples.length, skipped, sheets };
}
