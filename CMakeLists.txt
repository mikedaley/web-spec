cmake_minimum_required(VERSION 3.20)
project(web-spec VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Generate compile_commands.json for clangd
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Source files
set(CORE_SOURCES
    src/core/audio.cpp
    src/core/emulator.cpp
    src/core/sna_loader.cpp
    src/core/ula_contention.cpp
    src/core/z80/z80.cpp
    src/core/z80/z80_opcodes_main.cpp
    src/core/z80/z80_opcodes_cb.cpp
    src/core/z80/z80_opcodes_dd.cpp
    src/core/z80/z80_opcodes_ed.cpp
    src/core/z80/z80_opcodes_fd.cpp
    src/core/z80/z80_opcodes_ddcb.cpp
    src/core/z80/z80_opcodes_fdcb.cpp
    src/core/z80/z80_opcode_tables.cpp
    src/bindings/wasm_interface.cpp
)

# Custom command to generate ROM data arrays
# The script handles missing ROM files gracefully (generates empty arrays)
add_custom_command(
    OUTPUT ${CMAKE_BINARY_DIR}/generated/roms.cpp
    COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_BINARY_DIR}/generated
    COMMAND ${CMAKE_SOURCE_DIR}/scripts/generate_roms.sh ${CMAKE_SOURCE_DIR}/roms ${CMAKE_BINARY_DIR}/generated/roms.cpp
    DEPENDS ${CMAKE_SOURCE_DIR}/scripts/generate_roms.sh
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
        ${CMAKE_BINARY_DIR}/generated
    )

    # Emscripten-specific flags
    set_target_properties(zxspec PROPERTIES
        SUFFIX ".js"
        LINK_FLAGS "\
            -s WASM=1 \
            -s MODULARIZE=1 \
            -s EXPORT_NAME='createZXSpecModule' \
            -s EXPORTED_FUNCTIONS='[ \
                \"_init\", \
                \"_reset\", \
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
                \"_readMemory\", \
                \"_writeMemory\", \
                \"_isPaused\", \
                \"_setPaused\", \
                \"_stepInstruction\", \
                \"_runFrame\", \
                \"_getFramebuffer\", \
                \"_getFramebufferSize\", \
                \"_keyDown\", \
                \"_keyUp\", \
                \"_getKeyboardRow\", \
                \"_getAudioBuffer\", \
                \"_getAudioSampleCount\", \
                \"_resetAudioBuffer\", \
                \"_loadSNA\", \
                \"_malloc\", \
                \"_free\" \
            ]' \
            -s EXPORTED_RUNTIME_METHODS='[\"ccall\", \"cwrap\", \"UTF8ToString\", \"stringToUTF8\", \"HEAPU8\", \"HEAPF32\"]' \
            -s ALLOW_MEMORY_GROWTH=1 \
            -s INITIAL_MEMORY=33554432 \
            -s MAXIMUM_MEMORY=268435456 \
            -s NO_EXIT_RUNTIME=1 \
            -s ASYNCIFY=0 \
            --no-entry \
            -O3 \
            -flto \
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
        src/core/z80/z80.cpp
        src/core/z80/z80_opcodes_main.cpp
        src/core/z80/z80_opcodes_cb.cpp
        src/core/z80/z80_opcodes_dd.cpp
        src/core/z80/z80_opcodes_ed.cpp
        src/core/z80/z80_opcodes_fd.cpp
        src/core/z80/z80_opcodes_ddcb.cpp
        src/core/z80/z80_opcodes_fdcb.cpp
        src/core/z80/z80_opcode_tables.cpp
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

endif()
