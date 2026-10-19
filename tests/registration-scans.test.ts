import { it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createTournament } from "../src/domain/engine";
import { makeRegistrationSheet } from "../electron/registration-pdf";
import { localRect, textCrop, textSuggestion } from "../src/scan/handwriting";
import {
  alignRaster,
  homography,
  normalizedScale,
  type Raster,
} from "../src/scan/geometry";
import { tournamentSchema } from "../src/domain/schema";

it("each printed half owns the same local geometry, four anchors, branding footprint and field areas", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "OV-half-layout-"));
  try {
    const t = createTournament("Inscriptions"),
      d = await makeRegistrationSheet(
        t,
        folder,
        path.resolve("assets/fonts"),
        "Hommes",
        2,
        1,
      );
    const [top, bottom] = d.forms!;
    expect(top.region).toEqual([0, 0, 595.28, 841.89 / 2]);
    expect(bottom.region).toEqual([0, 841.89 / 2, 595.28, 841.89 / 2]);
    localRect(top, top.qr).forEach((v, i) =>
      expect(v).toBeCloseTo(localRect(bottom, bottom.qr)[i], 6),
    );
    expect(top.id).not.toBe(bottom.id);
    expect(top.fields).toHaveLength(17);
    for (let i = 0; i < top.fields.length; i++) {
      const a = top.fields[i],
        b = bottom.fields[i];
      expect(a.key).toBe(b.key);
      localRect(top, a.rect).forEach((v, j) =>
        expect(v).toBeCloseTo(localRect(bottom, b.rect)[j], 6),
      );
      expect(a.rect[1] + a.rect[3]).toBeLessThan(top.region![3] - 25);
    }
    t.documents = [d];
    t.paperForms = d.forms;
    t.schema = 2;
    expect(tournamentSchema.parse(t).paperForms![1].region).toEqual(
      bottom.region,
    );
    expect(normalizedScale(1191, 842)).toBe(2);
    expect(
      localRect({ ...top, region: undefined }, top.fields[0].rect),
    ).toEqual(top.fields[0].rect);
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});

it("blank cells, pale ruling and specks never invoke text recognition; faint pen strokes survive", () => {
  const im: Raster = {
    width: 1191,
    height: 842,
    data: new Uint8ClampedArray(1191 * 842 * 4),
  };
  im.data.fill(255);
  const rect: [number, number, number, number] = [0, 0, 60, 30];
  expect(textCrop(im, rect)).toBeNull();
  for (let n = 0; n < 8; n++)
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const k = ((10 + (n % 3) * 8 + dy) * im.width + 9 + n * 8 + dx) * 4;
        im.data[k] = im.data[k + 1] = im.data[k + 2] = 50;
      }
  expect(textCrop(im, rect)).toBeNull();
  im.data.fill(255);
  // A clipped dark printed border must not turn an empty cell into underscores.
  for (let x = 0; x < 120; x++) {
    const k = x * 4;
    im.data[k] = im.data[k + 1] = im.data[k + 2] = 35;
  }
  expect(textCrop(im, rect)).toBeNull();
  for (let x = 0; x < 120; x++) {
    const k = (52 * im.width + x) * 4;
    im.data[k] = im.data[k + 1] = im.data[k + 2] = 135;
  }
  expect(textCrop(im, rect)).toBeNull();
  for (let y = 15; y < 38; y++)
    for (let x = 16; x < 20; x++) {
      const k = (y * im.width + x) * 4;
      im.data[k] = im.data[k + 1] = im.data[k + 2] = 155;
    }
  const crop = textCrop(im, rect)!;
  expect(crop).not.toBeNull();
  expect(crop.height).toBeGreaterThan(20);
  expect(crop.width).toBeLessThan(40);
});

it("transcription preserves accents, never invents email punctuation, and flags unreadable/invalid text", () => {
  expect(textSuggestion("  E\u0301milie\nDupré ", "player0:name").value).toBe(
    "Émilie Dupré",
  );
  expect(textSuggestion("anna @ example . com", "player0:email").value).toBe(
    "anna@example.com",
  );
  expect(textSuggestion("annaexample.com", "player0:email")).toMatchObject({
    value: "annaexample.com",
    issue: "Format d’e-mail à vérifier",
  });
  expect(textSuggestion("", "teamName").issue).toContain("non reconnu");
});

it("normalizing a lower physical half produces local pixels without the other team's image", () => {
  const im: Raster = {
    width: 60,
    height: 90,
    data: new Uint8ClampedArray(60 * 90 * 4),
  };
  im.data.fill(255);
  const k = (47 * 60 + 6) * 4;
  im.data[k] = im.data[k + 1] = im.data[k + 2] = 0;
  const h = homography(
    [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 90 },
      { x: 0, y: 90 },
    ],
    [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 90 },
      { x: 0, y: 90 },
    ],
  );
  const result = alignRaster(im, h, 1, [0, 45, 60, 45]);
  expect(result.width).toBe(60);
  expect(result.height).toBe(45);
  expect(result.data[(2 * 60 + 6) * 4]).toBe(0);
});
