'use strict';

// Remote command output is decoded as UTF-8. Anything that cannot be shown as-is —
// invalid byte sequences, C0/C1 control characters and DEL — is escaped as \xNN so
// filenames stay unambiguous instead of turning into U+FFFD noise.
// Valid UTF-8 (e.g. Chinese names) is kept untouched.

function hexEscape(byte) {
  return `\\x${byte.toString(16).padStart(2, '0')}`;
}

function sequenceLength(byte) {
  if (byte >= 0xc2 && byte <= 0xdf) return 2;
  if (byte >= 0xe0 && byte <= 0xef) return 3;
  if (byte >= 0xf0 && byte <= 0xf4) return 4;
  return 0;
}

function decodeUtf8WithEscapes(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input == null ? '' : input), 'utf8');
  let out = '';
  let index = 0;
  while (index < buf.length) {
    const byte = buf[index];
    if (byte < 0x80) {
      // Keep the separators that carry the output structure (LF / TAB); escape the
      // rest of the control characters so they cannot hide inside a name.
      const keep = (byte >= 0x20 && byte !== 0x7f) || byte === 0x0a || byte === 0x09;
      out += keep ? String.fromCharCode(byte) : hexEscape(byte);
      index += 1;
      continue;
    }
    const size = sequenceLength(byte);
    if (size && index + size <= buf.length) {
      const decoded = buf.subarray(index, index + size).toString('utf8');
      if (decoded.indexOf('\ufffd') < 0) {
        out += decoded;
        index += size;
        continue;
      }
    }
    out += hexEscape(byte);
    index += 1;
  }
  return out;
}

module.exports = { decodeUtf8WithEscapes };
