"""Evaluate offline q8 readers against an explicitly supplied reviewed export.

Reads private images/text locally. Only aggregates and source/weight hashes enter
the public report; detailed predictions stay in the ignored experiment folder.
Never use this export as training data or checkpoint-selection validation.
"""

import argparse
import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path
import unicodedata

import onnxruntime as ort
from optimum.onnxruntime import ORTModelForVision2Seq
from transformers import TrOCRProcessor, VisionEncoderDecoderConfig
from PIL import Image
from rapidfuzz.distance import Levenshtein
import torch
from registration_preprocessing import handwriting_crop


def normalize(text, email=False):
    value = " ".join(unicodedata.normalize("NFC", text).split())
    if email:
        import re

        joined = "".join(value.split())
        if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", joined):
            return joined
    return value


def summary(rows):
    out = {}
    for kind in ["all", "team", "name", "email", "club", "blank"]:
        selected = [
            r
            for r in rows
            if (
                not r["text"]
                if kind == "blank"
                else bool(r["text"]) and (kind == "all" or r["kind"] == kind)
            )
        ]
        chars = sum(len(r["text"]) for r in selected)
        errors = sum(Levenshtein.distance(r["text"], r["prediction"]) for r in selected)
        out[kind] = dict(
            samples=len(selected),
            exact=sum(r["text"] == r["prediction"] for r in selected),
            caseInsensitiveExact=sum(
                r["text"].casefold() == r["prediction"].casefold() for r in selected
            ),
            characters=chars,
            characterErrors=errors,
            cer=errors / max(1, chars),
        )
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--export", type=Path, required=True)
    p.add_argument("--candidate", type=Path, required=True)
    p.add_argument("--out", type=Path, default=Path("tmp/registration-alpha6"))
    p.add_argument("--name", default="candidate")
    p.add_argument("--task-prefixes", action="store_true")
    p.add_argument("--training-split", type=Path)
    args = p.parse_args()
    torch.set_num_threads(4)
    rows = json.loads((args.export / "inscriptions.json").read_text(encoding="utf8"))[
        "samples"
    ]
    assert (
        len({r["captureGroup"] for r in rows}) == 1
    ), "Review source separation before using a different export."
    args.out.mkdir(parents=True, exist_ok=True)
    processor = TrOCRProcessor.from_pretrained("tmp/registration-alpha6/baseline/best")
    config = VisionEncoderDecoderConfig.from_pretrained(
        "tmp/registration-alpha6/baseline/best"
    )
    staging = args.out / ("evaluate-" + args.name)
    staging.mkdir(exist_ok=True)
    config.save_pretrained(staging)
    hashes = {}
    for src, dst in [
        ("encoder_model_quantized.onnx", "encoder_model.onnx"),
        ("decoder_model_merged_quantized.onnx", "decoder_model_merged.onnx"),
    ]:
        data = (args.candidate / src).read_bytes()
        hashes[src] = hashlib.sha256(data).hexdigest()
        (staging / dst).write_bytes(data)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    options.inter_op_num_threads = 1
    model = ORTModelForVision2Seq.from_pretrained(
        staging,
        config=config,
        use_merged=True,
        use_cache=True,
        session_options=options,
        local_files_only=True,
    )
    predictions = []
    with torch.inference_mode():
        for i, row in enumerate(rows):
            raw = (args.export / row["file"]).read_bytes()
            assert hashlib.sha256(raw).hexdigest() == row["imageSha256"]
            crop = handwriting_crop(Image.open(args.export / row["file"]))
            if crop is None:
                text = ""
            else:
                pixels = processor(images=crop, return_tensors="pt").pixel_values
                tag = "email:" if row["kind"] == "email" else "text:"
                prefix = torch.tensor(
                    [
                        [2, 0]
                        + processor.tokenizer(tag, add_special_tokens=False).input_ids
                    ]
                )
                ids = model.generate(
                    pixels,
                    max_new_tokens=80 if row["kind"] == "email" else 48,
                    num_beams=1,
                    do_sample=False,
                    **({"decoder_input_ids": prefix} if args.task_prefixes else {})
                )
                text = processor.batch_decode(ids, skip_special_tokens=True)[0]
                if args.task_prefixes:
                    assert text.startswith(tag)
                    text = text[len(tag) :]
            predictions.append(
                {
                    **row,
                    "text": normalize(row["text"]),
                    "prediction": normalize(text, row["kind"] == "email"),
                }
            )
            if i % 13 == 0:
                print(args.name, i, len(rows), flush=True)
    split = json.loads(args.training_split.read_text()) if args.training_split else None
    report = dict(
        format="open-volleyball-reviewed-registration-evaluation",
        version=1,
        reader=args.name,
        exportSha256=hashlib.sha256(
            (args.export / "inscriptions.json").read_bytes()
        ).hexdigest(),
        samples=len(rows),
        sheets=len({r["sheetGroup"] for r in rows}),
        captures=1,
        privateSamplesUsedForTraining=split["trainFields"] if split else 0,
        weights=hashes,
        runtime="ONNX Runtime CPU q8",
        summary=summary(predictions),
        limits=[
            (
                "One capture; unknown writer identities. Personalized comparison separates whole sheets, not independent sources or proven writers."
                if split
                else "All eight sheets excluded from training."
            ),
            "Corrected labels may include capitalization/spelling changes or text clipped by the original field. Strict exact accuracy counts these as errors.",
            "A small supplied test set is not a population accuracy estimate; review remains mandatory.",
        ],
    )
    if split:
        report["heldOutSheets"] = len(split["testSheets"])
        report["heldOutSummary"] = summary(
            [r for r in predictions if r["sheetGroup"] in split["testSheets"]]
        )
    (args.out / (args.name + "-private-predictions.json")).write_text(
        json.dumps(predictions, ensure_ascii=False, indent=2), encoding="utf8"
    )
    (args.out / (args.name + "-summary.json")).write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf8"
    )
    print(json.dumps(report["summary"], indent=2), flush=True)


if __name__ == "__main__":
    main()
