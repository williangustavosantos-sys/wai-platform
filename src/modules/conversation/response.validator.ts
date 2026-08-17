import { parseISO, format, isValid } from 'date-fns';
import { OperationalResult } from './conversation.types';
import Fuse from 'fuse.js';

export interface ResponseValidationRequest {
    humanizedText: string;
    baseText: string;
    operationalResult: OperationalResult;
}

/**
 * Validates that the AI-humanized response still contains all critical data points.
 * If validation fails, the safe base text should be used instead.
 */
export class ResponseValidator { // Renamed from AIResponseFormatter
    validate(request: ResponseValidationRequest): boolean {
        const { humanizedText, baseText, operationalResult } = request;
        const lowerHumanizedText = humanizedText.toLowerCase();
        const lowerBaseText = baseText.toLowerCase();

        // 1. Basic check: Ensure critical string data points are present.
        // Matching is word-level (contiguity is not essential) and the
        // professional name is validated separately with fuzzy matching below.
        const professionalName = typeof operationalResult.data?.professionalName === 'string'
            ? (operationalResult.data.professionalName as string)
            : undefined;
        const isProfessionalDataPoint = (dataPoint: string) =>
            professionalName !== undefined
            && (dataPoint.toLowerCase().includes(professionalName.toLowerCase())
                || professionalName.toLowerCase().includes(dataPoint.toLowerCase()));
        for (const dataPoint of operationalResult.criticalData) {
            if (!dataPoint) continue; // Skip empty data points
            if (isProfessionalDataPoint(dataPoint)) continue; // Checked via fuzzyMatch below
            if (!this.containsAllWords(dataPoint, lowerHumanizedText)) {
                console.warn(`ResponseValidator FAIL: Humanized text is missing critical string data: "${dataPoint}"`);
                return false;
            }
        }

        // 2. Structural validation based on OperationalResult type
        switch (operationalResult.type) {
            case 'BOOKING_CREATED': {
                const { professionalName, date, time } = operationalResult.data;
                // Validate professional name (fuzzy match)
                if (professionalName && !this.fuzzyMatch(professionalName, humanizedText)) {
                    console.warn(`ResponseValidator FAIL: Professional name "${professionalName}" not found in humanized text.`);
                    return false;
                }
                // Validate date and time
                if (date && time) {
                    const baseDateTime = parseISO(`${date}T${time}`);
                    if (!isValid(baseDateTime)) {
                        console.warn(`ResponseValidator WARN: Invalid date/time in operational result: ${date} ${time}`);
                        break; // Cannot validate if base is invalid
                    }
                    const formattedBaseDate = format(baseDateTime, 'dd/MM/yyyy'); // Example format
                    const formattedBaseTime = format(baseDateTime, 'HH:mm');

                    // Simple check for now, more robust date/time extraction from natural language is complex
                    if (!lowerHumanizedText.includes(formattedBaseDate.toLowerCase()) || !lowerHumanizedText.includes(formattedBaseTime.toLowerCase())) {
                        console.warn(`ResponseValidator FAIL: Date/Time "${formattedBaseDate} ${formattedBaseTime}" not found in humanized text.`);
                        return false;
                    }
                }
                break;
            }
            case 'SLOTS_AVAILABLE': {
                // Some SLOTS_AVAILABLE results (e.g. the DATE step day-selection)
                // carry day labels in criticalData without a data.slots array;
                // those were already enforced by the word-level check above.
                const slots = operationalResult.data.slots;
                if (!Array.isArray(slots)) break;
                // Only enforce the slots the base text actually lists (criticalData),
                // otherwise a slot beyond the first 5 shown would wrongly reject.
                const guaranteed = new Set((operationalResult.criticalData || []).map((s) => s.toLowerCase()));
                for (const slot of slots) {
                    if (!guaranteed.has(String(slot).toLowerCase())) continue;
                    if (!lowerHumanizedText.includes(String(slot).toLowerCase())) {
                        console.warn(`ResponseValidator FAIL: Slot "${slot}" not found in humanized text.`);
                        return false;
                    }
                }
                break;
            }
            case 'COMPANY_INFORMATION_FOUND': {
                const { answer } = operationalResult.data;
                if (answer && !this.containsAllWords(answer, lowerHumanizedText)) {
                    console.warn(`ResponseValidator FAIL: Company information answer not found in humanized text.`);
                    return false;
                }
                break;
            }
            // Add more cases for other OperationalResult types as needed
        }

        // 3. Check for forbidden additions (simple heuristic for now)
        // This is a very basic check and can be improved.
        // For example, if the base text doesn't mention "parking", but humanized text does, it's a red flag.
        const forbiddenKeywords = ['parcheggio', 'gratuito', 'sconto', 'promozione']; // Example forbidden words
        for (const keyword of forbiddenKeywords) {
            if (!lowerBaseText.includes(keyword) && lowerHumanizedText.includes(keyword)) {
                console.warn(`ResponseValidator FAIL: Humanized text introduced forbidden keyword: "${keyword}"`);
                return false;
            }
        }

        return true;
    }

    /** Checks that every word of the phrase appears (word-level, non-contiguous). */
    private containsAllWords(phrase: string, lowerHaystack: string): boolean {
        const words = phrase.toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((word) => word.length > 0);
        return words.length > 0 && words.every((word) => lowerHaystack.includes(word));
    }

    private fuzzyMatch(expected: string, actualText: string): boolean {
        // Token-based check: at least one meaningful token of the expected
        // professional name (title removed) must appear in the humanized text.
        // E.g. "Dott.ssa Anna Ferrari" matches "...con la Dott.ssa Anna..."
        // but not "...con la Dott.ssa Sofia...".
        const tokens = expected
            .toLowerCase()
            .replace(/dott\.?s?a?\.?|dr\.?\s*/g, ' ')
            .split(/[^a-zà-ÿ0-9]+/)
            .filter((token) => token.length >= 3);
        const haystack = actualText.toLowerCase();
        return tokens.length > 0 && tokens.some((token) => haystack.includes(token));
    }
}