"""Package the current Windows build and its source, without private/local models."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
release = root / "release"
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[\w.]+)?", version):
    raise SystemExit("Invalid release version")
stem = f"Open-Volleyball-{version}"
exe = release / f"{stem}-Windows.exe"
if not exe.is_file():
    raise SystemExit("Build the Windows application with npm run package first")
bundle = release / f"{stem}-source.bundle"
if bundle.exists():
    raise SystemExit("Source bundle already exists; do not replace an existing release")
subprocess.run(["git", "bundle", "create", str(bundle), "HEAD"], cwd=root, check=True)
archive = release / f"{stem}-Windows.zip"
with zipfile.ZipFile(archive, "x", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    z.write(exe, exe.name)
    for name in ["README.md", "LICENSE"]:
        z.write(root / name, name)
    for folder in ["docs", "examples", "assets"]:
        for file in sorted((root / folder).rglob("*")):
            if not file.is_file():
                continue
            relative = file.relative_to(root).as_posix()
            if relative.startswith(("assets/models/registration/", "assets/models/registration-fr/")):
                continue
            z.write(file, relative)
artifacts = [exe, archive, bundle]
reader = release / f"{stem}-LecteurAvance-Windows.zip"
if reader.exists():
    artifacts.append(reader)
lines = []
for file in artifacts:
    with file.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    lines.append(f"{digest}  {file.name}")
(release / f"SHA256SUMS-{version}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("\n".join(lines))
