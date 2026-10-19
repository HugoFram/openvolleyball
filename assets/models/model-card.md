# Open Volleyball digit CNN v3

Independent model weights: MIT, as the application. SHA-256 and input/output
contract are in `manifest.json`. The prior MIT MNIST-12 model remains available
as an evaluation baseline; the application uses `digits-v3.onnx`.

## Training

The 243k-parameter CNN has three 3x3 convolution layers (24, 24, 48 channels),
two max-pools, a 96-unit dense layer, dropout 0.25 and ten output logits.
White ink on black; input `[1,1,28,28]`, float32. ONNX opset 12, CPU WASM.

Public pretraining: MNIST's 60,000 training images, with a seeded split of
55,000 training / 5,000 checkpoint validation. Eight epochs, AdamW, batch 256;
seed 20261019. Bounding-box normalization to 20 pixels and mass centering;
random rotation, shear, size, translation and stroke-weight augmentation.
Epoch 7 selected by public validation (4,953 / 5,000). The MNIST test set is
never used for gradients or checkpoint selection.

Dataset: LeCun, Cortes and Burges, *The MNIST database of handwritten digits*.
Original: http://yann.lecun.com/exdb/mnist/ . Public files retrieved from the
[PyTorch mirror](https://ossci-datasets.s3.amazonaws.com/mnist/):

- `train-images-idx3-ubyte.gz`: SHA-256
  `440fcabf73cc546fa21475e81ea370265605f56be210a4024d2ca8f203523609`
- `train-labels-idx1-ubyte.gz`: SHA-256
  `3552534a0a558bbed6aed32b30c495cca23d567ec52cac8be1a0730e8010255c`

Adaptation: 63 audited complete score crops from three source scan groups,
using only isolated digits with unambiguous one-to-one labels. Three prepared
views per digit. Four inconsistent paper/approved-score labels and four blank
crops excluded before training and measurement. An additional crossed-out score
is retained in evaluation and excluded automatically from digit training.
A fourth source scan group (31 usable scores) is excluded from all adaptation
gradients. Fixed 300 AdamW steps, lr 0.00015, weight decay 0.01, equal batches of
96 public and 96 reviewed digit views, same augmentation. There is no adjustment
from volleyball scoring rules and no automatic learning inside the application.

Private crops, per-score labels and participant information are not distributed.
The shipped weights contain learned digit patterns; the training tool and public
pretraining process are reproducible. Reproducing the adapted weights requires
the original private audited inputs. The development sample is small and pages
may share a writer: the reserved page is not a claim of independent-writer accuracy.

## Measurements and limitations

See `docs/reports/digits-alpha3-reviewed-summary.json` and
`docs/reports/digits-alpha3-controlled.json`. On 94 usable scores, alpha.2 gives
79 correct numerical proposals, 1 wrong and 14 uncertain; v3 gives 91 correct,
0 wrong and 3 uncertain. Of these, 63 belong to adaptation pages and must not be
treated as independent validation. The reserved 31-score page improves from
27 correct / 4 uncertain to 29 correct / 2 uncertain, with no numerical errors
observed in either reader. This is a development comparison, not a field accuracy
guarantee. Alternatives and confidence are uncalibrated model outputs.

Only isolated digits are supported. Touching digits, overwriting, unusual styles,
cropping and shadows can cause errors, including confident errors. The application
still requires human review of every scanned result. Text names/emails are manual.

## Developer reproduction

Python 3.12, torch 2.14.1 CPU, numpy 2.3.5, scipy 1.18.1, onnx 1.23.2 were used.
These are development dependencies only, absent from the user installation.
Put the public files in `tmp/` as `mnist-train-images.gz` and
`mnist-train-labels.gz`. From the repository root:

```powershell
python scripts/train-digits.py --output tmp/digits-mnist.onnx
npx tsx scripts/prepare-reviewed-digits.ts <export> <audited-exclusions.json> tmp/reviewed-digits.json
python scripts/train-digits.py --adapt tmp/reviewed-digits.json --holdout-group <reserved-source-hash> --base tmp/digits-mnist.pt --output tmp/digits-adapted.onnx
npx tsx scripts/evaluate-reviewed.ts <export> --exclude <audited-exclusions.json> --model tmp/digits-adapted.onnx
```

Audit the handwritten value independently of the valid tournament result. Never
label a handwritten `24` as `21` merely because the sporting result was corrected.
Keep all views/digits from a source page in the same training or reserved group.
