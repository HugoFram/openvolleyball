import { it, expect } from "vitest";
import { prepareDigit, readScore } from "../src/scan/digits";
import type { Raster } from "../src/scan/geometry";
import { digitTensor, normalizedScale } from "../src/scan/geometry";
import { makeSheet } from "../electron/pdf";
import { groupPhase, registered } from "./helpers";
import { scoreFixtureKey, currentForm } from "../src/domain/scans";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function ink(paper = 255, pen = 20): Raster {
  const im: Raster = {
    width: 80,
    height: 70,
    data: new Uint8ClampedArray(80 * 70 * 4),
  };
  for (let i = 0; i < im.data.length; i += 4) {
    im.data[i] = im.data[i + 1] = im.data[i + 2] = paper;
    im.data[i + 3] = 255;
  }
  for (let y = 11; y < 37; y++)
    for (let x = 15; x < 19; x++) {
      const k = (y * im.width + x) * 4;
      im.data[k] = im.data[k + 1] = im.data[k + 2] = pen;
    }
  return im;
}
it("Faint ink is normalized like dark ink and tensor mass is centred", () => {
  expect(normalizedScale(1191, 1684)).toBe(2);
  const rect: [number, number, number, number] = [0, 0, 25, 25],
    dark = prepareDigit(ink(), rect)!,
    faint = prepareDigit(ink(235, 150), rect)!;
  expect(dark.variants).toHaveLength(3);
  expect(faint.variants).toHaveLength(3);
  expect(digitTensor(ink(235, 150), rect)).toBeNull();
  for (let i = 0; i < 784; i++)
    expect(faint.variants[0][i]).toBeCloseTo(dark.variants[0][i], 4);
  let mass = 0,
    cx = 0,
    cy = 0;
  dark.variants[0].forEach((v, k) => {
    mass += v;
    cx += v * (k % 28);
    cy += v * Math.floor(k / 28);
  });
  expect(cx / mass).toBeCloseTo(13.5, 1);
  expect(cy / mass).toBeCloseTo(13.5, 1);
});
it("Tally marks outside a final-score box never change its recognition input", () => {
  const im = ink(),
    rect: [number, number, number, number] = [0, 0, 25, 25],
    before = prepareDigit(im, rect)!;
  for (let y = 5; y < 60; y++)
    for (let x = 55; x < 75; x++) {
      const k = (y * im.width + x) * 4;
      im.data[k] = im.data[k + 1] = im.data[k + 2] = 0;
    }
  expect(prepareDigit(im, rect)!.variants).toEqual(before.variants);
});
it("A pen stroke continuing below a printed box is recovered rather than losing its foot", () => {
  const im = ink();
  for (let y = 36; y < 53; y++)
    for (let x = 15; x < 19; x++) {
      const k = (y * im.width + x) * 4;
      im.data[k] = im.data[k + 1] = im.data[k + 2] = 20;
    }
  for (let y = 51; y < 54; y++)
    for (let x = 15; x < 27; x++) {
      const k = (y * im.width + x) * 4;
      im.data[k] = im.data[k + 1] = im.data[k + 2] = 20;
    }
  const short = prepareDigit(im, [0, 0, 25, 25])!,
    full = prepareDigit(im, [0, 0, 25, 30])!;
  expect(short.variants[0]).toEqual(full.variants[0]);
});
it("Disagreeing preparations return a required review marker and alternatives, not a fabricated valid score", async () => {
  const im = ink(),
    rect: [number, number, number, number] = [0, 0, 25, 25];
  let count = 0;
  const read = await readScore(im, [rect], async () => {
    const logits = Array(10).fill(-8);
    logits[count++ === 1 ? 6 : 5] = 8;
    return logits;
  });
  expect(read.value).toBe("?");
  expect(read.issue).toContain("ambigu");
  expect(read.alternatives).toContain("5");
  expect(read.alternatives).toContain("6");
});
it("Compact final-score boxes occupy less than 15% of dense group cells; legacy sheets remain fixture-bound", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "OV-final-corner-"));
  try {
    const t = groupPhase(registered(5)),
      p = t.phases[0],
      d = await makeSheet(
        t,
        p,
        folder,
        path.resolve("assets/fonts"),
        p.groups[0],
      );
    t.documents = [d];
    t.paperForms = d.forms;
    for (const field of d.forms![0].fields) {
      const area = field.digits!.reduce((sum, r) => sum + r[2] * r[3], 0);
      expect(area / (125 * ((770 - 315 - 32) / 10))).toBeLessThan(0.15);
      expect(field.rect[2]).toBeLessThan(50);
    }
    const form = t.paperForms![0];
    expect(form.fixtureKey).toBe(scoreFixtureKey(t, form));
    t.documents = [];
    expect(currentForm(t, form.id)).toBe(form);
    p.matches[0].target = 25;
    expect(() => currentForm(t, form.id)).toThrow("remplacée");
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});
