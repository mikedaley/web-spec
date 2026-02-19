/*
 * sinclair-basic-highlighting.js - Syntax highlighting for Sinclair BASIC
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { KEYWORDS_BY_LENGTH, KEYWORD_TO_TOKEN, KEYWORD_TO_CATEGORY } from "./sinclair-basic-tokens.js";

/**
 * Highlight a single line of Sinclair BASIC text.
 * Returns an HTML string with <span> tags for syntax highlighting.
 */
export function highlightLine(text) {
  if (!text) return "";

  const parts = [];
  let i = 0;
  const len = text.length;

  // Check for line number at start
  let lineNumEnd = 0;
  while (lineNumEnd < len && text[lineNumEnd] >= "0" && text[lineNumEnd] <= "9") {
    lineNumEnd++;
  }
  if (lineNumEnd > 0) {
    parts.push(`<span class="bas-linenum">${escapeHtml(text.slice(0, lineNumEnd))}</span>`);
    i = lineNumEnd;
    // Skip whitespace after line number
    while (i < len && text[i] === " ") {
      parts.push(" ");
      i++;
    }
  }

  let inString = false;
  let inRem = false;

  while (i < len) {
    // REM comment - rest of line is comment
    if (inRem) {
      parts.push(`<span class="bas-rem">${escapeHtml(text.slice(i))}</span>`);
      break;
    }

    // String literal
    if (text[i] === '"') {
      if (inString) {
        parts.push(`"</span>`);
        inString = false;
        i++;
        continue;
      } else {
        parts.push(`<span class="bas-string">"`)
        inString = true;
        i++;
        continue;
      }
    }

    if (inString) {
      parts.push(escapeHtml(text[i]));
      i++;
      continue;
    }

    // Try keyword match (longest match first)
    let matched = false;
    const remaining = text.slice(i).toUpperCase();
    for (const kw of KEYWORDS_BY_LENGTH) {
      if (remaining.startsWith(kw)) {
        // Verify it's not part of a longer identifier
        const afterKw = i + kw.length;
        if (afterKw < len) {
          const nextChar = text[afterKw];
          // If keyword ends with letter and next char is letter/digit, skip
          if (/[A-Za-z]/.test(kw[kw.length - 1]) && /[A-Za-z0-9]/.test(nextChar)) {
            // Not a keyword boundary - skip this match
            continue;
          }
        }

        const cat = KEYWORD_TO_CATEGORY[kw] || "misc";
        parts.push(`<span class="bas-kw-${cat}">${escapeHtml(kw)}</span>`);
        i += kw.length;
        matched = true;

        if (kw === "REM") {
          inRem = true;
        }
        break;
      }
    }
    if (matched) continue;

    // Number
    if (text[i] >= "0" && text[i] <= "9") {
      let numEnd = i;
      let hasDot = false;
      while (numEnd < len) {
        if (text[numEnd] >= "0" && text[numEnd] <= "9") {
          numEnd++;
        } else if (text[numEnd] === "." && !hasDot) {
          hasDot = true;
          numEnd++;
        } else if ((text[numEnd] === "e" || text[numEnd] === "E") && numEnd > i) {
          numEnd++;
          if (numEnd < len && (text[numEnd] === "+" || text[numEnd] === "-")) numEnd++;
        } else {
          break;
        }
      }
      parts.push(`<span class="bas-number">${escapeHtml(text.slice(i, numEnd))}</span>`);
      i = numEnd;
      continue;
    }

    // Regular character
    parts.push(escapeHtml(text[i]));
    i++;
  }

  // Close unclosed string
  if (inString) {
    parts.push("</span>");
  }

  return parts.join("");
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
