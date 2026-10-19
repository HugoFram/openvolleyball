import unittest
import torch
from registration_training_loss import aligned_loss
from registration_model_policy import require_private_destination
from pathlib import Path


class AlignmentTest(unittest.TestCase):
    def test_personalized_checkpoint_cannot_write_public_assets(self):
        recipe = {"personalizedLocalOnly": True}
        for destination in [None, Path("assets/models"), Path("tmp/../assets/models")]:
            with self.assertRaises(ValueError):
                require_private_destination(recipe, destination)

    def test_personalized_output_stays_in_ignored_workspace(self):
        require_private_destination(
            {"personalizedLocalOnly": True}, Path("tmp/local-model")
        )

    def test_generic_checkpoint_cannot_be_mislabelled_as_personalized(self):
        with self.assertRaises(ValueError):
            require_private_destination({}, Path("tmp/local-model"))

    def test_position_zero_and_eos_are_supervised_without_a_second_shift(self):
        labels = torch.tensor([[0, 3, 2, -100], [0, 4, 2, -100]])
        logits = torch.full((2, 4, 5), -12.0, requires_grad=True)
        with torch.no_grad():
            for b in range(2):
                for s in range(3):
                    logits[b, s, labels[b, s]] = 12
        loss = aligned_loss(logits, labels)
        self.assertLess(loss.item(), 1e-6)
        loss.backward()
        self.assertEqual(logits.grad[:, 3].abs().sum().item(), 0)
        # A causal next-token shift would penalize this perfectly aligned output.
        shifted = torch.nn.functional.cross_entropy(
            logits[:, :2].reshape(-1, 5), labels[:, 1:3].reshape(-1)
        )
        self.assertGreater(shifted.item(), 20)

    def test_empty_target_batch_is_rejected(self):
        with self.assertRaises(ValueError):
            aligned_loss(torch.zeros(1, 2, 5), torch.full((1, 2), -100))

    def test_batch_rows_and_padding_cannot_leak_into_each_other(self):
        labels = torch.tensor([[1, -100], [3, 2]])
        logits = torch.randn(2, 2, 5)
        actual = aligned_loss(logits, labels)
        expected = torch.stack(
            [
                torch.nn.functional.cross_entropy(logits[0, 0:1], labels[0, 0:1]),
                torch.nn.functional.cross_entropy(logits[1, 0:1], labels[1, 0:1]),
                torch.nn.functional.cross_entropy(logits[1, 1:2], labels[1, 1:2]),
            ]
        ).mean()
        torch.testing.assert_close(actual, expected)


if __name__ == "__main__":
    unittest.main()
