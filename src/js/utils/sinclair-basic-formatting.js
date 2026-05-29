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

    // REM swallows the whole BASIC line as a comment — ignore any FOR/NEXT
    // that appear inside it.
    const isRem = /^REM\b/.test(upper);
    const forCount = isRem ? 0 : (upper.match(/\bFOR\b/g) || []).length;
    const nextCount = isRem ? 0 : (upper.match(/\bNEXT\b/g) || []).length;

    // If the line closes more loops than it opens, drop the indent first so
    // the line itself sits at the outer level (matters when NEXT appears
    // after a colon, e.g. "LET d(i)=...: NEXT i").
    if (nextCount > forCount) {
      indent = Math.max(0, indent - (nextCount - forCount));
    }
    formatted.push(`${line.lineNumber} ${"  ".repeat(indent)}${body}`);
    if (forCount > nextCount) {
      indent += forCount - nextCount;
    }
  }

  return formatted.join("\n");
}
