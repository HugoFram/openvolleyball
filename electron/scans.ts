import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { dialog, nativeImage, type BrowserWindow } from "electron";
import { z } from "zod";
import { PackageStore, atomicWrite } from "./store";
import { approveScan, currentForm, type ScanPage } from "../src/domain/scans";
import { check, id, now } from "../src/domain/engine";
import type { Tournament } from "../src/domain/types";

function scanPath(store: PackageStore, file: string) {
  check(/^scans\/[a-zA-Z0-9.-]+$/.test(file), "Chemin de scan invalide.");
  return path.join(store.folder, file);
}
function changed(t: Tournament, action: string, detail: unknown) {
  t.schema = 2;
  t.revision++;
  t.modifiedAt = now();
  t.audit.push({ id: id(), at: now(), revision: t.revision, action, detail });
}
const valuesSchema = z.record(
  z.string().max(180),
  z.object({
    value: z.string().max(2000),
    confidence: z.number().min(0).max(1).optional(),
  }),
);
const pageSchema = z.object({
  sourceId: z.string(),
  page: z.number().int().min(1).max(100),
  results: z
    .array(
      z.object({
        formId: z.string().optional(),
        image: z.string().max(16000000),
        values: valuesSchema,
        note: z.string().max(2000).optional(),
      }),
    )
    .min(1)
    .max(2),
});

export async function scanAction(
  method: string,
  a: any,
  store: PackageStore,
  win: BrowserWindow,
  generate: (t: Tournament, s: PackageStore) => Promise<Tournament>,
) {
  if (method === "scan-source" || method === "scan-image") {
    const item =
      method === "scan-source"
        ? store.current.scanSources?.find((s) => s.id === a.id)
        : store.current.scanPages?.find((s) => s.id === a.id);
    check(item, "Scan introuvable.");
    const file = "file" in item ? item.file : item.image;
    const bytes = await fs.readFile(scanPath(store, file));
    if ("hash" in item)
      check(
        createHash("sha256").update(bytes).digest("hex") === item.hash,
        "Le scan original a été modifié ou endommagé. Importez à nouveau le fichier d’origine.",
      );
    return new Uint8Array(bytes);
  }
  if (method === "scan-import") {
    const r = await dialog.showOpenDialog(win, {
      title: "Importer des feuilles scannées",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "PDF et images", extensions: ["pdf", "png", "jpg", "jpeg"] },
      ],
    });
    if (r.canceled) return true;
    check(
      r.filePaths.length <= 30,
      "Importez au maximum 30 fichiers à la fois.",
    );
    const t = structuredClone(store.current);
    await fs.mkdir(path.join(store.folder, "scans"), { recursive: true });
    for (const file of r.filePaths) {
      const ext = path.extname(file).toLowerCase();
      check(
        [".pdf", ".png", ".jpg", ".jpeg"].includes(ext),
        "Format de scan non pris en charge.",
      );
      const stat = await fs.stat(file);
      check(
        stat.size <= 40 * 1024 * 1024,
        "Un fichier dépasse 40 Mo. Divisez le lot.",
      );
      const bytes = await fs.readFile(file);
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (t.scanSources?.some((s) => s.hash === hash)) continue;
      if (ext === ".pdf")
        check(bytes.subarray(0, 5).toString() === "%PDF-", "PDF invalide.");
      else
        check(
          !nativeImage.createFromBuffer(bytes).isEmpty(),
          "Image illisible.",
        );
      const source = {
        id: id(),
        name: path.basename(file),
        file: `scans/${hash}${ext}`,
        hash,
        importedAt: now(),
      };
      await atomicWrite(scanPath(store, source.file), bytes);
      (t.scanSources ??= []).push(source);
    }
    if (
      (t.scanSources?.length || 0) !== (store.current.scanSources?.length || 0)
    ) {
      changed(t, "scan-import", { sources: t.scanSources!.length });
      await store.save(t);
    }
    return true;
  }
  if (method === "scan-page") {
    const data = pageSchema.parse(a);
    const t = structuredClone(store.current);
    check(
      t.scanSources?.some((s) => s.id === data.sourceId),
      "Source de scan introuvable.",
    );
    await fs.mkdir(path.join(store.folder, "scans"), { recursive: true });
    for (const result of data.results) {
      if (
        t.scanPages?.some(
          (s) =>
            s.sourceId === data.sourceId &&
            s.page === data.page &&
            s.formId === result.formId,
        )
      )
        continue;
      const form = t.paperForms?.find((f) => f.id === result.formId);
      check(!result.formId || form, "Identifiant de fiche inconnu.");
      check(
        /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result.image),
        "Image de scan invalide.",
      );
      const image = nativeImage.createFromBuffer(
        Buffer.from(result.image.split(",")[1], "base64"),
      );
      check(
        !image.isEmpty() &&
          image.getSize().width <= 3000 &&
          image.getSize().height <= 4000,
        "Dimensions de scan invalides.",
      );
      const scan: ScanPage = {
        id: id(),
        sourceId: data.sourceId,
        page: data.page,
        formId: result.formId,
        image: "",
        status: "pending",
        values: result.values,
        note: result.note,
      };
      scan.image = `scans/${scan.id}.png`;
      await atomicWrite(scanPath(store, scan.image), image.toPNG());
      (t.scanPages ??= []).push(scan);
    }
    changed(t, "scan-analyzed", { sourceId: data.sourceId, page: data.page });
    await store.save(t);
    return true;
  }
  if (method === "scan-finish") {
    const t = structuredClone(store.current),
      source = t.scanSources?.find((s) => s.id === a.id);
    check(source, "Source introuvable.");
    source.processed = !a.error;
    source.error = a.error ? String(a.error).slice(0, 2000) : undefined;
    changed(t, "scan-finished", { sourceId: source.id, error: source.error });
    await store.save(t);
    return true;
  }
  if (method === "scan-draft") {
    const t = structuredClone(store.current),
      scan = t.scanPages?.find((s) => s.id === a.id);
    check(scan && scan.status === "pending", "Cette feuille est déjà traitée.");
    scan.values = valuesSchema.parse(a.values);
    changed(t, "scan-draft", { scanId: scan.id });
    await store.save(t);
    return true;
  }
  if (method === "scan-associate") {
    const t = structuredClone(store.current),
      scan = t.scanPages?.find((s) => s.id === a.id);
    check(
      scan && scan.status === "pending" && !scan.formId,
      "Cette feuille est déjà identifiée.",
    );
    currentForm(t, a.formId);
    scan.formId = a.formId;
    scan.values = {};
    scan.note =
      "Association manuelle : vérifiez les participants et saisissez les champs depuis l’image.";
    changed(t, "scan-associated", { scanId: scan.id, formId: scan.formId });
    await store.save(t);
    return true;
  }
  if (method === "scan-ignore") {
    const t = structuredClone(store.current),
      scan = t.scanPages?.find((s) => s.id === a.id);
    check(scan && scan.status === "pending", "Cette feuille est déjà traitée.");
    scan.status = "ignored";
    changed(t, "scan-ignored", { scanId: scan.id });
    await store.save(t);
    return true;
  }
  if (method === "scan-approve") {
    const accepted = z
      .record(z.string().max(180), z.string().max(2000))
      .parse(a.accepted);
    let next = approveScan(store.current, a.id, accepted);
    next = await generate(next, store);
    await store.save(next);
    return true;
  }
  throw new Error("Action de scan inconnue.");
}
