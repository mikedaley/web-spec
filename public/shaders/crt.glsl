// Fragment shader with comprehensive CRT effects
// Adapted from web-a2e (inspired by cool-retro-term)

precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_burnInTexture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;
uniform float u_time;

// CRT effect uniforms
uniform float u_curvature;
uniform float u_scanlineIntensity;
uniform float u_scanlineWidth;
uniform float u_shadowMask;
uniform float u_glowIntensity;
uniform float u_glowSpread;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_vignette;
uniform float u_flicker;
uniform float u_rgbOffset;

// Analog effect uniforms
uniform float u_staticNoise;
uniform float u_jitter;
uniform float u_horizontalSync;
uniform float u_glowingLine;
uniform float u_ambientLight;
uniform float u_burnIn;
uniform float u_overscan;
uniform float u_noSignal;

// Bezel spill controls
uniform float u_bezelSpillReach;
uniform float u_bezelSpillIntensity;

// Corner radius for rounded screen corners
uniform float u_cornerRadius;

// Screen margin/padding for rounded corners
uniform float u_screenMargin;

// Background colour for pixels outside the curved screen area
uniform vec3 u_surroundColor;

varying vec2 v_texCoord;

const float PI = 3.14159265359;

// ============================================
// Utility functions
// ============================================

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float rgb2grey(vec3 v) {
    return dot(v, vec3(0.21, 0.72, 0.07));
}

// ============================================
// Screen overscan/border
// ============================================

vec2 applyOverscan(vec2 uv) {
    if (u_overscan > 0.999) return uv;

    // ZX Spectrum: 256x192 display centered in 320x256 framebuffer
    // Border is 32px on each side
    const vec2 borderUV = vec2(32.0 / 320.0, 32.0 / 256.0);

    // u_overscan 1.0 = full border, 0.0 = no border (display area only)
    vec2 margin = borderUV * (1.0 - u_overscan);

    return margin + uv * (1.0 - 2.0 * margin);
}

// ============================================
// Screen curvature (pincushion distortion)
// ============================================

vec2 curveUV(vec2 uv) {
    if (u_curvature < 0.001) return uv;

    vec2 cc = uv - 0.5;
    float dist = dot(cc, cc);
    float distortion = dist * u_curvature * 0.5;
    return uv + cc * distortion;
}

// ============================================
// Horizontal sync distortion
// ============================================

vec2 applyHorizontalSync(vec2 uv, float time) {
    if (u_horizontalSync < 0.001) return uv;

    float randVal = hash12(vec2(floor(time * 0.5), 0.0));
    if (randVal > u_horizontalSync) return uv;

    float distortionFreq = mix(4.0, 40.0, hash12(vec2(time * 0.1, 1.0)));
    float distortionScale = u_horizontalSync * 0.02 * randVal;
    float wave = sin((uv.y + time * 0.01) * distortionFreq);
    uv.x += wave * distortionScale;

    return uv;
}

// ============================================
// Jitter effect
// ============================================

vec2 applyJitter(vec2 uv, float time) {
    if (u_jitter < 0.001) return uv;

    vec2 noiseCoord = uv * 100.0 + vec2(time * 10.0, time * 7.0);
    vec2 offset = vec2(
        hash12(noiseCoord) - 0.5,
        hash12(noiseCoord + vec2(100.0, 0.0)) - 0.5
    );

    return uv + offset * u_jitter * 0.005;
}

// ============================================
// Static noise effect
// ============================================

float staticNoise(vec2 uv, float time) {
    if (u_staticNoise < 0.001) return 0.0;

    vec2 blockSize = vec2(1.0, 1.0);
    vec2 pixelCoord = floor(uv * u_textureSize / blockSize);

    vec2 noiseCoord = pixelCoord + vec2(
        floor(time * 30.0) * 17.0,
        floor(time * 30.0) * 31.0
    );

    float noise = hash12(noiseCoord);

    float scanBand = hash12(vec2(pixelCoord.y, floor(time * 15.0)));
    noise = mix(noise, scanBand, 0.3);

    vec2 cc = uv - 0.5;
    float dist = length(cc);
    float vignette = 1.0 - dist * 0.5;

    return noise * u_staticNoise * vignette;
}

// ============================================
// No signal TV static
// ============================================

vec3 noSignalStatic(vec2 uv, float time) {
    vec2 blockSize = vec2(1.0, 1.0);
    vec2 pixelCoord = floor(uv * u_textureSize / blockSize);

    float frameTime = floor(time * 50.0);
    vec2 noiseCoord = pixelCoord + vec2(frameTime * 17.0, frameTime * 31.0);

    float noise = hash12(noiseCoord);

    float bandNoise = hash12(vec2(pixelCoord.y * 0.1, frameTime * 0.5));
    float band = smoothstep(0.4, 0.7, bandNoise);
    noise = mix(noise * 0.7, noise * 1.2, band);

    float lineNoise = hash12(vec2(frameTime, 0.0));
    if (lineNoise > 0.95) {
        float lineY = hash12(vec2(frameTime, 1.0));
        float lineDist = abs(uv.y - lineY);
        if (lineDist < 0.02) {
            noise = mix(noise, 1.0, (0.02 - lineDist) / 0.02 * 0.5);
        }
    }

    float brightnessFlicker = 0.85 + hash12(vec2(frameTime * 0.1, 0.0)) * 0.3;
    noise *= brightnessFlicker;

    noise = clamp(noise, 0.0, 1.0) * 0.25;
    return vec3(noise);
}

// ============================================
// Flicker effect
// ============================================

float flicker(float time) {
    if (u_flicker < 0.001) return 1.0;

    float noiseVal = hash12(vec2(floor(time * 15.0), 0.0));
    return 1.0 + (noiseVal - 0.5) * u_flicker * 0.15;
}

// ============================================
// Glowing line effect (scanning beam)
// ============================================

float glowingLine(vec2 uv, float time) {
    if (u_glowingLine < 0.001) return 0.0;

    float beamPos = fract(time * 0.05);
    float dist = abs(uv.y - beamPos);
    float glow = smoothstep(0.1, 0.0, dist);

    return glow * u_glowingLine * 0.3;
}

// ============================================
// Ambient light effect
// ============================================

vec3 applyAmbientLight(vec3 color, vec2 uv) {
    if (u_ambientLight < 0.001) return color;

    vec2 cc = uv - 0.5;
    float dist = length(cc);
    float ambient = (1.0 - dist) * (1.0 - dist);

    return color + vec3(u_ambientLight * ambient * 0.15);
}

// ============================================
// Scanline effect
// ============================================

float scanlines(vec2 uv) {
    if (u_scanlineIntensity < 0.001) return 1.0;

    float scanline = sin(uv.y * u_textureSize.y * PI) * 0.5 + 0.5;
    scanline = pow(scanline, u_scanlineWidth * 2.0 + 0.5);
    return mix(1.0, scanline, u_scanlineIntensity);
}

// ============================================
// Shadow mask
// ============================================

vec3 shadowMask(vec2 uv) {
    if (u_shadowMask < 0.001) return vec3(1.0);

    vec2 pos = uv * u_resolution;
    int px = int(mod(pos.x, 3.0));

    vec3 mask;
    if (px == 0) {
        mask = vec3(1.0, 0.7, 0.7);
    } else if (px == 1) {
        mask = vec3(0.7, 1.0, 0.7);
    } else {
        mask = vec3(0.7, 0.7, 1.0);
    }

    return mix(vec3(1.0), mask, u_shadowMask);
}

// ============================================
// Vignette effect
// ============================================

float vignette(vec2 uv) {
    if (u_vignette < 0.001) return 1.0;

    vec2 center = uv - 0.5;
    float dist = length(center);
    float vig = 1.0 - dist * dist * u_vignette * 2.0;
    return clamp(vig, 0.0, 1.0);
}

// ============================================
// Phosphor glow / bloom effect
// ============================================

vec3 glow(sampler2D tex, vec2 uv) {
    if (u_glowIntensity < 0.001) return vec3(0.0);

    vec3 bloom = vec3(0.0);
    float spread = u_glowSpread * 0.01;

    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offset = vec2(float(x), float(y)) * spread;
            bloom += texture2D(tex, uv + offset).rgb;
        }
    }
    bloom /= 9.0;

    return bloom * u_glowIntensity;
}

// ============================================
// RGB chromatic aberration
// ============================================

vec3 rgbShift(sampler2D tex, vec2 uv) {
    if (u_rgbOffset < 0.001) return texture2D(tex, uv).rgb;

    vec2 dir = uv - 0.5;
    float offset = u_rgbOffset * 0.003;

    vec2 rOffset = dir * offset;
    vec2 bOffset = -dir * offset;

    float r = texture2D(tex, uv + rOffset).r;
    float g = texture2D(tex, uv).g;
    float b = texture2D(tex, uv + bOffset).b;

    return vec3(r, g, b);
}

// ============================================
// Color adjustment
// ============================================

vec3 adjustColor(vec3 color) {
    color *= u_brightness;
    color = (color - 0.5) * u_contrast + 0.5;
    float gray = rgb2grey(color);
    color = mix(vec3(gray), color, u_saturation);
    return color;
}

// ============================================
// Edge effects
// ============================================

float edgeFade(vec2 uv) {
    vec2 edge = smoothstep(0.0, 0.005, uv) * smoothstep(0.0, 0.005, 1.0 - uv);
    return mix(0.85, 1.0, edge.x * edge.y);
}

float smoothEdge(vec2 uv) {
    if (u_curvature < 0.001 && u_cornerRadius < 0.001) return 1.0;

    vec2 centered = uv - 0.5;
    float cornerRadius = u_cornerRadius > 0.001 ? u_cornerRadius : u_curvature * 0.03;
    vec2 cornerDist = abs(centered) - (0.5 - cornerRadius);
    cornerDist = max(cornerDist, 0.0);
    float corner = length(cornerDist) / cornerRadius;

    return 1.0 - smoothstep(0.9, 1.0, corner);
}

float roundedRectAlpha(vec2 uv, float radius) {
    if (radius < 0.001) return 1.0;

    vec2 centered = abs(uv - 0.5);
    vec2 cornerDist = centered - (0.5 - radius);

    if (cornerDist.x < 0.0 || cornerDist.y < 0.0) {
        return 1.0;
    }

    float dist = length(cornerDist);
    return 1.0 - smoothstep(radius - 0.005, radius + 0.005, dist);
}

vec2 applyScreenMargin(vec2 uv) {
    if (u_screenMargin < 0.001) return uv;

    vec2 centered = uv - 0.5;
    float scale = 1.0 / (1.0 - u_screenMargin * 2.0);
    return centered * scale + 0.5;
}

// ============================================
// Bezel shading (inner TV surround)
// ============================================

vec3 bezelShade(vec2 uv, vec2 curvedUV) {
    vec3 bezel = u_surroundColor;

    // Distance from screen centre (0 at centre, ~0.7 at corners)
    vec2 centered = uv - 0.5;
    float dist = length(centered);

    // 1. Inner shadow — darken where bezel meets the glass edge
    //    Uses distance from the [0,1] rect boundary
    vec2 edgeDist = min(uv, 1.0 - uv);           // 0 at edge, 0.5 at centre
    float innerShadow = smoothstep(0.0, 0.12, min(edgeDist.x, edgeDist.y));
    bezel *= mix(0.45, 1.0, innerShadow);

    // 2. Corner vignette — additional darkening in corners
    float cornerDark = 1.0 - dist * dist * 0.6;
    bezel *= clamp(cornerDark, 0.5, 1.0);

    // 3. Subtle warm-to-cool color shift toward edges (simulates age/wear)
    float edgeFactor = smoothstep(0.2, 0.7, dist);
    bezel = mix(bezel, bezel * vec3(0.92, 0.90, 0.88), edgeFactor * 0.5);

    // 4. Fine grain noise — breaks up flat color for a matte plastic feel
    vec2 grainCoord = uv * u_resolution * 0.5;
    float grain = hash12(grainCoord + vec2(floor(u_time * 0.5))) * 2.0 - 1.0;
    bezel += grain * 0.015;

    // 5. Thin highlight line at the inner lip (glass-to-bezel ridge)
    float lipDist = min(edgeDist.x, edgeDist.y);
    float lip = smoothstep(0.008, 0.004, lipDist) * smoothstep(0.0, 0.002, lipDist);
    bezel += vec3(lip * 0.2);

    // 6. Screen color spill — physically-motivated bezel reflection
    //
    //    The bezel is a raised wall around a recessed screen. Light from
    //    the screen hits the inner wall at an angle, so:
    //    - Points on the bezel near the screen see the edge pixels
    //    - Points further up the wall see pixels deeper INTO the screen
    //      (parallax: the wall looks down at the screen at a steeper angle)
    //    - The reflection is softer/more diffuse further from the screen

    // Distance from the screen content boundary in curved space
    vec2 screenDist = max(vec2(0.0) - curvedUV, curvedUV - vec2(1.0));
    screenDist = max(screenDist, 0.0);
    float distFromScreen = max(screenDist.x, screenDist.y);

    // Parallax offset: further from screen edge → sample deeper into screen
    // This simulates the viewing angle off the bezel wall
    float parallax = distFromScreen * 3.0;
    vec2 inwardDir = normalize(vec2(0.5) - curvedUV);
    vec2 sampleBase = clamp(curvedUV + inwardDir * parallax, 0.005, 0.995);

    // Blur neighbourhood — wider blur further from screen (more diffuse reflection)
    vec2 texelSize = 1.0 / u_textureSize;
    float blurScale = 3.0 + distFromScreen * 40.0;
    vec3 spill = vec3(0.0);
    for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
            vec2 sampleUV = sampleBase + vec2(float(x), float(y)) * texelSize * blurScale;
            sampleUV = clamp(sampleUV, 0.0, 1.0);
            spill += texture2D(u_texture, sampleUV).rgb;
        }
    }
    spill /= 25.0;

    // Apply the same brightness/contrast/saturation as the screen content
    spill = adjustColor(spill);

    // Scale spill by luminance — bright edges bleed more, dark edges don't
    float spillLuma = rgb2grey(spill);

    // Spill reach and intensity controlled by uniforms (0-1 range from sliders)
    float reach = u_bezelSpillReach * 0.1;
    float spillStrength = smoothstep(reach, 0.0, distFromScreen) * spillLuma * u_bezelSpillIntensity;
    bezel += spill * spillStrength;

    return clamp(bezel, 0.0, 1.0);
}

// ============================================
// Main fragment shader
// ============================================

void main() {
    vec2 uv = v_texCoord;

    // Stable screen boundary from undistorted coordinates
    vec2 stableCurvedUV = curveUV(uv);

    // Compute bezel color once (with shading effects applied)
    vec3 bezel = bezelShade(uv, stableCurvedUV);

    float cornerAlpha = roundedRectAlpha(stableCurvedUV, u_cornerRadius);
    if (cornerAlpha < 0.001) {
        gl_FragColor = vec4(bezel, 1.0);
        return;
    }

    float edgeFactor = smoothEdge(stableCurvedUV);
    if (edgeFactor < 0.001) {
        gl_FragColor = vec4(bezel, 1.0);
        return;
    }

    if (stableCurvedUV.x < 0.0 || stableCurvedUV.x > 1.0 || stableCurvedUV.y < 0.0 || stableCurvedUV.y > 1.0) {
        gl_FragColor = vec4(bezel, 1.0);
        return;
    }

    // Apply signal distortions
    vec2 distortedUV = applyHorizontalSync(uv, u_time);
    distortedUV = applyJitter(distortedUV, u_time);
    vec2 curvedUV = curveUV(distortedUV);

    // Content coordinates
    vec2 contentUV = applyOverscan(curvedUV);
    contentUV = applyScreenMargin(contentUV);

    vec3 darkBezelColor = vec3(0.0);
    bool inMargin = contentUV.x < 0.0 || contentUV.x > 1.0 || contentUV.y < 0.0 || contentUV.y > 1.0;

    // No signal mode
    if (u_noSignal > 0.5) {
        vec3 staticColor = noSignalStatic(curvedUV, u_time);
        staticColor *= scanlines(curvedUV);
        staticColor *= vignette(curvedUV);

        if (u_curvature > 0.001) {
            staticColor *= edgeFade(curvedUV);
        }

        float staticAlpha = cornerAlpha * edgeFactor;
        staticColor = mix(bezel, staticColor, staticAlpha);
        gl_FragColor = vec4(staticColor, 1.0);
        return;
    }

    // Get base color
    vec3 color;
    if (inMargin) {
        color = darkBezelColor;
    } else {
        color = rgbShift(u_texture, contentUV);
    }

    // Apply texture-based effects only for content area
    if (!inMargin) {
        // Apply burn-in from accumulation buffer
        if (u_burnIn > 0.001) {
            vec2 burnInCoord = vec2(contentUV.x, 1.0 - contentUV.y);
            vec3 burnInColor = texture2D(u_burnInTexture, burnInCoord).rgb;
            color = max(color, burnInColor * u_burnIn);
        }

        // Add phosphor glow
        color += glow(u_texture, contentUV);
    }

    // Apply scanlines
    color *= scanlines(curvedUV);

    // Apply shadow mask
    color *= shadowMask(curvedUV);

    // Apply color adjustments
    color = adjustColor(color);

    // Apply vignette
    color *= vignette(curvedUV);

    // Apply edge fade for curved screens
    if (u_curvature > 0.001) {
        color *= edgeFade(stableCurvedUV);
    }

    // Apply flicker
    color *= flicker(u_time);

    // Add glowing line
    color += vec3(glowingLine(curvedUV, u_time));

    // Add static noise
    color += vec3(staticNoise(curvedUV, u_time));

    // Apply ambient light
    color = applyAmbientLight(color, curvedUV);

    // Clamp final color
    color = clamp(color, 0.0, 1.0);

    float alpha = cornerAlpha * edgeFactor;

    // Blend screen content with bezel at curved edges
    color = mix(bezel, color, alpha);

    gl_FragColor = vec4(color, 1.0);
}
