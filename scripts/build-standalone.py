#!/usr/bin/env python3
"""Embed the maintainable PM application fragment in the standalone PWA shell."""

from html import escape, unescape
from pathlib import Path
import re
import shutil


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
APP = ROOT / "app" / "pm-command-centre.html"
APP_START = '<div id="pm-command-centre">'


def main() -> None:
    document = INDEX.read_text(encoding="utf-8")
    match = re.search(r'(<iframe\b[^>]*\bsrcdoc=")([\s\S]*?)("[^>]*></iframe>)', document)
    if not match:
        raise SystemExit("Standalone iframe srcdoc was not found.")

    srcdoc = unescape(match.group(2))
    app_start = srcdoc.find(APP_START)
    body_end = srcdoc.rfind("</body>")
    if app_start < 0 or body_end < app_start:
        raise SystemExit("Expected application or document body marker was not found.")

    fragment = APP.read_text(encoding="utf-8").strip()
    if not fragment.startswith(APP_START) or not fragment.endswith("</div>"):
        raise SystemExit("Application fragment must contain one PM command-centre root.")

    # The generated visualization tooltip/icon runtime is unnecessary for this
    # standalone app and has previously emitted an invalid MutationObserver
    # target error. Keep the shell styles, embed the application, and close the
    # document without that external runtime so offline behaviour is deterministic.
    rebuilt_srcdoc = srcdoc[:app_start] + fragment + "\n\n" + srcdoc[body_end:]
    encoded = escape(rebuilt_srcdoc, quote=True)
    rebuilt_document = document[: match.start(2)] + encoded + document[match.end(2) :]
    INDEX.write_text(rebuilt_document, encoding="utf-8")
    dist = ROOT / "dist"
    if dist.exists():
        shutil.rmtree(dist)
    (dist / "server").mkdir(parents=True)
    (dist / "client" / "assets").mkdir(parents=True)
    (dist / "server" / "index.js").write_text(
        "export default { async fetch(request, env) { return env.ASSETS.fetch(request); } };\n",
        encoding="utf-8",
    )
    shutil.copy2(INDEX, dist / "client" / "index.html")
    shutil.copy2(ROOT / "manifest.webmanifest", dist / "client" / "manifest.webmanifest")
    shutil.copy2(ROOT / "service-worker.js", dist / "client" / "service-worker.js")
    for asset in (ROOT / "assets").iterdir():
        if asset.is_file():
            shutil.copy2(asset, dist / "client" / "assets" / asset.name)
    print(f"Embedded {APP.relative_to(ROOT)} into {INDEX.name}")


if __name__ == "__main__":
    main()
