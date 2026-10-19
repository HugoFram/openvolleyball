/** PDF dimensions are points (72 per inch). */
export const MAX_TABLE_ROW_HEIGHT = (5 / 2.54) * 72;

/** Centre each wrapped text block within its cell, retaining horizontal alignment. */
export function tableText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  align: "left" | "center" = "left",
) {
  if (!text) return;
  const padding = 6;
  const innerWidth = width - padding * 2;
  const lineHeight = doc.currentLineHeight(true);
  const availableHeight =
    Math.floor((height - padding * 2) / lineHeight) * lineHeight;
  const textHeight = Math.min(
    doc.heightOfString(text, { width: innerWidth }),
    availableHeight,
  );
  doc.text(text, x + padding, y + (height - textHeight) / 2, {
    width: innerWidth,
    height: textHeight + 0.01,
    align,
    ellipsis: true,
  });
}
