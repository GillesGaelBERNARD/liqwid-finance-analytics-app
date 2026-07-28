import os
import subprocess
from pathlib import Path

def rebuild_data_archive(data_root, archive_name="liqwid-data (21).zip"):
    data_root = Path(data_root).resolve()
    project_root = Path(__file__).resolve().parents[1]
    js_script = project_root / "scripts" / "rebuild_data_archive.js"

    cmd = ["node", str(js_script), str(data_root)]
    print(f"Executing Node data archive builder: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)

if __name__ == "__main__":
    rebuild_data_archive(Path("data/liqwid"))
