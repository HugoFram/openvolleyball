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
    .font("Bold")
    .fillColor("#172f4b")
    .fontSize(21)
    .text(t.name, 36, 35, {
      width: t.branding?.logo ? 415 : 523,
      height: 54,
      ellipsis: true,
    });
  if (t.branding?.logo)
    doc.image(Buffer.from(t.branding.logo.split(",")[1], "base64"), 465, 24, {
      fit: [94, 76],
      align: "right",
      valign: "center",
    });
}
export function printFooter(
  doc: PDFKit.PDFDocument,
  t: Tournament,
  page: number,
  pages: number,
) {
  if (t.branding?.website)
    doc
      .font("Regular")
      .fontSize(9)
      .fillColor("#465b73")
      .text(t.branding.website, 36, 806, {
        width: 450,
        height: 12,
        ellipsis: true,
        link: t.branding.website,
      });
  doc
    .font("Regular")
    .fontSize(8)
    .fillColor("#465b73")
    .text(`${page}/${pages}`, 500, 806, {
      width: 59,
      align: "right",
      lineBreak: false,
    });
}
