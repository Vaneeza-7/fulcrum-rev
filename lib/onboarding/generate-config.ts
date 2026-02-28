import { askClaudeJson } from '@/lib/ai/claude'

export interface ICPContext {
  companyName: string
  websiteUrl?: string | null
  industry?: string | null
  companySize?: string | null
  productDescription?: string | null
  problemsSolved?: string | null
  valueProposition?: string | null
  targetIndustries: string[]
  targetCompanySizes: string[]
  targetRoles: string[]
  targetGeography: string[]
  painPoints?: string | null
  buyingSignals?: string | null
  searchKeywords?: string | null
  competitors: Array<{ name: string; websiteUrl?: string | null; differentiator?: string | null }>
  competitorDifferentiation?: string | null
  whyChooseUs?: string | null
}

export interface GeneratedSearchQuery {
  queryName: string
  searchQuery: {
    keywords: string
    industry?: string
    companySize?: string
    additionalKeywords?: string
  }
  maxResults: number
}

export interface GeneratedIntentKeyword {
  keyword: string
  intentScore: number
  category: string
}

export interface GeneratedScoringConfig {
  company_size: Array<{ min: number; max: number; points: number }>
  industry_fit: Array<{ match: string; points: number }>
  role_authority: Array<{ pattern: string; points: number }>
  revenue_signals: Array<{ signal: string; points: number }>
}

export interface GeneratedConfig {
  searchQueries: GeneratedSearchQuery[]
  intentKeywords: GeneratedIntentKeyword[]
  scoringConfig: GeneratedScoringConfig
}

const SYSTEM_PROMPT = `You are an expert B2B lead generation strategist. Given a company's profile, ideal customer description, and competitive positioning, generate a precise lead research configuration.

You MUST return a JSON object with exactly this structure:

{
  "searchQueries": [
    {
      "queryName": "descriptive name for this search",
      "searchQuery": {
        "keywords": "LinkedIn search keywords (job titles, boolean operators OK)",
        "industry": "target industry for this search",
        "companySize": "employee range like 1-50 or 51-200 or 201-500 or 501-1000 or 1001-5000",
        "additionalKeywords": "extra qualifying terms"
      },
      "maxResults": 10
    }
  ],
  "intentKeywords": [
    {
      "keyword": "phrase that signals buying intent",
      "intentScore": 8,
      "category": "category name"
    }
  ],
  "scoringConfig": {
    "company_size": [
      { "min": 11, "max": 200, "points": 10 },
      { "min": 201, "max": 500, "points": 7 },
      { "min": 1, "max": 10, "points": 3 }
    ],
    "industry_fit": [
      { "match": "perfect", "points": 8 },
      { "match": "adjacent", "points": 5 },
      { "match": "neutral", "points": 3 }
    ],
    "role_authority": [
      { "pattern": "c_level", "points": 15 },
      { "pattern": "vp_director", "points": 12 },
      { "pattern": "manager", "points": 7 },
      { "pattern": "ic", "points": 3 }
    ],
    "revenue_signals": [
      { "signal": "signal_name", "points": 7 }
    ]
  }
}

Rules:
1. Generate 3-5 search queries that would find the company's ideal prospects on LinkedIn.
2. Generate 8-12 intent keywords — phrases that indicate someone is actively looking for a solution like this company offers. Score each 1-10 (10 = strongest buying signal).
3. For scoring config:
   - company_size: 3 tiers mapping to point values based on which company sizes are ideal
   - industry_fit: always use "perfect" (8pts), "adjacent" (5pts), "neutral" (3pts)
   - role_authority: always use c_level (15), vp_director (12), manager (7), ic (3) — adjust points based on which roles matter most
   - revenue_signals: 3-5 signals relevant to this company's market (funding, hiring, budget season, etc.)
4. Make keywords specific to the company's market, NOT generic. Reference actual pain points, tools, and industry terms.
5. Use competitor names in intent keywords where relevant (e.g., "switching from [competitor]").`

export async function generateConfig(context: ICPContext): Promise<GeneratedConfig> {
  const userMessage = `
## Company Profile
- Name: ${context.companyName}
- Website: ${context.websiteUrl ?? 'Not provided'}
- Industry: ${context.industry ?? 'Not specified'}
- Company Size: ${context.companySize ?? 'Not specified'}
- Product/Service: ${context.productDescription ?? 'Not provided'}
- Problems Solved: ${context.problemsSolved ?? 'Not provided'}
- Value Proposition: ${context.valueProposition ?? 'Not provided'}

## Ideal Customer Profile
- Target Industries: ${context.targetIndustries.join(', ') || 'Not specified'}
- Target Company Sizes: ${context.targetCompanySizes.join(', ') || 'Not specified'}
- Decision Makers: ${context.targetRoles.join(', ') || 'Not specified'}
- Target Geography: ${context.targetGeography.join(', ') || 'Not specified'}
- Customer Pain Points: ${context.painPoints ?? 'Not provided'}
- Buying Signals: ${context.buyingSignals ?? 'Not provided'}
- Search Keywords: ${context.searchKeywords ?? 'Not provided'}

## Competitors
${context.competitors.length > 0
    ? context.competitors.map(c => `- ${c.name}${c.websiteUrl ? ` (${c.websiteUrl})` : ''}${c.differentiator ? `: ${c.differentiator}` : ''}`).join('\n')
    : 'No competitors listed'}

## Positioning
- General Differentiator: ${context.competitorDifferentiation ?? 'Not provided'}
- Why Customers Choose Them: ${context.whyChooseUs ?? 'Not provided'}

Generate a lead research configuration optimized for finding prospects who are most likely to become paying customers of ${context.companyName}.`

  return askClaudeJson<GeneratedConfig>(SYSTEM_PROMPT, userMessage, {
    maxTokens: 4096,
  })
}
