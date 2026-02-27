/*
 * sinclair-basic-rules.js - ZX Spectrum BASIC syntax rules for the editor
 *
 * Defines validation rules, naming constraints, operator precedence, and
 * language semantics for ZX Spectrum 48K and 128K BASIC. Used by the BASIC
 * editor for syntax checking and autocompletion guidance.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// ---------------------------------------------------------------------------
// Variable naming rules
// ---------------------------------------------------------------------------

export const VARIABLE_RULES = {
  numeric: {
    description: 'Numeric variables',
    minNameLength: 1,
    maxNameLength: Infinity,
    startPattern: /^[a-zA-Z]/,
    continuePattern: /^[a-zA-Z0-9 ]+$/,
    caseInsensitive: true,
    spacesIgnored: true,
    notes: 'Arbitrary length; must start with a letter, continue with letters/digits; spaces are ignored; case-insensitive internally',
  },

  forLoopControl: {
    description: 'FOR loop control variables',
    minNameLength: 1,
    maxNameLength: 1,
    startPattern: /^[a-zA-Z]$/,
    continuePattern: null,
    caseInsensitive: true,
    spacesIgnored: false,
    notes: 'Single letter only',
  },

  numericArray: {
    description: 'Numeric arrays',
    minNameLength: 1,
    maxNameLength: 1,
    startPattern: /^[a-zA-Z]$/,
    continuePattern: null,
    caseInsensitive: true,
    spacesIgnored: false,
    canShareNameWithSimple: true,
    notes: 'Single letter only; can share name with a simple numeric variable',
  },

  string: {
    description: 'String variables',
    minNameLength: 1,
    maxNameLength: 1,
    suffix: '$',
    startPattern: /^[a-zA-Z]$/,
    continuePattern: null,
    caseInsensitive: true,
    spacesIgnored: false,
    notes: 'Single letter + $',
  },

  stringArray: {
    description: 'String arrays',
    minNameLength: 1,
    maxNameLength: 1,
    suffix: '$',
    startPattern: /^[a-zA-Z]$/,
    continuePattern: null,
    caseInsensitive: true,
    spacesIgnored: false,
    canShareNameWithSimple: false,
    notes: 'Single letter + $; cannot share name with a simple string variable',
  },
};

// ---------------------------------------------------------------------------
// DEF FN rules
// ---------------------------------------------------------------------------

export const DEF_FN_RULES = {
  functionName: {
    maxNameLength: 1,
    pattern: /^[a-zA-Z]$/,
    allowStringSuffix: true,
    notes: 'Function name is a single letter (or single letter + $ for string functions)',
  },

  parameter: {
    maxNameLength: 1,
    pattern: /^[a-zA-Z]$/,
    allowStringSuffix: true,
    notes: 'Each parameter is a single letter (or letter + $ for string params)',
  },

  emptyArgsRequireBrackets: true,
  notes: 'DEF FN l(l1,...lk)=e — empty args still require brackets: DEF FN f()=expression',
};

// ---------------------------------------------------------------------------
// Operator precedence (higher number = binds tighter)
// ---------------------------------------------------------------------------

export const OPERATOR_PRECEDENCE = [
  { precedence: 12, operators: ['subscript', 'slice'], description: 'Subscripting and slicing' },
  { precedence: 11, operators: ['FN', 'SIN', 'COS', 'TAN', 'ASN', 'ACS', 'ATN', 'LN', 'EXP', 'INT', 'SQR', 'SGN', 'ABS', 'PEEK', 'IN', 'USR', 'STR$', 'CHR$', 'CODE', 'VAL', 'VAL$', 'LEN', 'BIN', 'SCREEN$', 'ATTR', 'POINT', 'PI', 'RND', 'INKEY$'], description: 'All functions except NOT and unary minus' },
  { precedence: 10, operators: ['^'], description: 'Exponentiation' },
  { precedence:  9, operators: ['unary-'], description: 'Unary minus' },
  { precedence:  8, operators: ['*', '/'], description: 'Multiplication and division' },
  { precedence:  6, operators: ['+', '-'], description: 'Addition and subtraction' },
  { precedence:  5, operators: ['=', '>', '<', '<=', '>=', '<>'], description: 'Comparison operators' },
  { precedence:  4, operators: ['NOT'], description: 'Logical NOT' },
  { precedence:  3, operators: ['AND'], description: 'Logical AND' },
  { precedence:  1, operators: ['OR'], description: 'Logical OR' },
];

// ---------------------------------------------------------------------------
// AND / OR semantics (non-standard boolean behaviour)
// ---------------------------------------------------------------------------

export const LOGICAL_SEMANTICS = {
  AND: {
    numeric: 'a AND b → a if b ≠ 0, 0 if b = 0',
    string:  'a$ AND b → a$ if b ≠ 0, "" if b = 0',
    notes: 'AND is not standard boolean; the left operand passes through when the right operand is truthy',
  },

  OR: {
    numeric: 'a OR b → 1 if b ≠ 0, a if b = 0',
    string:  null,
    notes: 'OR is not standard boolean; returns 1 when right operand is truthy, else returns left operand',
  },
};

// ---------------------------------------------------------------------------
// String slicing rules
// ---------------------------------------------------------------------------

export const STRING_SLICING = {
  indexBase: 1,
  forms: [
    { syntax: 'a$(m TO n)', description: 'Substring from position m to position n (1-based, inclusive)' },
    { syntax: 'a$(m TO)',   description: 'From position m to end of string' },
    { syntax: 'a$(TO n)',   description: 'From start of string to position n' },
    { syntax: 'a$(n)',      description: 'Single character at position n' },
  ],
  notes: 'Indices are 1-based; both endpoints are inclusive',
};

// ---------------------------------------------------------------------------
// General language rules
// ---------------------------------------------------------------------------

export const GENERAL_RULES = {
  letMandatory: {
    value: true,
    notes: 'LET is mandatory — cannot omit unlike most BASICs',
  },

  ifThenBehaviour: {
    lineNumberTarget: false,
    notes: 'IF x THEN s — s is all statements to end of line; IF x THEN linenumber is NOT allowed',
  },

  statementSeparator: {
    character: ':',
    notes: 'Multiple statements per line separated by colon',
  },

  programOnlyCommands: {
    commands: ['INPUT', 'DEF FN', 'DATA'],
    notes: 'These commands can only be used in programs, not as direct commands',
  },

  remBehaviour: {
    consumesToEndOfLine: true,
    includesColons: true,
    notes: 'REM consumes everything to end of line including colons — no further statements on the same line',
  },

  numbers: {
    type: 'floating-point',
    accuracy: 9.5,
    accuracyUnit: 'significant digits',
    rangeMin: 4e-39,
    rangeMax: 1e38,
    smallIntegerOptimisation: true,
    notes: 'Floating point with ~9.5 digits accuracy; range ~4×10⁻³⁹ to ~10³⁸; small integers have a compact 2-byte internal representation',
  },

  lineNumbers: {
    min: 1,
    max: 9999,
    notes: 'Valid line numbers are 1 to 9999',
  },

  maxLineLength: {
    value: 255,
    unit: 'bytes',
    notes: 'Maximum tokenized line length (including line number and length header) is 255 bytes. The actual editable content limit depends on the tokenized size.',
  },
};

// ---------------------------------------------------------------------------
// Direct command restrictions
// ---------------------------------------------------------------------------

export const DIRECT_COMMAND_RESTRICTIONS = {
  forbidden: ['INPUT', 'DEF FN', 'DATA'],
  notes: 'These keywords cause an error when entered as direct commands (without a line number)',
};

// ---------------------------------------------------------------------------
// Convenience: validate a variable name against a rule set
// ---------------------------------------------------------------------------

/**
 * Validate a variable name against a specific variable rule.
 *
 * @param {string} name - The variable name (without $ suffix for string vars)
 * @param {string} ruleKey - One of the keys in VARIABLE_RULES
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateVariableName(name, ruleKey) {
  const rule = VARIABLE_RULES[ruleKey];
  if (!rule) {
    return { valid: false, error: `Unknown variable rule: ${ruleKey}` };
  }

  // Strip spaces if the rule says they are ignored
  const effective = rule.spacesIgnored ? name.replace(/ /g, '') : name;

  if (effective.length < rule.minNameLength) {
    return { valid: false, error: `Name must be at least ${rule.minNameLength} character(s)` };
  }

  if (effective.length > rule.maxNameLength) {
    return { valid: false, error: `Name must be at most ${rule.maxNameLength} character(s)` };
  }

  if (!rule.startPattern.test(effective[0])) {
    return { valid: false, error: 'Name must start with a letter' };
  }

  if (effective.length > 1 && rule.continuePattern && !rule.continuePattern.test(effective)) {
    return { valid: false, error: 'Name can only contain letters, digits, and spaces' };
  }

  return { valid: true };
}

/**
 * Validate a DEF FN function name.
 *
 * @param {string} name - The function name (without $ suffix)
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateFunctionName(name) {
  if (!DEF_FN_RULES.functionName.pattern.test(name)) {
    return { valid: false, error: 'Function name must be a single letter' };
  }
  return { valid: true };
}

/**
 * Look up the precedence of an operator.
 *
 * @param {string} op - The operator string (e.g. '+', 'AND', '^')
 * @returns {number|null} The precedence level, or null if not found
 */
export function getOperatorPrecedence(op) {
  for (const level of OPERATOR_PRECEDENCE) {
    if (level.operators.includes(op)) {
      return level.precedence;
    }
  }
  return null;
}
