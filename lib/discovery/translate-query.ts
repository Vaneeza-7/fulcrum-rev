import type { LeadDiscoveryQuery } from './provider'

function parseCompanySizeRange(companySize: string | undefined) {
  if (!companySize) return {}

  const match = companySize.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (!match) {
    const single = companySize.match(/^\d+$/)
    if (!single) return {}
    const exact = Number(single[0])
    return { company_size_min: exact, company_size_max: exact }
  }

  return {
    company_size_min: Number(match[1]),
    company_size_max: Number(match[2]),
  }
}

export function translateCurrentQueryToInstantlyFilter(query: LeadDiscoveryQuery) {
  const freeText = [
    query.searchQuery.keywords,
    query.searchQuery.additionalKeywords,
  ]
    .filter(Boolean)
    .join(' ')
    .trim()

  return {
    query: freeText,
    filters: {
      ...(query.searchQuery.industry?.trim()
        ? { industry: query.searchQuery.industry.trim() }
        : {}),
      ...parseCompanySizeRange(query.searchQuery.companySize),
    },
    limit: query.maxResults,
  }
}
