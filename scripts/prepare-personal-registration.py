"""Prepare an explicitly local personalized experiment from reviewed registrations.

All output, including names/emails and the source split, stays under ignored tmp.
This is a maintainer training tool, never an automatic upload or in-app trainer.
Whole sheets at the end of the export are reserved; writer identities are unknown.
"""

import argparse
import hashlib
import json
import random
from pathlib import Path
from PIL import Image
from registration_preprocessing import handwriting_crop


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--export", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument(
        "--public-data",
        type=Path,
        default=Path("tmp/registration-alpha6/prepared-samples.json"),
    )
    p.add_argument("--training-sheets", type=int, default=6)
    p.add_argument(
        "--all-reviewed",
        action="store_true",
        help="Final local fit after a separate held-out experiment; this output has no held-out accuracy estimate",
    )
    p.add_argument("--exclude", nargs="*", default=[])
    args = p.parse_args()
    if not args.output.resolve().is_relative_to(Path("tmp").resolve()):
        raise ValueError("Personalized data must stay under ignored tmp")
    args.output.mkdir(parents=True, exist_ok=True)
    source = json.loads((args.export / "inscriptions.json").read_text(encoding="utf8"))
    assert source["format"] == "open-volleyball-reviewed-registrations"
    sheets = list(dict.fromkeys(r["sheetGroup"] for r in source["samples"]))
    if not args.all_reviewed and not 0 < args.training_sheets < len(sheets):
        raise ValueError("Reserve at least one complete sheet")
    training, heldout = (
        (sheets, [])
        if args.all_reviewed
        else (sheets[: args.training_sheets], sheets[args.training_sheets :])
    )
    public = json.loads(args.public_data.read_text(encoding="utf8"))
    rng, rows = random.Random(20261020), []
    for corpus, count in [
        ("gnhk", 800),
        ("cremma", 600),
        ("synthetic", 1000),
        ("fields", 3000),
    ]:
        pool = [r for r in public if r["corpus"] == corpus and r["split"] == "train"]
        rng.shuffle(pool)
        rows += pool[:count]
    rows += [r for r in public if r["split"] in ["validation", "test"]]
    private = []
    for row in source["samples"]:
        if (
            row["sheetGroup"] not in training
            or not row["text"]
            or row["file"] in args.exclude
        ):
            continue
        file = args.export / row["file"]
        if hashlib.sha256(file.read_bytes()).hexdigest() != row["imageSha256"]:
            raise ValueError("Input image differs from its reviewed hash")
        image = handwriting_crop(Image.open(file))
        if image is None:
            continue
        output = args.output / row["file"]
        image.save(output)
        private.append(
            dict(
                file=str(output),
                text=row["text"],
                kind=row["kind"],
                corpus="reviewed",
                split="train",
                group=row["sheetGroup"],
            )
        )
    rows += private * 60
    (args.output / "prepared-samples.json").write_text(
        json.dumps(rows, ensure_ascii=False), encoding="utf8"
    )
    (args.output / "private-split.json").write_text(
        json.dumps(
            dict(
                trainSheets=training,
                testSheets=heldout,
                trainFields=len(private),
                excluded=args.exclude,
                captures=len({r["captureGroup"] for r in source["samples"]}),
                limit="Same-capture sheet separation does not establish independent-source or independent-writer accuracy",
            ),
            indent=2,
        )
    )
    (args.output / "input-hashes.json").write_text(
        json.dumps(
            {
                str(f): hashlib.sha256(f.read_bytes()).hexdigest()
                for f in args.export.iterdir()
                if f.is_file()
            },
            indent=2,
        )
    )
    print("Local training fields:", len(private), "reserved sheets:", len(heldout))


if __name__ == "__main__":
    main()
