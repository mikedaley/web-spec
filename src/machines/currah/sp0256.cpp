/*
 * sp0256.cpp - GI SP0256-AL2 Speech Synthesis Chip
 *
 * Full emulation of the SP0256's micro-sequencer and 12-pole LPC filter.
 * I could have just used pre-recorded allophone samples like some other
 * emulators do, but where's the fun in that? This processes the actual
 * bitstream from the chip's 2KB mask ROM — the same tiny programs that
 * ran on the real silicon in 1983.
 *
 * The trickiest part was getting the opcode decode right. The SP0256 uses
 * a data-driven approach where a format table describes the bit-fields for
 * each instruction variant (there are 16 opcodes x 4 modes = 64 variants).
 * Jump addresses are bit-reversed because the ROM's address bus is wired
 * backwards relative to the data bus — a quirk of the chip's layout that
 * took a while to figure out.
 *
 * The coefficient quantisation table maps 8-bit register values through a
 * non-linear curve to get the filter coefficients. The LPC filter itself
 * is six cascaded second-order IIR sections — basically a digital model
 * of the human vocal tract. Voiced sounds use a periodic impulse train
 * (the glottis), unvoiced sounds use noise from an LFSR. The filter
 * shapes both into recognisable speech. It's genuinely clever for a chip
 * from this era.
 *
 * Huge thanks to Joe Zbiciak and Frank Palazzolo for reverse-engineering
 * the SP0256 instruction set, and to the MAME project for their reference
 * implementation which was invaluable in getting the opcode decode and
 * data format tables right.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "sp0256.hpp"
#include <cstring>
#include <cmath>

namespace zxspec {

// ============================================================================
// Constants and register layout
// ============================================================================

#define PER_PAUSE    64
#define PER_NOISE    64

// Register indices
enum { AM = 0, PR, B0, F0, B1, F1, B2, F2, B3, F3, B4, F4, B5, F5, IA, IP };

// ============================================================================
// Coefficient quantisation table — maps 7-bit unsigned values (0-127) to
// the actual 10-bit filter coefficients used by the LPC model. This is the
// non-linear curve baked into the SP0256 hardware. The values come from the
// original SP0250 data sheet (the SP0256 uses the same filter core).
// ============================================================================

static const int16_t qtbl[128] = {
       0,     9,    17,    25,    33,    41,    49,    57,
      65,    73,    81,    89,    97,   105,   113,   121,
     129,   137,   145,   153,   161,   169,   177,   185,
     193,   201,   209,   217,   225,   233,   241,   249,
     257,   265,   273,   281,   289,   297,   301,   305,
     309,   313,   317,   321,   325,   329,   333,   337,
     341,   345,   349,   353,   357,   361,   365,   369,
     373,   377,   381,   385,   389,   393,   397,   401,
     405,   409,   413,   417,   421,   425,   427,   429,
     431,   433,   435,   437,   439,   441,   443,   445,
     447,   449,   451,   453,   455,   457,   459,   461,
     463,   465,   467,   469,   471,   473,   475,   477,
     479,   481,   482,   483,   484,   485,   486,   487,
     488,   489,   490,   491,   492,   493,   494,   495,
     496,   497,   498,   499,   500,   501,   502,   503,
     504,   505,   506,   507,   508,   509,   510,   511,
};

// ============================================================================
// bitrev32 — reverse all 32 bits. Needed because the SP0256's ROM address
// bus is wired in the opposite bit-order to the data bus. Jump targets and
// page registers come through the address path, so they need flipping.
// ============================================================================

static inline uint32_t bitrev32(uint32_t val)
{
    val = ((val & 0xFFFF0000) >> 16) | ((val & 0x0000FFFF) << 16);
    val = ((val & 0xFF00FF00) >>  8) | ((val & 0x00FF00FF) <<  8);
    val = ((val & 0xF0F0F0F0) >>  4) | ((val & 0x0F0F0F0F) <<  4);
    val = ((val & 0xCCCCCCCC) >>  2) | ((val & 0x33333333) <<  2);
    val = ((val & 0xAAAAAAAA) >>  1) | ((val & 0x55555555) <<  1);
    return val;
}

// ============================================================================
// Instruction format table — this is the heart of the opcode decoder.
// Rather than hard-coding what each opcode reads from ROM, the SP0256 uses
// this table to describe the bit-fields for each instruction variant.
// Each entry says: read N bits, shift left by S, store in register P,
// with optional delta-update, field-replace, or register-clear behaviour.
// The opcode + mode selects a range of entries from this table via the
// index array below. Took a while to get all 177 entries right.
// CR(len, shift, param, delta, field, clr5, clrAll)
// ============================================================================

#define CR(l,s,p,d,f,c5,ca) \
    (uint16_t)( (((l)&15)<<0) | (((s)&15)<<4) | (((p)&15)<<8) | \
                (((d)&1)<<12) | (((f)&1)<<13) | (((c5)&1)<<14) | (((ca)&1)<<15) )

#define CR_LEN(x) ((x) & 15)
#define CR_SHF(x) (((x) >> 4) & 15)
#define CR_PRM(x) (((x) >> 8) & 15)
#define CR_DELTA  (1 << 12)
#define CR_FIELD  (1 << 13)
#define CR_CLR5   (1 << 14)
#define CR_CLRA   (1 << 15)

static const uint16_t sp0256_datafmt[] = {
    /* 0  PAUSE */        CR(0,0,0,0,0,0,1),
    /* 1  LOADALL mode*   */  CR(8,0,AM,0,0,0,1), CR(8,0,PR,0,0,0,0),
    CR(8,0,B0,0,0,0,0), CR(8,0,F0,0,0,0,0), CR(8,0,B1,0,0,0,0), CR(8,0,F1,0,0,0,0),
    CR(8,0,B2,0,0,0,0), CR(8,0,F2,0,0,0,0), CR(8,0,B3,0,0,0,0), CR(8,0,F3,0,0,0,0),
    CR(8,0,B4,0,0,0,0), CR(8,0,F4,0,0,0,0), CR(8,0,B5,0,0,0,0), CR(8,0,F5,0,0,0,0),
    /* 15 */ CR(8,0,IA,0,0,0,0), CR(8,0,IP,0,0,0,0),
    /* LOAD_4 mode 00,01 */
    /* 17 */ CR(6,2,AM,0,0,0,1), CR(8,0,PR,0,0,0,0),
    CR(4,3,B3,0,0,0,0), CR(6,2,F3,0,0,0,0), CR(7,1,B4,0,0,0,0), CR(6,2,F4,0,0,0,0),
    /* 23 */ CR(8,0,B5,0,0,0,0), CR(8,0,F5,0,0,0,0),
    /* LOAD_4 mode 10,11 */
    /* 25 */ CR(6,2,AM,0,0,0,1), CR(8,0,PR,0,0,0,0),
    CR(6,1,B3,0,0,0,0), CR(7,1,F3,0,0,0,0), CR(8,0,B4,0,0,0,0), CR(8,0,F4,0,0,0,0),
    /* 31 */ CR(8,0,B5,0,0,0,0), CR(8,0,F5,0,0,0,0),
    /* SETMSB_6 mode 00 */
    /* 33 */ CR(0,0,0,0,0,1,0),
    /* 34 */ CR(6,2,AM,0,0,0,0), CR(6,2,F3,0,1,0,0), CR(6,2,F4,0,1,0,0),
    /* 37 */ CR(8,0,F5,0,1,0,0),
    /* SETMSB_6 mode 10 */
    /* 38 */ CR(0,0,0,0,0,1,0),
    /* 39 */ CR(6,2,AM,0,0,0,0), CR(7,1,F3,0,1,0,0), CR(8,0,F4,0,1,0,0),
    /* 42 */ CR(8,0,F5,0,1,0,0),
    /* 43,44 */ 0, 0,
    /* DELTA_9 mode 00,01 */
    /* 45 */ CR(4,2,AM,1,0,0,0), CR(5,0,PR,1,0,0,0),
    CR(3,4,B0,1,0,0,0), CR(3,3,F0,1,0,0,0), CR(3,4,B1,1,0,0,0), CR(3,3,F1,1,0,0,0),
    CR(3,4,B2,1,0,0,0), CR(3,3,F2,1,0,0,0), CR(3,3,B3,1,0,0,0), CR(4,2,F3,1,0,0,0),
    CR(4,1,B4,1,0,0,0), CR(4,2,F4,1,0,0,0),
    /* 57 */ CR(5,0,B5,1,0,0,0), CR(5,0,F5,1,0,0,0),
    /* DELTA_9 mode 10,11 */
    /* 59 */ CR(4,2,AM,1,0,0,0), CR(5,0,PR,1,0,0,0),
    CR(4,1,B0,1,0,0,0), CR(4,2,F0,1,0,0,0), CR(4,1,B1,1,0,0,0), CR(4,2,F1,1,0,0,0),
    CR(4,1,B2,1,0,0,0), CR(4,2,F2,1,0,0,0), CR(4,1,B3,1,0,0,0), CR(5,1,F3,1,0,0,0),
    CR(5,0,B4,1,0,0,0), CR(5,0,F4,1,0,0,0),
    /* 71 */ CR(5,0,B5,1,0,0,0), CR(5,0,F5,1,0,0,0),
    /* SETMSB_A mode 00 */
    /* 73 */ CR(0,0,0,0,0,1,0),
    /* 74 */ CR(6,2,AM,0,0,0,0), CR(5,3,F0,0,1,0,0), CR(5,3,F1,0,1,0,0), CR(5,3,F2,0,1,0,0),
    /* SETMSB_A mode 10 */
    /* 78 */ CR(0,0,0,0,0,1,0),
    /* 79 */ CR(6,2,AM,0,0,0,0), CR(6,2,F0,0,1,0,0), CR(6,2,F1,0,1,0,0), CR(6,2,F2,0,1,0,0),
    /* LOAD_2/C mode 00 */
    /* 83 */ CR(6,2,AM,0,0,0,1), CR(8,0,PR,0,0,0,0),
    CR(3,4,B0,0,0,0,0), CR(5,3,F0,0,0,0,0), CR(3,4,B1,0,0,0,0), CR(5,3,F1,0,0,0,0),
    CR(3,4,B2,0,0,0,0), CR(5,3,F2,0,0,0,0), CR(4,3,B3,0,0,0,0), CR(6,2,F3,0,0,0,0),
    CR(7,1,B4,0,0,0,0), CR(6,2,F4,0,0,0,0),
    /* 95 */ CR(5,0,IA,0,0,0,0), CR(5,0,IP,0,0,0,0),
    /* LOAD_2/C mode 10 */
    /* 97 */ CR(6,2,AM,0,0,0,1), CR(8,0,PR,0,0,0,0),
    CR(6,1,B0,0,0,0,0), CR(6,2,F0,0,0,0,0), CR(6,1,B1,0,0,0,0), CR(6,2,F1,0,0,0,0),
    CR(6,1,B2,0,0,0,0), CR(6,2,F2,0,0,0,0), CR(6,1,B3,0,0,0,0), CR(7,1,F3,0,0,0,0),
    CR(8,0,B4,0,0,0,0), CR(8,0,F4,0,0,0,0),
    /* 109 */ CR(5,0,IA,0,0,0,0), CR(5,0,IP,0,0,0,0),
    /* DELTA_D mode 00,01 */
    /* 111 */ CR(4,2,AM,1,0,0,0), CR(5,0,PR,1,0,0,0),
    CR(3,3,B3,1,0,0,0), CR(4,2,F3,1,0,0,0), CR(4,1,B4,1,0,0,0), CR(4,2,F4,1,0,0,0),
    /* 117 */ CR(5,0,B5,1,0,0,0), CR(5,0,F5,1,0,0,0),
    /* DELTA_D mode 10,11 */
    /* 119 */ CR(4,2,AM,1,0,0,0), CR(5,0,PR,1,0,0,0),
    CR(4,1,B3,1,0,0,0), CR(5,1,F3,1,0,0,0), CR(5,0,B4,1,0,0,0), CR(5,0,F4,1,0,0,0),
    /* 125 */ CR(5,0,B5,1,0,0,0), CR(5,0,F5,1,0,0,0),
    /* LOAD_E */
    /* 127 */ CR(6,2,AM,0,0,0,0), CR(8,0,PR,0,0,0,0),
    /* LOAD_2/C mode 01 */
    /* 129 */ CR(6,2,AM,0,0,0,1), CR(8,0,PR,0,0,0,0),
    CR(3,4,B0,0,0,0,0), CR(5,3,F0,0,0,0,0), CR(3,4,B1,0,0,0,0), CR(5,3,F1,0,0,0,0),
    CR(3,4,B2,0,0,0,0), CR(5,3,F2,0,0,0,0), CR(4,3,B3,0,0,0,0), CR(6,2,F3,0,0,0,0),
    CR(7,1,B4,0,0,0,0), CR(6,2,F4,0,0,0,0),
    CR(8,0,B5,0,0,0,0), CR(8,0,F5,0,0,0,0),
    /* 143 */ CR(5,0,IA,0,0,0,0), CR(5,0,IP,0,0,0,0),
    /* LOAD_2/C mode 11 */
    /* 145 */ CR(6,2,AM,0,0,0,1), CR(8,0,PR,0,0,0,0),
    CR(6,1,B0,0,0,0,0), CR(6,2,F0,0,0,0,0), CR(6,1,B1,0,0,0,0), CR(6,2,F1,0,0,0,0),
    CR(6,1,B2,0,0,0,0), CR(6,2,F2,0,0,0,0), CR(6,1,B3,0,0,0,0), CR(7,1,F3,0,0,0,0),
    CR(8,0,B4,0,0,0,0), CR(8,0,F4,0,0,0,0),
    CR(8,0,B5,0,0,0,0), CR(8,0,F5,0,0,0,0),
    /* 159 */ CR(5,0,IA,0,0,0,0), CR(5,0,IP,0,0,0,0),
    /* SETMSB_3/5 mode 00 */
    /* 161 */ CR(0,0,0,0,0,1,0),
    /* 162 */ CR(6,2,AM,0,0,0,0), CR(8,0,PR,0,0,0,0),
    CR(5,3,F0,0,1,0,0), CR(5,3,F1,0,1,0,0), CR(5,3,F2,0,1,0,0),
    /* 167 */ CR(5,0,IA,0,0,0,0), CR(5,0,IP,0,0,0,0),
    /* SETMSB_3/5 mode 10 */
    /* 169 */ CR(0,0,0,0,0,1,0),
    /* 170 */ CR(6,2,AM,0,0,0,0), CR(8,0,PR,0,0,0,0),
    CR(6,2,F0,0,1,0,0), CR(6,2,F1,0,1,0,0), CR(6,2,F2,0,1,0,0),
    /* 175 */ CR(5,0,IA,0,0,0,0), CR(5,0,IP,0,0,0,0),
};

static const int16_t sp0256_df_idx[16 * 8] = {
    /*  OPCODE 0000 */  -1,-1,  -1,-1,  -1,-1,  -1,-1,
    /*  OPCODE 1000 */  -1,-1,  -1,-1,  -1,-1,  -1,-1,
    /*  OPCODE 0100 */  17,22,  17,24,  25,30,  25,32,
    /*  OPCODE 1100 */  83,94,  129,142, 97,108, 145,158,
    /*  OPCODE 0010 */  83,96,  129,144, 97,110, 145,160,
    /*  OPCODE 1010 */  73,77,  74,77,  78,82,  79,82,
    /*  OPCODE 0110 */  33,36,  34,37,  38,41,  39,42,
    /*  OPCODE 1110 */  127,128, 127,128, 127,128, 127,128,
    /*  OPCODE 0001 */  1,14,   1,16,   1,14,   1,16,
    /*  OPCODE 1001 */  45,56,  45,58,  59,70,  59,72,
    /*  OPCODE 0101 */  161,166, 162,166, 169,174, 170,174,
    /*  OPCODE 1101 */  111,116, 111,118, 119,124, 119,126,
    /*  OPCODE 0011 */  161,168, 162,168, 169,176, 170,176,
    /*  OPCODE 1011 */  -1,-1,  -1,-1,  -1,-1,  -1,-1,
    /*  OPCODE 0111 */  -1,-1,  -1,-1,  -1,-1,  -1,-1,
    /*  OPCODE 1111 */  0,0,    0,0,    0,0,    0,0,
};

// ============================================================================
// Initialisation
// ============================================================================

SP0256::SP0256() { reset(); }

void SP0256::setup(int sampleRate, double framesPerSecond, int tStatesPerFrame)
{
    double cpuClock = static_cast<double>(tStatesPerFrame) * framesPerSecond;
    tsStep_ = cpuClock / static_cast<double>(sampleRate);
    // SP0256 sample rate: clock / 2 / 156 = clock / 312 = 10kHz at 3.12MHz
    // The chip uses 7-bit PWM (128 steps) plus 28 padding steps = 156 total,
    // clocked at half the crystal frequency. This matches the datasheet.
    internalStep_ = cpuClock / (static_cast<double>(SP0256_CLOCK) / 312.0);
}

void SP0256::reset()
{
    pc_ = 0;
    page_ = 0x1000 << 3;   // Page stored as BIT address (MAME convention)
    stack_ = 0;
    halted_ = true;
    mode_ = 0;
    lrq_ = true;
    ald_ = 0;
    silent_ = true;

    std::memset(&filt_, 0, sizeof(filt_));
    filt_.rpt = -1;
    filt_.rng = 1;

    sampleIndex_ = 0;
    tsCounter_ = 0.0;
    internalCounter_ = 0.0;
    currentSample_ = 0.0f;
    highIntonation_ = false;
}

void SP0256::loadROM(const uint8_t* data, uint32_t size)
{
    if (!data || size == 0) return;
    uint32_t copySize = (size < ROM_SIZE) ? size : ROM_SIZE;
    std::memcpy(rom_.data(), data, copySize);
}

// ============================================================================
// Host interface — the Currah hardware writes allophone numbers here
// ============================================================================

void SP0256::writeAllophone(uint8_t allophone)
{
    allophone &= 0x3F;
    // The Currah ROM writes PA1 (allophone 0 = 10ms pause) on every
    // interrupt — 50 times per second — even when nothing is being spoken.
    // If the chip is already halted and silent, there's no point dispatching
    // a pause through the full JMP chain and filter. Skipping it avoids
    // tiny transients from the micro-sequencer startup on each interrupt.
    if (allophone == 0 && halted_) return;
    ald_ = (static_cast<uint32_t>(allophone) << 4) | (0x1000 << 3);
    lrq_ = false;
}

bool SP0256::isBusy() const
{
    return !lrq_ || !halted_;
}

// ============================================================================
// ROM bit reading — fetches variable-length fields from the ROM bitstream.
// The SP0256 ROM is addressed at the BIT level, not byte level, so we need
// to handle reads that span byte boundaries. This grabs two adjacent bytes
// and shifts out the bits we want.
// ============================================================================

uint32_t SP0256::getb(int len)
{
    int idx0 = (pc_    ) >> 3;
    int idx1 = (pc_ + 8) >> 3;
    uint32_t d0 = rom_[idx0 & (ROM_SIZE - 1)];
    uint32_t d1 = rom_[idx1 & (ROM_SIZE - 1)];
    uint32_t data = ((d1 << 8) | d0) >> (pc_ & 7);
    pc_ += len;
    return data & ((1u << len) - 1);
}

// ============================================================================
// Register decode — converts the raw 8-bit register file into the actual
// filter coefficients. Amplitude uses a floating-point format (5-bit
// mantissa, 3-bit exponent). The B and F coefficients go through the
// non-linear quantisation table to get the actual filter values.
// ============================================================================

void SP0256::regdec()
{
    filt_.amp = (filt_.r[AM] & 0x1F) << (((filt_.r[AM] & 0xE0) >> 5) + 0);
    filt_.cnt = 0;
    filt_.per = filt_.r[PR];

    auto IQ = [](uint8_t x) -> int16_t {
        return (x & 0x80) ? qtbl[0x7F & static_cast<uint8_t>(-static_cast<int8_t>(x))]
                          : -qtbl[x & 0x7F];
    };

    for (int i = 0; i < 6; i++) {
        filt_.b_coef[i] = IQ(filt_.r[B0 + 2*i]);
        filt_.f_coef[i] = IQ(filt_.r[F0 + 2*i]);
    }

    filt_.interp = filt_.r[IA] || filt_.r[IP];
}

// ============================================================================
// Micro-sequencer — this is the SP0256's little CPU. It fetches opcodes
// from the ROM, decodes them via the format table, and loads the LPC
// filter's register file. It keeps running until it sets up a non-zero
// repeat count (meaning the filter has work to do), or it halts.
// ============================================================================

void SP0256::micro()
{
    while (filt_.rpt <= 0) {
        // If halted, check for pending ALD
        if (halted_ && !lrq_) {
            pc_       = ald_;
            halted_   = false;
            lrq_      = true;
            ald_      = 0;
            for (int i = 0; i < 16; i++) filt_.r[i] = 0;
            // Clear filter delay elements and output smoother so there's
            // no residual energy from the previous allophone bleeding into
            // the start of the new one
            for (int j = 0; j < 6; j++)
                filt_.z_data[j][0] = filt_.z_data[j][1] = 0;
            currentSample_ = 0.0f;
        }

        if (halted_) {
            filt_.rpt = 1;
            lrq_      = true;
            ald_      = 0;
            for (int i = 0; i < 16; i++) filt_.r[i] = 0;
            // Decode the cleared registers so the filter actually goes
            // silent. Without this, the old amplitude/coefficients remain
            // active for one more period, producing a burst of sound from
            // the previous allophone's tail.
            regdec();
            for (int j = 0; j < 6; j++)
                filt_.z_data[j][0] = filt_.z_data[j][1] = 0;
            currentSample_ = 0.0f;
            silent_   = true;
            return;
        }

        // Read instruction: 4-bit immed + 4-bit opcode
        uint8_t immed4 = static_cast<uint8_t>(getb(4));
        uint8_t opcode = static_cast<uint8_t>(getb(4));
        int repeat = 0;
        bool ctrl_xfer = false;

        switch (opcode) {
        case 0x0: {
            // RTS / SETPAGE
            if (immed4) {
                page_ = bitrev32(immed4) >> 13;
            } else {
                uint32_t btrg = stack_;
                stack_ = 0;
                if (!btrg) {
                    halted_ = true;
                    pc_ = 0;
                } else {
                    pc_ = btrg;
                }
                ctrl_xfer = true;
            }
            break;
        }

        case 0xE:
        case 0xD: {
            // JMP / JSR
            uint32_t btrg = page_
                          | (bitrev32(immed4) >> 17)
                          | (bitrev32(getb(8)) >> 21);
            ctrl_xfer = true;
            if (opcode == 0xD)
                stack_ = (pc_ + 7) & ~7u;
            pc_ = btrg;
            break;
        }

        case 0x1: {
            // SETMODE
            mode_ = ((immed4 & 8) >> 2) | (immed4 & 4) | ((immed4 & 3) << 4);
            break;
        }

        default: {
            repeat = immed4 | (mode_ & 0x30);
            break;
        }
        }

        if (opcode != 1) mode_ &= 0xF;

        if (ctrl_xfer) continue;

        // Skip if repeat == 0
        if (!repeat) continue;

        filt_.rpt = repeat + 1;

        // Look up data format table entries for this opcode + mode
        int idx = (opcode << 3) | (mode_ & 6);
        int idx0 = sp0256_df_idx[idx];
        int idx1 = sp0256_df_idx[idx + 1];

        if (idx0 < 0 || idx1 < 0) continue;

        // Process data format entries
        for (int i = idx0; i <= idx1; i++) {
            uint16_t cr = sp0256_datafmt[i];
            int len   = CR_LEN(cr);
            int shf   = CR_SHF(cr);
            int prm   = CR_PRM(cr);
            bool clra  = (cr & CR_CLRA) != 0;
            bool clr5  = (cr & CR_CLR5) != 0;
            bool delta = (cr & CR_DELTA) != 0;
            bool field = (cr & CR_FIELD) != 0;

            if (clra) {
                for (int j = 0; j < 16; j++) filt_.r[j] = 0;
                silent_ = true;
            }
            if (clr5) {
                filt_.r[B5] = filt_.r[F5] = 0;
            }

            if (!len) continue;

            int8_t value = static_cast<int8_t>(getb(len));
            if (delta && (value & (1 << (len - 1))))
                value |= static_cast<int8_t>(-1 << len);

            if (shf) value <<= shf;

            silent_ = false;

            if (field) {
                filt_.r[prm] &= ~(~0u << shf);
                filt_.r[prm] |= static_cast<uint8_t>(value);
                continue;
            }
            if (delta) {
                filt_.r[prm] += static_cast<uint8_t>(value);
                continue;
            }
            filt_.r[prm] = static_cast<uint8_t>(value);
        }

        // Special: PAUSE sets period to PER_PAUSE
        if (opcode == 0xF) {
            silent_ = true;
            filt_.r[PR] = PER_PAUSE;
        }

        regdec();
        break;
    }
}

// ============================================================================
// LPC-12 filter — generates one 10kHz audio sample. This is the actual
// speech synthesis: a periodic impulse (voiced) or noise (unvoiced) is
// fed through six cascaded second-order filter sections. The filter shapes
// the flat excitation into formant peaks that make vowels and consonants
// sound like actual speech. The z_data arrays are cleared on each new
// pitch period to prevent energy from the previous period carrying over.
// ============================================================================

bool SP0256::lpc12_update(int16_t& out)
{
    bool do_int = false;
    int16_t samp = 0;

    if (filt_.per) {
        // Voiced (periodic)
        if (filt_.cnt <= 0) {
            filt_.cnt += filt_.per;
            samp = filt_.amp;
            filt_.rpt--;
            do_int = filt_.interp;
            for (int j = 0; j < 6; j++)
                filt_.z_data[j][0] = filt_.z_data[j][1] = 0;
        } else {
            samp = 0;
            filt_.cnt--;
        }
    } else {
        // Unvoiced (noise)
        if (--filt_.cnt <= 0) {
            do_int = filt_.interp;
            filt_.cnt = PER_NOISE;
            filt_.rpt--;
            for (int j = 0; j < 6; j++)
                filt_.z_data[j][0] = filt_.z_data[j][1] = 0;
        }
        bool bit = (filt_.rng & 1) != 0;
        filt_.rng = (filt_.rng >> 1) ^ (bit ? 0x4001 : 0);
        samp = bit ? filt_.amp : -filt_.amp;
    }

    // Interpolation
    if (do_int) {
        filt_.r[AM] += filt_.r[IA];
        filt_.r[PR] += filt_.r[IP];
        filt_.amp = (filt_.r[AM] & 0x1F) << (((filt_.r[AM] & 0xE0) >> 5) + 0);
        filt_.per = filt_.r[PR];
    }

    // Check repeat expiry
    if (filt_.rpt <= 0) {
        out = 0;
        return false; // Need more opcodes
    }

    // 6-stage cascaded 2nd order filter.
    // Important: the clamp is applied ONLY at the output, not inside the
    // loop. The z_data stores unclamped intermediate values. Clamping inside
    // the loop corrupts the filter state and produces harsh transients.
    // MAME uses uint16_t for samp with natural wrapping — we use the same
    // approach by storing the truncated 16-bit value in z_data.
    for (int j = 0; j < 6; j++) {
        samp += (int(filt_.b_coef[j]) * int(filt_.z_data[j][1])) >> 9;
        samp += (int(filt_.f_coef[j]) * int(filt_.z_data[j][0])) >> 8;

        filt_.z_data[j][1] = filt_.z_data[j][0];
        filt_.z_data[j][0] = static_cast<int16_t>(samp);
    }

    // Clamp at output only
    if (samp > 8191) samp = 8191;
    if (samp < -8192) samp = -8192;
    out = samp << 2;
    return true;
}

// ============================================================================
// T-state-driven update — called once per Z80 instruction with the number
// of T-states consumed. We accumulate fractional ticks to run the SP0256
// at its native ~10kHz rate, and also accumulate for the 48kHz output
// buffer. The zero-order hold between 10kHz and 48kHz is authentic — the
// real chip used PWM output at a similar rate.
// ============================================================================

void SP0256::update(int32_t tStates)
{
    for (int32_t t = 0; t < tStates; t++) {
        internalCounter_ += 1.0;
        if (internalCounter_ >= internalStep_) {
            internalCounter_ -= internalStep_;

            // Generate one internal sample, matching MAME's approach:
            // 1. If the repeat count expired, run the micro-sequencer
            // 2. If we're in a silent state AND no repeat pending, output
            //    zeros WITHOUT running the filter — this is the key to
            //    preventing residual filter noise between allophones
            // 3. Otherwise, run the LPC filter to produce a real sample
            int16_t sample = 0;

            if (filt_.rpt <= 0)
                micro();

            if (silent_ && filt_.rpt <= 0) {
                sample = 0;
            } else {
                if (!lpc12_update(sample))
                    sample = 0;
            }

            // Output low-pass filter — the real Currah board has an RC
            // filter on the SP0256 output that softens transients
            // The LPC filter's impulse response is very peaky — the first
            // few samples of each pitch period can be 10-30x louder than the
            // steady state. Hard clipping sounds awful, so we use tanh() for
            // soft saturation (like the analogue compression that happens
            // naturally in the real hardware's output stage and speaker).
            // The gain of 1.5 keeps steady-state speech at a good level,
            // and tanh compresses the peaks smoothly.
            float raw = static_cast<float>(sample) / 32768.0f * 16.0f;
            float compressed = tanhf(raw) * 0.8f;
            constexpr float lpAlpha = 0.12f;
            currentSample_ = currentSample_ * (1.0f - lpAlpha) + compressed * lpAlpha;
        }

        tsCounter_ += 1.0;
        if (tsCounter_ >= tsStep_) {
            tsCounter_ -= tsStep_;
            if (sampleIndex_ < MAX_SAMPLES)
                sampleBuffer_[sampleIndex_++] = currentSample_;
        }
    }
}

void SP0256::frameEnd() {}

} // namespace zxspec
