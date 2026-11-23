#include <string>
using String = std::string;
#include "../../TamaPoke/sdmon.h"
#include "../../TamaPoke/embedded_mon.h"
#include "../../TamaPoke/rtcbat.h"
#include "../../TamaPoke/audio.h"
#include <cstdlib>

bool sdReady = false, sdDirty = false;
SdThumbs thumbs;
bool SdThumbs::load() { return false; }
void SdThumbs::unload() {}
const uint8_t *SdThumbs::get(int16_t) const { return nullptr; }
bool SdMon::load(uint8_t, bool) { return false; }
void SdMon::unload() { loaded = false; if (data) free(data); data = nullptr; }

static uint32_t demoEpoch = 1795432800;
bool rtcBegin() { return true; }
uint32_t rtcEpoch() { return demoEpoch; }
void rtcSetEpoch(uint32_t e) { demoEpoch = e; }
int batPercent() { return 86; }
bool batCharging() { return true; }
bool usbPresent() { return true; }
static uint8_t volume = 0;
void audioSetVolume(uint8_t level) { volume = level; }
uint8_t audioVolume() { return volume; }

// PmdMon parser is generated from sdmon.cpp by render_ui.py; only file I/O is
// replaced by reading the same preserved in-firmware bytes.
