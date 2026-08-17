import { describe, it, expect, beforeEach } from 'vitest';
import { processConversationTurn } from '../../src/modules/conversation/conversation.service';
import { WebChatAdapter } from '../../src/modules/conversation/webchat_adapter';
import { createMockClients, getInitialStores, ORG_ID } from '../chiara/mocks/supabase.mock';
import type { MockStores } from '../chiara/mocks/supabase.mock';

/**
 * Reproduces the reported bug with a realistic catalog of SIMILAR service names
 * (like a clinic: "Consulta Inicial", "Consulta de Retorno", "Consulta Online").
 *
 * Root cause hypothesis: when the user clicks the service card, the engine
 * re-routes the card LABEL through the fuzzy catalog matcher. Similar names
 * produce `multipleServices: true`, so the explicitly chosen service is never
 * stored in the derived workflow history. If the persisted workflow_state is
 * unavailable (column missing / RLS / transient failure), the service is lost
 * and the flow asks for the service again — even after choosing a professional.
 */
describe('Booking state loss with fuzzy-ambiguous service catalog', () => {
  let mocks: ReturnType<typeof createMockClients>;
  let stores: MockStores;
  const adapter = new WebChatAdapter();
  const conversationId = 'conv-bug-ambiguity';

  const stateOf = (): Record<string, unknown> | null => {
    const conv = stores.conversationsStore.find((c) => c.id === conversationId);
    return (conv?.workflow_state as Record<string, unknown> | null | undefined) ?? null;
  };

  beforeEach(() => {
    stores = getInitialStores();
    // Realistic clinic-style catalog with mutually ambiguous names.
    stores.servicesStore.splice(0, stores.servicesStore.length);
    stores.servicesStore.push(
      { id: 'srv-001', organization_id: ORG_ID, name: 'Consulta Inicial', duration_minutes: 45, price_cents: 12000, price: 12000, buffer_after_minutes: 15, status: 'active' },
      { id: 'srv-002', organization_id: ORG_ID, name: 'Consulta de Retorno', duration_minutes: 30, price_cents: 8000, price: 8000, buffer_after_minutes: 15, status: 'active' },
      { id: 'srv-003', organization_id: ORG_ID, name: 'Consulta Online', duration_minutes: 30, price_cents: 9000, price: 9000, buffer_after_minutes: 15, status: 'active' },
    );
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

  const wipeWorkflowState = () => {
    const conv = stores.conversationsStore.find((c) => c.id === conversationId);
    if (conv) conv.workflow_state = null;
  };

  const turn = async (label: string, payload: Record<string, unknown>) => {
    const result = await processConversationTurn(
      mocks.userClient,
      mocks.adminClient,
      'user-admin-aurora',
      'studio-aurora',
      adapter,
      { conversationId, ...payload },
      `corr-${label}`,
    );
    console.log(`\n[${label}] text="${payload.text}" step=${result.metadata?.flowStep} outcome=${result.metadata?.outcomeCode}`);
    console.log(`  workflow_state -> ${JSON.stringify(stateOf())}`);
    const persisted = stateOf();
    // Simulate a DB without the workflow_state column: the memory must
    // survive via message-history derivation alone.
    wipeWorkflowState();
    return { result, persisted };
  };

  it('service card (ambiguous label) -> professional card -> "hoje" must keep the service', async () => {
    // Turno 1: usuário escolhe serviço via card
    const t1 = await turn('T1-service-card', {
      text: 'Consulta Inicial',
      selection: { type: 'service', id: 'srv-001', label: 'Consulta Inicial' },
    });
    console.log(`  [T1] options=${JSON.stringify(t1.result.metadata?.structuredContent?.options?.map((o: { id: string }) => o.id))}`);
    expect(t1.result.metadata?.flowStep).toBe('PROFESSIONAL');
    expect(t1.persisted?.serviceId).toBe('srv-001');

    // Turno 2: escolhe profissional via card — BUG: pergunta serviço de novo
    const t2 = await turn('T2-professional-card', {
      text: 'Dott. Marco Rossi',
      selection: { type: 'professional', id: 'b1111111', label: 'Dott. Marco Rossi' },
    });
    console.log(`  [T2] structuredContentType=${t2.result.metadata?.structuredContent?.type}`);
    expect(t2.result.metadata?.flowStep).toBe('SLOTS');
    expect(t2.persisted?.serviceId).toBe('srv-001');
    expect(t2.persisted?.professionalId).toBe('b1111111');

    // Turno 3: "hoje" — BUG: pergunta serviço de novo
    const t3 = await turn('T3-today', { text: 'hoje' });
    console.log(`  [T3] structuredContentType=${t3.result.metadata?.structuredContent?.type}`);
    expect(t3.result.metadata?.flowStep).toBe('TIME');
    expect(t3.persisted?.serviceId).toBe('srv-001');
    expect(t3.persisted?.professionalId).toBe('b1111111');
    expect(t3.persisted?.date).toBeTruthy();
  });
});
