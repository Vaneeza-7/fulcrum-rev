import OpenAI from 'openai';

const globalForPerplexity = globalThis as unknown as { perplexity: OpenAI | undefined };

export const perplexity = globalForPerplexity.perplexity ?? new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai',
});

if (process.env.NODE_ENV !== 'production') {
  globalForPerplexity.perplexity = perplexity;
}

/**
 * Search the web via Perplexity for real-time data.
 * Returns factual, cited information about companies, funding, news.
 */
export async function searchWeb(query: string): Promise<string> {
  const response = await perplexity.chat.completions.create({
    model: 'sonar',
    messages: [
      {
        role: 'system',
        content: 'You are a research assistant. Provide factual, concise information with specific data points (funding amounts, employee counts, dates). Focus on B2B company intelligence.',
      },
      {
        role: 'user',
        content: query,
      },
    ],
  });

  return response.choices[0]?.message?.content ?? '';
}

/**
 * Research a company for lead enrichment.
 * Queries Perplexity for funding, size, tech stack, news.
 */
export async function researchCompany(
  companyName: string,
  personName: string,
  personTitle: string
): Promise<{
  raw: string;
  fundingInfo: string;
  companySize: string;
  recentNews: string;
}> {
  const queries = [
    `${companyName} funding rounds investors valuation 2024 2025 2026`,
    `${companyName} company size employees revenue industry`,
    `${companyName} ${personName} ${personTitle} recent news announcements`,
  ];

  const results = await Promise.all(queries.map(searchWeb));

  return {
    raw: results.join('\n\n---\n\n'),
    fundingInfo: results[0],
    companySize: results[1],
    recentNews: results[2],
  };
}
