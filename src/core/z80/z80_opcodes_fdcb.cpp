/*
 * z80_opcodes_fdcb.cpp - Z80 FDCB prefix opcodes (IY bit operations)
 *
 * FDCB opcodes share implementations with DDCB opcodes - see z80_opcode_tables.cpp
 * Both DDCB and FDCB prefix opcode tables point to the same _IX_IY_ methods.
 * The execute loop sets m_MEMPTR to IX+d or IY+d before calling the opcode method,
 * so the shared implementations just use m_MEMPTR for the computed address.
 *
 * All shared implementations are in z80_opcodes_ddcb.cpp
 *
 * Ported from SpectREMCPP by Mike Daley
 */

#include "z80.hpp"

// No additional implementations needed - FDCB opcodes use the same
// methods as DDCB opcodes (defined in z80_opcodes_ddcb.cpp).
// The opcode table entries in z80_opcode_tables.cpp point both
// DDCB_Opcodes and FDCB_Opcodes to the shared _IX_IY_ methods.
