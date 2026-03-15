cmake_minimum_required(VERSION 3.20)
project(web-spec VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Generate compile_commands.json for clangd
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Source files - Z80 CPU (shared across all machines)
set(Z80_SOURCES
    src/core/z80/z80.cpp
    src/core/z80/z80_opcodes_main.cpp
    src/core/z80/z80_opcodes_cb.cpp
    src/core/z80/z80_opcodes_dd.cpp
    src/core/z80/z80_opcodes_ed.cpp
    src/core/z80/z80_opcodes_fd.cpp
    src/core/z80/z80_opcodes_ddcb.cpp
    src/core/z80/z80_opcodes_fdcb.cpp
    src/core/z80/z80_opcode_tables.cpp
    src/core/z80/z80_disassembler.cpp
    src/core/z80/z80_assembler.cpp
)

# Source files - ZX Spectrum base class (shared display/audio/contention)
set(ZXSPECTRUM_BASE_SOURCES
    src/machines/zx_spectrum.cpp
    src/machines/display.cpp
    src/machines/audio.cpp
    src/machines/ay.cpp
    src/machines/contention.cpp
    src/machines/loaders/sna_loader.cpp
    src/machines/loaders/z80_loader.cpp
    src/machines/loaders/tzx_loader.cpp
    src/machines/loaders/tap_loader.cpp
    src/machines/basic/sinclair_basic_float.cpp
    src/machines/basic/sinclair_basic_tokenizer.cpp
    src/machines/basic/sinclair_basic_parser.cpp
    src/machines/basic/sinclair_basic_variables.cpp
    src/machines/basic/sinclair_basic_writer.cpp
    src/machines/basic/sinclair_basic_renumber.cpp
    src/machines/loaders/z80_saver.cpp
)

# Source files - ZX Spectrum 48K variant
set(ZX48K_SOURCES
    src/machines/zx48k/zx_spectrum_48k.cpp
)

# Source files - ZX Spectrum 128K variant
set(ZX128K_SOURCES
    src/machines/zx128k/zx_spectrum_128k.cpp
)

# Source files - ZX Spectrum 128K +2 variant
set(ZXPLUS2_SOURCES
    src/machines/zxplus2/zx_spectrum_plus2.cpp
)

# Source files - ZX Spectrum 128K +2A variant
set(ZXPLUS2A_SOURCES
    src/machines/zxplus2a/zx_spectrum_plus2a.cpp
)

# Source files - ZX Spectrum +3 variant (includes FDC)
set(ZXPLUS3_SOURCES
    src/machines/zxplus3/zx_spectrum_plus3.cpp
    src/machines/fdc/upd765a.cpp
    src/machines/fdc/disk_image.cpp
)

# Source files - ZX81
set(ZX81_SOURCES
    src/machines/zx81/zx81.cpp
)

# Source files - Spectranet Ethernet interface
set(SPECTRANET_SOURCES
    src/machines/spectranet/spectranet.cpp
    src/machines/spectranet/w5100.cpp
)

set(DEBUG_SOURCES
    src/core/debug/condition_evaluator.cpp
)

set(CORE_SOURCES
    ${Z80_SOURCES}
    ${ZXSPECTRUM_BASE_SOURCES}
    ${ZX48K_SOURCES}
    ${ZX128K_SOURCES}
    ${ZXPLUS2_SOURCES}
    ${ZXPLUS2A_SOURCES}
    ${ZXPLUS3_SOURCES}
    ${ZX81_SOURCES}
    ${SPECTRANET_SOURCES}
    ${DEBUG_SOURCES}
    src/bindings/wasm_interface.cpp
)

# Custom command to generate ROM data arrays
add_custom_command(
    OUTPUT ${CMAKE_BINARY_DIR}/generated/roms.cpp
    COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_BINARY_DIR}/generated
    COMMAND ${CMAKE_SOURCE_DIR}/scripts/generate_roms.sh ${CMAKE_SOURCE_DIR}/roms ${CMAKE_BINARY_DIR}/generated/roms.cpp
    DEPENDS ${CMAKE_SOURCE_DIR}/scripts/generate_roms.sh
            ${CMAKE_SOURCE_DIR}/roms/48.rom
            ${CMAKE_SOURCE_DIR}/roms/128-0.rom
            ${CMAKE_SOURCE_DIR}/roms/128-1.rom
            ${CMAKE_SOURCE_DIR}/roms/plus2-0.ROM
            ${CMAKE_SOURCE_DIR}/roms/plus2-1.ROM
            ${CMAKE_SOURCE_DIR}/roms/plus2a.rom
            ${CMAKE_SOURCE_DIR}/roms/plus3.rom
            ${CMAKE_SOURCE_DIR}/roms/spectranet.rom
            ${CMAKE_SOURCE_DIR}/roms/zx81.rom
    COMMENT "Generating ROM data arrays"
)

if(EMSCRIPTEN)
    add_executable(zxspec
        ${CORE_SOURCES}
    )

    # Ensure roms.cpp is generated before building
    add_custom_target(generate_roms DEPENDS ${CMAKE_BINARY_DIR}/generated/roms.cpp)
    add_dependencies(zxspec generate_roms)

    target_include_directories(zxspec PRIVATE
        ${CMAKE_SOURCE_DIR}/src/core
        ${CMAKE_SOURCE_DIR}/src/core/z80
        ${CMAKE_SOURCE_DIR}/src/machines
        ${CMAKE_SOURCE_DIR}/src/machines/loaders
        ${CMAKE_SOURCE_DIR}/src/machines/zx48k
        ${CMAKE_SOURCE_DIR}/src/machines/zx128k
        ${CMAKE_SOURCE_DIR}/src/machines/zxplus2
        ${CMAKE_SOURCE_DIR}/src/machines/zxplus2a
        ${CMAKE_SOURCE_DIR}/src/machines/zxplus3
        ${CMAKE_SOURCE_DIR}/src/machines/zx81
        ${CMAKE_SOURCE_DIR}/src/machines/fdc
        ${CMAKE_SOURCE_DIR}/src/machines/spectranet
        ${CMAKE_SOURCE_DIR}/src/machines/basic
        ${CMAKE_SOURCE_DIR}/src/core/debug
        ${CMAKE_BINARY_DIR}/generated
    )

    # Compile-time optimisation flags
    target_compile_options(zxspec PRIVATE -O3 -flto -fno-exceptions -fno-rtti -msimd128)

    # Emscripten-specific flags
    set_target_properties(zxspec PROPERTIES
        SUFFIX ".js"
        LINK_FLAGS "\
            -s WASM=1 \
            -s MODULARIZE=1 \
            -s EXPORT_NAME='createZXSpecModule' \
            -s EXPORTED_FUNCTIONS='[ \
                \"_init\", \
                \"_initMachine\", \
                \"_getMachineId\", \
                \"_getMachineName\", \
                \"_reset\", \
                \"_triggerNMI\", \
                \"_runCycles\", \
                \"_getPC\", \
                \"_getSP\", \
                \"_getAF\", \
                \"_getBC\", \
                \"_getDE\", \
                \"_getHL\", \
                \"_getIX\", \
                \"_getIY\", \
                \"_getI\", \
                \"_getR\", \
                \"_getIFF1\", \
                \"_getIFF2\", \
                \"_getIM\", \
                \"_getTStates\", \
                \"_getBeamX\", \
                \"_getBeamY\", \
                \"_getBeamScanline\", \
                \"_getBeamHTs\", \
                \"_isInVBL\", \
                \"_isInHBLANK\", \
                \"_readMemory\", \
                \"_writeMemory\", \
                \"_setAccessTracking\", \
                \"_getAccessFlags\", \
                \"_isPaused\", \
                \"_setPaused\", \
                \"_stepInstruction\", \
                \"_renderDisplay\", \
                \"_renderDisplayToBeam\", \
                \"_runFrame\", \
                \"_getFramebuffer\", \
                \"_getFramebufferSize\", \
                \"_getDisplayTs\", \
                \"_getSignalBuffer\", \
                \"_getSignalBufferSize\", \
                \"_keyDown\", \
                \"_keyUp\", \
                \"_getKeyboardRow\", \
                \"_getAudioBuffer\", \
                \"_getAudioSampleCount\", \
                \"_resetAudioBuffer\", \
                \"_detectSnapshotMachine\", \
                \"_loadSNA\", \
                \"_loadZ80\", \
                \"_loadTZX\", \
                \"_loadTAP\", \
                \"_loadTZXTape\", \
                \"_loadP\", \
                \"_tapePlay\", \
                \"_tapeStop\", \
                \"_tapeRewind\", \
                \"_tapeRewindBlock\", \
                \"_tapeForwardBlock\", \
                \"_tapeEject\", \
                \"_tapeIsPlaying\", \
                \"_tapeIsLoaded\", \
                \"_tapeGetBlockCount\", \
                \"_tapeGetCurrentBlock\", \
                \"_tapeGetBlockInfo\", \
                \"_tapeGetMetadata\", \
                \"_tapeGetBlockProgress\", \
                \"_tapeSetInstantLoad\", \
                \"_tapeGetInstantLoad\", \
                \"_tapeSetBlockPause\", \
                \"_tapeRecordStart\", \
                \"_tapeRecordStop\", \
                \"_tapeIsRecording\", \
                \"_tapeRecordGetData\", \
                \"_tapeRecordGetSize\", \
                \"_tapeRecordGetBlockCount\", \
                \"_tapeRecordGetBlockInfo\", \
                \"_getAltAF\", \
                \"_getAltBC\", \
                \"_getAltDE\", \
                \"_getAltHL\", \
                \"_setPC\", \
                \"_setSP\", \
                \"_setAF\", \
                \"_setBC\", \
                \"_setDE\", \
                \"_setHL\", \
                \"_setIX\", \
                \"_setIY\", \
                \"_setI\", \
                \"_setR\", \
                \"_addBreakpoint\", \
                \"_removeBreakpoint\", \
                \"_enableBreakpoint\", \
                \"_isBreakpointHit\", \
                \"_getBreakpointAddress\", \
                \"_clearBreakpointHit\", \
                \"_resetBreakpointHit\", \
                \"_addBeamBreakpoint\", \
                \"_removeBeamBreakpoint\", \
                \"_enableBeamBreakpoint\", \
                \"_clearAllBeamBreakpoints\", \
                \"_isBeamBreakpointHit\", \
                \"_getBeamBreakpointHitId\", \
                \"_getBeamBreakHitScanline\", \
                \"_getBeamBreakHitHTs\", \
                \"_getDisplayWidth\", \
                \"_getDisplayHeight\", \
                \"_getBreakpointCount\", \
                \"_getBreakpointList\", \
                \"_getAYRegister\", \
                \"_setAYChannelMute\", \
                \"_getAYChannelMute\", \
                \"_getAYWaveform\", \
                \"_getBeeperWaveform\", \
                \"_isAYEnabled\", \
                \"_setAYEnabled\", \
                \"_getAYToneOutput\", \
                \"_getAYNoiseLFSR\", \
                \"_getAYEnvVolume\", \
                \"_getAYEnvHolding\", \
                \"_getAYEnvAttack\", \
                \"_getAYChannelOutput\", \
                \"_isSpecdrumEnabled\", \
                \"_setSpecdrumEnabled\", \
                \"_getIssueNumber\", \
                \"_setIssueNumber\", \
                \"_basicTokenize\", \
                \"_basicTokenizeGetLength\", \
                \"_basicParseProgram\", \
                \"_basicParseVariables\", \
                \"_basicWriteProgram\", \
                \"_setBasicBreakpointStep\", \
                \"_setBasicBreakpointRun\", \
                \"_addBasicBreakpointLine\", \
                \"_clearBasicBreakpointLines\", \
                \"_clearBasicBreakpointMode\", \
                \"_isBasicBreakpointHit\", \
                \"_getBasicBreakpointLine\", \
                \"_getBasicBreakpointStatement\", \
                \"_clearBasicBreakpointHit\", \
                \"_hasBasicProgram\", \
                \"_setBasicProgramActive\", \
                \"_isBasicReportFired\", \
                \"_clearBasicReportFired\", \
                \"_stepOver\", \
                \"_stepOut\", \
                \"_hasTempBreakpoint\", \
                \"_clearTempBreakpoint\", \
                \"_disassembleAt\", \
                \"_disassembleGetSize\", \
                \"_disassembleAroundPC\", \
                \"_getInstructionLength\", \
                \"_basicRenumberProgram\", \
                \"_basicRenumberGetResult\", \
                \"_basicAutoRenumber\", \
                \"_basicAutoRenumberGetResult\", \
                \"_getPagingRegister\", \
                \"_evaluateCondition\", \
                \"_evaluateExpression\", \
                \"_getConditionError\", \
                \"_exportState\", \
                \"_importState\", \
                \"_isSpectranetEnabled\", \
                \"_setSpectranetEnabled\", \
                \"_spectranetGetPageA\", \
                \"_spectranetGetPageB\", \
                \"_spectranetGetControlReg\", \
                \"_spectranetIsPagedIn\", \
                \"_spectranetGetTrapAddr\", \
                \"_spectranetIsTrapEnabled\", \
                \"_spectranetGetPendingCommand\", \
                \"_spectranetClearPendingCommand\", \
                \"_spectranetPushReceivedData\", \
                \"_spectranetGetRxAvailable\", \
                \"_spectranetSetSocketStatus\", \
                \"_spectranetGetTxBuffer\", \
                \"_spectranetGetTxBufferSize\", \
                \"_spectranetW5100Read\", \
                \"_spectranetGetSocketStatus\", \
                \"_spectranetSetNetworkConfig\", \
                \"_spectranetSetStaticIP\", \
                \"_spectranetIsStaticIP\", \
                \"_spectranetReloadROM\", \
                \"_assembleSource\", \
                \"_assemblerGetOutput\", \
                \"_assemblerGetOutputSize\", \
                \"_assemblerGetOrigin\", \
                \"_assemblerGetErrorCount\", \
                \"_assemblerGetErrors\", \
                \"_assemblerGetListing\", \
                \"_diskInsert\", \
                \"_diskInsertEmpty\", \
                \"_diskEject\", \
                \"_diskIsInserted\", \
                \"_diskIsModified\", \
                \"_diskSetWriteProtected\", \
                \"_diskIsWriteProtected\", \
                \"_diskExportData\", \
                \"_diskExportDataSize\", \
                \"_diskIsMotorOn\", \
                \"_diskGetCurrentTrack\", \
                \"_diskGetFDCPhase\", \
                \"_diskIsReadMode\", \
                \"_traceEnable\", \
                \"_traceIsEnabled\", \
                \"_traceGetBuffer\", \
                \"_traceGetEntryCount\", \
                \"_traceGetWriteIndex\", \
                \"_traceGetEntrySize\", \
                \"_traceGetMaxEntries\", \
                \"_malloc\", \
                \"_free\" \
            ]' \
            -s EXPORTED_RUNTIME_METHODS='[\"ccall\", \"cwrap\", \"UTF8ToString\", \"stringToUTF8\", \"lengthBytesUTF8\", \"HEAPU8\", \"HEAPF32\"]' \
            -s ALLOW_MEMORY_GROWTH=1 \
            -s INITIAL_MEMORY=33554432 \
            -s MAXIMUM_MEMORY=268435456 \
            -s NO_EXIT_RUNTIME=1 \
            -s ASYNCIFY=0 \
            -s STACK_SIZE=131072 \
            -s MALLOC=emmalloc \
            -s FILESYSTEM=0 \
            --no-entry \
            -O3 \
            -flto \
            -fno-exceptions \
            -fno-rtti \
            -msimd128 \
        "
    )

    # Copy output to public directory
    add_custom_command(TARGET zxspec POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:zxspec> ${CMAKE_SOURCE_DIR}/public/zxspec.js
        COMMAND ${CMAKE_COMMAND} -E copy ${CMAKE_BINARY_DIR}/zxspec.wasm ${CMAKE_SOURCE_DIR}/public/zxspec.wasm
        COMMENT "Copying WASM files to public directory"
    )

else()
    # Native build for testing
    enable_testing()

    # Z80 CPU Test
    add_executable(z80_test
        tests/z80/z80_test.cpp
        ${Z80_SOURCES}
    )
    target_include_directories(z80_test PRIVATE
        ${CMAKE_SOURCE_DIR}/src/core
        ${CMAKE_SOURCE_DIR}/src/core/z80
    )
    target_compile_options(z80_test PRIVATE -O3 -Wall -Wextra)
    add_test(NAME z80_cpu_test
        COMMAND z80_test
        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
    )

    # Timing Test (CPU & ULA timing validation)
    add_executable(timing_test
        tests/timing/timing_test.cpp
        ${Z80_SOURCES}
        src/machines/contention.cpp
    )
    target_include_directories(timing_test PRIVATE
        ${CMAKE_SOURCE_DIR}/src/core
        ${CMAKE_SOURCE_DIR}/src/core/z80
        ${CMAKE_SOURCE_DIR}/src/machines
    )
    target_compile_options(timing_test PRIVATE -O3 -Wall -Wextra)
    add_test(NAME timing_test
        COMMAND timing_test
        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
    )

endif()
