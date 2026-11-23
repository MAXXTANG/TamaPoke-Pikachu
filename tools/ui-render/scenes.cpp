void resetScene() {
  pmd.unload(); galleryPmd.unload(); evoPmd.unload();
  mockNvsReset(); mockSetMillis(2000); randomSeed(20261123);
  pet = Pet(); pet.begin(); pet.selectSpecies(25);
  pet.ageMinutes = 135; pet.streak = 3; pet.bestStreak = 3; pet.bond = 24;
  pet.weight = 12; pet.lastSeenEpoch = 13 * 3600 + 20 * 60;
  pet.fullness = 82; pet.joy = 91; pet.energy = 76; pet.hygiene = 88;
  pmd.load(25);
  galleryOpen = gameOpen = sackOpen = kbOpen = clockOpen = cardOpen = false;
  galleryDetail = 0; galleryPage = 0; cardPage = 0; galleryDirty = true;
  confirmUntil = feedMenuUntil = bathUntil = choiceUntil = 0; choiceKind = 0;
  bathPending = false; userDim = 0; gLang = LANG_EN;
  beh.mode = 0; beh.act = PMD_IDLE; beh.t0 = 0; beh.until = millis() + 10000; beh.x = beh.targetX = 233;
  gNight = false; screenKeyValid = false; applyLangFont();
  gfx->fillScreen(0);
}

int main(int argc, char **argv) {
  if (argc != 2) return 2;
  const char *names[] = {"home", "feeding", "eating", "sleep", "bath", "profile", "stats", "medals", "progress", "training", "minigame", "game-results", "pokedex", "pokedex-detail", "settings", "rename", "starter", "egg", "evolution", "farewell", "release", "runaway"};
  for (const char *name : names) {
    resetScene(); std::string scene(name);
    if (scene == "feeding") feedMenuUntil = millis() + 6000;
    if (scene == "eating") pet.feedBerry(1);
    if (scene == "sleep") pet.sleeping = true;
    if (scene == "bath") { pet.poops = 2; startBath(); mockAdvanceMillis(600); }
    if (scene == "profile" || scene == "stats" || scene == "medals" || scene == "progress") {
      cardOpen = true; cardPage = scene == "profile" ? 0 : scene == "stats" ? 1 : scene == "medals" ? 2 : 3;
      if (scene == "medals") pet.medals = MED_LV10 | MED_BERRY;
    }
    if (scene == "training") { startSack(); sackHits = 18; mockAdvanceMillis(2200); sackShake = 4; }
    if (scene == "minigame" || scene == "game-results") {
      startGame(); gameScore = 8; gameMisses = 1; ballX = 274; ballY = 190; gamePetX = 250;
      if (scene == "game-results") { gameMisses = 3; gameOverUntil = millis() + 4000; gameNewHi = true; }
    }
    if (scene == "pokedex" || scene == "pokedex-detail") {
      galleryOpen = true; galleryPage = 1;
      if (scene == "pokedex-detail") { galleryDetail = 25; galleryPmd.load(25); }
    }
    if (scene == "settings") openClock();
    if (scene == "rename") { openKeyboard(); strcpy(nameBuf, "SPARK"); nameLen = 5; }
    if (scene == "starter" || scene == "egg") {
      mockNvsReset(); pet = Pet(); pet.begin(); pmd.unload();
      if (scene == "egg") pet.chooseStarter(25);
    }
    if (scene == "evolution") {
      pet.ageMinutes = 31 * 60; choiceKind = 1; choiceUntil = millis() + 10000;
    }
    if (scene == "farewell") {
      pet.selectSpecies(26); pmd.load(26); pet.ageMinutes = 3 * 1440;
      choiceKind = 2; choiceUntil = millis() + 10000;
    }
    if (scene == "release") confirmUntil = millis() + 10000;
    if (scene == "runaway") pet.dbgRunawayReady();
    render();
    std::string path = std::string(argv[1]) + "/" + name + ".ppm";
    gfx->save(path.c_str()); printf("%s\n", name);
  }
}
