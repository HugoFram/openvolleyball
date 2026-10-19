import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./print.css";
declare global {
  interface Window {
    printBridge: {
      source: () => Promise<Uint8Array>;
      complete: (result: { pages?: number; error?: string }) => void;
    };
  }
}
GlobalWorkerOptions.workerSrc = workerUrl;
async function prepare() {
  const data = await window.printBridge.source();
  const task = getDocument({ data: new Uint8Array(data), useWasm: false });
  const pdf = await task.promise;
  const container = document.querySelector("#pages")!;
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n),
      viewport = page.getViewport({ scale: 200 / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport, background: "#ffffff" }).promise;
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    image.alt = `Page ${n}`;
    await image.decode();
    const sheet = document.createElement("section");
    sheet.className = "print-page";
    sheet.append(image);
    container.append(sheet);
    canvas.width = canvas.height = 0;
    page.cleanup();
  }
  await document.fonts.ready;
  // Let layout and decoded page images reach the compositor before invoking print.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  document.querySelector("#print-status")!.textContent =
    `${pdf.numPages} page${pdf.numPages > 1 ? "s" : ""} · A4`;
  document.documentElement.dataset.printReady = "true";
  window.printBridge.complete({ pages: pdf.numPages });
  await task.destroy();
}
void prepare().catch((error) => {
  document.querySelector("#print-status")!.textContent = (
    error as Error
  ).message;
  window.printBridge.complete({ error: (error as Error).message });
});
