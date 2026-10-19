# Trained registration model chunks

These Brotli chunks contain the French TrOCR adaptation, supplied under **CC BY
4.0**, with the base Microsoft model retaining its MIT license. See the complete
[notice and attributions](../../licenses/Registration-adaptation-NOTICE.txt) and
[model card](../registration-model-card.md).

`npm run models:fetch` reconstructs and checks the runtime ONNX files using the
manifest in the parent directory. End-user applications contain the reconstructed
weights and exclude these source chunks. No training images or personal samples
are stored here. Regenerate using `scripts/export-registration-model.py` after the
documented training and evaluation steps.
