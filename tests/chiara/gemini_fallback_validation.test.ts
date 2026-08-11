import { describe, expect, it } from 'vitest';
import dotenv from 'dotenv';

const runExternalValidation = process.env.RUN_GEMINI_FALLBACK_VALIDATION === 'true';

describe.skipIf(!runExternalValidation)('Gemini fallback validation', () => {
  it('returns a structured tool call for ambiguous booking language', async () => {
    dotenv.config({ path: '.env.local', override: true });
    process.env.OFFLINE_AI_TEST = '';

    expect(process.env.GOOGLE_GENERATIVE_AI_API_KEY).toBeTruthy();

    const { GeminiAIProvider } = await import('../../src/modules/ai/gemini_ai_provider');
    const provider = new GeminiAIProvider();
    const result = await provider.processTurn(
      null,
      [],
      'Vorrei fissare un appuntamento per domani pomeriggio.',
      [],
      'studio-aurora',
    );

    expect(result.toolCalls.length).toBeGreaterThan(0);
    expect(result.toolCalls.every(call => typeof call.name === 'string' && call.name.length > 0)).toBe(true);
  }, 30_000);
});
