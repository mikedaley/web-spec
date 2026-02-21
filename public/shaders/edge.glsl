// Edge overlay fragment shader
// Renders the screen edge highlight as a separate pass so it is
// completely unaffected by CRT effects (scanlines, shadow mask, etc.).

precision highp float;

uniform float u_curvatureX;
uniform float u_curvatureY;
uniform float u_cornerRadius;
uniform float u_edgeHighlight;
uniform vec2 u_textureSize;
uniform vec2 u_resolution;

varying vec2 v_texCoord;

// Screen curvature (must match crt.glsl)
vec2 curveUV(vec2 uv) {
    if (u_curvatureX < 0.001 && u_curvatureY < 0.001) return uv;

    vec2 cc = uv - 0.5;
    float dist = dot(cc, cc);
    vec2 distortion = dist * vec2(u_curvatureX, u_curvatureY) * 0.5;
    return uv + cc * distortion;
}

// Rounded rectangle alpha (must match crt.glsl)
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

float edgeHighlightIntensity(vec2 uv, float radius) {
    if (u_edgeHighlight < 0.001) return 0.0;

    vec2 centered = abs(uv - 0.5);
    vec2 cornerDist = centered - (0.5 - radius);

    float distFromEdge;
    vec2 gradDir;

    if (cornerDist.x > 0.0 && cornerDist.y > 0.0) {
        float d = length(cornerDist);
        distFromEdge = radius - d;
        gradDir = cornerDist / d;
    } else if (0.5 - centered.x < 0.5 - centered.y) {
        distFromEdge = 0.5 - centered.x;
        gradDir = vec2(1.0, 0.0);
    } else {
        distFromEdge = 0.5 - centered.y;
        gradDir = vec2(0.0, 1.0);
    }

    float uvPerPixel = length(gradDir / u_resolution);
    float lineWidth = 2.5 * uvPerPixel;
    float aa = 0.75 * uvPerPixel;

    float outer = smoothstep(-aa, aa, distFromEdge);
    float inner = smoothstep(lineWidth + aa, lineWidth - aa, distFromEdge);

    return outer * inner * u_edgeHighlight;
}

void main() {
    vec2 curvedUV = curveUV(v_texCoord);

    float cornerAlpha = roundedRectAlpha(curvedUV, u_cornerRadius);
    if (cornerAlpha < 0.001) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    float edgeGlow = edgeHighlightIntensity(curvedUV, u_cornerRadius);
    if (edgeGlow < 0.001) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    float lineAlpha = edgeGlow / u_edgeHighlight;
    vec3 highlightColor = vec3(0.55, 0.55, 0.5) * u_edgeHighlight;
    gl_FragColor = vec4(highlightColor, lineAlpha);
}
