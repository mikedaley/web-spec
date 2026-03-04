/*
 * sinclair-basic-formatting.js - Shared BASIC text parsing and formatting
 *
 * Pure functions for parsing numbered BASIC lines and applying
 * FOR/NEXT indentation. Used by BasicProgramWindow and UDGEditorWindow.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * Parse raw BASIC text into an array of { lineNumber, body } objects.
 * Skips blank lines and lines without a leading line number.
 * @param {string} text
 * @returns {{ lineNumber: number, body: string }[]}
 */
export function parseBasicLines(text) {
  const lines = [];
  for (const rawLine of text.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\d+)\s*(.*)/);
    if (match) {
      lines.push({ lineNumber: parseInt(match[1], 10), body: match[2] });
    }
  }
  return lines;
}

/**
 * Sort numbered BASIC lines and apply FOR/NEXT indentation.
 * Returns the formatted text string.
 * @param {string} text - Raw BASIC program text
 * @returns {string} Formatted text, or the original text if no numbered lines found
 */
export function formatBasicText(text) {
  const lines = parseBasicLines(text);
  if (lines.length === 0) return text;

  lines.sort((a, b) => a.lineNumber - b.lineNumber);

  let indent = 0;
  const formatted = [];
  for (const line of lines) {
    const body = line.body.replace(/^\s+/, "");
    const upper = body.toUpperCase();
    if (!/^REM\b/.test(upper) && /^NEXT\b/.test(upper)) {
      indent = Math.max(0, indent - 1);
    }
    formatted.push(`${line.lineNumber} ${"  ".repeat(indent)}${body}`);
    if (!/^REM\b/.test(upper) && /\bFOR\b/.test(upper) && !/\bNEXT\b/.test(upper)) {
      indent++;
    }
  }

  return formatted.join("\n");
}
