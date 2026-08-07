import { describe, it, expect } from 'vitest';
import { SimpleAIProvider } from '../../src/modules/ai/simple_ai_provider';
import { WebChatAdapter } from '../../src/modules/conversation/webchat_adapter';
import { DigitalEmployeeConfig } from '../../src/modules/assistant/assistant.types';
import { extractAvailabilityFromToolCall } from '../../src/modules/tools/tools.types';

describe('Phase 2 Unit Tests: Conversation Engine & AI Abstraction Layer', () => {
  const aiProvider = new SimpleAIProvider();
  const webChatAdapter = new WebChatAdapter();
  const mockConfig: DigitalEmployeeConfig = {
    id: 'cfg-aurora',
    organizationId: 'org-aurora',
    name: 'Sofia',
    personalitySummary: 'Gentile ed empatica',
    language: 'it',
    communicationTone: 'cordial_empathic',
    avatarPlaceholderUrl: 'S',
    isDefault: true,
    status: 'active',
    settingsJson: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  describe('WebChatAdapter Component', () => {
    it('deve extrair e formatar a mensagem com sucesso de payload válido', async () => {
      const payload = { conversationId: 'conv-123', text: 'Ciao Sofia, vorrei un appuntamento' };
      const res = await webChatAdapter.receiveMessage(payload);

      expect(res.conversationId).toBe('conv-123');
      expect(res.text).toBe('Ciao Sofia, vorrei un appuntamento');
    });

    it('deve rejeitar payload com texto em branco ou inválido lançando erro', async () => {
      const payload = { text: '' };
      await expect(webChatAdapter.receiveMessage(payload)).rejects.toThrow(/Payload webchat inválido ou vazio/);
    });
  });

  describe('SimpleAIProvider - Rilevamento Intenzioni e Generazione Tools', () => {
    it('deve detectar intent BOOK_APPOINTMENT ed emettere chiamate tool pertinenti', async () => {
      const turnRes = await aiProvider.processTurn(
        mockConfig,
        [],
        "Vorrei prenotare una visita per il 2026-08-02 alle 10:00, cellulare +393401122333",
        [],
        'studio-aurora'
      );

      expect(turnRes.detectedIntent).toBe('BOOK_APPOINTMENT');
      expect(turnRes.toolCalls.length).toBeGreaterThanOrEqual(1);
      const listSrvCall = turnRes.toolCalls.find((t: any) => t.name === 'checkAvailability' && t.args.serviceId === 'AUTO_RESOLVE');
      expect(listSrvCall).toBeDefined();
    });

    it('deve detectar intent CHECK_AVAILABILITY quando cliente chiede orari disponibili', async () => {
      const turnRes = await aiProvider.processTurn(
        mockConfig,
        [],
        "Quali sono gli orari disponibili per domani?",
        [],
        'studio-aurora'
      );

      expect(turnRes.detectedIntent).toBe('BOOK_APPOINTMENT');
      const srvCall = turnRes.toolCalls.find((t: any) => t.name === 'checkAvailability' && t.args.serviceId === 'AUTO_RESOLVE');
      expect(srvCall).toBeDefined();
    });

    it('deve detectar intent CANCEL_APPOINTMENT ed emettere tool cancelAppointment', async () => {
      const turnRes = await aiProvider.processTurn(
        mockConfig,
        [],
        "Vorrei cancellare il mio appuntamento di domani.",
        [],
        'studio-aurora'
      );

      expect(turnRes.detectedIntent).toBe('CANCEL_APPOINTMENT');
      expect(turnRes.toolCalls[0].name).toBe('cancelAppointment');
    });

    it('deve rispondere in modo conversazionale per GENERAL_INFORMATION senza chiamare tools', async () => {
      const turnRes = await aiProvider.processTurn(
        mockConfig,
        [],
        "Ciao Sofia, buongiorno!",
        [],
        'studio-aurora'
      );

      expect(turnRes.detectedIntent).toBe('GENERAL_INFORMATION');
      expect(turnRes.toolCalls).toHaveLength(0);
      expect(turnRes.replyText).toBe('');
    });

    it('deve reconhecer intenções fiscais em linguagem natural (commercialista, tasse, bilancio, etc) e sugerir agendamento', async () => {
      const phrases = [
        "Ho bisogno di parlare con un commercialista",
        "Mi serve aiuto con le tasse",
        "Devo sistemare il bilancio",
        "Ho un problema fiscale",
        "Vorrei parlare con qualcuno per le tasse"
      ];

      for (const phrase of phrases) {
        const turnRes = await aiProvider.processTurn(
          mockConfig,
          [],
          phrase,
          [],
          'studio-aurora'
        );
        expect(turnRes.detectedIntent).toBe('BOOK_APPOINTMENT');
        const checkCall = turnRes.toolCalls.find((t: any) => t.name === 'checkAvailability');
        expect(checkCall).toBeDefined();
        expect(checkCall?.args.serviceId).toBe('AUTO_RESOLVE');
      }
    });
  });

  describe('SimpleAIProvider - Generazione Risposta Basata sul Esito Database (Guardrail WAI)', () => {
    it('deve generare risposta di successo confermando la prenotazione creata', async () => {
      const toolResults = [
        { toolName: 'createAppointment', success: true, executionTimeMs: 12, result: { id: 'appt-999', scheduledAt: '2026-08-02 10:00' } }
      ];
      const reply = await aiProvider.generateReplyFromToolResults(
        mockConfig,
        'BOOK_APPOINTMENT',
        "user text",
        toolResults,
        'studio-aurora',
        "[WAI_STEP_CONFIRM]"
      );

      expect(reply).toContain('Prenotazione confermata');
      expect(reply).toContain('A presto!');
    });

    it('deve gestire collisione GIST (sovrapposizione oraria) spiegando in modo empatico', async () => {
      const toolResults = [
        { 
          toolName: 'createAppointment', 
          success: false, 
          isGistOverlapError: true, 
          executionTimeMs: 8, 
          error: 'SOVRAPPOSIZIONE_GIST: Il professionista è già prenotato in questo slot.' 
        }
      ];
      const reply = await aiProvider.generateReplyFromToolResults(
        mockConfig,
        'BOOK_APPOINTMENT',
        "user text",
        toolResults,
        'studio-aurora',
        "[WAI_STEP_CONFIRM]"
      );

      expect(reply).toContain('Mi dispiace, questo orario non è più disponibile');
      expect(reply).toContain('Scegli un altro orario.');
    });

    it('TEST 7: deve reconhecer serviço informado pelo usuário e pular [WAI_STEP_SERVICE] direto para [WAI_STEP_WEEK]', async () => {
      const toolResults = [
        { toolName: 'listServices', success: true, executionTimeMs: 10, result: { found: true, services: [{ name: 'Consulenza Fiscale Iniziale', duration_minutes: 45, price_cents: 12000 }] } }
      ];
      const reply = await aiProvider.generateReplyFromToolResults(
        mockConfig,
        'BOOK_APPOINTMENT',
        "Vorrei prenotare una consulenza fiscale",
        toolResults,
        'studio-aurora',
        "[WAI_STEP_SERVICE_CHECK]"
      );

      expect(reply).toContain('[WAI_STEP_SERVICE]');
      expect(reply).toContain('Quale servizio ti serve?');
    });

    it('TEST 8: deve filtrar estritamente histórico persistido garantindo que somente datas com availableSlots > 0 gerem disponibilidade', () => {
      const persistedToolCalls = [
        { toolName: 'checkAvailability', arguments: { date: '2026-08-03' }, result: { result: { availableSlots: [] } } },
        { toolName: 'checkAvailability', arguments: { date: '2026-08-04' }, result: { result: { availableSlots: ['09:00', '10:00'] } } }
      ];

      const validDays = persistedToolCalls
        .map(c => extractAvailabilityFromToolCall(c))
        .filter((a): a is NonNullable<typeof a> => a !== null && a.success && a.availableSlots.length > 0);

      expect(validDays).toHaveLength(1);
      expect(validDays[0].date).toBe('2026-08-04');
      expect(validDays[0].availableSlots).toEqual(['09:00', '10:00']);
    });
  });
});
