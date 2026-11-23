# Third-party notices

- **TamaPoke source:** Copyright (c) 2026 Quique Tortosa. MIT; retain the full [LICENSE](LICENSE). This snapshot derives from [socquique/TamaPoke at 00136942f42c651ceb75fbfef8499a2df945cde7](https://github.com/socquique/TamaPoke/tree/00136942f42c651ceb75fbfef8499a2df945cde7).
- **Sprite artwork:** PMD SpriteCollab community, as packaged by TamaPoke's official `sprites.pak`. The embedded species are Pikachu (#25) and Raichu (#26), normal and shiny forms. The upstream project identifies these assets as CC BY-NC 4.0; retain attribution and use for personal, non-commercial purposes. Artist attribution is available in [SpriteCollab's tracker](https://github.com/PMDCollab/SpriteCollab/blob/master/tracker.json).
- **Characters and names:** Pokémon © Nintendo / Game Freak / The Pokémon Company. This archive is not affiliated with or endorsed by those companies.
- **Original boot prefix:** The factory image uses the first 64 KiB of the original TamaPoke v1.19 installer image. Its source URL and SHA-256 are retained in `firmware/manifest.json`.
- **Dependencies:** Arduino-ESP32 / Espressif, Arduino_GFX / moononournation, SensorLib and XPowersLib / Lewis He, U8g2 / olikraus. Dependencies retain their own licenses and are installed separately.

The MIT license for the source code does not relicense the embedded sprite artwork. Full original project credits are preserved in [docs/UPSTREAM_CREDITS.md](docs/UPSTREAM_CREDITS.md).

## Browser installer and UI documentation

- ESP Web Tools **10.4.0**, Apache-2.0, from the official npm package. The bundled browser files and full license are preserved in `web/vendor/esp-web-tools-10.4.0/`; original dependency notices within those bundles are retained. Source: https://github.com/esphome/esp-web-tools.
- The host UI renderer uses the Adafruit GFX classic 5×7 bitmap font, BSD licensed. The original file header and full license are retained in `tools/ui-render/glcdfont.h` and `FONT-LICENSE.txt`. The English UI uses this classic glyph set; CJK font rendering is not emulated.
- Game interface illustrations are produced from the unchanged render section of this fork's firmware with deterministic demonstration inputs. They are not photographs or captures from a connected ESP32. Image provenance is recorded in `web/assets/screens/provenance.json`.
