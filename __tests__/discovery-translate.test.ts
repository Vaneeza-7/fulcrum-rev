import { describe, expect, it } from 'vitest'
import { translateCurrentQueryToInstantlyFilter } from '@/lib/discovery/translate-query'

describe('translateCurrentQueryToInstantlyFilter', () => {
  it('maps the current search query shape into Instantly preview filters', () => {
    const result = translateCurrentQueryToInstantlyFilter({
      queryName: 'District Leaders',
      searchQuery: {
        keywords: 'superintendent OR director',
        industry: 'Education',
        companySize: '201-1000',
        additionalKeywords: 'student wellness',
      },
      maxResults: 25,
    })

    expect(result).toEqual({
      query: 'superintendent OR director student wellness',
      filters: {
        industry: 'Education',
        company_size_min: 201,
        company_size_max: 1000,
      },
      limit: 25,
    })
  })

  it('leaves optional filters out when they are not present', () => {
    const result = translateCurrentQueryToInstantlyFilter({
      queryName: 'Founders',
      searchQuery: {
        keywords: 'founder',
      },
      maxResults: 10,
    })

    expect(result).toEqual({
      query: 'founder',
      filters: {},
      limit: 10,
    })
  })
})
