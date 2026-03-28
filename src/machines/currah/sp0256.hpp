/*
 * sp0256.hpp - GI SP0256-AL2 Speech Synthesis Chip
 *
 * Rather than taking the easy route and using pre-recorded allophone samples
 * (which would be simpler but less authentic), this is a proper emulation of
 * the SP0256's internal micro-sequencer and 12-pole LPC vocal tract model.
 * The chip's 2KB mask ROM contains tiny programs built from ~16 opcodes that
 * configure a cascaded IIR filter to shape glottal pulses or noise into speech.
 * It's a surprisingly elegant piece of 1980s silicon.
 *
 * The micro-sequencer reads variable-length bit-fields from ROM, loads filter
 * coefficients through a non-linear quantisation table, and generates audio at
 * ~10kHz (3.12MHz / 336). Getting the opcode decode right was the hard part —
 * the instruction format uses a data-driven table of bit-field descriptors
 * rather than fixed formats, and jump targets are bit-reversed because the
 * ROM's address bus runs in the opposite direction to the data bus. Fun.
 *
 * The SP0256 instruction set was reverse-engineered by Joe Zbiciak and Frank
 * Palazzolo, and the approach here closely follows their work as implemented
 * in MAME's sp0256.cpp.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>
#include <array>

namespace zxspec {

class SP0256 {
public:
    static constexpr uint32_t ROM_SIZE = 2048;     // 2KB allophone ROM
    static constexpr int SP0256_CLOCK = 3120000;   // 3.12MHz crystal on the Currah board
    static constexpr int MAX_SAMPLES = 2048;

    SP0256();
    ~SP0256() = default;

    void setup(int sampleRate, double framesPerSecond, int tStatesPerFrame);
    void reset();
    void loadROM(const uint8_t* data, uint32_t size);

    void writeAllophone(uint8_t allophone);
    bool isBusy() const;

    void update(int32_t tStates);
    void frameEnd();

    const float* getBuffer() const { return sampleBuffer_; }
    float* getMutableBuffer() { return sampleBuffer_; }
    int getSampleCount() const { return sampleIndex_; }
    void resetBuffer() { sampleIndex_ = 0; }

    void setHighIntonation(bool high) { highIntonation_ = high; }
    bool isHighIntonation() const { return highIntonation_; }

private:
    std::array<uint8_t, ROM_SIZE> rom_{};

    // Micro-sequencer — all addresses are BIT addresses, not byte addresses.
    // The SP0256 addresses its ROM at the bit level because instructions are
    // not byte-aligned (they can be any number of bits long).
    uint32_t pc_ = 0;
    uint32_t page_ = 0;         // Upper address bits for JMP/JSR targets
    uint32_t stack_ = 0;        // One-deep return stack for JSR/RTS
    uint32_t ald_ = 0;          // Address Latch — pending allophone from host
    uint8_t  mode_ = 0;         // Controls coefficient bit-widths and optional fields
    bool     halted_ = true;    // Waiting for an allophone to be written
    bool     lrq_ = true;       // Load Request line — true means ready for data
    bool     silent_ = true;    // Standby indicator (doesn't mute audio)

    // LPC-12 filter state — six cascaded second-order sections that model
    // the vocal tract. The coefficients come from the ROM via the micro-
    // sequencer, decoded through a non-linear quantisation table.
    struct LPC12 {
        int16_t  rpt = -1;         // Repeat count (pitch periods remaining)
        int16_t  cnt = 0;          // Sample counter within current pitch period
        int16_t  per = 0;          // Pitch period in samples (0 = noise/unvoiced)
        uint32_t rng = 1;          // LFSR for noise generation (unvoiced sounds)
        int16_t  amp = 0;          // Amplitude (decoded from floating-point register)
        int16_t  f_coef[6]{};      // Formant frequency coefficients (F0-F5)
        int16_t  b_coef[6]{};      // Formant bandwidth coefficients (B0-B5)
        int16_t  z_data[6][2]{};   // Filter delay elements (two per section)
        uint8_t  r[16]{};          // Raw 8-bit register file before decoding
        bool     interp = false;   // Interpolation active (smooth transitions)
    } filt_;

    // Audio output — we generate at the SP0256's native ~10kHz rate then
    // zero-order hold upsample to 48kHz for mixing with the beeper output.
    float    sampleBuffer_[MAX_SAMPLES]{};
    int      sampleIndex_ = 0;
    double   tsCounter_ = 0.0;
    double   tsStep_ = 0.0;
    double   internalCounter_ = 0.0;
    double   internalStep_ = 0.0;
    float    currentSample_ = 0.0f;
    bool     highIntonation_ = false;

    uint32_t getb(int len);         // Read bits from ROM at current PC
    void     micro();               // Execute micro-sequencer until filter has work
    bool     lpc12_update(int16_t& out);  // Generate one 10kHz sample
    void     regdec();              // Decode register file into filter coefficients
};

} // namespace zxspec
