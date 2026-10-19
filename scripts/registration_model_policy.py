"""Keep personalized checkpoints out of publicly distributed model assets."""

from pathlib import Path


def require_private_destination(recipe, destination):
    if recipe.get("personalizedLocalOnly"):
        if destination is None or not Path(destination).resolve().is_relative_to(
            Path("tmp").resolve()
        ):
            raise ValueError(
                "Private checkpoints must stay under ignored tmp; never create public chunks"
            )
    elif destination is not None:
        raise ValueError(
            "Private output requires a documented personalized training recipe"
        )
