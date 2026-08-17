import { describe, it, expect, beforeEach } from 'vitest';
import { ResponseValidator } from './response.validator';
import { OperationalResult } from './conversation.types';

describe('ResponseValidator', () => {
    let validator: ResponseValidator;

    beforeEach(() => {
        validator = new ResponseValidator();
    });

    it('should return true if humanized text contains all critical string data', () => {
        const operationalResult: OperationalResult = {
            type: 'BOOKING_CREATED',
            data: { professionalName: 'Dr. Marco Rossi', date: '2026-08-20', time: '10:00' },
            language: 'it',
            criticalData: ['Marco Rossi', '20/08/2026', '10:00'],
            baseReplyText: 'Appuntamento confermato con Dr. Marco Rossi per il 20/08/2026 alle 10:00.',
        };
        const request = {
            humanizedText: 'Perfetto! Il tuo appuntamento con il Dr. Marco Rossi è confermato per il 20/08/2026 alle 10:00. Ti aspettiamo!',
            baseText: operationalResult.baseReplyText,
            operationalResult,
        };
        expect(validator.validate(request)).toBe(true);
    });

    it('should return false if humanized text is missing critical string data', () => {
        const operationalResult: OperationalResult = {
            type: 'BOOKING_CREATED',
            data: { professionalName: 'Dr. Marco Rossi', date: '2026-08-20', time: '10:00' },
            language: 'it',
            criticalData: ['Marco Rossi', '20/08/2026', '10:00'],
            baseReplyText: 'Appuntamento confermato con Dr. Marco Rossi per il 20/08/2026 alle 10:00.',
        };
        const request = {
            humanizedText: 'Perfetto! Il tuo appuntamento è confermato per il 20/08/2026 alle 10:00. Ti aspettiamo!', // Missing professional name
            baseText: operationalResult.baseReplyText,
            operationalResult,
        };
        expect(validator.validate(request)).toBe(false);
    });

    it('should return false if humanized text introduces forbidden keywords not in base text', () => {
        const operationalResult: OperationalResult = {
            type: 'BOOKING_CREATED',
            data: { professionalName: 'Dr. Marco Rossi', date: '2026-08-20', time: '10:00' },
            language: 'it',
            criticalData: ['Marco Rossi', '20/08/2026', '10:00'],
            baseReplyText: 'Appuntamento confermato con Dr. Marco Rossi per il 20/08/2026 alle 10:00.',
        };
        const request = {
            humanizedText: 'Perfetto! Il tuo appuntamento con il Dr. Marco Rossi è confermato per il 20/08/2026 alle 10:00. Il parcheggio è gratuito!', // Adds "parcheggio gratuito"
            baseText: operationalResult.baseReplyText,
            operationalResult,
        };
        expect(validator.validate(request)).toBe(false);
    });

    it('should return true if humanized text contains forbidden keywords that were also in base text', () => {
        const operationalResult: OperationalResult = {
            type: 'COMPANY_INFORMATION_FOUND',
            data: { answer: 'Il parcheggio è gratuito.' },
            language: 'it',
            criticalData: ['parcheggio gratuito'],
            baseReplyText: 'Il parcheggio è gratuito.',
        };
        const request = {
            humanizedText: 'Ottima notizia! Il parcheggio è gratuito per tutti i nostri clienti.',
            baseText: operationalResult.baseReplyText,
            operationalResult,
        };
        expect(validator.validate(request)).toBe(true);
    });

    it('should validate professional name with fuzzy matching for BOOKING_CREATED', () => {
        const operationalResult: OperationalResult = {
            type: 'BOOKING_CREATED',
            data: { professionalName: 'Dott.ssa Anna Ferrari', date: '2026-08-22', time: '14:00' },
            language: 'it',
            criticalData: ['Anna Ferrari', '22/08/2026', '14:00'],
            baseReplyText: 'Appuntamento confermato con Dott.ssa Anna Ferrari per il 22/08/2026 alle 14:00.',
        };
        const request = {
            humanizedText: 'Fantastico! La tua visita con la Dott.ssa Anna è fissata per il 22/08/2026 alle 14:00.', // "Dott.ssa Anna" should match "Dott.ssa Anna Ferrari"
            baseText: operationalResult.baseReplyText,
            operationalResult,
        };
        expect(validator.validate(request)).toBe(true);

        const requestFail = {
            humanizedText: 'Fantastico! La tua visita con la Dott.ssa Sofia è fissata per il 22/08/2026 alle 14:00.', // Wrong professional
            baseText: operationalResult.baseReplyText,
            operationalResult,
        };
        expect(validator.validate(requestFail)).toBe(false);
    });

    // Add more tests for date/time validation, other operationalResult types
});