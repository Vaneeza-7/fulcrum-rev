/**
 * IndexNow client for rapid search engine re-indexing.
 * Notifies Bing, Yandex, and other IndexNow-supporting engines.
 */

const INDEXNOW_ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
];

/**
 * Submit a single URL for re-indexing via IndexNow.
 */
export async function submitUrl(
  url: string,
  apiKey: string,
  keyLocation?: string
): Promise<{ success: boolean; message: string }> {
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;

  const params = new URLSearchParams({
    url,
    key: apiKey,
    ...(keyLocation ? { keyLocation } : {}),
  });

  // Try the first endpoint; fall back to second
  for (const endpoint of INDEXNOW_ENDPOINTS) {
    try {
      const res = await fetch(`${endpoint}?${params.toString()}`, { method: 'GET' });
      if (res.ok || res.status === 202) {
        return { success: true, message: `IndexNow submitted: ${url} via ${host}` };
      }
    } catch {
      // Try next endpoint
    }
  }

  return { success: false, message: `IndexNow submission failed for ${url}` };
}

/**
 * Submit a batch of URLs for re-indexing via IndexNow.
 * Uses the batch API endpoint (POST with JSON body).
 */
export async function submitBatch(
  urls: string[],
  apiKey: string,
  host: string
): Promise<{ success: boolean; submitted: number; message: string }> {
  if (urls.length === 0) {
    return { success: true, submitted: 0, message: 'No URLs to submit' };
  }

  const body = {
    host,
    key: apiKey,
    keyLocation: `https://${host}/${apiKey}.txt`,
    urlList: urls.slice(0, 10000), // IndexNow batch limit
  };

  for (const endpoint of INDEXNOW_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      });

      if (res.ok || res.status === 202) {
        return {
          success: true,
          submitted: urls.length,
          message: `IndexNow batch submitted: ${urls.length} URLs`,
        };
      }
    } catch {
      // Try next endpoint
    }
  }

  return { success: false, submitted: 0, message: 'IndexNow batch submission failed' };
}
