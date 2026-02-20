# WASM Bindings Reference

All functions exported from `src/bindings/wasm_interface.cpp` via `EMSCRIPTEN_KEEPALIVE`.
Called from JavaScript via `wasmModule._functionName()` in `emulator-worker.js`.

## Machine Management

| Function | Signature | Description |
|---|---|---|
| `initMachine` | `void initMachine(int machineId)` | Create and init machine (0 = ZX48K) |
| `getMachineId` | `int getMachineId()` | Get current machine ID |
| `getMachineName` | `const char* getMachineName()` | Get machine name string |
| `init` | `void init()` | Init default machine (ZX48K) |
| `reset` | `void reset()` | Reset machine to initial state |

## CPU Execution

| Function | Signature | Description |
|---|---|---|
| `runCycles` | `void runCycles(int cycles)` | Execute N T-states |
| `runFrame` | `void runFrame()` | Execute one full frame (69,888 T-states) |
| `stepInstruction` | `void stepInstruction()` | Execute single Z80 instruction |
| `isPaused` | `bool isPaused()` | Check if CPU is paused |
| `setPaused` | `void setPaused(bool paused)` | Pause/resume CPU |

## CPU Register Getters

| Function | Returns | Description |
|---|---|---|
| `getPC` | `uint16_t` | Program counter |
| `getSP` | `uint16_t` | Stack pointer |
| `getAF` | `uint16_t` | Accumulator + flags |
| `getBC` | `uint16_t` | BC register pair |
| `getDE` | `uint16_t` | DE register pair |
| `getHL` | `uint16_t` | HL register pair |
| `getIX` | `uint16_t` | Index register X |
| `getIY` | `uint16_t` | Index register Y |
| `getI` | `uint8_t` | Interrupt vector |
| `getR` | `uint8_t` | Memory refresh |
| `getIFF1` | `uint8_t` | Interrupt flip-flop 1 |
| `getIFF2` | `uint8_t` | Interrupt flip-flop 2 |
| `getIM` | `uint8_t` | Interrupt mode (0/1/2) |
| `getTStates` | `uint32_t` | T-state counter |
| `getAltAF` | `uint16_t` | Alternate AF |
| `getAltBC` | `uint16_t` | Alternate BC |
| `getAltDE` | `uint16_t` | Alternate DE |
| `getAltHL` | `uint16_t` | Alternate HL |

## CPU Register Setters

| Function | Signature |
|---|---|
| `setPC` | `void setPC(uint16_t v)` |
| `setSP` | `void setSP(uint16_t v)` |
| `setAF` | `void setAF(uint16_t v)` |
| `setBC` | `void setBC(uint16_t v)` |
| `setDE` | `void setDE(uint16_t v)` |
| `setHL` | `void setHL(uint16_t v)` |
| `setIX` | `void setIX(uint16_t v)` |
| `setIY` | `void setIY(uint16_t v)` |
| `setI` | `void setI(uint8_t v)` |
| `setR` | `void setR(uint8_t v)` |

## Memory Access

| Function | Signature | Description |
|---|---|---|
| `readMemory` | `uint8_t readMemory(uint16_t addr)` | Read byte from address |
| `writeMemory` | `void writeMemory(uint16_t addr, uint8_t data)` | Write byte to address |

## Breakpoints

| Function | Signature | Description |
|---|---|---|
| `addBreakpoint` | `void addBreakpoint(uint16_t addr)` | Add breakpoint at address |
| `removeBreakpoint` | `void removeBreakpoint(uint16_t addr)` | Remove breakpoint |
| `enableBreakpoint` | `void enableBreakpoint(uint16_t addr, bool enabled)` | Enable/disable breakpoint |
| `isBreakpointHit` | `bool isBreakpointHit()` | Check if breakpoint was hit |
| `getBreakpointAddress` | `uint16_t getBreakpointAddress()` | Get address of hit breakpoint |
| `clearBreakpointHit` | `void clearBreakpointHit()` | Clear breakpoint hit flag |
| `resetBreakpointHit` | `void resetBreakpointHit()` | Reset breakpoint hit state |

## Display

| Function | Signature | Description |
|---|---|---|
| `renderDisplay` | `void renderDisplay()` | Render current frame to framebuffer |
| `getFramebuffer` | `const uint8_t* getFramebuffer()` | Get pointer to RGBA framebuffer |
| `getFramebufferSize` | `int getFramebufferSize()` | Get framebuffer size in bytes |

## Audio

| Function | Signature | Description |
|---|---|---|
| `getAudioBuffer` | `const float* getAudioBuffer()` | Get audio sample buffer (float32) |
| `getAudioSampleCount` | `int getAudioSampleCount()` | Number of samples in buffer |
| `resetAudioBuffer` | `void resetAudioBuffer()` | Clear audio buffer |

## Keyboard

| Function | Signature | Description |
|---|---|---|
| `keyDown` | `void keyDown(int row, int bit)` | Press key (row 0-7, bit 0-4) |
| `keyUp` | `void keyUp(int row, int bit)` | Release key |
| `getKeyboardRow` | `uint8_t getKeyboardRow(int row)` | Read keyboard matrix row |

## Snapshot Loading

| Function | Signature | Description |
|---|---|---|
| `loadSNA` | `void loadSNA(const uint8_t* data, int size)` | Load SNA snapshot |
| `loadZ80` | `void loadZ80(const uint8_t* data, int size)` | Load Z80 snapshot |
| `loadTZX` | `void loadTZX(const uint8_t* data, int size)` | Load TZX as snapshot |

## Tape Control

| Function | Signature | Description |
|---|---|---|
| `loadTAP` | `void loadTAP(const uint8_t* data, int size)` | Load TAP tape |
| `loadTZXTape` | `void loadTZXTape(const uint8_t* data, int size)` | Load TZX tape |
| `tapePlay` | `void tapePlay()` | Start tape playback |
| `tapeStop` | `void tapeStop()` | Stop tape |
| `tapeRewind` | `void tapeRewind()` | Rewind to start |
| `tapeRewindBlock` | `void tapeRewindBlock()` | Go to previous block |
| `tapeForwardBlock` | `void tapeForwardBlock()` | Go to next block |
| `tapeEject` | `void tapeEject()` | Eject tape |
| `tapeIsPlaying` | `int tapeIsPlaying()` | 1 if playing |
| `tapeIsLoaded` | `int tapeIsLoaded()` | 1 if tape loaded |
| `tapeGetBlockCount` | `int tapeGetBlockCount()` | Number of blocks |
| `tapeGetCurrentBlock` | `int tapeGetCurrentBlock()` | Current block index |
| `tapeGetBlockInfo` | `const uint8_t* tapeGetBlockInfo()` | Serialized block info (20 bytes/block) |
| `tapeGetMetadata` | `const char* tapeGetMetadata()` | JSON metadata string |
| `tapeGetBlockProgress` | `int tapeGetBlockProgress()` | Current block progress % |
| `tapeSetInstantLoad` | `void tapeSetInstantLoad(int instant)` | Enable/disable instant load |
| `tapeGetInstantLoad` | `int tapeGetInstantLoad()` | 1 if instant load enabled |
| `tapeSetBlockPause` | `void tapeSetBlockPause(int blockIndex, int pauseMs)` | Set pause after block |

## Tape Recording

| Function | Signature | Description |
|---|---|---|
| `tapeRecordStart` | `void tapeRecordStart()` | Start recording |
| `tapeRecordStop` | `void tapeRecordStop()` | Stop recording |
| `tapeIsRecording` | `int tapeIsRecording()` | 1 if recording |
| `tapeRecordGetData` | `const uint8_t* tapeRecordGetData()` | Get recorded TAP data |
| `tapeRecordGetSize` | `uint32_t tapeRecordGetSize()` | Get recorded data size |
| `tapeRecordGetBlockCount` | `int tapeRecordGetBlockCount()` | Number of recorded blocks |
| `tapeRecordGetBlockInfo` | `const uint8_t* tapeRecordGetBlockInfo()` | Recorded block info (20 bytes/block) |

## AY-3-8912 Sound Chip

| Function | Signature | Description |
|---|---|---|
| `getAYRegister` | `int getAYRegister(int reg)` | Read AY register (0-15) |
| `setAYChannelMute` | `void setAYChannelMute(int ch, int muted)` | Mute/unmute channel (0-2) |
| `getAYChannelMute` | `int getAYChannelMute(int ch)` | 1 if channel muted |
| `getAYWaveform` | `void getAYWaveform(int ch, float* buf, int count)` | Copy channel waveform to buffer |
| `getBeeperWaveform` | `void getBeeperWaveform(float* buf, int count)` | Copy beeper waveform to buffer |
| `isAYEnabled` | `int isAYEnabled()` | 1 if AY chip enabled |
| `setAYEnabled` | `void setAYEnabled(int enabled)` | Enable/disable AY chip |

## BASIC Support

| Function | Signature | Description |
|---|---|---|
| `basicTokenize` | `const uint8_t* basicTokenize(const char* text)` | Tokenize BASIC text |
| `basicTokenizeGetLength` | `int basicTokenizeGetLength()` | Get tokenized data length |
| `basicParseProgram` | `const char* basicParseProgram()` | Parse program from memory → JSON |
| `basicParseVariables` | `const char* basicParseVariables()` | Parse variables from memory → JSON |
| `basicWriteProgram` | `void basicWriteProgram(const uint8_t* data, int length)` | Write tokenized program to memory |

## Memory Management

| Function | Signature | Description |
|---|---|---|
| `_malloc` | `void* _malloc(size_t size)` | Allocate WASM heap memory |
| `_free` | `void _free(void* ptr)` | Free WASM heap memory |

## Block Info Format

`tapeGetBlockInfo` and `tapeRecordGetBlockInfo` return 20 bytes per block:

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | flagByte |
| 1 | 1 | headerType |
| 2-11 | 10 | filename |
| 12-13 | 2 | dataLength (LE) |
| 14-15 | 2 | param1 (LE) |
| 16-17 | 2 | param2 (LE) |
| 18-19 | 2 | reserved |
