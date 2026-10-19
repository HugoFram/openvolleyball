"""Short-field rehearsal for the offline reader; no reviewed/private data is read.

Requires the pinned public corpora from prepare-registration-data.py. New e-mail
strings are generated, never delivered or used as an address book. Real-word
composites inherit their source split; original test crops are never training.
Windows fonts are used locally for rendering and are not distributed.
"""

import json
import random
import re
import unicodedata
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
from registration_preprocessing import handwriting_crop

ROOT = Path("tmp/registration-alpha6")
SEED = 20261020
DOMAINS = [
    "gmail.com",
    "hotmail.com",
    "outlook.fr",
    "orange.fr",
    "yahoo.fr",
    "icloud.com",
    "proton.me",
    "live.fr",
    "laposte.net",
    "free.fr",
]
TLDS = ["fr", "com", "ch", "org", "net", "eu", "me", "be", "it"]
FONTS = [
    "segoepr.ttf",
    "comic.ttf",
    "Inkfree.ttf",
    "LHANDW.TTF",
    "BRADHITC.TTF",
    "FRSCRIPT.TTF",
    "MISTRAL.TTF",
]
VAL_FONTS = ["segoeprb.ttf", "comici.ttf"]


def ascii_word(text):
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()


def render(text, rng, fonts):
    font = ImageFont.truetype(
        "C:/Windows/Fonts/" + rng.choice(fonts), rng.randrange(25, 49)
    )
    box = font.getbbox(text)
    canvas = Image.new("L", (box[2] - box[0] + 36, box[3] - box[1] + 24), 255)
    ImageDraw.Draw(canvas).text(
        (18 - box[0], 12 - box[1]), text, font=font, fill=rng.randrange(0, 125)
    )
    # Uneven pen height/spacing, perspective-free scan noise and low resolution.
    if rng.random() < 0.55:
        a = np.array(canvas)
        for x in range(a.shape[1]):
            a[:, x] = np.roll(a[:, x], round(1.7 * np.sin(x / 35 + rng.random() * 0.3)))
        canvas = Image.fromarray(a)
    canvas = canvas.resize(
        (
            max(20, int(canvas.width * rng.uniform(0.65, 1.25))),
            max(12, int(canvas.height * rng.uniform(0.8, 1.25))),
        )
    )
    canvas = canvas.rotate(rng.uniform(-2, 2), fillcolor=255, expand=True)
    if rng.random() < 0.6:
        factor = rng.uniform(0.5, 1)
        canvas = canvas.resize(
            (max(12, int(canvas.width * factor)), max(10, int(canvas.height * factor)))
        )
        canvas = canvas.filter(ImageFilter.GaussianBlur(rng.uniform(0.15, 0.55)))
    return canvas.convert("RGB")


def composite(words, rng, fonts):
    # Assemble complete real handwritten words, not incorrectly labelled letters.
    parts, text = [], ""
    for word in words:
        if isinstance(word, dict):
            im = Image.open(word["file"]).convert("RGB")
            a = np.asarray(im)
            yy, xx = np.where(a.mean(axis=2) < 170)
            if not len(xx):
                return None, None
            im = im.crop((xx.min(), yy.min(), xx.max() + 1, yy.max() + 1))
            im = im.resize((max(3, round(im.width * 32 / im.height)), 32))
            value = word["text"]
        else:
            value = word
            im = render(value, rng, fonts)
            im = ImageOps.crop(im, (4, 2, 4, 2))
            im = im.resize((max(3, round(im.width * 36 / im.height)), 36))
        parts.append(im)
        text += value
    canvas = Image.new("RGB", (sum(p.width for p in parts) + 24, 60), "white")
    x = 12
    for im in parts:
        canvas.paste(im, (x, 12 + rng.randrange(-2, 3)))
        x += im.width
    return canvas, text


def main():
    rng = random.Random(SEED)
    public = json.loads(
        Path("tmp/registration-data/prepared-samples.json").read_text(encoding="utf8")
    )
    out = ROOT / "fields"
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    # Vocabulary only from public TRAINING lines, not supplied registrations.
    vocab = sorted(
        {
            w.strip('.,;:()[]!?"=')
            for r in public
            if r["split"] == "train"
            for w in r["text"].split()
            if 3 <= len(w) <= 18
        }
    )
    vocab = [w for w in vocab if re.fullmatch(r"[^\W\d_]+(?:[-'][^\W\d_]+)?", w)]
    words = {
        split: [
            r
            for r in public
            if r["split"] == split
            and r["corpus"] == "gnhk"
            and re.fullmatch("[A-Za-z]{3,12}", r["text"])
        ]
        for split in ["train", "validation"]
    }

    def save(image, text, split, kind, source_groups=None):
        prepared = handwriting_crop(image)
        if not prepared:
            return
        file = out / f"{len(rows):06}.png"
        prepared.save(file)
        rows.append(
            dict(
                file=str(file),
                text=text,
                split=split,
                corpus="fields",
                kind=kind,
                group=f"generated-{split}",
                sourceGroups=source_groups or [],
            )
        )

    for split, count, fonts in [
        ("train", 16000, FONTS),
        ("validation", 240, VAL_FONTS),
    ]:
        for i in range(count):
            mode = i % 8
            if mode <= 3:
                a, b = (
                    ascii_word(rng.choice(vocab)).lower(),
                    ascii_word(rng.choice(vocab)).lower(),
                )
                local = rng.choice(
                    [
                        a,
                        a + "." + b,
                        a + "_" + b,
                        a[0] + b,
                        a + str(rng.randrange(10, 2000)),
                        a + "-" + b,
                    ]
                )
                domain = (
                    rng.choice(DOMAINS)
                    if i % 3
                    else ascii_word(rng.choice(vocab)).lower() + "." + rng.choice(TLDS)
                )
                text = local + "@" + domain
                if i % 5 == 0:
                    text = text[:1].upper() + text[1:]
                save(render(text, rng, fonts), text, split, "email")
            elif mode == 4:
                # Public real-word email composites diversify beyond font strokes.
                a, b = rng.choice(words[split]), rng.choice(words[split])
                parts = [a, "@", b, "." + rng.choice(TLDS)]
                image, text = composite(parts, rng, fonts)
                if image:
                    save(image, text, split, "email", [a["group"], b["group"]])
            else:
                n = 2 if mode == 5 else rng.randrange(1, 5)
                text = " ".join(rng.choice(vocab).capitalize() for _ in range(n))
                if mode == 7 and i % 3:
                    text = text[:1].upper() + text[1:].lower()
                save(render(text, rng, fonts), text, split, "short-field")
            if i % 2000 == 0:
                print(split, i, flush=True)
    # Rehearse the original data to avoid forgetting French handwriting.
    combined = public + rows
    (ROOT / "prepared-samples.json").write_text(
        json.dumps(combined, ensure_ascii=False), encoding="utf8"
    )
    (ROOT / "fields-recipe.json").write_text(
        json.dumps(
            {
                "seed": SEED,
                "generator": "scripts/prepare-registration-fields.py",
                "counts": dict(Counter(r["split"] + ":" + r["kind"] for r in rows)),
                "trainingFonts": FONTS,
                "validationFonts": VAL_FONTS,
                "privateSamplesRead": 0,
                "domainsAreGeneratedTrainingStrings": True,
                "limitations": "Synthetic fields are rehearsal, not real handwriting accuracy evidence. Font families overlap between train and validation.",
            },
            indent=2,
        ),
        encoding="utf8",
    )
    print("Prepared", len(rows), "short fields", flush=True)


if __name__ == "__main__":
    main()
