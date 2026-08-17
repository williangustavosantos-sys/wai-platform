import { describe, it, expect, beforeEach } from 'vitest';
import { processConversationTurn } from '../../src/modules/conversation/conversation.service';
import { WebChatAdapter } from '../../src/modules/conversation/webchat_adapter';
import { createMockClients, getInitialStores, ORG_ID } from './mocks/supabase.mock';
import type { MockStores } from './mocks/supabase.mock';

const metaOf = (result: { metadata?: Record<string, any> }) => result.metadata!;

describe('Fase 5: Extração de Entidades e Fluxo Acelerado', () => {
    let mocks: ReturnType<typeof createMockClients>;
    let stores: MockStores;

    beforeEach(() => {
        stores = getInitialStores();
        mocks = createMockClients(stores);
    });

    it('deve pular as perguntas de serviço, profissional e dia se o cliente informar tudo de uma vez', async () => {
        const adapter = new WebChatAdapter();
        const conversationId = 'conv-f5-full-sentence';
        const customerPhone = '+39345678976';
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

        // Turno 1: Cliente fornece todas as informações em linguagem natural
        const turn1 = await processConversationTurn(
            mocks.userClient,
            mocks.adminClient,
            'user-admin-aurora',
            'studio-aurora',
            adapter,
            {
                conversationId,
                text: 'Vorrei prenotare una Consulenza Fiscale Iniziale con Dott. Marco Rossi per il 25 agosto alle 15:00. Mi chiamo Gianni Blu.',
                customerPhone,
            },
            'corr-f5-1',
        );

        // Nada é perguntado: o fluxo vai direto para a criação operacional,
        // pois todas as entidades já foram extraídas da linguagem natural.
        expect(metaOf(turn1).outcomeCode).toBe('BOOKING_CREATED');
        expect(turn1.replyText).toContain('Prenotazione confermata');
        expect(turn1.replyText).toContain('25 agosto');
        expect(turn1.replyText).toContain('15:00');
        expect(turn1.replyText.toLowerCase()).not.toContain('quale servizio');
        expect(turn1.replyText.toLowerCase()).not.toContain('professionista specifico');

        // O cliente foi criado no CRM com os dados informados
        const newCustomer = stores.customersStore.find((c) => c.phone_normalized === customerPhone);
        expect(newCustomer).toBeDefined();
        expect(newCustomer.first_name).toBe('Gianni');
        expect(newCustomer.last_name).toBe('Blu');

        // O agendamento foi criado com o profissional e horário extraídos
        const newAppointment = stores.appointmentsStore.at(-1);
        expect(newAppointment.professional_id).toBe('b1111111');
        expect(new Date(newAppointment.start_at).getTime()).toBe(new Date('2026-08-25T15:00:00+02:00').getTime());
    });
});
