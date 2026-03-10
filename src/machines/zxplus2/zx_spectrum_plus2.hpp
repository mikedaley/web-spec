/*
 * zx_spectrum_plus2.hpp - ZX Spectrum 128K +2 machine variant
 *
 * Identical to the 128K in hardware (same paging, timing, contention)
 * but with different ROMs.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "../zx128k/zx_spectrum_128k.hpp"

namespace zxspec::zxplus2 {

class ZXSpectrumPlus2 : public zx128k::ZXSpectrum128 {
public:
    void init() override;
    void reloadSpectranetROM() override;
};

} // namespace zxspec::zxplus2
