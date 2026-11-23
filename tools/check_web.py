"""Validate the published page's local assets and exact archived firmware."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse, unquote
import hashlib
import json
import re
import struct

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"

class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []
        self.ids = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        for key in ["src", "href"]:
            if key in attrs:
                self.paths.append(attrs[key])

page = Assets()
page.feed((WEB / "index.html").read_text())
assert len(page.ids) == len(set(page.ids)), "Duplicate page IDs"
for path in page.paths:
    parsed = urlparse(path)
    if parsed.scheme or parsed.netloc:
        continue
    if parsed.path:
        local = (WEB / unquote(parsed.path)).resolve()
        assert local.is_relative_to(WEB) and local.is_file(), path
    if parsed.fragment:
        assert parsed.fragment in page.ids, path

manifest = json.loads((WEB / "manifest.json").read_text())
assert manifest["version"] == "1.19-pika"
assert manifest["new_install_improv_wait_time"] == 0
build = manifest["builds"][0]
assert build["chipFamily"] == "ESP32-S3"
assert build["parts"][0]["offset"] == 0
firmware = WEB / build["parts"][0]["path"]
assert firmware.read_bytes() == (ROOT / "firmware/tamapoke-1.19-pika-factory.bin").read_bytes()
assert hashlib.sha256(firmware.read_bytes()).hexdigest() == "c3a9322abf99bde35e127f2ff6e3f1a8a55e9d658a664b807df6dc0f39b29e3b"
assert firmware.read_bytes()[0x10000:] == (ROOT / "firmware/tamapoke-1.19-pika-app.bin").read_bytes()

provenance = json.loads((WEB / "assets/screens/provenance.json").read_text())
assert len(provenance["images"]) == 22
for entry in provenance["images"]:
    image = WEB / "assets/screens" / entry["file"]
    assert hashlib.sha256(image.read_bytes()).hexdigest() == entry["sha256"]
app = (WEB / "app.mjs").read_text()
screen_names = re.findall(r'\["([a-z-]+)", "(?:daily|card|games|collection|growth)"', app)
assert len(screen_names) == 22
for name in screen_names:
    assert (WEB / "assets/screens" / (name + ".png")).is_file()

for module in (WEB / "vendor/esp-web-tools-10.4.0").glob("*.js"):
    for dependency in re.findall(r'["\'](\./[^"\']+\.js)["\']', module.read_text()):
        assert (module.parent / dependency).is_file(), (module.name, dependency)
pack_info = json.loads((ROOT / "evidence/full-sprite-pack.json").read_text())
pack = (WEB / "assets/sprites/all-gen1.pak").read_bytes()
assert len(pack) == 41746554 and pack[:4] == b"TPAK"
assert hashlib.sha256(pack).hexdigest() == pack_info["sha256"]
pack_module = (WEB / "sprite-pack.mjs").read_text()
assert pack_info["sha256"] in pack_module
assert str(len(pack)) in pack_module
count = struct.unpack_from("<H", pack, 4)[0]
assert count == len(pack_info["files"]) == 303
offset = 6
index = []
for _ in range(count):
    length = pack[offset]
    offset += 1
    name = pack[offset:offset + length].decode()
    offset += length
    size = struct.unpack_from("<I", pack, offset)[0]
    offset += 4
    index.append((name, size))
expected_names = {"mons/thumbs.bin"} | {
    f"mons/{form}{species:03d}.bin"
    for species in range(1, 152) for form in ["p", "ps"]
}
assert {name for name, _ in index} == expected_names
for (name, size), recorded in zip(index, pack_info["files"]):
    payload = pack[offset:offset + size]
    offset += size
    assert recorded["name"] == name and recorded["bytes"] == size
    assert hashlib.sha256(payload).hexdigest() == recorded["sha256"], name
    if name in {"mons/p025.bin", "mons/ps025.bin", "mons/p026.bin", "mons/ps026.bin"}:
        assert payload == (ROOT / "assets" / name.split("/")[-1]).read_bytes(), name
assert offset == len(pack)
print("Web links, 22 UI images, vendor imports, archived firmware and 303 full-pack assets verified")
