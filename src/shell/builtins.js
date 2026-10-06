/**
 * Which simulated commands are bash builtins, and which of those have no
 * program in /usr/bin (echo, pwd, kill, true and false have both).
 */

export const BUILTINS = new Set(['cd', 'history', 'alias', 'export', 'exit', 'logout', 'type', 'echo', 'pwd', 'kill', 'true', 'false', 'help', 'unalias']);
export const NO_BINARY = new Set(['cd', 'history', 'alias', 'export', 'exit', 'logout', 'type', 'help', 'unalias']);
