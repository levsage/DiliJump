/** Formatting and sanitising helpers for UI text. */

export const formatNumber = (n) => Math.floor(n).toLocaleString('en-US');

export const formatDate = (timestamp) =>
  new Date(timestamp).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

/**
 * Normalise a user supplied player name:
 * trims, collapses whitespace, strips control / markup characters and
 * enforces the length limit. Returns '' when nothing valid remains.
 */
export const sanitizeName = (raw, maxLength = 16) =>
  String(raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();

/** Escape text for safe insertion into HTML templates. */
export const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
