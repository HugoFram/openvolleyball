"""Public training/evaluation counterpart of src/scan/handwriting.ts textCrop.

Input is an already isolated field/line. Pixel math, connected components,
thresholds and padding follow the application; no labels inform the preparation.
"""

import numpy as np
from PIL import Image
from scipy import ndimage


def handwriting_crop(image):
    rgb = np.asarray(image.convert("RGB"), dtype=np.float64)
    gray = np.floor(
        rgb[:, :, 0] * 0.299 + rgb[:, :, 1] * 0.587 + rgb[:, :, 2] * 0.114 + 0.5
    ).astype(np.uint8)
    hist = np.bincount(gray.ravel(), minlength=256).cumsum()
    percentile = lambda p: int(np.searchsorted(hist, gray.size * p))
    paper, ink = percentile(0.9), percentile(0.015)
    threshold = paper - max(28, (paper - ink) * 0.4)
    for y in np.flatnonzero((gray < threshold).sum(axis=1) > gray.shape[1] * 0.8):
        gray[y, gray[y] > 95] = paper
    labels, _ = ndimage.label(gray < threshold, structure=np.ones((3, 3)))
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    mask = sizes[labels] >= 3
    if mask.sum() < 14:
        return None
    yy, xx = np.where(mask)
    x0, x1, y0, y1 = xx.min(), xx.max(), yy.min(), yy.max()
    if x1 - x0 < 2 or y1 - y0 < 5:
        return None
    pad = max(6, int(np.floor((y1 - y0 + 1) * 0.12 + 0.5)))
    out = np.full((y1 - y0 + 1 + pad * 2, x1 - x0 + 1 + pad * 2), 255, dtype=np.uint8)
    g = np.maximum(
        0, 255 - (paper - gray[yy, xx].astype(float)) * 255 / max(35, paper - ink)
    )
    # Uint8ClampedArray rounds ties to even, as numpy.rint does.
    out[yy - y0 + pad, xx - x0 + pad] = np.rint(g).astype(np.uint8)
    return Image.fromarray(out).convert("RGB")


if __name__ == "__main__":
    import json
    from pathlib import Path

    root = Path("tmp/registration-data")
    rows = json.loads((root / "samples.json").read_text(encoding="utf8"))
    prepared = root / "prepared"
    prepared.mkdir(exist_ok=True)
    for i, row in enumerate(rows):
        file = prepared / Path(row["file"]).name
        if not file.exists():
            crop = handwriting_crop(Image.open(row["file"]))
            (crop or Image.new("RGB", (16, 16), "white")).save(file)
        row["rawFile"] = row["file"]
        row["file"] = str(file)
        if i % 1000 == 0:
            print("Prepared contrast/crop", i, len(rows), flush=True)
    (root / "prepared-samples.json").write_text(
        json.dumps(rows, ensure_ascii=False), encoding="utf8"
    )
