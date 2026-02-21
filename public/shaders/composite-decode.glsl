// PAL composite video decode fragment shader
//
// Reads a single-channel (R8) signal texture containing PAL-encoded composite
// video and decodes it back to RGB. The encode→decode process inherently
// produces colour bleeding, fringing, and luma/chroma crosstalk — artefacts
// that cannot be faked as post-processing on clean RGBA data.

precision highp float;

uniform sampler2D u_signalTexture;
uniform vec2 u_textureSize;

varying vec2 v_texCoord;

const float PI = 3.14159265359;

// PAL subcarrier phase increment per pixel (must match C++ encoder)
// phase_inc = 2π × 4433618.75 / 7000000 ≈ 3.9793 rad/pixel
const float PHASE_INC = 2.0 * PI * 4433618.75 / 7000000.0;

void main() {
    vec2 uv = v_texCoord;
    vec2 texelSize = 1.0 / u_textureSize;

    // Use floor() to get integer pixel index matching the C++ encoder's
    // integer pixel positions (phase resets to 0 at start of each line).
    float pixelX = floor(uv.x * u_textureSize.x);
    float pixelY = floor(uv.y * u_textureSize.y);

    // Decode signal byte back to analog value
    // encoded = (signal + 0.4) * 170.0, so signal = encoded/255 * 1.5 - 0.4
    // (255/170 ≈ 1.5)

    // Luma extraction: low-pass filter (average 5 neighbouring samples)
    float lumaSum = 0.0;
    for (int i = -2; i <= 2; i++) {
        vec2 sampleUV = uv + vec2(float(i) * texelSize.x, 0.0);
        sampleUV.x = clamp(sampleUV.x, 0.0, 1.0);
        float encoded = texture2D(u_signalTexture, sampleUV).r;
        float sig = encoded * (255.0 / 170.0) - 0.4;
        lumaSum += sig;
    }
    float Y = lumaSum / 5.0;

    // Chroma extraction: demodulate by multiplying by sin/cos at subcarrier
    // frequency, then low-pass filter (average 9 samples, ±4 pixels)
    float uSum = 0.0;
    float vSum = 0.0;

    // PAL alternation: negate V on odd scanlines
    float palSign = mod(pixelY, 2.0) > 0.5 ? -1.0 : 1.0;

    for (int i = -4; i <= 4; i++) {
        vec2 sampleUV = uv + vec2(float(i) * texelSize.x, 0.0);
        sampleUV.x = clamp(sampleUV.x, 0.0, 1.0);
        float encoded = texture2D(u_signalTexture, sampleUV).r;
        float sig = encoded * (255.0 / 170.0) - 0.4;

        float sampleX = pixelX + float(i);
        float phase = sampleX * PHASE_INC;
        uSum += sig * sin(phase);
        vSum += sig * cos(phase) * palSign;
    }

    float U = uSum / 4.5;  // 9 samples, ×2 from demodulation
    float V = vSum / 4.5;

    // YUV → RGB (PAL standard matrix)
    float R = Y + 1.140 * V;
    float G = Y - 0.396 * U - 0.581 * V;
    float B = Y + 2.029 * U;

    gl_FragColor = vec4(clamp(vec3(R, G, B), 0.0, 1.0), 1.0);
}
