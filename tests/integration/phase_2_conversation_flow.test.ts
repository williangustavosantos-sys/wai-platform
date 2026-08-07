import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processConversationTurn } from '../../src/modules/conversation/conversation.service';
import { WebChatAdapter } from '../../src/modules/conversation/webchat_adapter';
import { SupabaseClient } from '@supabase/supabase-js';

describe('Phase 2 Integration: WAI Conversation Engine & Commercial Assistant MVP Flow', () => {
  let mockAdminClient: SupabaseClient;
  let mockUserClient: SupabaseClient;
  let auditLogsStore: unknown[];
  let messagesStore: unknown[];
  let appointmentsStore: unknown[];
  let customersStore: unknown[];
  let conversationsStore: unknown[];

  beforeEach(() => {
    auditLogsStore = [];
    messagesStore = [];
    appointmentsStore = [];
    customersStore = [
      { id: 'cust-111', organization_id: 'org-aurora-id', first_name: 'Mario', last_name: 'Rossi', phone: '+393401122333', email: 'mario@test.it', status: 'active' }
    ];
    conversationsStore = [
      { id: 'conv-001', organization_id: 'org-aurora-id', customer_id: null, channel: 'webchat', status: 'active', created_at: new Date().toISOString() }
    ];

    mockAdminClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'audit_logs') {
          return {
            insert: vi.fn().mockImplementation((records: unknown[]) => {
              const recs = Array.isArray(records) ? records : [records];
              auditLogsStore.push(...recs);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'audit-log-uuid', ...(recs[0] as object) }, error: null })
                })
              };
            })
          };
        }
      })
    } as unknown as SupabaseClient;

    mockUserClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'organizations') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'org-aurora-id', name: 'Studio Aurora', slug: 'studio-aurora', status: 'active' },
                    error: null
                  })
                }))
              }))
            }))
          };
        }
        if (table === 'organization_members') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation((col: string, orgId: string) => ({
                eq: vi.fn().mockImplementation((_: string, userId: string) => ({
                  eq: vi.fn().mockImplementation(() => ({
                    single: vi.fn().mockImplementation(() => {
                      if (orgId === 'org-aurora-id' && userId === 'user-admin-aurora') {
                        return Promise.resolve({ data: { role: 'organization_owner', status: 'active' }, error: null });
                      }
                      return Promise.resolve({ data: null, error: new Error('RLS block: unauthorized tenant member') });
                    })
                  }))
                }))
              }))
            }))
          };
        }
        if (table === 'digital_employees') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  order: vi.fn().mockImplementation(() => ({
                    limit: vi.fn().mockImplementation(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                          id: 'emp-aurora',
                          organization_id: 'org-aurora-id',
                          name: 'Sofia',
                          personality_prompt: 'Gentile ed empatica',
                          language: 'it',
                          communication_tone: 'cordial_empathic',
                          status: 'active',
                          is_default: true,
                          created_at: new Date().toISOString(),
                          updated_at: new Date().toISOString()
                        },
                        error: null
                      })
                    }))
                  }))
                }))
              }))
            }))
          };
        }
        if (table === 'conversations') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (col === 'id') {
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: conversationsStore.find(c => (c as any).id === val) || null,
                      error: null
                    })
                  };
                }
                return {
                  eq: vi.fn().mockResolvedValue({ data: conversationsStore, error: null }),
                  single: vi.fn().mockResolvedValue({ data: conversationsStore[0], error: null })
                };
              })
            })),
            insert: vi.fn().mockImplementation((record: any) => {
              const item = Array.isArray(record) ? record[0] : record;
              const newConv = { ...item, id: 'conv-002', created_at: new Date().toISOString() };
              conversationsStore.push(newConv);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: newConv, error: null })
                })
              };
            })
          };
        }
        if (table === 'messages') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                order: vi.fn().mockImplementation(() => ({
                  limit: vi.fn().mockResolvedValue({ data: messagesStore, error: null })
                })),
                eq: vi.fn().mockImplementation(() => ({
                  order: vi.fn().mockResolvedValue({ data: messagesStore, error: null })
                }))
              }))
            })),
            insert: vi.fn().mockImplementation((record: any) => {
              const item = Array.isArray(record) ? record[0] : record;
              const newMsg = { ...item, id: `msg-${messagesStore.length + 1}`, created_at: new Date().toISOString() };
              messagesStore.push(newMsg);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: newMsg, error: null })
                })
              };
            })
          };
        }
        if (table === 'customers') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                const results = customersStore.filter(c => (c as any)[col] === val || col === 'organization_id');
                const chain: any = {
                  eq: vi.fn().mockImplementation(() => chain),
                  neq: vi.fn().mockImplementation(() => chain),
                  order: vi.fn().mockImplementation(() => chain),
                  single: vi.fn().mockResolvedValue({ data: results[0] || null, error: null }),
                  then: (fn: any) => fn({ data: results, error: null })
                };
                return chain;
              })
            })),
            insert: vi.fn().mockImplementation((record: any) => {
              const item = Array.isArray(record) ? record[0] : record;
              const newCust = { ...item, id: 'cust-999', created_at: new Date().toISOString() };
              customersStore.push(newCust);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: newCust, error: null })
                })
              };
            })
          };
        }
        if (table === 'services') {
          return {
            select: vi.fn().mockImplementation(() => {
              const srvData = { id: 'srv-aurora-visita', name: 'Visita Odontoiatrica', duration_minutes: 30, price_cents: 8000, duration: 30, price: 8000 };
              const chain: any = {
                eq: vi.fn().mockImplementation(() => chain),
                limit: vi.fn().mockImplementation(() => chain),
                order: vi.fn().mockImplementation(() => chain),
                single: vi.fn().mockResolvedValue({ data: srvData, error: null }),
                then: (fn: any) => fn({ data: [srvData], error: null })
              };
              return chain;
            })
          };
        }
        if (table === 'professionals') {
          return {
            select: vi.fn().mockImplementation(() => {
              const profData = { id: 'prof-aurora-marco', firstName: 'Marco', lastName: 'Rossi', name: 'Dr. Marco Rossi', role: 'Dottore' };
              const chain: any = {
                eq: vi.fn().mockImplementation(() => chain),
                limit: vi.fn().mockImplementation(() => chain),
                order: vi.fn().mockImplementation(() => chain),
                single: vi.fn().mockResolvedValue({ data: profData, error: null }),
                then: (fn: any) => fn({ data: [profData], error: null })
              };
              return chain;
            })
          };
        }
        if (table === 'appointments') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockResolvedValue({ data: [], error: null })
              }))
            })),
            insert: vi.fn().mockImplementation((record: any) => {
              const item = Array.isArray(record) ? record[0] : record;
              const newAppt = {
                id: 'appt-20260802-001',
                ...item,
                status: 'confirmed',
                created_at: new Date().toISOString()
              };
              appointmentsStore.push(newAppt);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: newAppt, error: null })
                })
              };
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: null, error: null }) };
      })
    } as unknown as SupabaseClient;
  });

  it('deve processar um turno completo de agendamento: Mensagem -> IA -> Tools -> Validação -> Resposta -> Persistência', async () => {
    const adapter = new WebChatAdapter();
    const payload = {
      conversationId: 'conv-001',
      text: "Buongiorno Sofia, vorrei prenotare una visita per il 2026-08-02 alle 10:00, cellulare +393401122333"
    };

    const correlationId = 'test-corr-flow-1';
    const result = await processConversationTurn(
      mockUserClient,
      mockAdminClient,
      'user-admin-aurora',
      'studio-aurora',
      adapter,
      payload,
      correlationId
    );

    // 1. Verificações do resultado retornado para a UI
    expect(result.detectedIntent).toBe('BOOK_APPOINTMENT');
    expect(result.replyText).toContain('[WAI_STEP_SLOTS_EMPTY]');
    expect(result.toolCalls.length).toBeGreaterThanOrEqual(1); // checkAvailability

    // 2. Verificações de persistência de Mensagens RLS
    expect(messagesStore.length).toBe(2); // Mensagem do cliente + resposta do assistente
    expect((messagesStore[0] as any).role).toBe('customer');
    expect((messagesStore[1] as any).role).toBe('assistant');

    // 3. Verificação de Auditoria (Audit Log)
    expect(auditLogsStore.length).toBeGreaterThanOrEqual(1); // Log da conversa
    const auditActions = auditLogsStore.map((a: any) => a.action);
    expect(auditActions).toContain('CREATE_MESSAGE');
  });

  it('deve rejeitar execução quando a organização solicitada falhar na validação RLS', async () => {
    // Simulando tentativa de acesso sem permissões na organização (retorna nulo ou erro RLS)
    mockUserClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                single: vi.fn().mockResolvedValue({ data: null, error: new Error('RLS Violation') })
              }))
            }))
          }))
        };
      }
    });

    const adapter = new WebChatAdapter();
    await expect(
      processConversationTurn(
        mockUserClient,
        mockAdminClient,
        'unauthorized-user',
        'studio-aurora',
        adapter,
        { text: 'Ciao' },
        'corr-unauth'
      )
    ).rejects.toThrow(/Accesso negato al tenant/);

    expect(messagesStore.length).toBe(0); // Nenhuma mensagem persistida
    expect(appointmentsStore.length).toBe(0); // Nenhuma alteração no banco
  });
});
