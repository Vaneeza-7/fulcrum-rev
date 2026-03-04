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
      search_filters: {
        title: {
          include: ['superintendent', 'director'],
        },
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
      search_filters: {
        title: {
          include: ['founder'],
        },
      },
      limit: 10,
    })
  })

  it('splits boolean role queries into title filters only for launch recall', () => {
    const result = translateCurrentQueryToInstantlyFilter({
      queryName: 'Startup leaders',
      searchQuery: {
        keywords: 'CEO OR Founder AND (software OR development OR technical)',
        additionalKeywords: 'outsourcing help',
      },
      maxResults: 10,
    })

    expect(result).toEqual({
      search_filters: {
        title: {
          include: ['CEO', 'Founder'],
        },
      },
      limit: 10,
    })
  })
})
