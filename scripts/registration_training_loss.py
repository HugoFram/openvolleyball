"""Aligned encoder-decoder objective; never shift the target a second time.

transformers 4.55.4's inferred causal loss double-shifts VisionEncoderDecoder
targets (upstream #40111). The decoder inputs are explicitly shifted once; each
output position is compared with the label at that same position.
"""

import torch
from torch.nn import functional as F


def aligned_loss(logits, labels):
    labels = labels.reshape(-1)
    valid = labels != -100
    if not valid.any():
        raise ValueError("No target tokens in this batch")
    # Upcast only supervised positions, avoiding padded vocabulary-size copies.
    selected = logits.reshape(-1, logits.shape[-1])[valid].float()
    return F.cross_entropy(selected, labels[valid])
