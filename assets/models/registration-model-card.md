# Offline registration handwriting reader — alpha.5

The reader is Microsoft TrOCR-small, further trained for this application using
public handwriting and short synthetic registration fields. Inference remains
entirely local, on CPU; the application never downloads a model or sends scans to
a service. Original alpha.4 suggestions retain `trocr-v1`; new suggestions use
`trocr-fr-v2`. Accepted scans are never automatically re-read after an upgrade.

## Training data and rights

Base: [Microsoft TrOCR small handwritten](https://huggingface.co/microsoft/trocr-small-handwritten),
revision `b4648cfa171985a6745f37ddd637e98c0da958ac`, MIT. The starting weights were
already trained on IAM; this adaptation does not separately download/use IAM.

Additional unique training examples:

- **6,955 real handwritten English words**, selected from GNHK's training
  documents. [GoodNotes GNHK](https://github.com/GoodNotes/GNHK-dataset), Alex W. C.
  Lee, Jonathan Chung and Marco Lee, CC BY 4.0. Archive mirror revision
  `eaa67d396fd29b8b04e38d630da79f67db11b212`; SHA-256
  `5f4b470030b41cd80e32d3a5ae7bc8bc41acc79b4bf770a451e7ec54ca3be34d`.
  Up to 16 words per training document; handwritten regions only, unreadable
  markup excluded, EXIF orientation applied before polygon cropping/masking.
- **1,436 real handwritten French lines** from
  [CREMMA-Wikipedia](https://github.com/HTR-United/cremma-wikipedia), revision
  `5cd61fb74a976e23fa23df5811fc05c4424199ce`, CC BY 4.0. See the supplied complete
  citation and contributor list in `assets/licenses/CREMMA-Wikipedia-CITATION.cff`.
  Lines are cropped from ALTO annotations; editorial deletion/unreadability markup
  is excluded. This smaller French corpus is repeated four times during training.
- **2,400 synthetic short fields**: accented names, teams/clubs and email-like
  strings, rendered with five locally installed cursive/handwriting fonts and mild
  scan variations. These are supplementary training data, not real handwriting
  evidence. Font files and training images are not redistributed.

GNHK's official test documents remain untouched by training. Validation documents
are selected from the remaining documents by a deterministic hash. CREMMA uses
whole-document hash buckets: 80% training, 10% validation, 10% test. Individual
writer identities are unavailable; document separation is not a claim of proven
writer separation. A fixed 192-example validation subset selects the checkpoint;
the 1,283-example public test set is never used for checkpoint selection.

RIMES was investigated but excluded from the shipped adaptation because its
original publisher's CC BY-NC license conflicts with a mirror's MIT tag. No
RIMES-adapted checkpoint is shipped. No private tournament or reviewed registration
samples are used in this version. Score recognition weights are unchanged.

The base retains its MIT license. The new trained adaptation is supplied under
CC BY 4.0, separately from the MIT application code. Attribution, source URLs,
changes and full license texts are in `assets/licenses/Registration-adaptation-NOTICE.txt`,
`GNHK-CC-BY-4.0.txt` and `CREMMA-Wikipedia-CC-BY-4.0.txt`.

## Preparation, training and runtime

Public training/evaluation images use the application's foreground contrast,
connected-component filtering, cropping and padding. The Python counterpart is
`scripts/registration_preprocessing.py`; twelve varied public crops were checked
pixel for pixel against the actual TypeScript `textCrop` implementation.

Training uses seed 20261019, four epochs, batch 16, AdamW at 2e-5 with weight decay
0.01, gradient clipping 1, a 100-step warmup and linear decay, mild padding/rotation/
blur/contrast augmentation, and 96 label tokens. GPU bf16 is a development-only
acceleration; the saved master weights are float32. Lowest validation character
error selects the checkpoint. Scripts, pinned dependencies and public dataset
revisions allow the experiment to be repeated; GPU numerical differences can
prevent bit-identical retraining, so shipped weights have explicit checksums.

Training explicitly shifts decoder inputs once and computes aligned cross-entropy
over non-padding labels. This avoids the double target shift in the pinned
library's inferred causal objective ([upstream issue #40111](https://github.com/huggingface/transformers/issues/40111)).
Three regression tests cover target position zero, EOS, ignored padding and batch
row isolation. The exploratory run affected by that bug was discarded; the
shipped adaptation starts again from the original Microsoft checkpoint.

The selected model is exported to ONNX with cached merged decoding and dynamic
q8 quantization, including Gather and MatMul operations inside decoder subgraphs.
`registration-manifest.json` pins every runtime file and each compressed weight
chunk. `npm run models:fetch` reconstructs the adapted weights from tracked Brotli
chunks with Node, and downloads only unchanged pinned tokenizer/config assets.
Build checks verify every resulting hash. Source chunks are excluded from the
Windows application; only one copy of the runtime weights is bundled.

Transformers.js 4.3.1 uses shared ONNX Runtime Web 1.30.0 CPU WASM, one thread,
greedy deterministic decoding, 48 new tokens for names/teams/clubs and 80 for
emails. No GPU, Python, native ONNX dependency, remote model, shared browser cache
or pre-existing download is required by end users. The batch worker retains the
model until completion/cancellation. Empty cells bypass text generation. Levels
are read independently as checkboxes.

NFC and whitespace cleanup preserve accents and case; spaces inside an otherwise
valid-looking email can be removed. The application never fills in a missing @,
name, domain or dot using a dictionary. Generative model errors remain possible.
Every field requires explicit human review before creating/updating a team.

## Evaluation and limits

[Quantized CPU comparison](../../docs/reports/registration-alpha5-benchmark.json)
compares the previous shipped model with the adapted model on the same fixed,
held-out public samples, with identical preparation and 48-token greedy decoding.
The report distinguishes character error rate, exact strings and accented French
strings. These are public handwriting benchmark measurements, not an accuracy
guarantee for real registration forms. Character accuracy must not be confused
with the probability that an entire name or email is correct.

On 128 fixed held-out French lines, q8 CPU character error falls from **52.5% to
17.9%**. On the 102 accented French lines in that sample it falls from **54.0% to
18.9%**. On 128 held-out English words, exact strings rise from **40/128 to 74/128**
(31.3% to 57.8%), and character error falls from 54.3% to 21.7%. These sets are
harder/different from registration names; do not treat their percentages as field
accuracy. Case, punctuation and accents are counted; no dictionary fixes labels.

Float32-to-ONNX feature validation reported a maximum intermediate difference of
0.00224 against a 0.001 tolerance; it did not abort export. The subsequent q8
comparison above measures actual generated text from the shipped bytes, rather
than assuming numerical conversion preserves recognition. Real CPU WASM inference
also passes the offline desktop tests. CPU quantization/runtime differences mean
the GPU development and shipped-runtime reports should be read separately.

The full 1,283-example development evaluation and checkpoint-selection history are
summarized in `docs/reports/registration-alpha5-training.json`. Test documents were
not trained on. Complete predictions remain in ignored local training outputs;
only aggregate metrics and provenance are published.

Proper names, mixed languages, emails, very small writing, crossings-out and
multi-line cells remain difficult. The current user reports more than half of
registration strings having a mistake with alpha.4. No revised real-form error
rate is claimed before receiving and evaluating reviewed exports from several
writers. The new export preserves raw field images, accepted text, initial model
suggestions and source/sheet groups; blanks are retained and checkbox fields are
excluded. It does not upload data or automatically train a model.

Integration tests run the actual bundled reader offline on synthetic cursive
entries printed into rotated PDF/JPEG half-forms, preserve blank rows, read levels,
review accented corrections, create a team and export its accepted snapshots.
They verify lower-half crop pixels, later roster edits, cancellation and unchanged
original files. Synthetic font tests establish integration, not handwriting
accuracy.

## Repeat the training experiment (maintainers only)

Use a separate Python 3.12 environment. Install torch 2.14.1 / torchvision 0.29.1
from the matching CPU/CUDA index, then:

```powershell
python -m pip install -r scripts/requirements-registration-training.txt
python scripts/prepare-registration-data.py
python scripts/registration_preprocessing.py
python scripts/test-registration-training.py
python scripts/train-registration.py --epochs 4 --batch 16
python scripts/export-registration-model.py
python scripts/evaluate-registration-onnx.py --count 128
npm run models:fetch
npm run build
npm test
npm run test:ui
```

Training expects CUDA. End-user inference uses CPU only. Dataset preparation never
reads user tournaments. The ONNX comparison also needs the previous q8 encoder and
decoder copied to `tmp/baseline-registration/` before replacing them; their pinned
upstream revision and hashes are available in the alpha.4 Git manifest. Training
images/checkpoints stay under ignored `tmp/`; do not add reviewed personal samples
to Git. Before any future adaptation, inspect image/text agreement and separate
writers where known, as well as source documents, between training and evaluation.
