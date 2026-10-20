import argparse, base64, hashlib, io, json, os, subprocess, sys, time, urllib.request, unicodedata
from pathlib import Path

# Development tool only. No fine-tuning, remote inference, or public prediction output.
sys.path.insert(0, "scripts")
from registration_preprocessing import handwriting_crop
from PIL import Image, ImageOps

parser = argparse.ArgumentParser(
    description="Evaluate untrained offline readers; private images and predictions stay under ignored tmp."
)
parser.add_argument("reader", choices=["qwen4", "qwen8", "qwen35", "lighton"])
parser.add_argument("--export", required=True, type=Path)
parser.add_argument("--models-root", required=True, type=Path)
parser.add_argument("--output", required=True, type=Path)
parser.add_argument("--python-deps", type=Path)
parser.add_argument("--exclude", action="append", default=[])
parser.add_argument("--min-tokens", default=256, type=int, choices=[256, 1024])
parser.add_argument("--clean", action="store_true")
args = parser.parse_args()
experiment = (
    args.reader
    + ("-hires" if args.min_tokens == 1024 else "")
    + ("-clean" if args.clean else "")
)
root = args.models_root.resolve()
output = args.output.resolve()
if not output.is_relative_to(Path("tmp").resolve()):
    raise ValueError("Detailed predictions must remain under ignored tmp")
output.mkdir(parents=True, exist_ok=True)
folder = args.export.resolve()
rows = json.loads((folder / "inscriptions.json").read_text(encoding="utf8"))["samples"]
excluded = set(args.exclude)


def clean(s, email=False):
    s = " ".join(unicodedata.normalize("NFC", s).strip().split())
    if email:
        s = "".join(s.split())
    return s


server = None
try:
    if args.reader.startswith("qwen"):
        variant = "8B" if args.reader == "qwen8" else "4B"
        model = root / args.reader
        log = (output / f"{experiment}-server.log").open("w", encoding="utf8")
        language = (
            "Qwen3.5-9B-Q4_K_M.gguf"
            if args.reader == "qwen35"
            else f"Qwen3VL-{variant}-Instruct-Q4_K_M.gguf"
        )
        vision = (
            "mmproj-F16.gguf"
            if args.reader == "qwen35"
            else f"mmproj-Qwen3VL-{variant}-Instruct-F16.gguf"
        )
        server = subprocess.Popen(
            [
                str(root / "llama/llama-server.exe"),
                "-m",
                str(model / language),
                "--mmproj",
                str(model / vision),
                "--host",
                "127.0.0.1",
                "--port",
                "18763",
                "--api-key",
                "local-evaluation-only",
                "--offline",
                "--no-webui",
                "--log-disable",
                "-c",
                "4096",
                "-ngl",
                "99",
                "--parallel",
                "1",
                "-t",
                "6",
                "--image-min-tokens",
                str(args.min_tokens),
                "--image-max-tokens",
                "1024",
                "--no-context-shift",
            ],
            stdout=log,
            stderr=log,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        for _ in range(180):
            if server.poll() is not None:
                raise RuntimeError("Server stopped; inspect local log")
            try:
                if (
                    urllib.request.urlopen(
                        "http://127.0.0.1:18763/health", timeout=2
                    ).status
                    == 200
                ):
                    break
            except Exception:
                time.sleep(1)
        else:
            raise RuntimeError("Server startup timed out")

        def infer(im, kind):
            out = io.BytesIO()
            im.save(out, format="PNG")
            content = [
                {
                    "type": "text",
                    "text": (
                        "Read this single handwritten "
                        + (
                            "email address"
                            if kind == "email"
                            else "French name or short text"
                        )
                        + ". Output ONLY its exact transcription. Preserve accents, spelling, punctuation and digits. Do not correct, translate, expand or explain. Ignore printed lines. If illegible, output ?. Do not invent missing characters."
                    ),
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "data:image/png;base64,"
                        + base64.b64encode(out.getvalue()).decode()
                    },
                },
            ]
            body = {
                "messages": [{"role": "user", "content": content}],
                "temperature": 0,
                "seed": 42,
                "max_tokens": 96,
                "cache_prompt": False,
                "chat_template_kwargs": {"enable_thinking": False},
            }
            req = urllib.request.Request(
                "http://127.0.0.1:18763/v1/chat/completions",
                data=json.dumps(body).encode(),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": "Bearer local-evaluation-only",
                },
            )
            response = json.load(urllib.request.urlopen(req, timeout=120))
            return response["choices"][0]["message"]["content"]

    else:
        if args.python_deps:
            sys.path.insert(0, str(args.python_deps.resolve()))
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        import torch
        from transformers import LightOnOcrForConditionalGeneration, LightOnOcrProcessor

        torch.set_num_threads(6)
        model = (
            LightOnOcrForConditionalGeneration.from_pretrained(
                root / "lighton", torch_dtype=torch.bfloat16, local_files_only=True
            )
            .to("cuda")
            .eval()
        )
        processor = LightOnOcrProcessor.from_pretrained(
            root / "lighton", local_files_only=True
        )

        def infer(im, kind):
            messages = [{"role": "user", "content": [{"type": "image", "image": im}]}]
            inputs = processor.apply_chat_template(
                messages,
                add_generation_prompt=True,
                tokenize=True,
                return_dict=True,
                return_tensors="pt",
            )
            inputs = {
                k: (
                    v.to(device="cuda", dtype=torch.bfloat16)
                    if v.is_floating_point()
                    else v.to("cuda")
                )
                for k, v in inputs.items()
            }
            with torch.inference_mode():
                out = model.generate(**inputs, max_new_tokens=96, do_sample=False)
            return processor.decode(
                out[0, inputs["input_ids"].shape[1] :], skip_special_tokens=True
            )

    results = []
    start = time.monotonic()
    for i, row in enumerate(rows):
        file = (folder / row["file"]).resolve()
        if (
            not file.is_relative_to(folder)
            or hashlib.file_digest(file.open("rb"), "sha256").hexdigest()
            != row["imageSha256"]
        ):
            raise ValueError("Input integrity check failed")
        im = Image.open(file).convert("RGB")
        blank = handwriting_crop(im) is None
        t = time.monotonic()
        if blank:
            text = ""
        else:
            im = (
                handwriting_crop(im)
                if args.clean
                else ImageOps.expand(
                    im.crop((1, 1, im.width - 1, im.height - 1)),
                    border=16,
                    fill="white",
                )
            )
            text = infer(im, row["kind"])
        results.append(
            {
                **row,
                "prediction": clean(text, row["kind"] == "email"),
                "rawPrediction": text,
                "seconds": time.monotonic() - t,
                "excluded": row["file"] in excluded,
            }
        )
        (output / f"{experiment}-private-predictions.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2), encoding="utf8"
        )
        if (i + 1) % 13 == 0:
            print(
                args.reader,
                i + 1,
                "fields",
                round(time.monotonic() - start, 1),
                "seconds",
                flush=True,
            )
    summary = {
        "reader": experiment,
        "trainingOnProvidedSamples": False,
        "excludedMismatchedOrClippedLabels": len(excluded),
        "nonempty": {},
        "blank": {},
        "seconds": time.monotonic() - start,
    }
    for kind in ["team", "name", "email", "club", "all"]:
        subset = [
            r
            for r in results
            if r["text"] and not r["excluded"] and (kind == "all" or r["kind"] == kind)
        ]
        summary["nonempty"][kind] = {
            "correct": sum(
                clean(r["text"], r["kind"] == "email") == r["prediction"]
                for r in subset
            ),
            "total": len(subset),
        }
    blank = [r for r in results if not r["text"]]
    summary["blank"] = {
        "correct": sum(not r["prediction"] for r in blank),
        "total": len(blank),
    }
    (output / f"{experiment}-summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary), flush=True)
finally:
    if server:
        server.terminate()
        server.wait(timeout=15)
