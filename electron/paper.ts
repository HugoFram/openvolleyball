import QRCode from "qrcode";
import type { PaperForm } from "../src/domain/scans";
import { qrPayload } from "../src/domain/scans";

export function paperMarkers(doc: PDFKit.PDFDocument) {
  doc.save().fillColor("#000000");
  for (const [x, y] of [
    [22, 22],
    [567, 22],
    [22, 814],
    [567, 814],
  ])
    doc.rect(x, y, 6, 6).fill();
  doc.restore();
}

/** Vector QR: exact module coordinates are also the alignment reference. */
export function paperCode(doc: PDFKit.PDFDocument, form: PaperForm) {
  const code = QRCode.create(qrPayload(form), { errorCorrectionLevel: "M" });
  const [x, y, w] = form.qr,
    unit = w / code.modules.size;
  doc
    .save()
    .fillColor("#ffffff")
    .rect(x - 5, y - 5, w + 10, w + 10)
    .fill()
    .fillColor("#000000");
  for (let row = 0; row < code.modules.size; row++)
    for (let col = 0; col < code.modules.size; col++)
      if (code.modules.get(row, col))
        doc
          .rect(x + col * unit, y + row * unit, unit + 0.02, unit + 0.02)
          .fill();
  doc.restore();
}
