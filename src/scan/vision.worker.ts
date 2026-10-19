import jsQR from "jsqr";
import { InferenceSession, Tensor, env } from "onnxruntime-web/wasm";
import type { PaperForm, ScanValue } from "../domain/scans";
import {
  alignRaster,
  digitTensor,
  findMarker,
  homography,
  markedChoice,
  project,
  type Raster,
} from "./geometry";
function locate(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  known: (payload: string) => boolean,
) {
  const options = { inversionAttempts: "dontInvert" as const };
  const full = jsQR(data, width, height, options);
  if (full && known(full.data)) return full;
  let fallback = full;
  // Two aligned codes can confuse a single-code detector's finder grouping.
  // Search overlapping half-pages too, including sideways scans.
  for (const [x, y, w, h] of [
    [0, 0, width, Math.ceil(height * 0.55)],
    [0, Math.floor(height * 0.45), width, Math.ceil(height * 0.55)],
    [0, 0, Math.ceil(width * 0.55), height],
    [Math.floor(width * 0.45), 0, Math.ceil(width * 0.55), height],
  ]) {
    const crop = new Uint8ClampedArray(w * h * 4);
    for (let row = 0; row < h; row++)
      crop.set(
        data.subarray(
          ((y + row) * width + x) * 4,
          ((y + row) * width + x + w) * 4,
        ),
        row * w * 4,
      );
    const code = jsQR(crop, w, h, options);
    if (code) {
      for (const point of Object.values(code.location))
        if (point) {
          point.x += x;
          point.y += y;
        }
      if (known(code.data)) return code;
      fallback ??= code;
    }
  }
  return fallback;
}
env.wasm.numThreads = 1;
env.wasm.wasmPaths = new URL("./assets/ort/", self.location.origin + "/").href;
env.wasm.proxy = false;
let model: Promise<InferenceSession> | undefined;
const session = () =>
  (model ??= InferenceSession.create(
    new URL("./assets/models/mnist-12.onnx", self.location.origin + "/").href,
    { executionProviders: ["wasm"] },
  ));
const blobUrl = async (im: Raster) => {
  const canvas = new OffscreenCanvas(im.width, im.height);
  canvas
    .getContext("2d")!
    .putImageData(
      new ImageData(new Uint8ClampedArray(im.data), im.width, im.height),
      0,
      0,
    );
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return "data:image/png;base64," + btoa(binary);
};
self.onmessage = async (
  event: MessageEvent<{
    raster: Raster;
    forms: PaperForm[];
    tournamentId: string;
  }>,
) => {
  try {
    const { raster, forms, tournamentId } = event.data,
      search = new Uint8ClampedArray(raster.data);
    const results = [];
    for (let n = 0; n < 2; n++) {
      const qr = locate(search, raster.width, raster.height, (payload) => {
        const parts = payload.split(":");
        return (
          parts.length === 3 &&
          parts[0] === "OV2" &&
          parts[1] === tournamentId &&
          forms.some((f) => f.id === parts[2])
        );
      });
      if (!qr) break;
      const loc = qr.location;
      const parts = qr.data.split(":");
      const form =
        parts.length === 3 && parts[0] === "OV2" && parts[1] === tournamentId
          ? forms.find((f) => f.id === parts[2])
          : undefined;
      // Mask this code so that the second half-page form can also be found.
      const poly = [
        loc.topLeftCorner,
        loc.topRightCorner,
        loc.bottomRightCorner,
        loc.bottomLeftCorner,
      ];
      const x0 = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.x))) - 5),
        x1 = Math.min(
          raster.width,
          Math.ceil(Math.max(...poly.map((p) => p.x))) + 5,
        );
      const y0 = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.y))) - 5),
        y1 = Math.min(
          raster.height,
          Math.ceil(Math.max(...poly.map((p) => p.y))) + 5,
        );
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * raster.width + x) * 4;
          search[i] = search[i + 1] = search[i + 2] = 255;
        }
      if (!form) {
        results.push({
          image: await blobUrl(raster),
          values: {},
          note:
            "QR code inconnu ou appartenant à un autre tournoi. Association manuelle nécessaire. Référence lue : " +
            qr.data.slice(0, 160),
        });
        continue;
      }
      // A small QR's corner noise is amplified across an A4 page by a full
      // projective fit. Use its affine axes only to locate the four page marks;
      // those widely spaced marks supply the final projective fit.
      const [qx, qy, qw] = form.qr,
        ax = (poly[1].x - poly[0].x) / qw,
        ay = (poly[1].y - poly[0].y) / qw,
        bx = (poly[3].x - poly[0].x) / qw,
        by = (poly[3].y - poly[0].y) / qw;
      let h = [
        ax,
        bx,
        poly[0].x - ax * qx - bx * qy,
        ay,
        by,
        poly[0].y - ay * qx - by * qy,
        0,
        0,
      ];
      const reference = [
        { x: 25, y: 25 },
        { x: 570, y: 25 },
        { x: 570, y: 817 },
        { x: 25, y: 817 },
      ];
      const scale =
        Math.hypot(poly[1].x - poly[0].x, poly[1].y - poly[0].y) / form.qr[2];
      const markers = reference.map((p) =>
        findMarker(raster, project(h, p.x, p.y), 6 * scale),
      );
      const aligned = markers.every(Boolean);
      if (aligned)
        h = homography(reference, markers as { x: number; y: number }[]);
      const image = alignRaster(raster, h),
        values: Record<string, ScanValue> = {};
      let note = aligned
        ? undefined
        : "Repères de page incomplets : lecture automatique suspendue. Vérifiez l’alignement et saisissez les scores depuis l’image.";
      if (form.kind === "scores" && aligned) {
        const runtime = await session();
        for (const field of form.fields) {
          const digits: string[] = [],
            confidences: number[] = [];
          let seen = false,
            gap = false;
          for (const rect of field.digits || []) {
            const tensor = digitTensor(image, rect);
            if (!tensor) {
              if (seen) gap = true;
              continue;
            }
            if (gap) {
              digits.push("?");
              continue;
            }
            seen = true;
            const prediction = await runtime.run({
              [runtime.inputNames[0]]: new Tensor(
                "float32",
                tensor,
                [1, 1, 28, 28],
              ),
            });
            const logits = Array.from(
                prediction[runtime.outputNames[0]].data as Float32Array,
              ),
              max = Math.max(...logits);
            const exps = logits.map((v) => Math.exp(v - max)),
              sum = exps.reduce((a, b) => a + b, 0);
            digits.push(String(logits.indexOf(max)));
            confidences.push(1 / sum);
          }
          values[field.key] = {
            value: digits.join(""),
            confidence: confidences.length
              ? Math.min(...confidences)
              : undefined,
          };
        }
      } else if (form.kind === "registration") {
        if (aligned)
          for (const field of form.fields)
            if (field.choices)
              values[field.key] = { value: markedChoice(image, field.choices) };
        note =
          "Fiche identifiée. Vérifiez les niveaux cochés et recopiez les noms, e-mails et clubs depuis l’image. La reconnaissance du texte manuscrit est prévue dans une prochaine étape.";
      }
      results.push({
        formId: form.id,
        image: await blobUrl(image),
        values,
        note,
      });
    }
    if (!results.length)
      results.push({
        image: await blobUrl(raster),
        values: {},
        note: "Aucun QR code lisible. Associez la feuille manuellement ou importez un scan plus net.",
      });
    self.postMessage({ results });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
