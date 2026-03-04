import type { LeadDiscoveryQuery } from './provider'

const TITLE_HINTS = [
  'ceo',
  'founder',
  'cto',
  'chief',
  'head',
  'lead',
  'director',
  'vice president',
  'vp',
  'manager',
  'officer',
  'engineer',
  'developer',
  'superintendent',
]

function normalizeBooleanTokens(input: string) {
  return input
    .replace(/[()"]/g, ' ')
    .split(/\b(?:OR|AND)\b/gi)
    .map((value) => value.trim())
    .filter(Boolean)
}

function splitInstantlyKeywordBuckets(keywords: string) {
  const tokens = normalizeBooleanTokens(keywords)
  const title: string[] = []

  for (const token of tokens) {
    const normalized = token.toLowerCase()
    if (TITLE_HINTS.some((hint) => normalized.includes(hint)) && !title.includes(token)) {
      title.push(token)
    }
  }

  if (title.length === 0 && tokens.length > 0) {
    title.push(tokens[0])
  }

  return { title }
}

export function translateCurrentQueryToInstantlyFilter(query: LeadDiscoveryQuery) {
  const buckets = splitInstantlyKeywordBuckets(query.searchQuery.keywords)

  return {
    search_filters: {
      ...(buckets.title.length > 0
        ? {
            title: {
              include: buckets.title,
            },
          }
        : {}),
      // Instantly's non-title filters use provider-specific enums and matching
      // semantics that do not align cleanly with our free-text onboarding
      // schema. For launch, we bias toward recall by translating only role/title
      // intent here and letting scoring plus human review narrow the results.
    },
    limit: query.maxResults,
  }
}
