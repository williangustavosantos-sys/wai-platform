import { describe, it, expect, beforeEach } from 'vitest';
import { processConversationTurn } from '../../src/modules/conversation/conversation.service';
import { WebChatAdapter } from '../../src/modules/conversation/webchat_adapter';
import { createMockClients, getInitialStores, ORG_ID } from './mocks/supabase.mock';
import type { MockStores } from './mocks/supabase.mock';

const metaOf = (result: { metadata?: Record<string, any> }) => result.metadata!;

describe('Fase 2: Guided Booking Flow (SERVICE -> PROFESSIONAL -> SLOTS -> TIME -> CONFIRMATION -> CREATE)', () => {
    let mocks: ReturnType<typeof createMockClients>;
    let stores: MockStores;

    beforeEach(() => {
        stores = getInitialStores();
        // Add a verified customer with a valid E.164 phone so identityKnown resolves on confirm
        stores.customersStore.push({
            id: 'd0000099', organization_id: ORG_ID, first_name: 'Marco', last_name: 'Rossi',
            phone_normalized: '+39345678901', email: 'marco.rossi@example.it', status: 'active',
        });
        mocks = createMockClients(stores);
    });

    it('must guide the customer through the full guided booking flow', async () => {
        const adapter = new WebChatAdapter();
        const conversationId = 'conv-f2-guided-flow';
        const customerPhone = '+39345678901'; // Valid E.164 — verified Marco Rossi customer
        stores.conversationsStore.push({
            id: conversationId,
            organization_id: ORG_ID,
            customer_id: null,
            channel: 'webchat',
            status: 'active',
            workflow_state: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        // Turno 1: Cliente inicia o agendamento — "Vorrei prenotare una consulenza"
        // Service is NOT auto-resolved (two services, "consulenza" matches both concept tokens)
        // Flow goes to SERVICE step -> SERVICE_SELECTION_REQUIRED
        const turn1 = await processConversationTurn(
            mocks.userClient,
            mocks.adminClient,
            'user-admin-aurora',
            'studio-aurora',
            adapter,
            { conversationId, text: 'Vorrei prenotare una consulenza', customerPhone },
            'corr-f2-1',
        );

        expect(metaOf(turn1).flowStep).toBe('SERVICE');
        expect(metaOf(turn1).outcomeCode).toBe('SERVICE_SELECTION_REQUIRED');
        expect(turn1.replyText.toLowerCase()).toContain('quale servizio');
        expect(metaOf(turn1).structuredContent.type).toBe('SERVICE_SELECTION');
        expect(metaOf(turn1).structuredContent.options.map((o: any) => o.id)).toEqual(['c1111111', 'c2222222']);

        let conversationState = stores.conversationsStore.find((c) => c.id === conversationId);
        expect(conversationState?.workflow_state).toMatchObject({
            intent: 'CREATE_APPOINTMENT',
            serviceId: undefined,
            professionalId: null,
            step: 'SERVICE',
        });

        // Turno 2: Cliente selecciona o servico via card
        const turn2 = await processConversationTurn(
            mocks.userClient,
            mocks.adminClient,
            'user-admin-aurora',
            'studio-aurora',
            adapter,
            {
                conversationId,
                text: 'Consulenza Fiscale Iniziale',
                customerPhone,
                selection: { type: 'service', id: 'c1111111', label: 'Consulenza Fiscale Iniziale' },
            },
            'corr-f2-2',
        );

        expect(metaOf(turn2).flowStep).toBe('PROFESSIONAL');
        expect(metaOf(turn2).outcomeCode).toBe('PROFESSIONAL_SELECTION_REQUIRED');
        expect(turn2.replyText.toLowerCase()).toContain('professionista');
        expect(metaOf(turn2).structuredContent.type).toBe('PROFESSIONAL_SELECTION');
        expect(metaOf(turn2).structuredContent.options.map((o: any) => o.id)).toContain('b1111111');
        // "Nessuna preferenza" (ANY) option must also be present
        expect(metaOf(turn2).structuredContent.options.map((o: any) => o.id)).toContain('ANY');

        conversationState = stores.conversationsStore.find((c) => c.id === conversationId);
        expect(conversationState?.workflow_state).toMatchObject({
            intent: 'CREATE_APPOINTMENT',
            serviceId: 'c1111111',
            professionalId: null,
            step: 'PROFESSIONAL',
        });

        // Turno 3: Cliente escolhe o profissional via card -> busca de
        // disponibilidade AUTOMÁTICA: opções concretas de data + horário
        const turn3 = await processConversationTurn(
            mocks.userClient,
            mocks.adminClient,
            'user-admin-aurora',
            'studio-aurora',
            adapter,
            {
                conversationId,
                text: 'Dott. Marco Rossi',
                customerPhone,
                selection: { type: 'professional', id: 'b1111111', label: 'Dott. Marco Rossi' },
            },
            'corr-f2-3',
        );

        expect(metaOf(turn3).flowStep).toBe('SLOTS');
        expect(metaOf(turn3).outcomeCode).toBe('SLOTS_AVAILABLE');
        expect(metaOf(turn3).structuredContent.type).toBe('SLOT_SELECTION');
        expect(metaOf(turn3).structuredContent.options.length).toBeGreaterThan(0);
        // Cada opção carrega data + horário concretos do calendário real
        const todayKey = new Date().toISOString().slice(0, 10);
        const slotPayloads = metaOf(turn3).structuredContent.options.map((s: any) => s.payload);
        expect(slotPayloads.length).toBeGreaterThan(0);
        for (const payload of slotPayloads) {
            expect(typeof payload.date).toBe('string');
            expect(payload.date >= todayKey).toBe(true);
            expect(typeof payload.time).toBe('string');
            expect(payload.time).toMatch(/^\d{2}:\d{2}$/);
        }
        conversationState = stores.conversationsStore.find((c) => c.id === conversationId);
        expect(conversationState?.workflow_state).toMatchObject({
            intent: 'CREATE_APPOINTMENT',
            serviceId: 'c1111111',
            professionalId: 'b1111111',
            professionalPreference: 'specific',
            step: 'SLOTS',
        });

        // Turno 4: Cliente informa a data -> horarios reais do Dr. Marco
        const turn4 = await processConversationTurn(
            mocks.userClient,
            mocks.adminClient,
            'user-admin-aurora',
            'studio-aurora',
            adapter,
            { conversationId, text: 'Per il 25 agosto 2026', customerPhone },
            'corr-f2-4',
        );

        expect(metaOf(turn4).flowStep).toBe('TIME');
        expect(metaOf(turn4).outcomeCode).toBe('SLOTS_AVAILABLE');
        expect(turn4.replyText.toLowerCase()).toContain('orari disponibili');
        expect(metaOf(turn4).structuredContent.type).toBe('TIME_SELECTION');
        // Os horarios sao apenas do Dr. Marco
        const professionalIdsInSlots = metaOf(turn4).structuredContent.options.map((s: any) => s.payload.professionalId);
        expect(professionalIdsInSlots.every((id: string) => id === 'b1111111')).toBe(true);
        expect(stores.appointmentsStore.length).toBe(12); // Nenhum agendamento criado ainda
        conversationState = stores.conversationsStore.find((c) => c.id === conversationId);
        expect(conversationState?.workflow_state).toMatchObject({
            intent: 'CREATE_APPOINTMENT',
            serviceId: 'c1111111',
            professionalId: 'b1111111',
            date: '2026-08-25',
            step: 'TIME',
        });

        // Turno 5: Cliente escolhe o horario via card -> card de confirmacao
        const turn5 = await processConversationTurn(
            mocks.userClient,
            mocks.adminClient,
            'user-admin-aurora',
            'studio-aurora',
            adapter,
            {
                conversationId,
                text: '10:00',
                customerPhone,
                selection: { type: 'time', id: '10:00', label: '10:00' },
            },
            'corr-f2-5',
        );

        expect(metaOf(turn5).flowStep).toBe('CONFIRMATION');
        expect(metaOf(turn5).outcomeCode).toBe('CONFIRMATION_REQUIRED');
        expect(turn5.replyText).toContain('Confermi la prenotazione');
        const confirmationCard = metaOf(turn5).structuredContent;
        expect(confirmationCard.type).toBe('CONFIRMATION_CARD');
        expect(confirmationCard.payload).toMatchObject({
            serviceName: 'Consulenza Fiscale Iniziale',
            professionalName: 'Dott. Marco Rossi',
            date: '2026-08-25',
            time: '10:00',
        });
        expect(confirmationCard.actions.map((a: any) => a.id)).toEqual(['confirm', 'modify']);
        expect(stores.appointmentsStore.length).toBe(12);
        conversationState = stores.conversationsStore.find((c) => c.id === conversationId);
        expect(conversationState?.workflow_state).toMatchObject({
            intent: 'CREATE_APPOINTMENT',
            serviceId: 'c1111111',
            professionalId: 'b1111111',
            date: '2026-08-25',
            time: '10:00',
            step: 'CONFIRMATION',
        });

        // Turno 6: Cliente confirma -> criacao operacional transacional
        const turn6 = await processConversationTurn(
            mocks.userClient,
            mocks.adminClient,
            'user-admin-aurora',
            'studio-aurora',
            adapter,
            {
                conversationId,
                text: 'Confermo la prenotazione',
                customerPhone,
                selection: { type: 'confirm', label: 'Conferma' },
            },
            'corr-f2-6',
        );

        expect(metaOf(turn6).flowStep).toBe('CREATE');
        expect(metaOf(turn6).outcomeCode).toBe('BOOKING_CREATED');
        expect(turn6.replyText).toContain('Prenotazione confermata');
        expect(turn6.replyText).toContain('25 agosto');
        expect(turn6.replyText).toContain('10:00');
        expect(stores.appointmentsStore.length).toBe(13);
        const newAppointment = stores.appointmentsStore.at(-1);
        expect(newAppointment.professional_id).toBe('b1111111');
        expect(new Date(newAppointment.start_at).getTime()).toBe(new Date('2026-08-25T10:00:00+02:00').getTime());
        // Estado de fluxo concluido e limpo
        conversationState = stores.conversationsStore.find((c) => c.id === conversationId);
        expect(conversationState?.workflow_state ?? null).toBeNull();
    });
});
