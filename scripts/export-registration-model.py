"""Export the selected public-data checkpoint for offline WASM inference.

Source control contains compressed chunks, not Python or CUDA dependencies.
The normal Node model-preparation script reconstructs and checks these weights.
"""

import brotli
import argparse
import hashlib
import json
import shutil
from pathlib import Path
import torch

from optimum.exporters.onnx import main_export
from onnxruntime.quantization import quantize_dynamic, QuantType
from registration_model_policy import require_private_destination

parser = argparse.ArgumentParser()
parser.add_argument(
    "--experiment", type=Path, default=Path("tmp/registration-training")
)
parser.add_argument("--reader", default="trocr-fr-v2")
parser.add_argument(
    "--private-output",
    type=Path,
    help="Local-only output under ignored tmp; never creates public chunks",
)
args = parser.parse_args()
root = args.experiment
recipe = json.loads((root / "recipe.json").read_text())
require_private_destination(recipe, args.private_output)
assert (
    recipe.get("objective") == "aligned-cross-entropy-v1"
), "Refusing a checkpoint trained with the wrong target alignment"
assert (
    root / "adapted-test.json"
).exists(), (
    "Complete checkpoint selection and held-out evaluation before publishing weights"
)
torch.set_num_threads(6)
output = root / "onnx"
main_export(
    str(root / "best"),
    output=str(output),
    task="image-to-text-with-past",
    opset=17,
    do_validation=True,
    atol=1e-3,
    device="cpu",
)
target = Path("assets/models/registration/trocr-small-handwritten")
chunks_dir = Path("assets/models/registration-fr")
chunks_dir.mkdir(exist_ok=True)
manifest = json.loads(Path("assets/models/registration-manifest.json").read_text())
if args.private_output:
    target = args.private_output / "files"
    target.mkdir(parents=True, exist_ok=True)
    for entry in manifest["files"]:
        if not entry["file"].endswith(".onnx"):
            dest = target / entry["file"]
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(
                Path("assets/models") / manifest["directory"] / entry["file"], dest
            )
    (target / "onnx").mkdir(exist_ok=True)
for model in ["encoder_model", "decoder_model_merged"]:
    destination = target / "onnx" / f"{model}_quantized.onnx"
    quantize_dynamic(
        str(output / f"{model}.onnx"),
        str(destination),
        per_channel=True,
        reduce_range=True,
        weight_type=QuantType.QInt8,
        op_types_to_quantize=["MatMul", "Gather"],
        extra_options={"EnableSubgraph": True, "MatMulConstBOnly": True},
    )
    data = destination.read_bytes()
    if args.private_output:
        entry = next(
            f for f in manifest["files"] if f["file"] == f"onnx/{model}_quantized.onnx"
        )
        entry.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        entry.pop("chunks", None)
        entry.pop("compression", None)
        continue
    compressed = brotli.compress(data, quality=6)
    chunks = []
    for i, start in enumerate(range(0, len(compressed), 1024 * 1024)):
        name = f"{model}-{i:03}.brpart"
        content = compressed[start : start + 1024 * 1024]
        (chunks_dir / name).write_bytes(content)
        chunks.append(
            {
                "file": f"registration-fr/{name}",
                "sha256": hashlib.sha256(content).hexdigest(),
                "bytes": len(content),
            }
        )
    entry = next(
        f for f in manifest["files"] if f["file"] == f"onnx/{model}_quantized.onnx"
    )
    entry.update(
        bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        chunks=chunks,
        compression="brotli",
    )
    print(model, len(data), len(compressed), flush=True)
manifest["name"] = "Open Volleyball French TrOCR-small (public-data adaptation, q8)"
manifest["adaptation"] = {
    "recipe": "scripts/train-registration.py",
    "baseRevision": "b4648cfa171985a6745f37ddd637e98c0da958ac",
    "corpora": ["GNHK", "CREMMA-Wikipedia", "synthetic short fields"],
    "reader": args.reader,
    "objective": "aligned-cross-entropy-v1",
    "checkpointSha256": hashlib.sha256(
        (root / "best/model.safetensors").read_bytes()
    ).hexdigest(),
    "initialCheckpointSha256": recipe.get("initialCheckpointSha256"),
    "privateSamplesUsedForTraining": recipe.get("privateSamplesRead", 0),
    "personalizedLocalOnly": recipe.get("personalizedLocalOnly", False),
    "taskPrefixes": recipe.get("taskPrefixes", False),
}
if "fields" in recipe.get("trainCounts", {}):
    manifest["adaptation"][
        "shortFieldRecipe"
    ] = "scripts/prepare-registration-fields.py"
    manifest["adaptation"]["additionalShortFields"] = recipe["trainCounts"]["fields"]
destination_manifest = (
    args.private_output / "registration-manifest.json"
    if args.private_output
    else Path("assets/models/registration-manifest.json")
)
destination_manifest.write_text(json.dumps(manifest, indent=2) + "\n")
if args.private_output:
    print(
        "Private model exported locally; no public manifest/chunks modified", flush=True
    )
    raise SystemExit(0)
used = {
    Path(chunk["file"]).name
    for entry in manifest["files"]
    for chunk in entry.get("chunks", [])
}
for file in chunks_dir.glob("*.brpart"):
    if file.name not in used:
        file.unlink()
