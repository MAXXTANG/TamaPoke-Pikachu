"""Render the unchanged 1.19-pika drawing code with deterministic demo data.

These images are host-rendered UI examples, not photos of physical hardware.
Requires a C++17 compiler and Pillow. It never connects to a serial device.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import shutil

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build/ui-render"
OUT = ROOT / "web/assets/screens"
BUILD.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
source = (ROOT / "TamaPoke/TamaPoke.ino").read_text()
globals_ = source[source.index("bool gCjkFont"):source.index("volatile bool gTouchIrq")]
globals_ += source[source.index("uint32_t lastRender"):source.index("// BOOT controls")]
render = source[source.index("// ---------- render ----------"):]
prototypes = []
for match in re.finditer(r"^(?:static )?(?:const char \*|[\w]+(?:[ *]+\w+)*)\s*\w+\([^;\n]*\)\s*\{", render, re.M):
    signature = match.group(0).rsplit("{", 1)[0].strip()
    prototypes.append(signature + ";")
prefix = '''#include <string>
#include <cmath>
using String = std::string;
#include "Arduino.h"
#include "Preferences.h"
#include "species.h"
#include "dex.h"
#include "pet.h"
#include "sdmon.h"
#include "rtcbat.h"
#include "i18n.h"
#include "audio.h"
#include "blit.h"
#include "power.h"
#include "canvas.h"
#define BOARD_AMOLED_175C 0
#define FW_VERSION "1.19-pika"
#define RGB565_BLACK 0
#define RGB565_WHITE 65535
#define PI 3.14159265358979323846
static const uint8_t u8g2_font_unifont_t_japanese3[] = {0};
static const uint8_t u8g2_font_unifont_t_korean2[] = {0};
HostCanvas hostCanvas;
HostCanvas *gfx = &hostCanvas;
inline void flushUI() { gfx->flush(); }
'''
power_context = source[source.index("PowerCtx powerCtx(uint32_t now)"):source.index("// el usuario ha interactuado")]
translation = prefix + "\n".join(prototypes) + "\n" + globals_ + "\n" + power_context + "\n" + render
translation += "\n" + (ROOT / "tools/ui-render/scenes.cpp").read_text()
(BUILD / "render.cpp").write_text(translation)
sdmon = (ROOT / "TamaPoke/sdmon.cpp").read_text()
parser_body = sdmon[sdmon.index("  uint8_t nActs = blob[4];"):sdmon.index("void PmdMon::unload()")]
unload = sdmon[sdmon.index("void PmdMon::unload()"):sdmon.index("// ---------- miniaturas") if "// ---------- miniaturas" in sdmon else sdmon.index("bool SdThumbs::load()")]
# Keep only the PmdMon unload function, not subsequent filesystem code.
depth = 0
end = 0
for i, char in enumerate(unload):
    if char == "{": depth += 1
    elif char == "}":
        depth -= 1
        if depth == 0:
            end = i + 1
            break
runtime = (ROOT / "tools/ui-render/runtime.cpp").read_text()
runtime += '''\nbool PmdMon::load(uint8_t dexNum, bool shiny) {
  unload(); uint32_t size = 0;
  const uint8_t *raw = embeddedMonData(dexNum, shiny, size);
  if (!raw) return false;
  blob = (uint8_t *)malloc(size); if (!blob) return false;
  memcpy(blob, raw, size);
  const char *path = "embedded";
'''
runtime += parser_body + "\n" + unload[:end] + "\n"
(BUILD / "runtime.cpp").write_text(runtime.replace('"../../TamaPoke/', '"'))
compiler = shutil.which("clang++") or shutil.which("g++")
if not compiler:
    raise SystemExit("A C++17 compiler is required")
command = [compiler, "-std=c++17", "-O1", "-Wno-format", "-I", str(ROOT / "TamaPoke/test/shim"), "-I", str(ROOT / "TamaPoke"), "-I", str(ROOT / "tools/ui-render"),
           str(BUILD / "render.cpp"), str(BUILD / "runtime.cpp"), str(ROOT / "TamaPoke/pet.cpp"), str(ROOT / "TamaPoke/i18n.cpp"), str(ROOT / "TamaPoke/embedded_mon.cpp"), str(ROOT / "TamaPoke/test/shim/shim.cpp"), "-o", str(BUILD / "render")]
subprocess.run(command, check=True)
subprocess.run([str(BUILD / "render"), str(BUILD)], check=True)
images = []
for ppm in sorted(BUILD.glob("*.ppm")):
    target = OUT / (ppm.stem + ".png")
    Image.open(ppm).save(target, optimize=True)
    images.append({"file": target.name, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
provenance = {
    "kind": "host-rendered UI examples; not physical-device photographs",
    "firmware_version": "1.19-pika",
    "drawing_code": "TamaPoke/TamaPoke.ino, render section extracted unchanged",
    "drawing_code_sha256": hashlib.sha256((ROOT / "TamaPoke/TamaPoke.ino").read_bytes()).hexdigest(),
    "fixture": "deterministic demonstration stats, clock, battery and scene flags; no personal saved game",
    "adapter": "tools/ui-render/canvas.h (host RGB565 adapter; English classic bitmap font)",
    "images": images,
}
(OUT / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
print(f"Rendered {len(images)} game screens to {OUT}")
