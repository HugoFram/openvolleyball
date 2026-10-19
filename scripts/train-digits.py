"""Train/adapt the bundled isolated-digit CNN locally.

Developer tool; Python/PyTorch are never required by the distributed application.
Download train-images/labels-idx*-ubyte.gz from the PyTorch MNIST mirror.
Store as mnist-train-images.gz and mnist-train-labels.gz in --data.
Adaptation accepts only explicitly audited, page-grouped local labels.
"""

import argparse
import gzip
import hashlib
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from scipy.ndimage import zoom, shift, center_of_mass

parser = argparse.ArgumentParser()
parser.add_argument("--data", type=Path, default=Path("tmp"))
parser.add_argument("--output", type=Path, default=Path("tmp/digits-mnist.onnx"))
parser.add_argument("--epochs", type=int, default=8)
parser.add_argument(
    "--adapt", type=Path, help="Audited local prepared digits; never published"
)
parser.add_argument(
    "--holdout-group", help="Entire capture group reserved from adaptation"
)
parser.add_argument(
    "--base", type=Path, help="Publicly pretrained checkpoint for adaptation"
)
args = parser.parse_args()
torch.set_num_threads(4)
torch.manual_seed(20261019)
np.random.seed(20261019)
random.seed(20261019)


class Digits(nn.Module):
    def __init__(self):
        super().__init__()
        self.layers = nn.Sequential(
            nn.Conv2d(1, 24, 3, padding=1),
            nn.ReLU(),
            nn.Conv2d(24, 24, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(24, 48, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Flatten(),
            nn.Linear(48 * 7 * 7, 96),
            nn.ReLU(),
            nn.Dropout(0.25),
            nn.Linear(96, 10),
        )

    def forward(self, x):
        return self.layers(x)


def normalize(images):
    out = np.zeros((len(images), 1, 28, 28), np.float32)
    for i, im in enumerate(images):
        ys, xs = np.where(im > 30)
        if not len(xs):
            continue
        crop = (
            im[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1].astype(np.float32)
            / 255
        )
        h, w = crop.shape
        resized = zoom(crop, 20 / max(h, w), order=1)
        hh, ww = resized.shape
        canvas = np.zeros((28, 28), np.float32)
        y, x = (28 - hh) // 2, (28 - ww) // 2
        canvas[y : y + hh, x : x + ww] = resized
        cy, cx = center_of_mass(canvas)
        out[i, 0] = shift(canvas, (13.5 - cy, 13.5 - cx), order=1, mode="constant")
    return torch.from_numpy(out)


for filename, expected in [
    (
        "mnist-train-images.gz",
        "440fcabf73cc546fa21475e81ea370265605f56be210a4024d2ca8f203523609",
    ),
    (
        "mnist-train-labels.gz",
        "3552534a0a558bbed6aed32b30c495cca23d567ec52cac8be1a0730e8010255c",
    ),
]:
    if hashlib.sha256((args.data / filename).read_bytes()).hexdigest() != expected:
        raise ValueError(f"Unexpected public dataset checksum: {filename}")
cache = args.data / "mnist-normalized.pt"
if cache.exists():
    x, y = torch.load(cache, weights_only=True)
else:
    images = np.frombuffer(
        gzip.decompress((args.data / "mnist-train-images.gz").read_bytes()),
        np.uint8,
        offset=16,
    ).reshape(-1, 28, 28)
    labels = np.frombuffer(
        gzip.decompress((args.data / "mnist-train-labels.gz").read_bytes()),
        np.uint8,
        offset=8,
    ).astype(np.int64)
    x, y = normalize(images), torch.from_numpy(labels)
    torch.save((x, y), cache)
permutation = torch.randperm(len(x))
# A public validation set selects the checkpoint. No tournament page is used.
validation_size = 5000
valid = permutation[-validation_size:]
train = permutation[:-validation_size]
model = Digits()
optimizer = torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=0.001)


def augment(batch):
    n = len(batch)
    angle = (torch.rand(n) - 0.5) * 0.45
    shear = (torch.rand(n) - 0.5) * 0.5
    scale = 0.85 + torch.rand(n) * 0.35
    theta = torch.zeros(n, 2, 3)
    theta[:, 0, 0] = angle.cos() * scale
    theta[:, 1, 1] = angle.cos() * scale
    theta[:, 1, 0] = angle.sin() * scale
    theta[:, 0, 1] = -angle.sin() * scale + shear
    theta[:, :, 2] = (torch.rand(n, 2) - 0.5) * 0.12
    batch = F.grid_sample(
        batch,
        F.affine_grid(theta, batch.shape, align_corners=False),
        align_corners=False,
    )
    mode = random.randrange(4)
    if mode == 0:
        batch = batch * 0.7 + F.max_pool2d(batch, 3, stride=1, padding=1) * 0.3
    if mode == 1:
        batch = batch * 0.7 - F.max_pool2d(-batch, 3, stride=1, padding=1) * 0.3
    return batch.clamp(0, 1)


if args.adapt:
    if not args.base or not args.holdout_group:
        raise ValueError(
            "Adaptation requires base checkpoint and a held-out page group"
        )
    data = json.loads(args.adapt.read_text())
    if (
        data.get("format") != "open-volleyball-reviewed-digits"
        or data.get("version") != 1
    ):
        raise ValueError("Unexpected reviewed-digit format")
    if args.holdout_group not in {r["group"] for r in data["digits"]}:
        raise ValueError("The holdout group must exist in the supplied data")
    rows = [r for r in data["digits"] if r["group"] != args.holdout_group]
    rx = torch.tensor([r["pixels"] for r in rows], dtype=torch.float32).reshape(
        -1, 1, 28, 28
    )
    ry = torch.tensor([r["label"] for r in rows], dtype=torch.long)
    model.load_state_dict(torch.load(args.base, weights_only=True))
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.00015, weight_decay=0.01)
    model.train()
    # Fixed adaptation schedule, with equal public rehearsal to preserve other styles.
    # The reserved capture group never chooses steps or weights.
    for step in range(300):
        public = train[torch.randint(len(train), (96,))]
        review = torch.randint(len(rx), (96,))
        bx = torch.cat([x[public], rx[review]])
        by = torch.cat([y[public], ry[review]])
        optimizer.zero_grad()
        loss = F.cross_entropy(model(augment(bx)), by)
        loss.backward()
        optimizer.step()
    model.eval()
    torch.save(model.state_dict(), args.output.with_suffix(".pt"))
    torch.onnx.export(
        model,
        torch.zeros(1, 1, 28, 28),
        str(args.output),
        input_names=["digit"],
        output_names=["logits"],
        opset_version=12,
        dynamo=False,
    )
    args.output.with_suffix(".json").write_text(
        json.dumps(
            {
                "adaptationSteps": 300,
                "developmentGroups": sorted(set(r["group"] for r in rows)),
                "developmentScores": len(set(r["file"] for r in rows)),
                "excludedHoldoutGroup": args.holdout_group,
                "privateImagesPublished": False,
                "seed": 20261019,
                "sha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
            },
            indent=2,
        )
    )
    raise SystemExit(0)

best = 0
history = []
for epoch in range(args.epochs):
    started = time.time()
    model.train()
    order = train[torch.randperm(len(train))]
    for indices in order.split(256):
        optimizer.zero_grad()
        loss = F.cross_entropy(model(augment(x[indices])), y[indices])
        loss.backward()
        optimizer.step()
    model.eval()
    with torch.no_grad():
        correct = sum(
            int((model(x[i]).argmax(1) == y[i]).sum()) for i in valid.split(512)
        )
    record = {
        "epoch": epoch + 1,
        "validationCorrect": correct,
        "validationCount": len(valid),
        "seconds": round(time.time() - started, 1),
    }
    history.append(record)
    print(json.dumps(record), flush=True)
    if correct > best:
        best = correct
        torch.save(model.state_dict(), args.output.with_suffix(".pt"))
        torch.onnx.export(
            model,
            torch.zeros(1, 1, 28, 28),
            str(args.output),
            input_names=["digit"],
            output_names=["logits"],
            opset_version=12,
            dynamo=False,
        )
    if epoch == 4:
        for group in optimizer.param_groups:
            group["lr"] = 0.0003

model.load_state_dict(torch.load(args.output.with_suffix(".pt"), weights_only=True))
model.eval()
torch.onnx.export(
    model,
    torch.zeros(1, 1, 28, 28),
    str(args.output),
    input_names=["digit"],
    output_names=["logits"],
    opset_version=12,
    dynamo=False,
)
report = {
    "seed": 20261019,
    "dataset": "MNIST",
    "trainingSamples": len(train),
    "validationSamples": len(valid),
    "privateTrainingSamples": 0,
    "history": history,
    "sha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
}
args.output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
