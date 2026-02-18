/*
 * wasm_interface.cpp - WebAssembly binding layer exposing the emulator API to JavaScript
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "../machines/machine.hpp"
#include "../machines/zx_spectrum.hpp"
#include "../machines/zx48k/zx_spectrum_48k.hpp"
#include <cstring>
#include <emscripten.h>

// Global machine instance
static zxspec::Machine *g_machine = nullptr;

// Helper macros to reduce repetitive null checks
#define REQUIRE_MACHINE() do { if (!g_machine) return; } while(0)
#define REQUIRE_MACHINE_OR(default_val) do { if (!g_machine) return (default_val); } while(0)

extern "C" {

EMSCRIPTEN_KEEPALIVE
void initMachine(int machineId) {
  delete g_machine;
  g_machine = nullptr;

  switch (machineId) {
    case 0:
    default:
      g_machine = new zxspec::zx48k::ZXSpectrum48();
      break;
  }

  g_machine->init();
}

EMSCRIPTEN_KEEPALIVE
int getMachineId() {
  REQUIRE_MACHINE_OR(-1);
  return g_machine->getId();
}

EMSCRIPTEN_KEEPALIVE
const char* getMachineName() {
  REQUIRE_MACHINE_OR("");
  return g_machine->getName();
}

EMSCRIPTEN_KEEPALIVE
void init() {
  if (!g_machine) {
    g_machine = new zxspec::zx48k::ZXSpectrum48();
    g_machine->init();
  }
}

EMSCRIPTEN_KEEPALIVE
void reset() {
  REQUIRE_MACHINE();
  g_machine->reset();
}

EMSCRIPTEN_KEEPALIVE
void runCycles(int cycles) {
  REQUIRE_MACHINE();
  g_machine->runCycles(cycles);
}

// ============================================================================
// CPU State Access
// ============================================================================

EMSCRIPTEN_KEEPALIVE
uint16_t getPC() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getPC();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getSP() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getSP();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getAF() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getAF();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getBC() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getBC();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getDE() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getDE();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getHL() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getHL();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getIX() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getIX();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getIY() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getIY();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getI() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getI();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getR() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getR();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getIFF1() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getIFF1();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getIFF2() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getIFF2();
}

EMSCRIPTEN_KEEPALIVE
uint8_t getIM() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getIM();
}

EMSCRIPTEN_KEEPALIVE
uint32_t getTStates() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getTStates();
}

// ============================================================================
// Alternate Register Access
// ============================================================================

EMSCRIPTEN_KEEPALIVE
uint16_t getAltAF() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getAltAF();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getAltBC() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getAltBC();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getAltDE() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getAltDE();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getAltHL() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getAltHL();
}

// ============================================================================
// Register Setters
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void setPC(uint16_t v) { REQUIRE_MACHINE(); g_machine->setPC(v); }

EMSCRIPTEN_KEEPALIVE
void setSP(uint16_t v) { REQUIRE_MACHINE(); g_machine->setSP(v); }

EMSCRIPTEN_KEEPALIVE
void setAF(uint16_t v) { REQUIRE_MACHINE(); g_machine->setAF(v); }

EMSCRIPTEN_KEEPALIVE
void setBC(uint16_t v) { REQUIRE_MACHINE(); g_machine->setBC(v); }

EMSCRIPTEN_KEEPALIVE
void setDE(uint16_t v) { REQUIRE_MACHINE(); g_machine->setDE(v); }

EMSCRIPTEN_KEEPALIVE
void setHL(uint16_t v) { REQUIRE_MACHINE(); g_machine->setHL(v); }

EMSCRIPTEN_KEEPALIVE
void setIX(uint16_t v) { REQUIRE_MACHINE(); g_machine->setIX(v); }

EMSCRIPTEN_KEEPALIVE
void setIY(uint16_t v) { REQUIRE_MACHINE(); g_machine->setIY(v); }

EMSCRIPTEN_KEEPALIVE
void setI(uint8_t v) { REQUIRE_MACHINE(); g_machine->setI(v); }

EMSCRIPTEN_KEEPALIVE
void setR(uint8_t v) { REQUIRE_MACHINE(); g_machine->setR(v); }

// ============================================================================
// Breakpoint Management
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void addBreakpoint(uint16_t addr) {
  REQUIRE_MACHINE();
  g_machine->addBreakpoint(addr);
}

EMSCRIPTEN_KEEPALIVE
void removeBreakpoint(uint16_t addr) {
  REQUIRE_MACHINE();
  g_machine->removeBreakpoint(addr);
}

EMSCRIPTEN_KEEPALIVE
void enableBreakpoint(uint16_t addr, bool enabled) {
  REQUIRE_MACHINE();
  g_machine->enableBreakpoint(addr, enabled);
}

EMSCRIPTEN_KEEPALIVE
bool isBreakpointHit() {
  REQUIRE_MACHINE_OR(false);
  return g_machine->isBreakpointHit();
}

EMSCRIPTEN_KEEPALIVE
uint16_t getBreakpointAddress() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getBreakpointAddress();
}

EMSCRIPTEN_KEEPALIVE
void clearBreakpointHit() {
  REQUIRE_MACHINE();
  g_machine->clearBreakpointHit();
}

// ============================================================================
// Memory Access
// ============================================================================

EMSCRIPTEN_KEEPALIVE
uint8_t readMemory(uint16_t address) {
  REQUIRE_MACHINE_OR(0);
  return g_machine->readMemory(address);
}

EMSCRIPTEN_KEEPALIVE
void writeMemory(uint16_t address, uint8_t data) {
  REQUIRE_MACHINE();
  g_machine->writeMemory(address, data);
}

// ============================================================================
// Execution Control
// ============================================================================

EMSCRIPTEN_KEEPALIVE
bool isPaused() {
  REQUIRE_MACHINE_OR(false);
  return g_machine->isPaused();
}

EMSCRIPTEN_KEEPALIVE
void setPaused(bool paused) {
  REQUIRE_MACHINE();
  g_machine->setPaused(paused);
}

EMSCRIPTEN_KEEPALIVE
void stepInstruction() {
  REQUIRE_MACHINE();
  g_machine->stepInstruction();
}

// ============================================================================
// Frame Execution & Display
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void runFrame() {
  REQUIRE_MACHINE();
  g_machine->runFrame();
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* getFramebuffer() {
  REQUIRE_MACHINE_OR(nullptr);
  return g_machine->getFramebuffer();
}

EMSCRIPTEN_KEEPALIVE
int getFramebufferSize() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getFramebufferSize();
}

// ============================================================================
// Audio
// ============================================================================

EMSCRIPTEN_KEEPALIVE
const float* getAudioBuffer() {
  REQUIRE_MACHINE_OR(nullptr);
  return g_machine->getAudioBuffer();
}

EMSCRIPTEN_KEEPALIVE
int getAudioSampleCount() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->getAudioSampleCount();
}

EMSCRIPTEN_KEEPALIVE
void resetAudioBuffer() {
  REQUIRE_MACHINE();
  g_machine->resetAudioBuffer();
}

// ============================================================================
// Keyboard Input
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void keyDown(int row, int bit) {
  REQUIRE_MACHINE();
  g_machine->keyDown(row, bit);
}

EMSCRIPTEN_KEEPALIVE
void keyUp(int row, int bit) {
  REQUIRE_MACHINE();
  g_machine->keyUp(row, bit);
}

EMSCRIPTEN_KEEPALIVE
uint8_t getKeyboardRow(int row) {
  REQUIRE_MACHINE_OR(0xBF);
  return g_machine->getKeyboardRow(row);
}

// ============================================================================
// Snapshot Loading
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void loadSNA(const uint8_t* data, int size) {
  REQUIRE_MACHINE();
  g_machine->loadSNA(data, static_cast<uint32_t>(size));
}

EMSCRIPTEN_KEEPALIVE
void loadZ80(const uint8_t* data, int size) {
  REQUIRE_MACHINE();
  g_machine->loadZ80(data, static_cast<uint32_t>(size));
}

EMSCRIPTEN_KEEPALIVE
void loadTZX(const uint8_t* data, int size) {
  REQUIRE_MACHINE();
  g_machine->loadTZX(data, static_cast<uint32_t>(size));
}

// ============================================================================
// TAP Loading & Tape Transport
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void loadTAP(const uint8_t* data, int size) {
  REQUIRE_MACHINE();
  g_machine->loadTAP(data, static_cast<uint32_t>(size));
}

EMSCRIPTEN_KEEPALIVE
void tapePlay() {
  REQUIRE_MACHINE();
  g_machine->tapePlay();
}

EMSCRIPTEN_KEEPALIVE
void tapeStop() {
  REQUIRE_MACHINE();
  g_machine->tapeStop();
}

EMSCRIPTEN_KEEPALIVE
void tapeRewind() {
  REQUIRE_MACHINE();
  g_machine->tapeRewind();
}

EMSCRIPTEN_KEEPALIVE
int tapeIsPlaying() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->tapeIsPlaying() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int tapeIsLoaded() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->tapeIsLoaded() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int tapeGetBlockCount() {
  REQUIRE_MACHINE_OR(0);
  return static_cast<int>(g_machine->tapeGetBlockCount());
}

EMSCRIPTEN_KEEPALIVE
int tapeGetCurrentBlock() {
  REQUIRE_MACHINE_OR(0);
  return static_cast<int>(g_machine->tapeGetCurrentBlock());
}

// Serialized block info buffer: 16 bytes per block
// [0]     flagByte
// [1]     headerType
// [2-11]  filename (10 bytes)
// [12-13] dataLength (LE)
// [14-15] reserved
static uint8_t s_blockInfoBuf[4096]; // max 256 blocks

EMSCRIPTEN_KEEPALIVE
const uint8_t* tapeGetBlockInfo() {
  REQUIRE_MACHINE_OR(nullptr);
  // We need to downcast to ZXSpectrum to access tapeGetBlockInfo()
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  if (!spec) return nullptr;

  const auto& info = spec->tapeGetBlockInfo();
  size_t count = info.size();
  if (count > 256) count = 256;

  for (size_t i = 0; i < count; i++) {
    uint8_t* dst = s_blockInfoBuf + i * 16;
    dst[0] = info[i].flagByte;
    dst[1] = info[i].headerType;
    memcpy(dst + 2, info[i].filename, 10);
    dst[12] = info[i].dataLength & 0xFF;
    dst[13] = (info[i].dataLength >> 8) & 0xFF;
    dst[14] = 0;
    dst[15] = 0;
  }

  return s_blockInfoBuf;
}

EMSCRIPTEN_KEEPALIVE
int tapeGetBlockProgress() {
  REQUIRE_MACHINE_OR(0);
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  return spec ? spec->tapeGetBlockProgress() : 0;
}

EMSCRIPTEN_KEEPALIVE
void tapeSetInstantLoad(int instant) {
  REQUIRE_MACHINE();
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  if (spec) spec->tapeSetInstantLoad(instant != 0);
}

EMSCRIPTEN_KEEPALIVE
int tapeGetInstantLoad() {
  REQUIRE_MACHINE_OR(0);
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  return spec ? (spec->tapeGetInstantLoad() ? 1 : 0) : 0;
}

} // extern "C"
