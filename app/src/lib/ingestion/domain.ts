import type { PaperDomain } from '@/types/paper'

// Deepfake/face-manipulation signals. A hit here suggests 'deepfake', but is
// always subordinate to FORGERY_OVERRIDES (see classifyDomain) — the user
// wants forgery/localization crossover papers to stay on their default tab.
const DEEPFAKE_SIGNALS = [
  'deepfake',
  'face swap',
  'faceswap',
  'face forgery',
  'face manipulation',
  'face reenactment',
  'facial reenactment',
  'talking head',
  'lip sync',
  'lip-sync',
  'facial attribute editing',
  'synthetic face',
  'fake face',
  'face generation',
  'face x-ray',
] as const

// Forgery-core signals. Presence of any of these always wins, even against
// an explicit 'deepfake' hint — a "face forgery localization via splicing"
// paper belongs on the forgery tab because the technique transfers to
// document forgery, which is the user's actual focus.
const FORGERY_OVERRIDES = [
  'document',
  'passport',
  'id card',
  'identity document',
  'receipt',
  'splicing',
  'copy-move',
  'copy move',
  'inpainting',
  'image harmonization',
  'image tampering',
  'image forensics',
  'forgery localization',
  'tamper localization',
  'tampering localization',
  'manipulation localization',
  'text forgery',
  'text tampering',
] as const

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle))
}

export function classifyDomain(
  input: { title: string; abstract: string | null },
  hint?: PaperDomain,
): PaperDomain {
  if (hint === 'forgery') return 'forgery'

  const text = `${input.title} ${input.abstract ?? ''}`.toLowerCase()
  if (includesAny(text, FORGERY_OVERRIDES)) return 'forgery'

  if (hint === 'deepfake' || includesAny(text, DEEPFAKE_SIGNALS)) return 'deepfake'

  return 'forgery'
}
