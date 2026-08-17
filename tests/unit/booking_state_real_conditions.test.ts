import { describe, it, expect, beforeEach } from 'vitest';
import { processConversationTurn } from '../../src/modules/conversation/conversation.service';
import { WebChatAdapter } from '../../src/modules/conversation/webchat_adapter';
import { createMockClients, getInitialStores, ORG_ID } from '../chiara/mocks/supabase.mock';
import type { MockStores } from '../chiara/mocks/supabase.mock';

/**
 * Reproduces the booking flow under REAL-environment conditions:
 *  - the workspace chat does NOT send customerPhone (no verified customer);
 *  - the DB may NOT have the workflow_state column (migration 20260814000007
 *    not applied), so the state has to survive ONLY via message history
 *    derivation (deriveConversationWorkflow).
 *
 * Every turn logs the persisted workflow_state and the decision inputs.
 */
describe('Booking flow under real-environment conditions (no phone, no workflow_state column)', () => {
  let mocks: ReturnType<typeof createMockClients>;
  let stores: MockStores;
  const adapter = new WebChatAdapter();
  const conversationId = 'conv-bug-real-env';
  // NO customerPhone — like sendChatMessageAction in the workspace chat.

  const stateOf = () => {
    const conv = stores.conversationsStore.find((c) => c.id === conversationId);
    return conv?.workflow_state ?? null;
  };

  beforeEach(() => {
    stores = getInitialStores();
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

  /** Simulates a DB without workflow_state: wipes the column after each turn. */
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
    console.log(`\n[${label}] text="${payload.text}" step=${result.metadata?.flowStep} intent=${result.metadata?.intent} outcome=${result.metadata?.outcomeCode}`);
    console.log(`  workflow_state(before wipe) -> ${JSON.stringify(stateOf())}`);
    wipeWorkflowState();
    console.log(`  workflow_state(after wipe)  -> ${JSON.stringify(stateOf())}`);
    return result;
  };

  it('card flow without workflow_state column: service -> professional -> "hoje"', async () => {
    // Turno 1: usuário escolhe serviço via card
    const t1 = await turn('T1-service-card', {
      text: 'Consulenza Fiscale Iniziale',
      selection: { type: 'service', id: 'c1111111', label: 'Consulenza Fiscale Iniziale' },
    });
    expect(t1.metadata?.flowStep).toBe('PROFESSIONAL');

    // Turno 2: escolhe profissional via card — BUG relatado: volta para SERVICE
    const t2 = await turn('T2-professional-card', {
      text: 'Dott. Marco Rossi',
      selection: { type: 'professional', id: 'b1111111', label: 'Dott. Marco Rossi' },
    });
    console.log(`  [T2] structuredContentType=${t2.metadata?.structuredContent?.type}`);
    expect(t2.metadata?.flowStep).toBe('SLOTS');

    // Turno 3: "hoje" (texto livre) — BUG relatado: volta para SERVICE
    const t3 = await turn('T3-today', { text: 'hoje' });
    console.log(`  [T3] structuredContentType=${t3.metadata?.structuredContent?.type}`);
    expect(t3.metadata?.flowStep).toBe('TIME');
  });

  it('typed flow without workflow_state column: service -> professional -> "hoje"', async () => {
    const t1 = await turn('T1-service-typed', { text: 'Consulenza Fiscale Iniziale' });
    expect(t1.metadata?.flowStep).toBe('PROFESSIONAL');

    const t2 = await turn('T2-professional-typed', { text: 'Dott. Marco Rossi' });
    expect(t2.metadata?.flowStep).toBe('SLOTS');

    const t3 = await turn('T3-today-typed', { text: 'hoje' });
    expect(t3.metadata?.flowStep).toBe('TIME');
  });
});
