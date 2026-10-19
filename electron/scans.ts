import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { dialog, nativeImage, type BrowserWindow } from "electron";
import { z } from "zod";
import { PackageStore, atomicWrite } from "./store";
import { approveScan, currentForm, type ScanPage } from "../src/domain/scans";
import { check, id, now } from "../src/domain/engine";
import type { Tournament } from "../src/domain/types";
import { normalizedScale } from "../src/scan/geometry";

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
    alternatives: z.array(z.string().max(3)).max(5).optional(),
    issue: z.string().max(2000).optional(),
    reader: z.enum(["contrast-v2", "style-cnn-v3", "trocr-v1"]).optional(),
  }),
);
const pageSchema = z.object({
  sourceId: z.string(),
  page: z.number().int().min(1).max(100),
  results: z
    .array(
      z.object({
        formId: z.string().optional(),
        aligned: z.boolean().optional(),
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
  if (method === "scan-export-reviewed") {
    const t = store.current;
    const candidates = (t.scanPages || []).filter(
      (s) =>
        s.status === "approved" &&
        s.formId &&
        (s.aligned === true || (s.aligned === undefined && !s.note)) &&
        t.paperForms?.some((f) => f.id === s.formId && f.kind === "scores"),
    );
    check(
      candidates.length,
      "Aucun score relu avec une image alignée à exporter.",
    );
    const selection = await dialog.showOpenDialog(win, {
      title: "Exporter les scores relus",
      properties: ["openDirectory", "createDirectory"],
    });
    if (selection.canceled) return null;
    const folder = path.join(
      selection.filePaths[0],
      `scores-relus-${Date.now()}-${id().slice(0, 8)}`,
    );
    await fs.mkdir(folder);
    const samples: unknown[] = [];
    let skipped = 0;
    for (const scan of candidates) {
      const form = t.paperForms!.find((f) => f.id === scan.formId)!;
      const source = t.scanSources!.find((s) => s.id === scan.sourceId)!;
      const image = nativeImage.createFromBuffer(
        await fs.readFile(scanPath(store, scan.image)),
      );
      if (image.isEmpty()) {
        skipped++;
        continue;
      }
      const size = image.getSize(),
        scale = normalizedScale(size.width, size.height);
      for (const field of form.fields) {
        const accepted = scan.accepted?.[field.key]?.trim();
        if (!accepted || !/^\d{1,3}$/.test(accepted) || !field.digits?.length)
          continue;
        const x = Math.max(0, Math.floor((field.digits[0][0] - 1) * scale)),
          y = Math.max(0, Math.floor((field.digits[0][1] - 1) * scale)),
          width = Math.ceil(
            (field.digits.reduce((sum, r) => sum + r[2], 0) + 2) * scale,
          ),
          height = Math.ceil((field.digits[0][3] + 5) * scale);
        if (x + width > size.width || y + height > size.height) {
          skipped++;
          continue;
        }
        const file = `score-${String(samples.length + 1).padStart(5, "0")}.png`;
        await atomicWrite(
          path.join(folder, file),
          image.crop({ x, y, width, height }).toPNG(),
        );
        const original = scan.originalValues?.[field.key];
        samples.push({
          file,
          score: accepted,
          suggested: original?.value ?? null,
          reader: original?.reader || "unknown",
          alternatives: original?.alternatives || [],
          captureGroup: source.hash,
          boxes: field.digits.map(([bx, by, bw, bh]) => [
            bx * scale - x,
            by * scale - y,
            bw * scale,
            bh * scale,
          ]),
        });
      }
    }
    await atomicWrite(
      path.join(folder, "scores.json"),
      JSON.stringify(
        {
          format: "open-volleyball-reviewed-scores",
          version: 1,
          createdAt: now(),
          pipeline: "style-consensus-v3",
          samples,
          skipped,
        },
        null,
        2,
      ),
    );
    await atomicWrite(
      path.join(folder, "LISEZ-MOI.txt"),
      "Extraits des zones de score et valeurs validées par l’organisateur. Aucun nom d’équipe, de joueur ou fichier source n’est exporté dans les métadonnées. Vérifiez les étiquettes avant entraînement. captureGroup identifie une source de scan, pas un auteur. Conservez des auteurs distincts pour la validation. L’application ne réentraîne aucun modèle automatiquement.\n",
    );
    return { path: folder, count: samples.length, skipped };
  }
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
        aligned: result.aligned,
        status: "pending",
        values: result.values,
        originalValues: structuredClone(result.values),
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
