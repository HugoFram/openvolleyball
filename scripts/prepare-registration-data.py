"""Download pinned public handwriting corpora; never reads user tournaments.

Run with the registration-training requirements. Data and intermediate images stay
under ignored tmp/. GNHK keeps its official test documents; CREMMA uses whole
document groups (writer identities are not available in these corpora).
"""

import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path("tmp/registration-data")
GNHK = "eaa67d396fd29b8b04e38d630da79f67db11b212"
CREMMA = "5cd61fb74a976e23fa23df5811fc05c4424199ce"


def download(url, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=120) as r:
                    data = r.read()
                target.write_bytes(data)
                break
            except Exception:
                if attempt == 3:
                    raise
    return target


def fetch():
    download(
        f"https://huggingface.co/datasets/staghado/GNHK-Dataset/resolve/{GNHK}/GNHK-dataset.zip",
        ROOT / "gnhk.zip",
    )
    tree = json.loads((ROOT / "cremma-tree.json").read_text())
    assert tree["sha"] == CREMMA, "Unexpected CREMMA source revision"
    assert (
        hashlib.sha256((ROOT / "gnhk.zip").read_bytes()).hexdigest()
        == "5f4b470030b41cd80e32d3a5ae7bc8bc41acc79b4bf770a451e7ec54ca3be34d"
    ), "GNHK archive integrity check failed"
    tasks = []
    for f in tree["tree"]:
        if f["path"].startswith("data/") and f["path"].endswith((".xml", ".png")):
            tasks.append(
                (
                    f"https://raw.githubusercontent.com/HTR-United/cremma-wikipedia/{CREMMA}/{f['path']}",
                    ROOT / "cremma" / f["path"],
                )
            )
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for i, _ in enumerate(pool.map(lambda args: download(*args), tasks)):
            if i % 50 == 0:
                print(f"Downloaded {i + 1}/{len(tasks)} files", flush=True)


def extract():
    from PIL import Image

    samples = []
    out = ROOT / "lines"
    out.mkdir(exist_ok=True)
    cache = ROOT / "cremma-samples.json"
    if cache.exists():
        samples.extend(json.loads(cache.read_text(encoding="utf8")))
    else:
        for xml in sorted((ROOT / "cremma" / "data").rglob("*.xml")):
            root = ET.parse(xml).getroot()
            group = xml.relative_to(ROOT / "cremma").as_posix()
            bucket = int(hashlib.sha256(group.encode()).hexdigest()[:8], 16) % 10
            split = "test" if bucket == 0 else "validation" if bucket == 1 else "train"
            image = Image.open(xml.with_suffix(".png")).convert("RGB")
            for i, line in enumerate(root.findall(".//{*}TextLine")):
                text = " ".join(
                    s.attrib.get("CONTENT", "") for s in line.findall("{*}String")
                ).strip()
                # Do not teach editorial markup for deletions / unreadable words.
                if not text or any(c in text for c in [">", "<", "^"]):
                    continue
                x, y, w, h = [
                    int(float(line.attrib[k]))
                    for k in ["HPOS", "VPOS", "WIDTH", "HEIGHT"]
                ]
                box = (
                    max(0, x - 3),
                    max(0, y - 3),
                    min(image.width, x + w + 4),
                    min(image.height, y + h + 4),
                )
                file = (
                    out
                    / f"cremma-{hashlib.sha256(group.encode()).hexdigest()[:12]}-{i:03}.png"
                )
                image.crop(box).save(file)
                samples.append(
                    dict(
                        file=str(file),
                        text=text,
                        split=split,
                        corpus="cremma",
                        group=group,
                    )
                )
        cache.write_text(json.dumps(samples, ensure_ascii=False), encoding="utf8")
    add_gnhk(samples, out)
    add_synthetic(samples, out)
    (ROOT / "samples.json").write_text(
        json.dumps(samples, ensure_ascii=False), encoding="utf8"
    )
    print("Prepared", len(samples), "lines", flush=True)


def add_gnhk(samples, out):
    import zipfile, shutil, random
    from PIL import Image, ImageDraw, ImageOps

    rng = random.Random(20261019)
    with zipfile.ZipFile(ROOT / "gnhk.zip") as outer:
        for name in ["train_data.zip", "test_data.zip"]:
            target = ROOT / name
            if not target.exists():
                with outer.open(name) as src, target.open("wb") as dst:
                    shutil.copyfileobj(src, dst)
            with zipfile.ZipFile(target) as archive:
                for name in sorted(archive.namelist()):
                    if not name.endswith(".json"):
                        continue
                    group = Path(name).stem
                    bucket = (
                        int(hashlib.sha256(group.encode()).hexdigest()[:8], 16) % 10
                    )
                    split = (
                        "test"
                        if name.startswith("test/")
                        else "validation" if bucket == 0 else "train"
                    )
                    words = [
                        w
                        for w in json.loads(archive.read(name))
                        if w.get("type") == "H"
                        and 2 <= len(w["text"].strip()) <= 35
                        and not any(c in w["text"] for c in ["%", "#", ">", "<"])
                    ]
                    rng.shuffle(words)
                    words = words[: 16 if split == "train" else 6]
                    image = ImageOps.exif_transpose(
                        Image.open(io.BytesIO(archive.read(name[:-5] + ".jpg")))
                    ).convert("RGB")
                    for i, word in enumerate(words):
                        points = [
                            (word["polygon"][f"x{j}"], word["polygon"][f"y{j}"])
                            for j in range(4)
                        ]
                        x, y = zip(*points)
                        box = (
                            max(0, min(x) - 3),
                            max(0, min(y) - 3),
                            min(image.width, max(x) + 4),
                            min(image.height, max(y) + 4),
                        )
                        if box[2] - box[0] < 4 or box[3] - box[1] < 4:
                            continue
                        file = out / f"gnhk-v2-{group}-{i:03}.png"
                        if not file.exists():
                            crop = image.crop(box)
                            mask = Image.new("L", crop.size, 0)
                            ImageDraw.Draw(mask).polygon(
                                [(a - box[0], b - box[1]) for a, b in points], fill=255
                            )
                            Image.composite(
                                crop, Image.new("RGB", crop.size, "white"), mask
                            ).save(file)
                        samples.append(
                            dict(
                                file=str(file),
                                text=word["text"].strip(),
                                split=split,
                                corpus="gnhk",
                                group=group,
                            )
                        )
    print(
        "GNHK", len([r for r in samples if r["corpus"] == "gnhk"]), "words", flush=True
    )


def add_synthetic(samples, out):
    from PIL import Image

    # Short isolated fields and punctuation differ from correspondence lines.
    # Synthetic examples supplement real handwriting; they are never reported
    # as real-writer evaluation data. Windows font files are not redistributed.
    import random
    from PIL import ImageDraw, ImageFont, ImageFilter

    rng = random.Random(20261019)
    given = [
        "François",
        "Étienne",
        "Chloé",
        "Maëlle",
        "Géraldine",
        "Noémie",
        "Benoît",
        "Léa",
        "André",
        "Gaël",
        "Loïc",
        "Élodie",
        "Clément",
        "Théo",
        "Océane",
        "Rémi",
        "Cédric",
        "Inès",
        "Jérôme",
        "Amélie",
    ]
    family = [
        "Marchand",
        "Dubois",
        "Lefèvre",
        "Gonçalves",
        "Müller",
        "Faure",
        "Moreau",
        "Girard",
        "Rivière",
        "Lemaître",
        "Gauthier",
        "Schär",
        "Bérard",
        "Dufour",
    ]
    fonts = [
        Path("C:/Windows/Fonts") / f
        for f in [
            "segoepr.ttf",
            "segoeprb.ttf",
            "comic.ttf",
            "comici.ttf",
            "lhandw.ttf",
        ]
    ]
    fonts = [f for f in fonts if f.exists()]
    import unicodedata

    for i in range(2400 if fonts else 0):
        first, last = rng.choice(given), rng.choice(family)
        mode = i % 4
        text = (
            first + " " + last
            if mode == 0
            else (
                first
                if mode == 1
                else (
                    rng.choice(
                        [
                            "Volley de Genève",
                            "Étoile du Léman",
                            "Les Aigles",
                            "AS Chêne",
                            "Monthey Volley",
                            "Sport et Amitié",
                        ]
                    )
                    if mode == 2
                    else unicodedata.normalize("NFKD", first + "." + last)
                    .encode("ascii", "ignore")
                    .decode()
                    .lower()
                    + rng.choice(["@example.com", "@exemple.fr", "@example.org"])
                )
            )
        )
        font = ImageFont.truetype(str(rng.choice(fonts)), rng.randrange(26, 46))
        box = font.getbbox(text)
        image = Image.new("RGB", (box[2] - box[0] + 24, box[3] - box[1] + 24), "white")
        ImageDraw.Draw(image).text(
            (12 - box[0], 12 - box[1]),
            text,
            font=font,
            fill=(rng.randrange(0, 70),) * 3,
        )
        image = image.rotate(rng.uniform(-1.4, 1.4), fillcolor="white", expand=True)
        if i % 3 == 0:
            image = image.filter(ImageFilter.GaussianBlur(0.35))
        file = out / f"synthetic-{i:05}.png"
        image.save(file)
        samples.append(
            dict(
                file=str(file),
                text=text,
                split="train",
                corpus="synthetic",
                group="synthetic-fonts",
            )
        )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch-only", action="store_true")
    parser.add_argument("--synthetic-only", action="store_true")
    args = parser.parse_args()
    if args.synthetic_only:
        samples = [
            r
            for r in json.loads((ROOT / "samples.json").read_text(encoding="utf8"))
            if r["corpus"] != "synthetic"
        ]
        add_synthetic(samples, ROOT / "lines")
        (ROOT / "samples.json").write_text(
            json.dumps(samples, ensure_ascii=False), encoding="utf8"
        )
        print("Prepared", len(samples), "lines", flush=True)
        raise SystemExit(0)
    ROOT.mkdir(parents=True, exist_ok=True)
    if not (ROOT / "cremma-tree.json").exists():
        download(
            f"https://api.github.com/repos/HTR-United/cremma-wikipedia/git/trees/{CREMMA}?recursive=1",
            ROOT / "cremma-tree.json",
        )
    fetch()
    if not args.fetch_only:
        extract()
