"""Compare actual quantized CPU models on fixed, held-out public samples.

Does not read reviewed exports or user tournaments. Configs/tokenizers are the
same for both models. Run after export-registration-model.py; see model card.
"""

import argparse
import json
from pathlib import Path
import random
import unicodedata
import shutil
import hashlib

import onnxruntime as ort
from optimum.onnxruntime import ORTModelForVision2Seq
from transformers import TrOCRProcessor, VisionEncoderDecoderConfig
from PIL import Image
from rapidfuzz.distance import Levenshtein
import torch


def normalize(s):
    return " ".join(unicodedata.normalize("NFC", s).split())


def main():
    p = argparse.ArgumentParser()
    p.add_argument(
        "--count",
        type=int,
        default=128,
        help="Fixed samples per corpus (never training/validation).",
    )
    args = p.parse_args()
    data = json.loads(
        Path("tmp/registration-data/prepared-samples.json").read_text(encoding="utf8")
    )
    rows = []
    rng = random.Random(917)
    for corpus in ["cremma", "gnhk"]:
        subset = [r for r in data if r["corpus"] == corpus and r["split"] == "test"]
        rng.shuffle(subset)
        rows += subset[: args.count]
    processor = TrOCRProcessor.from_pretrained("tmp/registration-training/best")
    config = VisionEncoderDecoderConfig.from_pretrained(
        "tmp/registration-training/best"
    )
    output = {
        "format": "open-volleyball-registration-benchmark",
        "version": 1,
        "samplesPerCorpus": args.count,
        "seed": 917,
        "maxNewTokens": 48,
        "runtime": "ONNX Runtime CPU q8",
        "onnxRuntimeVersion": ort.__version__,
        "weights": {},
        "models": {},
    }
    for name, directory in [
        ("baseline", "tmp/baseline-registration"),
        ("adapted", "assets/models/registration/trocr-small-handwritten/onnx"),
    ]:
        # Optimum treats explicit decoder filenames as separate non-merged
        # graphs. Stage the unchanged q8 bytes with its standard merged names.
        staging = Path("tmp/registration-training/benchmark-models") / name
        staging.mkdir(parents=True, exist_ok=True)
        config.save_pretrained(staging)
        for source, target in [
            ("encoder_model_quantized.onnx", "encoder_model.onnx"),
            ("decoder_model_merged_quantized.onnx", "decoder_model_merged.onnx"),
        ]:
            shutil.copyfile(Path(directory) / source, staging / target)
        output["weights"][name] = {
            file: hashlib.sha256((Path(directory) / file).read_bytes()).hexdigest()
            for file in [
                "encoder_model_quantized.onnx",
                "decoder_model_merged_quantized.onnx",
            ]
        }
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
                image = Image.open(row["file"]).convert("RGB")
                # A missed faint word counts as an error; it is not removed.
                empty = image.getextrema() == ((255, 255), (255, 255), (255, 255))
                pixels = processor(images=image, return_tensors="pt").pixel_values
                text = (
                    ""
                    if empty
                    else normalize(
                        processor.batch_decode(
                            model.generate(
                                pixels, max_new_tokens=48, num_beams=1, do_sample=False
                            ),
                            skip_special_tokens=True,
                        )[0]
                    )
                )
                predictions.append({**row, "prediction": text})
                if i % 32 == 0:
                    print(name, i, len(rows), flush=True)
        summary = {}
        for corpus in ["cremma", "gnhk"]:
            for accented in [False, True]:
                selected = [
                    r
                    for r in predictions
                    if r["corpus"] == corpus
                    and (not accented or any(ord(c) > 127 for c in r["text"]))
                ]
                chars = sum(len(normalize(r["text"])) for r in selected)
                errors = sum(
                    Levenshtein.distance(normalize(r["text"]), r["prediction"])
                    for r in selected
                )
                exact = sum(normalize(r["text"]) == r["prediction"] for r in selected)
                summary[corpus + ("_accented" if accented else "")] = {
                    "samples": len(selected),
                    "characters": chars,
                    "characterErrors": errors,
                    "cer": errors / max(1, chars),
                    "exact": exact,
                    "exactRate": exact / max(1, len(selected)),
                }
        output["models"][name] = summary
        Path(f"tmp/registration-training/quantized-{name}-predictions.json").write_text(
            json.dumps(predictions, ensure_ascii=False), encoding="utf8"
        )
        del model
        print(name, json.dumps(summary), flush=True)
    Path("docs/reports/registration-alpha5-benchmark.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )


if __name__ == "__main__":
    main()
