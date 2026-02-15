import { GSCConnector } from './gsc-connector';
import { submitBatch as indexNowBatch, submitUrl as indexNowSubmit } from './indexnow-client';
import { GSCAuthConfig } from './types';

/**
 * Submit URLs for re-indexing across multiple channels:
 * 1. Google Search Console URL Inspection API
 * 2. IndexNow (Bing, Yandex, etc.)
 */

interface ReindexResult {
  url: string;
  gscSuccess: boolean;
  indexNowSuccess: boolean;
  message: string;
}

/**
 * Submit a single URL for re-indexing via all available channels.
 */
export async function submitForReindex(
  url: string,
  gscConfig: GSCAuthConfig | null,
  indexNowApiKey?: string
): Promise<ReindexResult> {
  let gscSuccess = false;
  let indexNowSuccess = false;
  const messages: string[] = [];

  // GSC URL Inspection
  if (gscConfig?.accessToken && gscConfig.siteUrl) {
    try {
      const gsc = new GSCConnector(gscConfig);
      const result = await gsc.submitForIndexing(url);
      gscSuccess = result.success;
      messages.push(`GSC: ${result.message}`);
    } catch (error) {
      messages.push(`GSC failed: ${error}`);
    }
  }

  // IndexNow
  if (indexNowApiKey) {
    try {
      const result = await indexNowSubmit(url, indexNowApiKey);
      indexNowSuccess = result.success;
      messages.push(`IndexNow: ${result.message}`);
    } catch (error) {
      messages.push(`IndexNow failed: ${error}`);
    }
  }

  return {
    url,
    gscSuccess,
    indexNowSuccess,
    message: messages.join(' | '),
  };
}

/**
 * Submit multiple URLs for re-indexing in batch.
 */
export async function submitBatchForReindex(
  urls: string[],
  gscConfig: GSCAuthConfig | null,
  indexNowApiKey?: string,
  host?: string
): Promise<{ submitted: number; results: ReindexResult[] }> {
  if (urls.length === 0) {
    return { submitted: 0, results: [] };
  }

  const results: ReindexResult[] = [];

  // GSC: submit each individually (no batch API for URL Inspection)
  if (gscConfig?.accessToken && gscConfig.siteUrl) {
    const gsc = new GSCConnector(gscConfig);
    for (const url of urls) {
      try {
        const result = await gsc.submitForIndexing(url);
        results.push({
          url,
          gscSuccess: result.success,
          indexNowSuccess: false,
          message: `GSC: ${result.message}`,
        });
      } catch (error) {
        results.push({
          url,
          gscSuccess: false,
          indexNowSuccess: false,
          message: `GSC failed: ${error}`,
        });
      }
    }
  }

  // IndexNow: batch submit
  if (indexNowApiKey && host) {
    try {
      const batchResult = await indexNowBatch(urls, indexNowApiKey, host);
      // Mark IndexNow success on all results
      for (const result of results) {
        result.indexNowSuccess = batchResult.success;
      }
      // Handle URLs that only went through IndexNow (no GSC)
      if (results.length === 0) {
        for (const url of urls) {
          results.push({
            url,
            gscSuccess: false,
            indexNowSuccess: batchResult.success,
            message: `IndexNow batch: ${batchResult.message}`,
          });
        }
      }
    } catch (error) {
      console.error('[ReindexSubmitter] IndexNow batch failed:', error);
    }
  }

  return {
    submitted: results.filter((r) => r.gscSuccess || r.indexNowSuccess).length,
    results,
  };
}
