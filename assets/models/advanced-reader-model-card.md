# Optional offline registration reader — alpha.7

- Model: Qwen3.5 9B, Q4_K_M, upstream Apache-2.0.
- Upstream: `Qwen/Qwen3.5-9B`, revision
  `c202236235762e1c871ad0ccb60c8ee5ba337b9a`.
- Distributed quantization: `unsloth/Qwen3.5-9B-GGUF`, revision
  `3885219b6810b007914f3a7950a8d1b469d598a5`.
- Runtime: llama.cpp `b11669`, Windows x64 Vulkan build, MIT;
  OpenMP license included with its binary.
- Exact downloads, hashes and license files: `advanced-reader-recipe.json`.
- No further training, LoRA, dictionary of team names, email-domain corrections,
  or private sample adaptation. The upstream pretraining corpus is not audited
  here; public benchmark contamination cannot be excluded.
- Runtime input: one raw cropped cell, one pixel removed per edge, 16 white
  pixels of padding. Existing blank detection runs first. Image tokens 1024,
  maximum 1024; greedy decoding, seed 42, maximum 96 output tokens; thinking off.
  Incomplete generations are rejected. No calibrated confidence is claimed.
- Proposals use `local-vlm-v1` provenance and an experimental review notice.
  The model name and integrity hashes remain in the selected pack manifest.
- The 75% exact nonempty-string requirement is **not met**: 45/61 (73.8%) in
  the final application-reader replay. Names 19/24, emails 8/12. Blanks 39/39 are
  reported separately. Four inconsistent or clipped labels were omitted.
- This is exploratory selection on eight previously inspected sheets from one
  capture, with unknown writer identities. It is not a writer-independent test.
  No claim of accuracy on different teams’ handwriting is established.
- Scanning stays experimental. Preserve ordinary handwriting support, require
  review, and do not silently replace unclear strings with plausible values.

The optional pack contains public models and executable libraries only; it does
not contain reviewed crops, corrected names/emails, or the alpha.6 private model.
All recognition occurs on the local machine. See
`docs/REGISTRATION-READERS.md` and the aggregate benchmark report.
