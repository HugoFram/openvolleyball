"""Reproducible French adaptation of TrOCR-small; GPU training, offline CPU runtime.

Public corpora are prepared by prepare-registration-data.py. Private reviewed
data requires explicit --personalized mode; its weights must stay local.
GNHK official test documents and CREMMA document splits stay separate.
"""

import argparse
import hashlib
from collections import Counter
import json
import random
import time
import unicodedata
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps, ImageEnhance, ImageFilter
from rapidfuzz.distance import Levenshtein
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
from registration_training_loss import aligned_loss

BASE = "microsoft/trocr-small-handwritten"
REVISION = "b4648cfa171985a6745f37ddd637e98c0da958ac"
ROOT = Path("tmp/registration-data")
OUT = Path("tmp/registration-training")


def normalized(s):
    return " ".join(unicodedata.normalize("NFC", s).split())


class Lines(Dataset):
    def __init__(self, rows, processor, augment=False, task_prefixes=False):
        self.rows, self.processor, self.augment = rows, processor, augment
        self.task_prefixes = task_prefixes

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, index):
        row = self.rows[index]
        image = Image.open(row["file"]).convert("RGB")
        if self.augment:
            # Mild scan/photo variations, not aggressive destructive transforms.
            if random.random() < 0.5:
                image = ImageOps.expand(
                    image,
                    (random.randrange(3, 18), random.randrange(2, 12)),
                    fill="white",
                )
            if random.random() < 0.3:
                image = image.rotate(
                    random.uniform(-1.5, 1.5), fillcolor="white", expand=True
                )
            if random.random() < 0.25:
                image = image.filter(ImageFilter.GaussianBlur(random.uniform(0.1, 0.6)))
            if random.random() < 0.4:
                image = ImageEnhance.Contrast(image).enhance(random.uniform(0.65, 1.4))
        pixels = self.processor(images=image, return_tensors="pt").pixel_values[0]
        tokens = self.processor.tokenizer(
            (
                ("email:" if row.get("kind") == "email" else "text:")
                if self.task_prefixes
                else ""
            )
            + normalized(row["text"]),
            max_length=96,
            truncation=True,
            padding="max_length",
            return_tensors="pt",
        ).input_ids[0]
        tokens[tokens == self.processor.tokenizer.pad_token_id] = -100
        return pixels, tokens


def evaluate(model, processor, rows, name, batch=8):
    model.eval()
    predictions = []
    started = time.time()
    with torch.inference_mode():
        for start in range(0, len(rows), batch):
            selected = rows[start : start + batch]
            images = [Image.open(r["file"]).convert("RGB") for r in selected]
            pixels = processor(images=images, return_tensors="pt").pixel_values.to(
                "cuda"
            )
            with torch.autocast("cuda", dtype=torch.bfloat16):
                prefix = None
                if getattr(model, "ov_task_prefixes", False):
                    tags = [
                        "email:" if r.get("kind") == "email" else "text:"
                        for r in selected
                    ]
                    prefix = torch.tensor(
                        [
                            [2, 0]
                            + processor.tokenizer(
                                tag, add_special_tokens=False
                            ).input_ids
                            for tag in tags
                        ],
                        device="cuda",
                    )
                ids = model.generate(
                    pixels,
                    max_new_tokens=96,
                    num_beams=1,
                    do_sample=False,
                    **({"decoder_input_ids": prefix} if prefix is not None else {}),
                )
            texts = processor.batch_decode(ids, skip_special_tokens=True)
            if prefix is not None:
                texts = [
                    text[len(tag) :] if text.startswith(tag) else text
                    for tag, text in zip(tags, texts)
                ]
            for row, text in zip(selected, texts):
                predictions.append({**row, "prediction": normalized(text)})
            if start % 80 == 0:
                print(name, start, len(rows), flush=True)
    summary = {}
    for corpus in sorted(set(r["corpus"] for r in predictions)):
        for accented in [False, True]:
            subset = [
                r
                for r in predictions
                if r["corpus"] == corpus
                and (not accented or any(ord(c) > 127 for c in r["text"]))
            ]
            chars = sum(len(normalized(r["text"])) for r in subset)
            errors = sum(
                Levenshtein.distance(normalized(r["text"]), r["prediction"])
                for r in subset
            )
            exact = sum(normalized(r["text"]) == r["prediction"] for r in subset)
            summary[corpus + ("_accented" if accented else "")] = {
                "lines": len(subset),
                "characters": chars,
                "characterErrors": errors,
                "cer": errors / max(chars, 1),
                "exactLines": exact,
                "exactRate": exact / max(len(subset), 1),
            }
    result = {
        "name": name,
        "seconds": time.time() - started,
        "summary": summary,
        "predictions": predictions,
    }
    (OUT / f"{name}.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8"
    )
    print(name, json.dumps(summary), flush=True)
    return sum(
        Levenshtein.distance(normalized(r["text"]), r["prediction"])
        for r in predictions
    ) / max(1, sum(len(normalized(r["text"])) for r in predictions))


def main():
    global ROOT, OUT
    p = argparse.ArgumentParser()
    p.add_argument("--epochs", type=int, default=3)
    p.add_argument("--batch", type=int, default=8)
    p.add_argument("--evaluate-only", action="store_true")
    p.add_argument("--data-root", type=Path, default=ROOT)
    p.add_argument("--output", type=Path, default=OUT)
    p.add_argument("--initialize", type=Path)
    p.add_argument("--learning-rate", type=float, default=2e-5)
    p.add_argument("--short-fields", action="store_true")
    p.add_argument(
        "--personalized",
        action="store_true",
        help="Explicit local-only private corpus. Never publish the resulting weights.",
    )
    p.add_argument("--task-prefixes", action="store_true")
    p.add_argument(
        "--skip-baseline-test",
        action="store_true",
        help="For continuation from an already evaluated checkpoint",
    )
    args = p.parse_args()
    # Evaluation writes into the chosen experiment, preserving earlier releases.
    ROOT, OUT = args.data_root, args.output
    torch.manual_seed(20261019)
    random.seed(20261019)
    np.random.seed(20261019)
    torch.set_num_threads(6)
    assert (
        torch.cuda.is_available()
    ), "Use a CUDA training environment; the distributed app uses CPU only."
    OUT.mkdir(parents=True, exist_ok=True)
    processor = TrOCRProcessor.from_pretrained(BASE, revision=REVISION)
    model = VisionEncoderDecoderModel.from_pretrained(
        OUT / "best" if args.evaluate_only else (args.initialize or BASE),
        **({} if args.evaluate_only or args.initialize else {"revision": REVISION}),
        attn_implementation="eager",
    ).to("cuda")
    model.config.decoder_start_token_id = processor.tokenizer.eos_token_id
    model.config.pad_token_id = processor.tokenizer.pad_token_id
    model.config.eos_token_id = processor.tokenizer.eos_token_id
    model.generation_config.decoder_start_token_id = processor.tokenizer.eos_token_id
    model.generation_config.pad_token_id = processor.tokenizer.pad_token_id
    model.generation_config.eos_token_id = processor.tokenizer.eos_token_id
    model.ov_task_prefixes = args.task_prefixes
    rows = json.loads((ROOT / "prepared-samples.json").read_text(encoding="utf8"))
    allowed = (
        {
            "gnhk",
            "cremma",
            "synthetic",
        }
        | ({"fields"} if args.short_fields else set())
        | ({"reviewed"} if args.personalized else set())
    )
    assert {
        r["corpus"] for r in rows
    } == allowed, "Only documented distributable corpora may enter training."
    train = [
        r for r in rows if r["split"] == "train" and len(normalized(r["text"])) < 160
    ]
    # Fixed validation subset chosen before training. Test data is never used for selection.
    validation = []
    rng = random.Random(37)
    for corpus in ["gnhk", "cremma"]:
        val = [r for r in rows if r["split"] == "validation" and r["corpus"] == corpus]
        rng.shuffle(val)
        validation += val[:96]
    validation += [
        r for r in rows if r["split"] == "validation" and r["corpus"] == "fields"
    ]
    test = [r for r in rows if r["split"] == "test"]
    if args.evaluate_only:
        evaluate(model, processor, test, "adapted-test", args.batch)
        return
    (OUT / "recipe.json").write_text(
        json.dumps(
            {
                "base": BASE,
                "revision": REVISION,
                "seed": 20261019,
                "epochs": args.epochs,
                "batch": args.batch,
                "learningRate": args.learning_rate,
                "initialize": str(args.initialize) if args.initialize else BASE,
                "initialCheckpointSha256": (
                    hashlib.sha256(
                        (args.initialize / "model.safetensors").read_bytes()
                    ).hexdigest()
                    if args.initialize
                    else None
                ),
                "privateSamplesRead": len(
                    {r["file"] for r in train if r["corpus"] == "reviewed"}
                ),
                "personalizedLocalOnly": args.personalized,
                "taskPrefixes": args.task_prefixes,
                "objective": "aligned-cross-entropy-v1",
                "preprocessing": "scripts/registration_preprocessing.py (application textCrop pixel math)",
                "frenchTrainRepetitions": 4,
                "maximumLabelTokens": 96,
                "optimizer": "AdamW, weight_decay=0.01, clip_norm=1",
                "precision": "bf16 autocast with float32 master weights",
                "dataLoaderWorkers": 2,
                "checkpointSelection": "lowest validation character error; test excluded",
                "corpora": {
                    "cremma": "5cd61fb74a976e23fa23df5811fc05c4424199ce",
                    "gnhk": "eaa67d396fd29b8b04e38d630da79f67db11b212",
                },
                "trainCounts": dict(Counter(r["corpus"] for r in train)),
                "validationCounts": dict(Counter(r["corpus"] for r in validation)),
                "testCounts": dict(Counter(r["corpus"] for r in test)),
            },
            indent=2,
        )
    )
    if not args.skip_baseline_test:
        evaluate(model, processor, test, "baseline-test", args.batch)
    # Balance the smaller real French corpus without mixing split membership.
    train += [r for r in train if r["corpus"] == "cremma"] * 3
    loader = DataLoader(
        Lines(train, processor, True, args.task_prefixes),
        batch_size=args.batch,
        shuffle=True,
        num_workers=2,
        persistent_workers=True,
        pin_memory=True,
    )
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=args.learning_rate, weight_decay=0.01
    )
    steps = len(loader) * args.epochs
    scheduler = torch.optim.lr_scheduler.LambdaLR(
        optimizer, lambda s: min(1, (s + 1) / 100) * max(0.1, 1 - s / steps)
    )
    best = float("inf")
    step = 0
    started = time.time()
    for epoch in range(args.epochs):
        model.train()
        losses = []
        for pixels, labels in loader:
            optimizer.zero_grad(set_to_none=True)
            labels = labels.to("cuda", non_blocking=True)
            decoder_input_ids = model.prepare_decoder_input_ids_from_labels(
                labels=labels
            )
            with torch.autocast("cuda", dtype=torch.bfloat16):
                logits = model(
                    pixel_values=pixels.to("cuda", non_blocking=True),
                    decoder_input_ids=decoder_input_ids,
                    use_cache=False,
                ).logits
                loss = aligned_loss(logits, labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1)
            optimizer.step()
            scheduler.step()
            step += 1
            losses.append(loss.item())
            if step % 50 == 0:
                print(
                    f"epoch={epoch+1} step={step}/{steps} loss={np.mean(losses[-50:]):.4f} elapsed={time.time()-started:.0f}s",
                    flush=True,
                )
        score = evaluate(
            model, processor, validation, f"validation-{epoch+1}", args.batch
        )
        if score < best:
            best = score
            model.save_pretrained(OUT / "best")
            processor.save_pretrained(OUT / "best")
            (OUT / "best-selection.json").write_text(
                json.dumps(
                    {
                        "epoch": epoch + 1,
                        "validationCER": score,
                        "objective": "aligned-cross-entropy-v1",
                    },
                    indent=2,
                )
            )
        print("epoch", epoch + 1, "validation CER", score, "best", best, flush=True)
    del model
    torch.cuda.empty_cache()
    model = VisionEncoderDecoderModel.from_pretrained(
        OUT / "best", attn_implementation="eager"
    ).to("cuda")
    model.ov_task_prefixes = args.task_prefixes
    evaluate(model, processor, test, "adapted-test", args.batch)


if __name__ == "__main__":
    main()
