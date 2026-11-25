/**
 * Sanitizes unsupported medical symbols for the report PDF font.
 * Applied to analysis texts before storage and before PDF generation
 * so the report never contains tofu boxes.
 */

/** Symbols not covered by the font, with safe replacements */
const CHAR_MAP: Record<string, string> = {
  '≈': ' approx. ',
  '∼': ' approx. ',
  '⁓': ' approx. ',
  '±': ' +/- ',
  '≥': ' or more',
  '≤': ' or less',
  '→': ' to ',
  '←': ' from ',
  '↑': ' elevated ',
  '↓': ' depressed ',
  'µ': 'micro',
  '‖': ' and ',
  '†': ' ',
  '‡': ' ',
  '″': ' inch ',
  '′': ' minute ',
  '⁺': '+',
  '⁻': '-',
  '²': '2',
  '³': '3',
  '⁴': '4',
}

/** Symbols removed entirely (no safe replacement) */
const STRIP_RE = /[\u2020\u2021\u2016\u2053]/g

export function sanitizeMedicalText(input: string): string {
  if (!input) return input
  let out = input
  for (const [bad, good] of Object.entries(CHAR_MAP)) {
    out = out.split(bad).join(good)
  }
  out = out.replace(STRIP_RE, ' ')
  // Collapse repeated spaces
  out = out.replace(/ {2,}/g, ' ').trim()
  return out
}
