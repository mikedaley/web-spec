/*
 * condition_evaluator.hpp - Expression evaluator for conditional breakpoints
 *
 * Evaluates expressions like "A > 5 && PEEK($5C00) == 42" against
 * the current Z80 CPU and memory state.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>
#include <string>

namespace zxspec {

class Machine;

namespace debug {

// Evaluate a condition expression against the current machine state.
// Returns true if the condition is satisfied, false otherwise.
// On parse error, returns false and sets the error string.
bool evaluateCondition(const Machine& machine, const std::string& expr, std::string& error);

// Evaluate an expression and return its integer value.
// On parse error, returns 0 and sets the error string.
int32_t evaluateExpression(const Machine& machine, const std::string& expr, std::string& error);

} // namespace debug
} // namespace zxspec
