import { PDFDocument } from "pdf-lib";
import type { Document, Phase, Tournament } from "../src/domain/types";
import { check } from "../src/domain/engine";

/** Use sporting order, not document creation order (individual sheets may be refreshed). */
export function phaseDocuments(t: Tournament, phaseId: string): Document[] {
  const phase = t.phases.find((p) => p.id === phaseId);
  check(
    phase && phase.status !== "Préparation",
    "Cette phase n’a pas encore de feuilles.",
  );
  const items = phase.kind === "groups" ? phase.groups : orderedMatches(phase);
  const documents = items.map((item) => {
    const document = t.documents.find(
      (d) =>
        d.phaseId === phase.id &&
        (phase.kind === "groups"
          ? d.groupId === item.id
          : d.matchId === item.id),
    );
    check(
      document,
      "Une feuille est absente. Fermez puis rouvrez ce tournoi pour actualiser ses feuilles de match et de groupe.",
    );
    return document;
  });
  check(documents.length > 0, "Cette phase ne contient aucune feuille.");
  return documents;
}

function orderedMatches(phase: Phase) {
  return [...phase.matches].sort(
    (a, b) =>
      a.round - b.round ||
      Number(!!a.bronze) - Number(!!b.bronze) ||
      a.order - b.order,
  );
}

/** Assemble in memory, leaving the original PDFs and scan identities untouched.
 * Read and validate every sheet before opening a single native print dialog. */
export async function mergePhaseSheets(
  documents: Document[],
  read: (d: Document) => Promise<Uint8Array>,
) {
  const merged = await PDFDocument.create();
  for (const document of documents) {
    const source = await PDFDocument.load(await read(document));
    check(
      source.getPageCount() > 0,
      "Une feuille ne contient aucune page imprimable.",
    );
    check(
      merged.getPageCount() + source.getPageCount() <= 200,
      "L’impression est limitée à 200 pages par phase.",
    );
    for (const page of await merged.copyPages(source, source.getPageIndices()))
      merged.addPage(page);
  }
  check(merged.getPageCount() > 0, "Cette phase ne contient aucune feuille.");
  return merged.save();
}
