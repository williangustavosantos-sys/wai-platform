import * as fs from 'fs';
import * as path from 'path';
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

async function runBenchmark() {
    const { GeminiAIProvider } = await import('../../src/modules/ai/gemini_ai_provider');
    const provider = new GeminiAIProvider();
    const casesPath = path.join(__dirname, 'ai_validation_cases.json');
    const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

    const results = {
        total: cases.length,
        passed: 0,
        failed: 0,
        byCategory: {} as Record<string, { total: number, passed: number }>,
        failures: [] as any[]
    };

    console.log(`Starting benchmark for ${cases.length} cases...`);

    for (const c of cases) {
        if (!results.byCategory[c.category]) {
            results.byCategory[c.category] = { total: 0, passed: 0 };
        }
        results.byCategory[c.category].total++;

        // Delay to avoid rate limits
        await new Promise(r => setTimeout(r, 1000));

        try {
            const output = await provider.processTurn(
                null, // config
                [], // history
                c.input, // userText
                [], // availableTools
                'test-org' // organizationSlug
            );

            if (output.detectedIntent === c.expectedIntent) {
                results.passed++;
                results.byCategory[c.category].passed++;
                process.stdout.write('.');
            } else {
                results.failed++;
                results.failures.push({
                    case: c,
                    got: output.detectedIntent,
                    rawOutput: output
                });
                process.stdout.write('F');
            }
        } catch (e) {
            results.failed++;
            results.failures.push({
                case: c,
                error: e
            });
            process.stdout.write('E');
        }
    }

    console.log('\n\n--- Benchmark Results ---');
    console.log(`Total: ${results.total}`);
    console.log(`Passed: ${results.passed} (${((results.passed / results.total) * 100).toFixed(2)}%)`);
    console.log(`Failed: ${results.failed}`);
    console.log('\nBy Category:');
    for (const [cat, data] of Object.entries(results.byCategory)) {
        console.log(`- ${cat}: ${data.passed}/${data.total} (${((data.passed / data.total) * 100).toFixed(2)}%)`);
    }

    if (results.failures.length > 0) {
        console.log('\nFailures:');
        results.failures.slice(0, 5).forEach(f => {
            console.log(`- Input: "${f.case.input}"`);
            console.log(`  Expected: ${f.case.expectedIntent}, Got: ${f.got}`);
            if (f.rawOutput && f.rawOutput.toolCalls) {
                console.log(`  Tool calls: ${JSON.stringify(f.rawOutput.toolCalls)}`);
            }
        });
        if (results.failures.length > 5) {
            console.log(`  ... and ${results.failures.length - 5} more.`);
        }
    }
}

runBenchmark().catch(console.error);
