precision highp float;

uniform sampler2D u_currentTexture;
uniform sampler2D u_previousTexture;
uniform float u_burnInDecay;

varying vec2 v_texCoord;

void main() {
    // Flip Y when sampling current texture to match main rendering coords
    vec2 flippedCoord = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
    vec3 current = texture2D(u_currentTexture, flippedCoord).rgb;
    vec3 previous = texture2D(u_previousTexture, v_texCoord).rgb;

    // Decay the previous frame
    vec3 decayed = max(previous - vec3(u_burnInDecay), 0.0);

    // Take the maximum of current and decayed previous
    vec3 result = max(current, decayed);

    gl_FragColor = vec4(result, 1.0);
}
