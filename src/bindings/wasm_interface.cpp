/*
 * wasm_interface.cpp - WebAssembly binding layer exposing the emulator API to JavaScript
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "../core/emulator.hpp"
#include <emscripten.h>

// Global emulator instance
static zxspec::Emulator *g_emulator = nullptr;

// Helper macros to reduce repetitive null checks
#define REQUIRE_EMULATOR() do { if (!g_emulator) return; } while(0)
#define REQUIRE_EMULATOR_OR(default_val) do { if (!g_emulator) return (default_val); } while(0)

extern "C" {

EMSCRIPTEN_KEEPALIVE
void init() {
  if (!g_emulator) {
    g_emulator = new zxspec::Emulator();
    g_emulator->init();
  }
}

EMSCRIPTEN_KEEPALIVE
void reset() {
  REQUIRE_EMULATOR();
  g_emulator->reset();
}

EMSCRIPTEN_KEEPALIVE
void runCycles(int cycles) {
  REQUIRE_EMULATOR();
  g_emulator->runCycles(cycles);
}

// ============================================================================
// CPU State Access
// ============================================================================

EMSCRIPTEN_KEEPALIVE
uint16_t getPC() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getPC();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getSP() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getSP();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getAF() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getAF();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getBC() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getBC();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getDE() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getDE();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getHL() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getHL();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getIX() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getIX();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getIY() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getIY();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getI() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getI();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getR() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getR();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getIFF1() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getIFF1();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getIFF2() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getIFF2();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getIM() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getIM();
}

EMSCRIPTEN_KEEPALIVE
uint32_t getTStates() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getTStates();
}

// ============================================================================
// Memory Access
// ============================================================================

EMSCRIPTEN_KEEPALIVE
uint8_t readMemory(uint16_t address) {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->readMemory(address);
}

EMSCRIPTEN_KEEPALIVE
void writeMemory(uint16_t address, uint8_t data) {
  REQUIRE_EMULATOR();
  g_emulator->writeMemory(address, data);
}

// ============================================================================
// Execution Control
// ============================================================================

EMSCRIPTEN_KEEPALIVE
bool isPaused() {
  REQUIRE_EMULATOR_OR(false);
  return g_emulator->isPaused();
}

EMSCRIPTEN_KEEPALIVE
void setPaused(bool paused) {
  REQUIRE_EMULATOR();
  g_emulator->setPaused(paused);
}

EMSCRIPTEN_KEEPALIVE
void stepInstruction() {
  REQUIRE_EMULATOR();
  g_emulator->stepInstruction();
}

// ============================================================================
// Frame Execution & Display
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void runFrame() {
  REQUIRE_EMULATOR();
  g_emulator->runFrame();
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getFramebuffer() {
  REQUIRE_EMULATOR_OR(nullptr);
  return g_emulator->getFramebuffer();
}

EMSCRIPTEN_KEEPALIVE
int getFramebufferSize() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getFramebufferSize();
}

// ============================================================================
// Audio
// ============================================================================

EMSCRIPTEN_KEEPALIVE
const float* getAudioBuffer() {
  REQUIRE_EMULATOR_OR(nullptr);
  return g_emulator->getAudioBuffer();
}

EMSCRIPTEN_KEEPALIVE
int getAudioSampleCount() {
  REQUIRE_EMULATOR_OR(0);
  return g_emulator->getAudioSampleCount();
}

EMSCRIPTEN_KEEPALIVE
void resetAudioBuffer() {
  REQUIRE_EMULATOR();
  g_emulator->resetAudioBuffer();
}

// ============================================================================
// Keyboard Input
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void keyDown(int row, int bit) {
  REQUIRE_EMULATOR();
  g_emulator->keyDown(row, bit);
}

EMSCRIPTEN_KEEPALIVE
void keyUp(int row, int bit) {
  REQUIRE_EMULATOR();
  g_emulator->keyUp(row, bit);
}

EMSCRIPTEN_KEEPALIVE
uint8_t getKeyboardRow(int row) {
  REQUIRE_EMULATOR_OR(0xBF);
  return g_emulator->getKeyboardRow(row);
}

// ============================================================================
// Snapshot Loading
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void loadSNA(const uint8_t* data, int size) {
  REQUIRE_EMULATOR();
  g_emulator->loadSNA(data, static_cast<uint32_t>(size));
}

} // extern "C"
