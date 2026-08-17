import { describe, it, expect, beforeEach } from 'vitest';
import { processConversationTurn } from '../../src/modules/conversation/conversation.service';
import { WebChatAdapter } from '../../src/modules/conversation/webchat_adapter';
import { createMockClients, getInitialStores, ORG_ID } from '../chiara/mocks/supabase.mock';
import type { MockStores } from '../chiara/mocks/supabase.mock';

/**
 * Regression test for the "lost booking state" bug:
 * user picks service (card) -> picks professional (card) -> the flow must
 * remember the service. Typing short replies like "hoje" must advance the
 * DATE/TIME step instead of restarting at SERVICE.
 *
 * Every turn logs the persisted workflow_state so the memory/state flow is
 * visible in the test output.
 */
describe('Booking flow state memory (bug regression)', () => {
  let mocks: ReturnType<typeof createMockClients>;
  let stores: MockStores;
  const adapter = new WebChatAdapter();
  const conversationId = 'conv-bug-state-loss';
  const customerPhone = '+39345678901';

  const stateOf = (): Record<string, unknown> | null => {
    const conv = stores.conversationsStore.find((c) => c.id === conversationId);
    return (conv?.workflow_state as Record<string, unknown> | null | undefined) ?? null;
  };

  beforeEach(() => {
    stores = getInitialStores();
    stores.customersStore.push({
      id: 'd0000099', organization_id: ORG_ID, first_name: 'Marco', last_name: 'Rossi',
      phone_normalized: customerPhone, email: 'marco.rossi@example.it', status: 'active',
    });
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
    mocks = createMockClients(stores);
  });

  const turn = async (label: string, payload: Record<string, unknown>) => {
    const result = await processConversationTurn(
      mocks.userClient,
      mocks.adminClient,
      'user-admin-aurora',
      'studio-aurora',
      adapter,
      { conversationId, customerPhone, ...payload },
      `corr-${label}`,
    );
    console.log(`\n[${label}] text="${payload.text}" step=${result.metadata?.flowStep} intent=${result.metadata?.intent}`);
    console.log(`  workflow_state -> ${JSON.stringify(stateOf())}`);
    return result;
  };

  it('card flow: service -> professional -> "hoje" keeps the booking memory', async () => {
    // Turno 1: card de serviço
    const t1 = await turn('T1-service-card', {
      text: 'Consulenza Fiscale Iniziale',
      selection: { type: 'service', id: 'c1111111', label: 'Consulenza Fiscale Iniziale' },
    });
    expect(t1.metadata?.flowStep).toBe('PROFESSIONAL');

    // Turno 2: card de profissional — BUG: voltava para SERVICE
    const t2 = await turn('T2-professional-card', {
      text: 'Dott. Marco Rossi',
      selection: { type: 'professional', id: 'b1111111', label: 'Dott. Marco Rossi' },
    });
    expect(t2.metadata?.flowStep).toBe('SLOTS');

    // Turno 3: "hoje" (texto livre, sem card) — BUG: voltava para SERVICE
    const t3 = await turn('T3-today-text', { text: 'hoje' });
    expect(t3.metadata?.flowStep).toBe('TIME');
    expect(stateOf()).toMatchObject({ serviceId: 'c1111111', professionalId: 'b1111111', step: 'TIME' });
  });

  it('free-text flow: typed service -> typed professional -> "hoje" keeps the booking memory', async () => {
    // Turno 1: serviço digitado
    const t1 = await turn('T1-service-typed', { text: 'Vorrei una consulenza fiscale' });
    console.log(`  [T1] options=${JSON.stringify(t1.metadata?.structuredContent?.options?.map((o: { id: string }) => o.id))}`);
    if (t1.metadata?.flowStep !== 'PROFESSIONAL') {
      console.log('  [T1] catalog did not resolve a single service; flow will ask for it.');
    }

    // Turno 2: profissional digitado
    const t2 = await turn('T2-professional-typed', { text: 'Dott. Marco Rossi' });
    console.log(`  [T2] step=${t2.metadata?.flowStep}`);

    // Turno 3: "hoje"
    const t3 = await turn('T3-today-typed', { text: 'hoje' });
    console.log(`  [T3] step=${t3.metadata?.flowStep}`);
    expect(t3.metadata?.flowStep).toBe('TIME');
    expect(stateOf()).toMatchObject({ serviceId: 'c1111111', professionalId: 'b1111111', step: 'TIME' });
  });

  it('"sim" confirmation style short replies do not restart the flow', async () => {
    const t1 = await turn('T1-service-card', {
      text: 'Consulenza Fiscale Iniziale',
      selection: { type: 'service', id: 'c1111111', label: 'Consulenza Fiscale Iniziale' },
    });
    expect(t1.metadata?.flowStep).toBe('PROFESSIONAL');

    const t2 = await turn('T2-professional-card', {
      text: 'Dott. Marco Rossi',
      selection: { type: 'professional', id: 'b1111111', label: 'Dott. Marco Rossi' },
    });
    expect(t2.metadata?.flowStep).toBe('SLOTS');

    const t3 = await turn('T3-sim', { text: 'sim' });
    console.log(`  [T3 "sim"] step=${t3.metadata?.flowStep} outcome=${t3.metadata?.outcomeCode}`);
    // A short confirmation word must not erase the picked service/professional.
    expect(stateOf()?.serviceId).toBe('c1111111');
    expect(stateOf()?.professionalId).toBe('b1111111');
  });
});
