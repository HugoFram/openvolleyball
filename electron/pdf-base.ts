import PDFDocument from "pdfkit";
import path from "node:path";
import type { Tournament } from "../src/domain/types";
export function pdfDocument(t: Tournament, fontDir: string, title: string) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 30, bottom: 20, left: 36, right: 36 },
    autoFirstPage: false,
    info: { Title: title, Author: "Open Volleyball" },
  });
  doc.registerFont("Regular", path.join(fontDir, "OVSans-Regular.ttf"));
  doc.registerFont("Bold", path.join(fontDir, "OVSans-Bold.ttf"));
  const chunks: Buffer[] = [];
  const bytes = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  return { doc, bytes };
}
export function printHeader(doc: PDFKit.PDFDocument, t: Tournament) {
  doc
    .fillColor("#145b4b")
    .font("Bold")
    .fontSize(10)
    .text("OPEN VOLLEYBALL", 36, 30, { lineBreak: false });
  doc
    .fillColor("#172b25")
    .fontSize(19)
    .text(t.name, 36, 50, {
      width: t.branding?.logo ? 435 : 523,
      height: 40,
      ellipsis: true,
    });
  if (t.branding?.logo)
    doc.image(Buffer.from(t.branding.logo.split(",")[1], "base64"), 489, 28, {
      fit: [70, 58],
      align: "right",
      valign: "center",
    });
  if (t.branding?.website)
    doc
      .font("Regular")
      .fontSize(9)
      .fillColor("#45554f")
      .text(t.branding.website, 36, 90, {
        width: 523,
        height: 12,
        ellipsis: true,
        link: t.branding.website,
      });
}
