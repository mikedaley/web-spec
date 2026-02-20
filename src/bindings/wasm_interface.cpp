/*
 * wasm_interface.cpp - WebAssembly binding layer exposing the emulator API to JavaScript
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "../machines/machine.hpp"
#include "../machines/zx_spectrum.hpp"
#include "../machines/zx48k/zx_spectrum_48k.hpp"
#include "../machines/basic/sinclair_basic_tokenizer.hpp"
#include "../machines/basic/sinclair_basic_parser.hpp"
#include "../machines/basic/sinclair_basic_variables.hpp"
#include "../machines/basic/sinclair_basic_writer.hpp"
#include "../machines/basic/sinclair_basic_renumber.hpp"
#include "../core/z80/z80_disassembler.hpp"
#include <cstring>
#include <string>
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
// Display Constants
// ============================================================================

EMSCRIPTEN_KEEPALIVE
int getDisplayWidth() {
  return static_cast<int>(zxspec::TOTAL_WIDTH);
}

EMSCRIPTEN_KEEPALIVE
int getDisplayHeight() {
  return static_cast<int>(zxspec::TOTAL_HEIGHT);
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

EMSCRIPTEN_KEEPALIVE
void resetBreakpointHit() {
  REQUIRE_MACHINE();
  g_machine->resetBreakpointHit();
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

EMSCRIPTEN_KEEPALIVE
void renderDisplay() {
  REQUIRE_MACHINE();
  g_machine->renderDisplay();
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
void loadTZXTape(const uint8_t* data, int size) {
  REQUIRE_MACHINE();
  g_machine->loadTZXTape(data, static_cast<uint32_t>(size));
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
void tapeRewindBlock() {
  REQUIRE_MACHINE();
  g_machine->tapeRewindBlock();
}

EMSCRIPTEN_KEEPALIVE
void tapeForwardBlock() {
  REQUIRE_MACHINE();
  g_machine->tapeForwardBlock();
}

EMSCRIPTEN_KEEPALIVE
void tapeEject() {
  REQUIRE_MACHINE();
  g_machine->tapeEject();
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

// Serialized block info buffer: 20 bytes per block
// [0]     flagByte
// [1]     headerType
// [2-11]  filename (10 bytes)
// [12-13] dataLength (LE)
// [14-15] param1 (LE)
// [16-17] param2 (LE)
// [18-19] reserved
static uint8_t s_blockInfoBuf[5120]; // max 256 blocks * 20 bytes

EMSCRIPTEN_KEEPALIVE
const uint8_t* tapeGetBlockInfo() {
  REQUIRE_MACHINE_OR(nullptr);
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  if (!spec) return nullptr;

  const auto& info = spec->tapeGetBlockInfo();
  size_t count = info.size();
  if (count > 256) count = 256;

  for (size_t i = 0; i < count; i++) {
    uint8_t* dst = s_blockInfoBuf + i * 20;
    dst[0] = info[i].flagByte;
    dst[1] = info[i].headerType;
    memcpy(dst + 2, info[i].filename, 10);
    dst[12] = info[i].dataLength & 0xFF;
    dst[13] = (info[i].dataLength >> 8) & 0xFF;
    dst[14] = info[i].param1 & 0xFF;
    dst[15] = (info[i].param1 >> 8) & 0xFF;
    dst[16] = info[i].param2 & 0xFF;
    dst[17] = (info[i].param2 >> 8) & 0xFF;
    dst[18] = 0;
    dst[19] = 0;
  }

  return s_blockInfoBuf;
}

// JSON metadata buffer
static std::string s_metadataJson;

static void jsonEscape(std::string& out, const std::string& s) {
  for (char c : s) {
    switch (c) {
      case '"':  out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:   out += c; break;
    }
  }
}

EMSCRIPTEN_KEEPALIVE
const char* tapeGetMetadata() {
  REQUIRE_MACHINE_OR("");
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  if (!spec) return "";

  const auto& m = spec->tapeGetMetadata();
  s_metadataJson.clear();
  s_metadataJson = "{";

  auto addStr = [&](const char* key, const std::string& val) {
    s_metadataJson += "\"";
    s_metadataJson += key;
    s_metadataJson += "\":\"";
    jsonEscape(s_metadataJson, val);
    s_metadataJson += "\",";
  };
  auto addNum = [&](const char* key, uint32_t val) {
    s_metadataJson += "\"";
    s_metadataJson += key;
    s_metadataJson += "\":";
    s_metadataJson += std::to_string(val);
    s_metadataJson += ",";
  };

  addStr("format", m.format);
  addNum("versionMajor", m.versionMajor);
  addNum("versionMinor", m.versionMinor);
  addNum("fileSize", m.fileSize);
  addNum("blockCount", m.blockCount);
  addNum("totalDataBytes", m.totalDataBytes);
  addStr("title", m.title);
  addStr("publisher", m.publisher);
  addStr("author", m.author);
  addStr("year", m.year);
  addStr("language", m.language);
  addStr("type", m.type);
  addStr("price", m.price);
  addStr("protection", m.protection);
  addStr("origin", m.origin);
  addStr("comment", m.comment);

  // Remove trailing comma and close
  if (s_metadataJson.back() == ',') s_metadataJson.pop_back();
  s_metadataJson += "}";

  return s_metadataJson.c_str();
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

// ============================================================================
// Tape Recording
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void tapeSetBlockPause(int blockIndex, int pauseMs) {
  REQUIRE_MACHINE();
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  if (spec) spec->tapeSetBlockPause(static_cast<size_t>(blockIndex), static_cast<uint16_t>(pauseMs));
}

EMSCRIPTEN_KEEPALIVE
void tapeRecordStart() {
  REQUIRE_MACHINE();
  g_machine->tapeRecordStart();
}

EMSCRIPTEN_KEEPALIVE
void tapeRecordStop() {
  REQUIRE_MACHINE();
  g_machine->tapeRecordStop();
}

EMSCRIPTEN_KEEPALIVE
int tapeIsRecording() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->tapeIsRecording() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* tapeRecordGetData() {
  REQUIRE_MACHINE_OR(nullptr);
  return g_machine->tapeRecordGetData();
}

EMSCRIPTEN_KEEPALIVE
uint32_t tapeRecordGetSize() {
  REQUIRE_MACHINE_OR(0);
  return g_machine->tapeRecordGetSize();
}

EMSCRIPTEN_KEEPALIVE
int tapeRecordGetBlockCount() {
  REQUIRE_MACHINE_OR(0);
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  return spec ? static_cast<int>(spec->tapeRecordGetBlockCount()) : 0;
}

static uint8_t s_recBlockInfoBuf[5120]; // max 256 blocks * 20 bytes

EMSCRIPTEN_KEEPALIVE
const uint8_t* tapeRecordGetBlockInfo() {
  REQUIRE_MACHINE_OR(nullptr);
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  if (!spec) return nullptr;

  const auto& info = spec->tapeRecordGetBlockInfo();
  size_t count = info.size();
  if (count > 256) count = 256;

  for (size_t i = 0; i < count; i++) {
    uint8_t* dst = s_recBlockInfoBuf + i * 20;
    dst[0] = info[i].flagByte;
    dst[1] = info[i].headerType;
    memcpy(dst + 2, info[i].filename, 10);
    dst[12] = info[i].dataLength & 0xFF;
    dst[13] = (info[i].dataLength >> 8) & 0xFF;
    dst[14] = info[i].param1 & 0xFF;
    dst[15] = (info[i].param1 >> 8) & 0xFF;
    dst[16] = info[i].param2 & 0xFF;
    dst[17] = (info[i].param2 >> 8) & 0xFF;
    dst[18] = 0;
    dst[19] = 0;
  }

  return s_recBlockInfoBuf;
}

// ============================================================================
// AY-3-8912 Sound Chip
// ============================================================================

EMSCRIPTEN_KEEPALIVE
int getAYRegister(int reg) {
  REQUIRE_MACHINE_OR(0);
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  return spec ? spec->getAY().getRegister(reg) : 0;
}

EMSCRIPTEN_KEEPALIVE
void setAYChannelMute(int ch, int muted) {
  REQUIRE_MACHINE();
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  if (spec) spec->getAY().setChannelMute(ch, muted != 0);
}

EMSCRIPTEN_KEEPALIVE
int getAYChannelMute(int ch) {
  REQUIRE_MACHINE_OR(0);
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  return spec ? (spec->getAY().getChannelMute(ch) ? 1 : 0) : 0;
}

EMSCRIPTEN_KEEPALIVE
void getAYWaveform(int ch, float* buf, int count) {
  REQUIRE_MACHINE();
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  if (spec) spec->getAY().getWaveform(ch, buf, count);
}

EMSCRIPTEN_KEEPALIVE
void getBeeperWaveform(float* buf, int count) {
  REQUIRE_MACHINE();
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  if (spec) spec->getAudio().getWaveform(buf, count);
}

EMSCRIPTEN_KEEPALIVE
int isAYEnabled() {
  REQUIRE_MACHINE_OR(0);
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  return spec ? (spec->isAYEnabled() ? 1 : 0) : 0;
}

EMSCRIPTEN_KEEPALIVE
void setAYEnabled(int enabled) {
  REQUIRE_MACHINE();
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  if (spec) spec->setAYEnabled(enabled != 0);
}

// ============================================================================
// Machine Configuration (Issue Number)
// ============================================================================

EMSCRIPTEN_KEEPALIVE
int getIssueNumber() {
  REQUIRE_MACHINE_OR(3);
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  return spec ? spec->getIssueNumber() : 3;
}

EMSCRIPTEN_KEEPALIVE
void setIssueNumber(int issue) {
  REQUIRE_MACHINE();
  auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
  if (spec) spec->setIssueNumber(static_cast<uint8_t>(issue));
}

// ============================================================================
// BASIC Support
// ============================================================================

// Static buffers for BASIC results
static std::vector<uint8_t> s_basicTokenized;
static std::string s_basicProgramJson;
static std::string s_basicVariablesJson;

EMSCRIPTEN_KEEPALIVE
const uint8_t* basicTokenize(const char* text) {
    s_basicTokenized = zxspec::basic::tokenize(std::string(text));
    return s_basicTokenized.data();
}

EMSCRIPTEN_KEEPALIVE
int basicTokenizeGetLength() {
    return static_cast<int>(s_basicTokenized.size());
}

EMSCRIPTEN_KEEPALIVE
const char* basicParseProgram() {
    REQUIRE_MACHINE_OR("");
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    if (!spec) return "[]";
    s_basicProgramJson = zxspec::basic::parseProgramFromMemory(*spec);
    return s_basicProgramJson.c_str();
}

EMSCRIPTEN_KEEPALIVE
const char* basicParseVariables() {
    REQUIRE_MACHINE_OR("");
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    if (!spec) return "[]";
    s_basicVariablesJson = zxspec::basic::parseVariablesFromMemory(*spec);
    return s_basicVariablesJson.c_str();
}

EMSCRIPTEN_KEEPALIVE
void basicWriteProgram(const uint8_t* data, int length) {
    REQUIRE_MACHINE();
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    if (spec) zxspec::basic::writeProgramToMemory(*spec, data, static_cast<size_t>(length));
}

// ============================================================================
// Breakpoint Query
// ============================================================================

static std::string s_breakpointListJson;

EMSCRIPTEN_KEEPALIVE
int getBreakpointCount() {
    REQUIRE_MACHINE_OR(0);
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    return spec ? spec->getBreakpointCount() : 0;
}

EMSCRIPTEN_KEEPALIVE
const char* getBreakpointList() {
    REQUIRE_MACHINE_OR("[]");
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    if (!spec) return "[]";
    s_breakpointListJson = spec->getBreakpointListJson();
    return s_breakpointListJson.c_str();
}

// ============================================================================
// BASIC Breakpoint Support
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void setBasicBreakpointStep() {
    REQUIRE_MACHINE();
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    if (spec) spec->setBasicBreakpointStep();
}

EMSCRIPTEN_KEEPALIVE
void setBasicBreakpointRun() {
    REQUIRE_MACHINE();
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    if (spec) spec->setBasicBreakpointRun();
}

EMSCRIPTEN_KEEPALIVE
void addBasicBreakpointLine(uint16_t lineNumber) {
    REQUIRE_MACHINE();
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    if (spec) spec->addBasicBreakpointLine(lineNumber);
}

EMSCRIPTEN_KEEPALIVE
void clearBasicBreakpointLines() {
    REQUIRE_MACHINE();
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    if (spec) spec->clearBasicBreakpointLines();
}

EMSCRIPTEN_KEEPALIVE
void clearBasicBreakpointMode() {
    REQUIRE_MACHINE();
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    if (spec) spec->clearBasicBreakpointMode();
}

EMSCRIPTEN_KEEPALIVE
int isBasicBreakpointHit() {
    REQUIRE_MACHINE_OR(0);
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    return spec ? (spec->isBasicBreakpointHit() ? 1 : 0) : 0;
}

EMSCRIPTEN_KEEPALIVE
int getBasicBreakpointLine() {
    REQUIRE_MACHINE_OR(0);
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    return spec ? spec->getBasicBreakpointLine() : 0;
}

EMSCRIPTEN_KEEPALIVE
void clearBasicBreakpointHit() {
    REQUIRE_MACHINE();
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    if (spec) spec->clearBasicBreakpointHit();
}

EMSCRIPTEN_KEEPALIVE
int hasBasicProgram() {
    REQUIRE_MACHINE_OR(0);
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    return spec ? (spec->hasBasicProgram() ? 1 : 0) : 0;
}

EMSCRIPTEN_KEEPALIVE
void setBasicProgramActive() {
    REQUIRE_MACHINE();
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    if (spec) spec->setBasicProgramActive();
}

EMSCRIPTEN_KEEPALIVE
int isBasicReportFired() {
    REQUIRE_MACHINE_OR(0);
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    return spec ? (spec->isBasicReportFired() ? 1 : 0) : 0;
}

EMSCRIPTEN_KEEPALIVE
void clearBasicReportFired() {
    REQUIRE_MACHINE();
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    if (spec) spec->clearBasicReportFired();
}

// ============================================================================
// Step-Over / Step-Out
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void stepOver() {
    REQUIRE_MACHINE();
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    if (spec) spec->stepOver();
}

EMSCRIPTEN_KEEPALIVE
void stepOut() {
    REQUIRE_MACHINE();
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    if (spec) spec->stepOut();
}

EMSCRIPTEN_KEEPALIVE
int hasTempBreakpoint() {
    REQUIRE_MACHINE_OR(0);
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    return spec ? (spec->hasTempBreakpoint() ? 1 : 0) : 0;
}

EMSCRIPTEN_KEEPALIVE
void clearTempBreakpoint() {
    REQUIRE_MACHINE();
    auto* spec = static_cast<zxspec::ZXSpectrum*>(g_machine);
    if (spec) spec->clearTempBreakpoint();
}

// ============================================================================
// BASIC Renumbering
// ============================================================================

static std::string s_renumberResult;
static std::string s_autoRenumberResult;

EMSCRIPTEN_KEEPALIVE
const char* basicRenumberProgram(const char* text, int startNum, int step) {
    s_renumberResult = zxspec::basic::renumberProgram(std::string(text), startNum, step);
    return s_renumberResult.c_str();
}

EMSCRIPTEN_KEEPALIVE
const char* basicRenumberGetResult() {
    return s_renumberResult.c_str();
}

EMSCRIPTEN_KEEPALIVE
const char* basicAutoRenumber(const char* text) {
    s_autoRenumberResult = zxspec::basic::autoRenumber(std::string(text));
    return s_autoRenumberResult.c_str();
}

EMSCRIPTEN_KEEPALIVE
const char* basicAutoRenumberGetResult() {
    return s_autoRenumberResult.c_str();
}

// ============================================================================
// Z80 Disassembler
// ============================================================================

// Packed disassembly buffer: per instruction:
//   uint16_t addr (2 bytes LE)
//   uint8_t  length (1 byte)
//   uint8_t  bytes[4] (4 bytes)
//   uint8_t  mnemonicLen (1 byte)
//   char     mnemonic[32] (32 bytes, null-padded)
// Total: 40 bytes per instruction, max 64 instructions = 2560 bytes
static uint8_t s_disasmBuf[64 * 40];
static int s_disasmBufSize = 0;

static uint8_t disasmReadByte(uint16_t addr, void* ctx)
{
    auto* machine = static_cast<zxspec::Machine*>(ctx);
    return machine->readMemory(addr);
}

EMSCRIPTEN_KEEPALIVE
const uint8_t* disassembleAt(uint16_t addr, int count) {
    REQUIRE_MACHINE_OR(nullptr);
    if (count < 1) count = 1;
    if (count > 64) count = 64;

    int offset = 0;
    uint16_t pc = addr;

    for (int i = 0; i < count; i++) {
        auto result = zxspec::z80Disassemble(pc, disasmReadByte, g_machine);

        // addr (2 bytes LE)
        s_disasmBuf[offset++] = pc & 0xFF;
        s_disasmBuf[offset++] = (pc >> 8) & 0xFF;
        // length (1 byte)
        s_disasmBuf[offset++] = result.length;
        // bytes (4 bytes)
        for (int j = 0; j < 4; j++) {
            s_disasmBuf[offset++] = result.bytes[j];
        }
        // mnemonicLen (1 byte)
        int mnLen = static_cast<int>(result.mnemonic.size());
        if (mnLen > 31) mnLen = 31;
        s_disasmBuf[offset++] = static_cast<uint8_t>(mnLen);
        // mnemonic (32 bytes, null-padded)
        memcpy(s_disasmBuf + offset, result.mnemonic.c_str(), mnLen);
        memset(s_disasmBuf + offset + mnLen, 0, 32 - mnLen);
        offset += 32;

        pc = (pc + result.length) & 0xFFFF;
    }

    s_disasmBufSize = offset;
    return s_disasmBuf;
}

EMSCRIPTEN_KEEPALIVE
int disassembleGetSize() {
    return s_disasmBufSize;
}

EMSCRIPTEN_KEEPALIVE
int getInstructionLength(uint16_t addr) {
    REQUIRE_MACHINE_OR(1);
    return zxspec::z80InstructionLength(addr, disasmReadByte, g_machine);
}

} // extern "C"
