# Offline registration handwriting reader

Model: Microsoft TrOCR small handwritten, ONNX conversion by Xenova.
Sources: [Microsoft model card](https://huggingface.co/microsoft/trocr-small-handwritten),
[ONNX conversion](https://huggingface.co/Xenova/trocr-small-handwritten),
[Microsoft TrOCR source and MIT license](https://github.com/microsoft/unilm/tree/master/trocr).
The Microsoft MIT license is distributed in `assets/licenses/TrOCR-MIT.txt`.
Transformers.js / Tokenizers.js use Apache-2.0; Jinja uses MIT. Their notices are
included in `assets/licenses/`.

`registration-manifest.json` pins revision `2432e24d184b1d964d07ed04f5d9e21d31a59141`
and SHA-256/byte lengths of every config, tokenizer and quantized ONNX file. The
eight files total about 68 MB. The application bundles them; it never downloads
models or contacts the Hub. Build checks validate all hashes before packaging.
The large upstream files are not stored in Git. Developer setup downloads the
exact pinned assets once with `npm run models:fetch`; subsequent builds are local.

## Runtime and scope

Transformers.js 4.3.1, shared ONNX Runtime Web 1.30.0 CPU WASM, one inference thread,
q8 encoder and merged decoder, deterministic greedy decoding (no sampling),
48 new tokens per name/club/team and 80 per email. Vite maps the library's WebGPU
runtime import to the same stable WASM backend as the digit reader; no GPU or
native ONNX installation is required. A scan-batch worker retains the model
between pages and is terminated when the batch completes or is interrupted.
Remote models, filesystem/browser model caches and cross-origin fetching are
disabled. The app CSP permits only local fetches.

After QR identification, the four anchors of the relevant A4 or half-A4 region
supply the perspective transform. The normalized image contains only that form
at two pixels per PDF point. Text areas are cropped independently of the level
checkboxes. Local contrast, connected ink and pale-rule suppression prevent
empty fields from being passed to a generative reader. Each nonempty field is
transcribed independently. NFC normalization and whitespace trimming preserve
accents/case; spaces inside an already valid-looking email may be removed.
Missing `@`, dots, domains and names are never invented by application rules.

Every proposal is shown beside its image for human review. Invalid email formats
and nonempty handwriting with no transcription get visible warnings. No team is
created without explicit review/save; all original predictions and images remain
separate from corrections. Existing 3–4-player and registration-lock rules apply.
An unreadable QR, missing anchors or unavailable model leaves a manual workflow.

## Limits and evidence

The upstream model was fine-tuned on IAM single-line handwriting. It is not
specialized for French personal/team names, accents, email addresses or clubs.
Language-model errors and omissions are possible, including plausible-looking
ones. Multi-line writing, crossings-out, very small pen strokes, shadows and
cropped anchors reduce quality. Write one clear line per cell and review every
field. No percentage accuracy on real registration handwriting is claimed.

Automated tests use synthetic cursive text (Windows Segoe Print) embedded into
actual blank forms: two separate cut PDF pages, 90/180-degree rotation, JPEG
compression and a half positioned on an off-centre A4 scan bed. They run offline,
exercise the real local model, preserve blank cells, distinguish each half's
checkboxes, correct an email and accented names, and save/reload one independent
team. Another test identifies both forms on an uncut A4 page. These establish
integration behavior, not general handwriting accuracy. Real handwritten forms
from several writers are still needed to evaluate/adapt the reader.
