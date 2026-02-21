# ZX Spectrum Timing

This page documents every aspect of how timing is handled in the SpectREM Web emulator. The ZX Spectrum's architecture is tightly coupled around the ULA (Uncommitted Logic Array), which arbitrates access to shared RAM between the Z80 CPU and the video/audio circuitry. Accurate emulation of this timing is essential for correct display, audio, tape loading, and software compatibility.

All timing values referenced here are taken from `src/machines/machine_info.hpp` and the corresponding implementation files.

---

## Table of Contents

1. [Fundamental Constants](#fundamental-constants)
2. [Frame Structure](#frame-structure)
3. [Z80 CPU Execution Timing](#z80-cpu-execution-timing)
4. [Interrupt Generation](#interrupt-generation)
5. [ULA Contention (Memory)](#ula-contention-memory)
6. [ULA Contention (I/O)](#ula-contention-io)
7. [Display Timing](#display-timing)
8. [Beeper Audio Timing](#beeper-audio-timing)
9. [AY-3-8912 Sound Chip Timing](#ay-3-8912-sound-chip-timing)
10. [Tape Playback Timing](#tape-playback-timing)
11. [Frame Execution Loop](#frame-execution-loop)
12. [Machine Variant Timing Differences](#machine-variant-timing-differences)

---

## Fundamental Constants

Defined in `src/machines/machine_info.hpp`:

| Constant | ZX Spectrum 48K | Description |
|---|---|---|
| CPU clock | 3,500,000 Hz | Z80A clock frequency |
| T-states per frame | 69,888 | Total T-states in one video frame |
| T-states per scanline | 224 | T-states for one complete scanline |
| Frame rate | 50 Hz | PAL video refresh rate |
| Frame duration | ~19.968 ms | 69,888 / 3,500,000 |
| Total scanlines | 312 | Full frame including vblank |
| Interrupt length | 32 T-states | Duration of the INT signal |
| ULA T-states to display | 14,336 | T-state when ULA starts fetching display data (`ulaTsToDisplay`) |
| CPU T-states to contention | 14,335 | Contention start, derived as `ulaTsToDisplay - 1` |
| Audio sample rate | 48,000 Hz | Output audio sample rate |

### Display Dimensions

| Constant | Value | Description |
|---|---|---|
| Screen width | 256 pixels | Active display area |
| Screen height | 192 pixels | Active display area |
| Border (horizontal) | 48 pixels | Emulated border width (each side) |
| Border (vertical) | 56 pixels | Emulated border height (top and bottom) |
| Total width | 352 pixels | 48 + 256 + 48 |
| Total height | 304 pixels | 56 + 192 + 56 |
| Framebuffer size | 428,032 bytes | 352 x 304 x 4 (RGBA) |

### Display Timing

| Constant | Value | Description |
|---|---|---|
| Horizontal display | 128 T-states | T-states for the 256-pixel display area |
| T-states per character | 4 | Time for 8 pixels (one character cell) |
| Vertical blank | 1,792 T-states | 8 scanlines x 224 T-states |
| Top border | 12,544 T-states | 56 scanlines x 224 T-states |
| Vertical display | 43,008 T-states | 192 scanlines x 224 T-states |

Source: `MachineInfo` struct in `machine_info.hpp`, line 54.

---

## Frame Structure

A single 48K frame spans 312 scanlines at 224 T-states each, totalling 69,888 T-states:

```
Scanline    T-states         Region
────────    ────────         ──────
  0-7       0-1,791          Vertical blank (8 lines)
  8-63      1,792-14,335     Top border (56 lines)
 64-255     14,336-57,343    Active display (192 lines)
256-311     57,344-69,887    Bottom border (56 lines)
```

The **`ulaTsToDisplay`** value (14,336 for the 48K) marks the exact T-state at which the ULA begins fetching display data for the first pixel of the active display area (line 40, column 0). Everything before this is either vblank or top border. Contention starts one T-state earlier (`cpuTsToContention` = `ulaTsToDisplay - 1` = 14,335), because the CPU is held before the ULA's fetch cycle begins.

### Scanline Structure (224 T-states)

Each scanline breaks down as follows:

```
T-state     Pixels     Region
────────    ──────     ──────
  0-23      0-47       Left border (48 pixels)
 24-151     48-303     Active display (256 pixels = 32 characters × 4 T-states)
152-175     304-351    Right border (48 pixels)
176-223     ---        Horizontal retrace (not visible)
```

The display area occupies exactly 128 T-states (24 to 151 within the scanline), rendering 32 character cells at 4 T-states per character (8 pixels per character).

---

## Z80 CPU Execution Timing

### T-State Tracking

The Z80 CPU maintains a `TStates` counter (defined in `z80.hpp` as `uint32_t` within `Z80State`) that tracks the cumulative T-states executed within the current frame. This counter drives all timing decisions — display updates, audio sample generation, contention delays, and frame boundaries.

### Instruction Execution

The CPU executes instructions via `execute(numTStates, intTStates)` in `z80.cpp`:

```cpp
void Z80::execute(uint32_t numTStates, uint32_t intTStates)
{
    while (TStates < numTStates)
    {
        // Check for interrupt acceptance
        if (IntReq && TStates < intTStates && IFF1 && !EIHandled)
        {
            // Accept interrupt...
        }

        // Fetch and execute one instruction
        uint8_t opcode = z80MemRead(PC, 4); // 4 T-states for opcode fetch
        PC++;
        // Decode and execute...
    }
}
```

Key timing details:

- **Opcode fetch**: 4 T-states (M1 cycle: 4 T-states including memory read + refresh)
- **Memory read**: 3 T-states per byte (unless contended)
- **Memory write**: 3 T-states per byte (unless contended)
- **Each instruction**: adds its documented T-state count to `TStates`

### Memory Access Functions

The Z80 uses callbacks for memory access that include T-state accounting:

```cpp
uint8_t z80MemRead(uint16_t address, uint32_t tstates);  // Typically 3 T-states
void z80MemWrite(uint16_t address, uint8_t data, uint32_t tstates);  // Typically 3 T-states
```

The contention handling callbacks (`m_MemContentionHandling` and `m_NoMreqContentionHandling`) are invoked by the machine to add extra delay T-states when the CPU accesses contended memory.

### T-State Manipulation Methods

```cpp
void addTStates(uint32_t ts);           // Add T-states (unconditional)
void addContentionTStates(uint32_t ts); // Add contention delay T-states
uint32_t getTStates() const;            // Read current T-state counter
void resetTStates(uint32_t tsPerFrame); // Subtract tsPerFrame at frame end
```

The `resetTStates(tsPerFrame)` method at frame end subtracts 69,888 rather than resetting to zero, preserving any T-state overshoot from the last instruction into the next frame.

---

## Interrupt Generation

### Mechanism

The ZX Spectrum generates a maskable interrupt (INT) at the start of each frame, synchronised to the vertical blank. In the emulator, this is handled in `zx_spectrum.cpp`:

```cpp
// After frame execution completes:
z80_->resetTStates(info_.tsPerFrame);  // Wrap T-states
z80_->signalInterrupt();                // Signal INT for next frame
```

### Interrupt Acceptance

The Z80 accepts the interrupt only when all conditions are met:

1. `IntReq` is true (interrupt has been signalled)
2. `TStates < intTStates` (within the interrupt window — first 32 T-states of the frame)
3. `IFF1` is true (interrupts are enabled)
4. `EIHandled` is false (not immediately after an `EI` instruction)

The **interrupt length** (`intLength`) is 32 T-states for the 48K. This means the INT signal is only active during T-states 0-31 of each frame. If interrupts are disabled (DI) or the CPU is still executing an instruction that straddles the boundary, the interrupt is missed for that frame.

### Interrupt Service Timing

When the Z80 accepts an interrupt in IM 1 (the mode used by the 48K ROM):

| Action | T-states |
|---|---|
| Acknowledge interrupt | 7 |
| Push PC high byte to stack | 3 |
| Push PC low byte to stack | 3 |
| **Total** | **13** |

The CPU then jumps to address 0x0038 (the IM 1 handler). The 48K ROM's interrupt handler reads the keyboard, updates the system variables, and increments the frame counter — taking additional T-states from the instruction budget.

### NMI (Non-Maskable Interrupt)

NMI handling costs 11 T-states:

| Action | T-states |
|---|---|
| Acknowledge NMI | 5 |
| Push PC high byte to stack | 3 |
| Push PC low byte to stack | 3 |
| **Total** | **11** |

The CPU then jumps to address 0x0066.

---

## ULA Contention (Memory)

### Background

The ZX Spectrum 48K shares a single 16KB RAM chip (at addresses 0x4000-0x7FFF) between the Z80 CPU and the ULA. When the ULA is actively reading display data to generate the video signal, it takes priority, and the CPU must wait. This delay is called **memory contention**.

### Implementation

Contention is implemented in `src/machines/contention.cpp` using pre-calculated lookup tables:

```cpp
void ULAContention::buildContentionTable()
{
    for (uint32_t i = 0; i <= tsPerFrame_; i++)
    {
        memoryContentionTable_[i] = 0;

        if (i >= cpuTsToContention_)
        {
            uint32_t line = (i - cpuTsToContention_) / tsPerScanline_;
            uint32_t ts = (i - cpuTsToContention_) % tsPerScanline_;

            if (line < 192 && ts < 128)
            {
                memoryContentionTable_[i] = ULA_CONTENTION_VALUES[ts & 0x07];
            }
        }
    }
}
```

### Contention Delay Pattern

The ULA reads display data in an 8 T-state repeating pattern. The delay added to the CPU depends on where within this pattern the access falls:

| T-state mod 8 | Delay (T-states) |
|---|---|
| 0 | 6 |
| 1 | 5 |
| 2 | 4 |
| 3 | 3 |
| 4 | 2 |
| 5 | 1 |
| 6 | 0 |
| 7 | 0 |

These values are defined in `machine_info.hpp`:

```cpp
constexpr uint32_t ULA_CONTENTION_VALUES[] = { 6, 5, 4, 3, 2, 1, 0, 0 };
```

### When Contention Applies

Contention only occurs when **all** of the following are true:

1. The memory address is in the **contended range** (0x4000-0x7FFF on the 48K — page/slot 1)
2. The current T-state falls within the **active display area** (line 0-191 of the display, column T-states 0-127)
3. The T-state is at or after `cpuTsToContention` (14,335 for 48K, derived as `ulaTsToDisplay` - 1)

Outside the display area (border, retrace) or when accessing non-contended memory (ROM at 0x0000-0x3FFF, upper RAM at 0x8000-0xFFFF), no contention delay is added.

### Contention Application

When the 48K machine's memory handler detects an access to slot 1, it applies contention:

```cpp
// In zx_spectrum_48k.cpp memory read handler:
if (slot == 1) {
    z80.addContentionTStates(contention_.memoryContention(z80.getTStates()));
}
z80.addTStates(3); // Normal memory access time
```

The contention delay is added **before** the memory access T-states, matching the real hardware behaviour where the CPU is held in a wait state until the ULA releases the bus.

---

## ULA Contention (I/O)

### I/O Port Contention Rules

I/O contention is more complex than memory contention because it depends on two factors:
1. Whether the **address** falls in contended memory (bit 14 set, i.e., 0x4000-0x7FFF)
2. Whether the **port** is a ULA port (even address, bit 0 = 0)

The four combinations produce different contention patterns, implemented in `contention.cpp`:

### Case 1: Contended address, even port (ULA port in contended range)

Pattern: **C:1, C:3**

```cpp
// Apply contention, wait 1 T-state, apply contention again, wait 3 T-states
z80.addContentionTStates(ioContention(z80.getTStates()));
z80.addTStates(1);
z80.addContentionTStates(ioContention(z80.getTStates()));
z80.addTStates(3);
```

### Case 2: Contended address, odd port (non-ULA port in contended range)

Pattern: **C:1, C:1, C:1, C:1**

```cpp
// Four contention checks with 1 T-state gaps
z80.addContentionTStates(ioContention(z80.getTStates()));
z80.addTStates(1);
z80.addContentionTStates(ioContention(z80.getTStates()));
z80.addTStates(1);
z80.addContentionTStates(ioContention(z80.getTStates()));
z80.addTStates(1);
z80.addContentionTStates(ioContention(z80.getTStates()));
z80.addTStates(1);
```

### Case 3: Non-contended address, even port (ULA port outside contended range)

Pattern: **N:1, C:3**

```cpp
// No contention on first cycle, contention on second
z80.addTStates(1);
z80.addContentionTStates(ioContention(z80.getTStates()));
z80.addTStates(3);
```

### Case 4: Non-contended address, odd port (non-ULA port outside contended range)

Pattern: **N:4**

```cpp
// No contention at all
z80.addTStates(4);
```

### Summary Table

| Address contended? | Port even (ULA)? | Pattern | Total base T-states |
|---|---|---|---|
| Yes | Yes | C:1, C:3 | 4 + contention |
| Yes | No | C:1, C:1, C:1, C:1 | 4 + contention |
| No | Yes | N:1, C:3 | 4 + contention |
| No | No | N:4 | 4 |

---

## Display Timing

### Overview

The display subsystem (`src/machines/display.cpp`) generates the RGBA framebuffer incrementally, driven by T-state updates during CPU execution. Rather than rendering the entire screen at frame end, pixels are generated in sync with the CPU's T-state counter, matching how the real ULA generates the video signal.

### T-State Display Table

During initialization, `buildTsTable()` creates a 2D lookup table indexed by `[scanline][t-state]`:

```cpp
uint32_t tstateTable_[MAX_SCANLINES][MAX_TS_PER_LINE];
```

Each cell contains one of three values:

| Value | Constant | Meaning |
|---|---|---|
| 0 | `DISPLAY_RETRACE` | Horizontal or vertical retrace — no visible output |
| 1 | `DISPLAY_BORDER` | Border region — draw border colour |
| 2 | `DISPLAY_PAPER` | Active display — draw pixel data from screen memory |

### Incremental Update

The display is updated incrementally via `updateWithTs(tStates, memory, borderColor, frameCounter)`. This is called:

1. **After each CPU instruction** during the frame execution loop
2. **On writes to screen memory** (0x4000-0x5AFF) to catch mid-scanline changes

The method processes T-states from `currentDisplayTs_` up to the target `tStates`, rendering 8 pixels (2 characters worth, one display byte + attribute pair) at a time.

### Pixel Rendering

For each display byte in the active area:

1. **Calculate screen address** from the current scanline using `lineAddrTable_[]` — the Spectrum's interleaved screen layout maps line numbers to non-sequential memory addresses
2. **Read bitmap byte** from screen memory (one byte = 8 pixels)
3. **Read attribute byte** from the attribute area (0x1800 offset from screen start)
4. **Decode attribute**: bits 0-2 = INK colour, bits 3-5 = PAPER colour, bit 6 = BRIGHT, bit 7 = FLASH
5. **Apply flash**: every 16 frames (checked via `frameCounter & 0x10`), FLASH-attributed cells swap INK and PAPER
6. **Write 8 RGBA pixels** to the framebuffer

### Screen Memory Layout

The Spectrum's display memory has a non-linear layout:

```
Address bits: 010SSLLL RRRCCCCC

SS  = Screen third (0-2, each third is 64 lines)
LLL = Line within character row (0-7, pixel row within 8x8 cell)
RRR = Character row within third (0-7)
CCCCC = Column (0-31, character column)
```

The `lineAddrTable_[192]` lookup table pre-calculates the base address for each of the 192 display lines, avoiding the bit manipulation at runtime.

### Attribute Area

Attributes occupy 768 bytes at offset 0x1800 from the screen memory base:

```
Address: 0x5800 + (line / 8) * 32 + column

Bit 7:   FLASH
Bit 6:   BRIGHT
Bits 5-3: PAPER colour (0-7)
Bits 2-0: INK colour (0-7)
```

### Border Rendering

Border pixels are drawn for all visible scanline positions that fall outside the active display area. The border colour is taken from the lower 3 bits of the last value written to port 0xFE.

### Drawing Offsets

Two machine-specific offsets fine-tune the display pipeline:

| Offset | 48K Value | Purpose |
|---|---|---|
| `borderDrawingOffset` | 10 | T-state adjustment for border pixel alignment |
| `paperDrawingOffset` | 16 | T-state adjustment for display pixel alignment |

These account for the ULA's internal pipeline delay between fetching data and outputting pixels.

### Floating Bus

The `floatingBus()` method returns the byte currently on the ULA's data bus during display fetch:

```cpp
uint8_t Display::floatingBus(uint32_t cpuTStates, const uint8_t* memory) const
```

This is used when software reads from a non-decoded I/O port (odd port with no hardware attached). The method uses `ulaTsToDisplay` (the T-state when the ULA starts fetching display data) to convert CPU T-states into display-relative coordinates. The returned value depends on the current display fetch phase:

- During bitmap fetch: returns the screen bitmap byte
- During attribute fetch: returns the attribute byte
- During border/retrace: returns 0xFF

Some software (and copy protection schemes) rely on reading the floating bus to detect the current scanline position.

---

## Beeper Audio Timing

### Overview

The beeper is the 48K's only built-in sound output — a 1-bit audio device controlled by bit 4 of port 0xFE. The audio subsystem (`src/machines/audio.cpp`) converts the CPU-rate bit toggling into 48kHz audio samples.

### Sample Generation

Audio samples are generated incrementally, in lockstep with CPU execution. The key timing relationship:

```
T-states per sample = tsPerFrame / samplesPerFrame
                    = 69,888 / 960
                    ≈ 72.8 T-states per sample
```

| Parameter | Value |
|---|---|
| Sample rate | 48,000 Hz |
| Frame rate | 50 Hz |
| Samples per frame | 960 |
| T-states per sample | ~72.8 |

### Integration Method

The beeper uses **box-car integration** — accumulating the output level across all T-states within a sample period, then dividing by the count to produce the final sample value:

```cpp
void Audio::update(int32_t tStates)
{
    for (int32_t t = 0; t < tStates; t++)
    {
        double level = (earBit_ ? BEEPER_VOLUME : 0.0)
                     + (tapeEarBit_ ? TAPE_VOLUME : 0.0);

        outputLevel_ += level;
        tsCounter_ += 1.0;

        if (tsCounter_ >= beeperTsStep_)  // ≈72.8
        {
            float sample = static_cast<float>(outputLevel_ / tsCounter_);
            sampleBuffer_[sampleIndex_++] = sample;
            waveformBuffer_[waveformWritePos_] = sample;
            waveformWritePos_ = (waveformWritePos_ + 1) % WAVEFORM_BUFFER_SIZE;

            // Carry fractional T-state into next sample
            tsCounter_ -= beeperTsStep_;
            outputLevel_ = level * tsCounter_;
        }
    }
}
```

This method ensures that even if the EAR bit toggles mid-sample, the resulting audio sample correctly reflects the proportion of the sample period spent high vs low.

### Volume Levels

| Source | Volume |
|---|---|
| Beeper (EAR bit) | 0.6 |
| Tape playback | 0.3 |
| Combined maximum | 0.9 |

Both the beeper output and the tape EAR bit are mixed additively. The tape volume is lower to avoid clipping when both are active simultaneously.

### Frame End

At frame end, `frameEnd()` is called to finalize the sample buffer. Any remaining accumulated output is flushed as a final sample.

---

## AY-3-8912 Sound Chip Timing

### Overview

The AY-3-8912 is a Programmable Sound Generator (PSG) providing three tone channels, a noise generator, and an envelope generator. On the 128K Spectrum it is built in; on the 48K it can be present via add-on hardware (Fuller Box, Melodik). The implementation is in `src/machines/ay.cpp`.

### Clock Relationship

The AY chip runs at a different clock rate from the CPU:

| Parameter | Value |
|---|---|
| PSG master clock | 1,773,400 Hz (1.7734 MHz) |
| Internal prescaler | /8 |
| Effective generator clock | 221,675 Hz |
| CPU clock | 3,500,000 Hz |
| AY ticks per CPU T-state | 0.06333... |

```cpp
static constexpr double AY_TICKS_PER_TSTATE = (1773400.0 / 8.0) / 3500000.0;
```

This means one AY generator tick occurs approximately every 15.8 CPU T-states.

### Update Method

Like the beeper, the AY is updated incrementally after each CPU instruction:

```cpp
void AY3_8912::update(int32_t tStates)
{
    for (int32_t t = 0; t < tStates; t++)
    {
        // Advance AY generators by fractional ticks
        ayTsCounter_ += AY_TICKS_PER_TSTATE;
        while (ayTsCounter_ >= 1.0)
        {
            ayTsCounter_ -= 1.0;
            for (int ch = 0; ch < 3; ch++) tickToneGenerator(ch);
            tickNoiseGenerator();
            tickEnvelopeGenerator();
        }

        // Compute mixed output and accumulate for sample generation
        ayLevel_ = computeMixerOutput() * AY_VOLUME;
        outputLevel_ += ayLevel_;
        tsCounter_ += 1.0;

        if (tsCounter_ >= tsStep_)  // Same ≈72.8 ratio as beeper
        {
            float sample = static_cast<float>(outputLevel_ / tsCounter_);
            sampleBuffer_[sampleIndex_++] = sample;

            // Per-channel waveform capture for debug display
            for (int ch = 0; ch < 3; ch++)
                waveformBuffers_[ch][waveformWritePos_] = getChannelOutput(ch);
            waveformWritePos_ = (waveformWritePos_ + 1) % WAVEFORM_BUFFER_SIZE;

            tsCounter_ -= tsStep_;
            outputLevel_ = ayLevel_ * tsCounter_;
        }
    }
}
```

### Tone Generators

Each of the 3 channels has:
- A **12-bit period register** (from register pairs R0/R1, R2/R3, R4/R5)
- A **counter** that increments each AY tick
- A **toggle output** that flips when the counter reaches the period

```cpp
void AY3_8912::tickToneGenerator(int ch)
{
    toneCounters_[ch]++;
    uint16_t period = getTonePeriod(ch);
    if (period == 0) period = 1;
    if (toneCounters_[ch] >= period)
    {
        toneCounters_[ch] = 0;
        toneOutput_[ch] = !toneOutput_[ch];
    }
}
```

The output frequency is: `PSG_CLOCK / (8 × 2 × period)` = `1,773,400 / (16 × period)` Hz.

### Noise Generator

The noise generator uses a 17-bit LFSR (Linear Feedback Shift Register):

```cpp
void AY3_8912::tickNoiseGenerator()
{
    noiseCounter_++;
    uint8_t period = getNoisePeriod();
    if (period == 0) period = 1;
    if (noiseCounter_ >= period * 2u)
    {
        noiseCounter_ = 0;
        // LFSR: feedback = bit 0 XOR bit 3
        uint32_t feedback = (noiseLFSR_ ^ (noiseLFSR_ >> 3)) & 1;
        noiseLFSR_ = (noiseLFSR_ >> 1) | (feedback << 16);
    }
}
```

- Period register: R6 (5-bit, 0-31)
- Counter advances at `period × 2` AY ticks
- Output is bit 0 of the LFSR

### Envelope Generator

The envelope provides automatic volume ramping:

```cpp
void AY3_8912::tickEnvelopeGenerator()
{
    if (envHolding_) return;

    envCounter_++;
    uint16_t period = getEnvPeriod();
    if (period == 0) period = 1;
    if (envCounter_ >= period)
    {
        envCounter_ = 0;
        if (envAttack_) {
            envVolume_++;
            if (envVolume_ > 15) handleEnvelopeCycleEnd();
        } else {
            if (envVolume_ == 0) handleEnvelopeCycleEnd();
            else envVolume_--;
        }
    }
}
```

- Period registers: R11 (low), R12 (high) — 16-bit period
- Shape register: R13 — 4-bit shape selector
- Volume: 0-15 (4-bit)
- Modes: attack/decay with hold, continue, and alternate flags
- Writing to R13 restarts the envelope from the beginning

### Mixer

The mixer combines tone, noise, and volume for each channel:

```cpp
float AY3_8912::computeMixerOutput() const
{
    float total = 0.0f;
    uint8_t mixerReg = regs_[7]; // R7: mixer control

    for (int ch = 0; ch < 3; ch++)
    {
        if (channelMuted_[ch]) continue;

        bool toneEnabled = !(mixerReg & (1 << ch));
        bool noiseEnabled = !(mixerReg & (8 << ch));
        bool toneOut = toneOutput_[ch] || !toneEnabled;
        bool noiseOut = (noiseLFSR_ & 1) || !noiseEnabled;

        if (toneOut && noiseOut)
        {
            uint8_t volReg = regs_[8 + ch] & 0x1F;
            float vol = (volReg & 0x10)
                ? volumeTable_[envVolume_]    // Envelope mode
                : volumeTable_[volReg & 0x0F]; // Fixed volume
            total += vol;
        }
    }
    return total;
}
```

Register R7 bits:
- Bits 0-2: Tone enable for channels A, B, C (active LOW)
- Bits 3-5: Noise enable for channels A, B, C (active LOW)

Registers R8-R10 (channel volume):
- Bits 0-3: Fixed volume (0-15)
- Bit 4: Use envelope generator instead of fixed volume

### Volume Table

The AY uses a logarithmic volume DAC. The volume table (measured from real hardware):

```cpp
const float AY3_8912::volumeTable_[16] = {
    0.0000f, 0.0137f, 0.0205f, 0.0291f,
    0.0423f, 0.0618f, 0.0847f, 0.1369f,
    0.1691f, 0.2647f, 0.3527f, 0.4499f,
    0.5704f, 0.6873f, 0.8482f, 1.0000f
};
```

### AY Output Mixing

The AY's sample buffer is mixed into the beeper's sample buffer at frame end in `zx_spectrum.cpp`:

```cpp
if (ayEnabled_) {
    const float* ayBuf = ay_.getBuffer();
    float* audioBuf = audio_.getMutableBuffer();
    int count = audio_.getSampleCount();
    for (int i = 0; i < count; i++) {
        audioBuf[i] += ayBuf[i];
    }
}
```

The AY volume factor (0.8) combined with the beeper volume (0.6) can produce a theoretical peak of 1.4, but in practice the signals rarely peak simultaneously.

---

## Tape Playback Timing

### Pulse-Based Playback

Tape data is stored as a sequence of pulse durations measured in T-states. During playback, the tape subsystem advances through pulses in sync with CPU execution:

```cpp
void ZXSpectrum::advanceTape(int32_t tstates)
{
    tapeTs_ += tstates;
    while (tapeTs_ >= tapePulse_[tapePos_])
    {
        tapeTs_ -= tapePulse_[tapePos_];
        tapePos_++;
        tapeEarLevel_ = !tapeEarLevel_;  // Toggle EAR bit

        if (tapePos_ >= tapePulseCount_) {
            // End of block — advance to next block or stop
            break;
        }
    }
}
```

The `tapeEarLevel_` value is fed into the audio subsystem's `tapeEarBit_`, which is mixed at the tape volume level (0.3) into the output.

### Standard Timing

ZX Spectrum standard tape format timing:

| Pulse type | Duration (T-states) |
|---|---|
| Pilot tone (header) | 2,168 T-states × 8,063 pulses |
| Pilot tone (data) | 2,168 T-states × 3,223 pulses |
| Sync pulse 1 | 667 T-states |
| Sync pulse 2 | 735 T-states |
| Zero bit | 855 T-states × 2 pulses |
| One bit | 1,710 T-states × 2 pulses |
| Pause between blocks | Variable (typically 1 second = 3,500,000 T-states) |

### Instant Load Mode

When instant load is enabled, the emulator bypasses the normal pulse-by-pulse playback:

1. The ROM's tape loading routine is detected (execution at specific address)
2. Data is loaded directly into memory at full speed
3. Display and audio generation are skipped during loading
4. Audio is muted for 2 frames after loading completes to avoid clicks

---

## Frame Execution Loop

The main frame loop in `zx_spectrum.cpp` ties everything together:

```cpp
void ZXSpectrum::runFrame()
{
    uint32_t tsPerFrame = info_.tsPerFrame;  // 69,888

    while (z80_->getTStates() < tsPerFrame)
    {
        uint32_t tsBefore = z80_->getTStates();

        // Execute one Z80 instruction (with contention)
        z80_->execute(tsPerFrame, info_.intLength);

        int32_t delta = z80_->getTStates() - tsBefore;

        // Advance audio by the same T-state delta
        audio_.update(delta);

        // Advance AY chip if enabled
        if (ayEnabled_) ay_.update(delta);

        // Advance tape playback if active
        if (tapePlaying_) advanceTape(delta);
    }

    // Frame boundary housekeeping
    z80_->resetTStates(tsPerFrame);
    z80_->signalInterrupt();

    audio_.frameEnd();
    if (ayEnabled_) {
        ay_.frameEnd();
        // Mix AY into beeper buffer
        mixAYIntoAudio();
    }

    // Final display update for any remaining T-states
    display_.updateWithTs(tsPerFrame, screenMemory_, borderColor_, frameCounter_);
    display_.frameReset();

    frameCounter_++;
}
```

### Per-Instruction Timing Flow

For each instruction in the frame:

1. **CPU executes instruction** — T-states advance by the instruction's cost, including any memory/IO contention delays
2. **Audio integrates** — the beeper accumulates output level for the same T-state count, generating samples at ~72.8 T-state intervals
3. **AY integrates** — the AY chip advances its generators by fractional ticks, generating samples at the same ~72.8 T-state intervals
4. **Tape advances** — pulse durations are decremented, EAR bit toggles when pulses complete
5. **Display updates** — triggered by screen memory writes during the instruction (not on every instruction)

### Frame Boundary

At T-state 69,888:

1. T-state counter wraps (preserving overshoot)
2. INT is signalled for next frame
3. Audio buffers are finalized
4. AY output is mixed into the audio buffer
5. Display framebuffer is completed
6. Frame counter increments

---

## Machine Variant Timing Differences

The `MachineInfo` struct parameterizes timing for all machine variants. Key differences:

| Parameter | 48K | 128K | 128K +2 | 128K +2A |
|---|---|---|---|---|
| T-states/frame | 69,888 | 70,908 | 70,908 | 70,908 |
| T-states/line | 224 | 228 | 228 | 228 |
| `ulaTsToDisplay` | 14,336 | 14,362 | 14,362 | 14,365 |
| `cpuTsToContention` | 14,335 | 14,361 | 14,361 | 14,364 |
| Interrupt length | 32 | 36 | 36 | 32 |
| Total scanlines | 312 | 311 | 311 | 311 |
| Vertical blank lines | 8 | 7 | 7 | 7 |
| Vertical blank T-states | 1,792 | 1,596 | 1,596 | 1,596 |
| Top border T-states | 12,544 | 12,768 | 12,768 | 12,768 |
| Has AY chip | No | Yes | Yes | Yes |
| Has memory paging | No | Yes | Yes | Yes |
| Alt contention | No | No | No | Yes |
| ROM size | 16 KB | 32 KB | 32 KB | 64 KB |
| RAM size | 64 KB | 128 KB | 128 KB | 128 KB |

The 128K machines have 4 extra T-states per scanline (228 vs 224), resulting in 1,020 more T-states per frame. Their interrupt window is slightly longer (36 vs 32 T-states). The +2A uses an alternative contention pattern (`altContention = true`).

All machines share the same active display dimensions (256x192), border sizes (48 pixels horizontal, 56 pixels vertical), and audio sample rate (48kHz). The timing differences are parameterized through `MachineInfo` so the same code handles all variants.
