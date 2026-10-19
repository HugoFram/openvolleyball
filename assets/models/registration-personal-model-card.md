# Local personalized registration reader — alpha.6

This is an optional local build of the existing TrOCR-small reader. The Windows
bundle prepared for the supplied registrations includes this adaptation. Public
source builds retain the generic alpha.5 weights. Neither private images,
corrected strings nor personalized weights are published in GitHub/source bundles.
The application always performs CPU WASM inference offline, without Python,
training, remote downloads or uploading scans.

## What changed

The decoder receives the known field type as a forced prefix: `email:` for email
cells, `text:` for names, clubs and teams. The prefix is removed before showing
the suggestion. It supplies task context without a dictionary or a guessed
address. Missing punctuation/domains are never inserted by application rules.
The generative model can still substitute characters and needs review.

Empty-field preparation also rejects isolated speckles and dark printed borders
at crop edges. The Python/app preparation matches pixel for pixel on all 104
supplied field crops. New printed forms give email cells 210 rather than 180 PDF
points; saved forms retain their own original geometry.

## Local adaptation and measurement

Starting weights are the generic French model, SHA-256
`9286ddb2c0dcce8e07d2bb3d751203d6982b1ef4bb7fbc636ef25c0c2a76f3b2`
for its float checkpoint. Existing public data/license provenance is in the
[generic model card](registration-model-card.md).

The transfer experiment used **39 nonempty fields from the first six sheets**;
three visibly inconsistent labels were excluded. Each field was repeated 60 times
per epoch with scan augmentation. Rehearsal uses 800 GNHK words, 600 French CREMMA
lines (four presentations), 1,000 original synthetic fields and 3,000 additional
short fields from the public-only generator. Seed 20261019; four epochs, batch 16,
AdamW 2e-5, aligned cross-entropy, bf16 development acceleration. A fixed public
432-example validation set selected epoch four; private reserved labels were not
used for training or checkpoint selection.

The **last two sheets** contain 23 nonempty fields and three blank fields. Their
actual offline JavaScript/WASM replay gives:

| Reserved fields | Recorded alpha.5 suggestions | Personalized six-sheet model |
| --- | ---: | ---: |
| Entire strings exact | 7/23 | 12/23 |
| Player names exact | 2/7 | 3/7 |
| Emails exact | 1/7 | 3/7 |
| Clubs exact | 4/7 | 6/7 |
| Email character errors | 32/130 | 8/130 |
| Blank cells preserved | 3/3 | 3/3 |

See the [aggregate transfer report](../../docs/reports/registration-alpha6-transfer.json).
This is a limited improvement; names and entire addresses remain difficult.
All eight sheets came from **one capture**, with unknown writer identities. They
were inspected during development, so this is not a pristine external test or a
claim of independent-writer accuracy. Case, accents, punctuation, discrepancies in
corrected labels and a clipped address ending count as errors. Exported crop
edges can differ by one pixel from the original page-based crop.

After recording that comparison, the final local model is continued on **61
usable fields from all eight sheets**, with the same three exclusions plus the
clipped email. It continues from the six-sheet checkpoint at 1e-5 for two epochs,
with the same rehearsal and public validation selection. Any rereading of that
complete batch is **training fit**, not evidence of accuracy on new handwriting.
The six-sheet checkpoint and its reserved predictions remain locally preserved.

Public long-line/word checks are also retained locally. The six-sheet model has
GPU character errors of 16.7% on 251 French lines and 25.0% on 1,032 English words,
versus 15.3%/21.6% for the generic model. This specialization does not establish a
universal OCR improvement, which is why the public default model is retained.

The final selected float checkpoint is
`b1b760d9ec71f2fcc95a36373c1fe202d56bd9a42f3802f0f7532411b40f489d`.
Replaying its training batch through actual offline WASM gives 8/8 team names,
24/26 player names, 12/14 emails, 17/17 clubs and 39/39 blanks. All 61 usable
training fields match; the four excluded cases do not. This is **training fit**,
not a new-handwriting success rate. The [fit/provenance report](../../docs/reports/registration-alpha6-fit.json)
keeps this separate from the reserved-sheet comparison. Final public GPU checks
are 16.5% French-line and 24.5% English-word character errors.

The ONNX exporter warned about an intermediate feature difference of 0.00127
against a 0.001 tolerance. Actual quantized CPU and WASM output are measured
separately, rather than assuming conversion preserves recognition.

## Privacy and rebuilding

Personalized weights can memorize private training text. They stay under ignored
`tmp/`, and only the local executable contains them. Do not publish this personal
binary as the public release. Source control and public reports contain recipes,
hashes and aggregate counts only. The public generic model retains its existing
MIT/CC BY attribution; its notice is included in personalized builds too.

The export tool rejects private checkpoints unless their destination is inside
ignored `tmp/`. It never creates public Brotli chunks for private weights. Six
training/policy regression tests cover target alignment, padding and these guards.

Maintainers can prepare public rehearsal with `prepare-registration-data.py`,
`registration_preprocessing.py` and `prepare-registration-fields.py`, then use
`prepare-personal-registration.py --export EXPORT --output tmp/LOCAL` with audited
`--exclude` filenames. Reserve complete sheets before any final `--all-reviewed`
fit. Train with `--personalized --task-prefixes` and export using
`export-registration-model.py --experiment tmp/LOCAL/training --reader trocr-fr-v3
--private-output tmp/LOCAL/runtime`.

For a local personalized build set `OV_REGISTRATION_MODEL_MANIFEST` to the absolute
path of that private `registration-manifest.json`, then run the normal build or
package command. Each file is verified against its hash. The selected manifest
and a non-sensitive reader configuration are bundled under
`dist/assets/models/registration/`; no raw training data is included. Without the
environment variable the normal public build uses the generic model. End users
only launch the supplied executable.
