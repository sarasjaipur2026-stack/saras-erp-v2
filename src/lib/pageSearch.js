export const normalizePageSearch = (value) => String(value)
  .trim()
  .slice(0, 100)
  .replace(/[^\p{L}\p{M}\p{N}\s@.+-]/gu, ' ')
