import { z } from 'zod';
import type { CustomToolEntry } from '../../types';
import { firecrawlPost, selfHostedBase } from './client';

// Under the 120 s idle limit of a self-hosted call, so Firecrawl's own timeout answers
// first and names the cause.
const TIMEOUT_MS = 90_000;

const NO_MODEL_HINT =
  'Extraction needs a model provider on the Firecrawl server (OPENAI_API_KEY, OPENAI_BASE_URL, MODEL_NAME); its log has the cause.';

// Extracts structured data from pages through the Firecrawl API: a prompt says what to
// pull out, an optional JSON schema fixes the shape of the result. Each URL is one
// scrape with a JSON format, the replacement Firecrawl names for its /extract endpoint,
// so every page gets its own result and one failed page does not lose the others.
export const firecrawlExtract: CustomToolEntry = {
  key: 'firecrawl_extract',
  label: 'Firecrawl Extract',
  description:
    'Extract structured data from web pages (via the Firecrawl API). Give the page URLs and a prompt describing what to pull out; pass a JSON schema to fix the output shape. Returns one result per page. It reads only the pages given: to cover a site, find its pages with Firecrawl Map first.',
  inputSchema: z.object({
    urls: z
      .array(
        z
          .string()
          .url()
          .refine(
            (url) => !url.endsWith('/*'),
            'Give page URLs. Find the pages of a site with Firecrawl Map.',
          ),
      )
      .min(1)
      .max(10)
      .describe('The pages to extract from.'),
    prompt: z.string().min(1).max(10000).describe('What to extract from each page.'),
    schema: z
      .record(z.string(), z.any())
      .optional()
      .describe('Optional JSON schema for the output shape.'),
  }),
  execute: async (credential, input) => {
    const format = {
      type: 'json',
      prompt: String(input.prompt),
      ...(input.schema ? { schema: input.schema } : {}),
    };
    const results = await Promise.all(
      (input.urls as string[]).map(async (url) => {
        try {
          const res = (await firecrawlPost(
            credential,
            'scrape',
            // A scrape reads only the main content unless told; extraction needs the whole page.
            { url, formats: [format], onlyMainContent: false, timeout: TIMEOUT_MS },
            'Firecrawl extract',
          )) as { data?: { json?: unknown }; warning?: string };
          return {
            url,
            data: res.data?.json ?? null,
            ...(res.warning ? { warning: res.warning } : {}),
          };
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          // A self-hosted server without a model answers 500 and names no cause.
          const noModel = selfHostedBase(credential) !== '' && error.includes('failed (500)');
          return { url, error: noModel ? `${error} ${NO_MODEL_HINT}` : error };
        }
      }),
    );
    // Nothing worked, so the cause is the server or the credential, not a page.
    const failed = results.filter((r) => 'error' in r);
    if (failed.length === results.length) throw new Error(String(failed[0]!.error));
    return { results };
  },
};
