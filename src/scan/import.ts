import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PaperForm, ScanValue } from "../domain/scans";
GlobalWorkerOptions.workerSrc = pdfWorker;
export interface PageResult {
  formId?: string;
  image: string;
  values: Record<string, ScanValue>;
  note?: string;
}
export async function* scannedPages(
  bytes: Uint8Array,
  pdf: boolean,
): AsyncGenerator<HTMLCanvasElement> {
  if (pdf) {
    const task = getDocument({ data: new Uint8Array(bytes), useWasm: false });
    try {
      const doc = await task.promise;
      if (doc.numPages > 100)
        throw new Error("Ce PDF dépasse 100 pages. Divisez le lot.");
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i),
          base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(200 / 72, 2300 / Math.max(base.width, base.height)),
        });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport, background: "#fff" }).promise;
        yield canvas;
        page.cleanup();
      }
    } finally {
      await task.destroy();
    }
  } else {
    const blob = new Blob([new Uint8Array(bytes)]),
      image = await createImageBitmap(blob, { imageOrientation: "from-image" });
    try {
      const scale = Math.min(1, 2300 / Math.max(image.width, image.height)),
        canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      yield canvas;
    } finally {
      image.close();
    }
  }
}
export function analyzePage(
  canvas: HTMLCanvasElement,
  forms: PaperForm[],
  tournamentId: string,
): Promise<PageResult[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./vision.worker.ts", import.meta.url), {
      type: "module",
    });
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(
        new Error(
          "La lecture a dépassé deux minutes. Réessayez avec un scan plus petit.",
        ),
      );
    }, 120000);
    const finish = () => {
      clearTimeout(timeout);
      worker.terminate();
    };
    worker.onmessage = (e) => {
      finish();
      e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.results);
    };
    worker.onerror = (e) => {
      finish();
      reject(new Error(e.message));
    };
    const image = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height);
    worker.postMessage(
      {
        raster: { width: image.width, height: image.height, data: image.data },
        forms,
        tournamentId,
      },
      [image.data.buffer],
    );
  });
}
