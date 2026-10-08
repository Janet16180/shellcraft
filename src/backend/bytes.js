/**
 * Text measured as Linux measures files: in UTF-8 bytes.
 */

/**
 * @param {string} text Any text.
 * @returns {number} Its length in UTF-8 bytes.
 */
export function byteLength(text) {
  let bytes = text.length;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    // One UTF-16 unit takes 1 to 3 bytes; the two units of a surrogate pair take 2 each.
    if (unit >= 0x80) bytes++;
    if (unit >= 0x800 && (unit < 0xd800 || unit > 0xdfff)) bytes++;
  }
  return bytes;
}
