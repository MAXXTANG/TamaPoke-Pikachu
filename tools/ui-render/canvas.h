#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <vector>
#include "glcdfont.h"

// Host-only RGB565 drawing adapter. The game drawing functions are extracted
// unchanged from TamaPoke.ino; no ESP32 hardware or real save is accessed.
struct HostCanvas {
  std::vector<uint16_t> pixels = std::vector<uint16_t>(466 * 466, 0);
  int cursorX = 0, cursorY = 0, textSize = 1;
  uint16_t textColor = 0;
  void pixel(int x, int y, uint16_t color) {
    if (x >= 0 && y >= 0 && x < 466 && y < 466) pixels[y * 466 + x] = color;
  }
  void fillRect(int x, int y, int w, int h, uint16_t color) {
    for (int yy = std::max(0, y); yy < std::min(466, y + h); ++yy)
      for (int xx = std::max(0, x); xx < std::min(466, x + w); ++xx) pixel(xx, yy, color);
  }
  void fillScreen(uint16_t color) { std::fill(pixels.begin(), pixels.end(), color); }
  void drawLine(int x0, int y0, int x1, int y1, uint16_t color) {
    int dx = std::abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    int dy = -std::abs(y1 - y0), sy = y0 < y1 ? 1 : -1, error = dx + dy;
    while (true) {
      pixel(x0, y0, color);
      if (x0 == x1 && y0 == y1) break;
      int twice = 2 * error;
      if (twice >= dy) { error += dy; x0 += sx; }
      if (twice <= dx) { error += dx; y0 += sy; }
    }
  }
  void drawRect(int x, int y, int w, int h, uint16_t color) {
    fillRect(x, y, w, 1, color); fillRect(x, y + h - 1, w, 1, color);
    fillRect(x, y, 1, h, color); fillRect(x + w - 1, y, 1, h, color);
  }
  void fillCircle(int x, int y, int radius, uint16_t color) {
    for (int yy = -radius; yy <= radius; ++yy) {
      int half = int(std::sqrt(double(radius * radius - yy * yy)));
      fillRect(x - half, y + yy, 2 * half + 1, 1, color);
    }
  }
  void drawCircle(int cx, int cy, int radius, uint16_t color) {
    int x = 0, y = radius, d = 1 - radius;
    while (x <= y) {
      for (auto point : {std::pair<int,int>{x,y}, {y,x}, {-x,y}, {-y,x}, {x,-y}, {y,-x}, {-x,-y}, {-y,-x}})
        pixel(cx + point.first, cy + point.second, color);
      ++x;
      if (d < 0) d += 2 * x + 1;
      else { --y; d += 2 * (x - y) + 1; }
    }
  }
  void fillRoundRect(int x, int y, int w, int h, int radius, uint16_t color) {
    radius = std::min(radius, std::min(w, h) / 2);
    for (int row = 0; row < h; ++row) {
      int inset = 0;
      int dy = row < radius ? radius - row - 1 : row >= h - radius ? row - (h - radius) : -1;
      if (dy >= 0) inset = radius - int(std::sqrt(double(radius * radius - dy * dy)));
      fillRect(x + inset, y + row, w - 2 * inset, 1, color);
    }
  }
  void drawRoundRect(int x, int y, int w, int h, int radius, uint16_t color) {
    radius = std::min(radius, std::min(w, h) / 2);
    for (int row = 0; row < h; ++row) {
      int inset = 0;
      int dy = row < radius ? radius - row - 1 : row >= h - radius ? row - (h - radius) : -1;
      if (dy >= 0) inset = radius - int(std::sqrt(double(radius * radius - dy * dy)));
      if (row == 0 || row == h - 1) fillRect(x + inset, y + row, w - 2 * inset, 1, color);
      else { pixel(x + inset, y + row, color); pixel(x + w - inset - 1, y + row, color); }
    }
  }
  void fillTriangle(int x0, int y0, int x1, int y1, int x2, int y2, uint16_t color) {
    if (y0 > y1) { std::swap(y0, y1); std::swap(x0, x1); }
    if (y1 > y2) { std::swap(y1, y2); std::swap(x1, x2); }
    if (y0 > y1) { std::swap(y0, y1); std::swap(x0, x1); }
    if (y0 == y2) { int a = std::min(x0, std::min(x1, x2)), b = std::max(x0, std::max(x1, x2)); fillRect(a, y0, b - a + 1, 1, color); return; }
    int last = y1 == y2 ? y1 : y1 - 1;
    for (int y = y0; y <= y2; ++y) {
      int a = x0 + (y - y0) * (x2 - x0) / (y2 - y0), b;
      if (y <= last) b = y1 == y0 ? x1 : x0 + (y - y0) * (x1 - x0) / (y1 - y0);
      else b = y2 == y1 ? x1 : x1 + (y - y1) * (x2 - x1) / (y2 - y1);
      if (a > b) std::swap(a, b);
      fillRect(a, y, b - a + 1, 1, color);
    }
  }
  void setTextSize(int size) { textSize = size; }
  void setCursor(int x, int y) { cursorX = x; cursorY = y; }
  int16_t getCursorX() { return cursorX; }
  int16_t getCursorY() { return cursorY; }
  void setTextColor(uint16_t color) { textColor = color; }
  void setFont(const uint8_t * = nullptr) {}
  void setUTF8Print(bool) {}
  void getTextBounds(const char *s, int x, int y, int16_t *x1, int16_t *y1, uint16_t *w, uint16_t *h) {
    *x1 = x; *y1 = y; *w = std::strlen(s) * 6 * textSize; *h = 8 * textSize;
  }
  void print(char c) {
    if (c == '\n') { cursorX = 0; cursorY += 8 * textSize; return; }
    if (c == '\r') return;
    if (cursorX + 6 * textSize > 466) { cursorX = 0; cursorY += 8 * textSize; }
    for (int column = 0; column < 5; ++column) {
      uint8_t bits = font[uint8_t(c) * 5 + column];
      for (int row = 0; row < 8; ++row)
        if (bits & (1 << row)) fillRect(cursorX + column * textSize, cursorY + row * textSize, textSize, textSize, textColor);
    }
    cursorX += 6 * textSize;
  }
  void print(const char *text) { for (; *text; ++text) print(*text); }
  void flush() {}
  void save(const char *path) {
    FILE *file = fopen(path, "wb"); if (!file) std::abort();
    fprintf(file, "P6\n466 466\n255\n");
    for (int y = 0; y < 466; ++y) for (int x = 0; x < 466; ++x) {
      uint16_t c = (x - 233) * (x - 233) + (y - 233) * (y - 233) <= 233 * 233 ? pixels[y * 466 + x] : 0;
      uint8_t rgb[3] = {uint8_t(((c >> 11) & 31) * 255 / 31), uint8_t(((c >> 5) & 63) * 255 / 63), uint8_t((c & 31) * 255 / 31)};
      fwrite(rgb, 1, 3, file);
    }
    fclose(file);
  }
};
