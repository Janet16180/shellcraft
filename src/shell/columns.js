/**
 * GNU ls's column layout for a terminal (coreutils ls.c: calculate_columns,
 * print_many_per_line, indent): names go down the columns, every column but
 * the last is two wider than its longest name, and the gaps are filled with
 * tabs (every 8 columns) where a tab fits, then spaces.
 */

const MIN_COLUMN_WIDTH = 3;
const TAB = 8;

function bestLayout(widths, lineLength) {
  const n = widths.length;
  const maxIdx = Math.floor(lineLength / MIN_COLUMN_WIDTH) + (lineLength % MIN_COLUMN_WIDTH !== 0 ? 1 : 0);
  const maxCols = maxIdx > 0 && maxIdx < n ? maxIdx : n;
  const info = Array.from({ length: maxCols }, (_, i) => ({ valid: true, lineLen: (i + 1) * MIN_COLUMN_WIDTH, cols: new Array(i + 1).fill(MIN_COLUMN_WIDTH) }));
  widths.forEach((width, f) => {
    info.forEach((col, i) => {
      if (!col.valid) return;
      const idx = Math.floor(f / Math.floor((n + i) / (i + 1)));
      const real = width + (idx === i ? 0 : 2);
      if (col.cols[idx] >= real) return;
      col.lineLen += real - col.cols[idx];
      col.cols[idx] = real;
      col.valid = col.lineLen < lineLength;
    });
  });
  let cols = maxCols;
  while (cols > 1 && !info[cols - 1].valid) cols--;
  return { cols, widths: info[cols - 1].cols };
}

function indent(from, to) {
  let pad = '';
  let pos = from;
  while (pos < to) {
    const tab = Math.floor(to / TAB) > Math.floor((pos + 1) / TAB);
    pad += tab ? '\t' : ' ';
    pos += tab ? TAB - (pos % TAB) : 1;
  }
  return pad;
}

/**
 * Lay names out in columns.
 *
 * @param {{text: string, width: number, html?: string}[]} items The names as printed, with their display widths.
 * @param {number} lineLength The terminal width.
 * @param {'text'|'html'} [field] Which form of each name to emit; html falls back to the text.
 * @returns {string} The lines, each ending in a newline ('' for no items).
 */
export function layoutColumns(items, lineLength, field = 'text') {
  if (!items.length) return '';
  const { cols, widths } = bestLayout(items.map(i => i.width), lineLength);
  const rows = Math.ceil(items.length / cols);
  let out = '';
  for (let row = 0; row < rows; row++) {
    let pos = 0;
    let line = '';
    for (let col = 0, f = row; f < items.length; col++, f += rows) {
      line += items[f][field] ?? items[f].text;
      if (f + rows < items.length) line += indent(pos + items[f].width, pos + widths[col]);
      pos += widths[col];
    }
    out += `${line}\n`;
  }
  return out;
}
