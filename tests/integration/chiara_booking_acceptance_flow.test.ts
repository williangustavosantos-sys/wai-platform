import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { WebChatAdapter } from '../../src/modules/conversation/webchat_adapter';

const acceptanceState = vi.hoisted(() => ({
  messages: [] as Array<{
    id: string;
    organizationId: string;
    conversationId: string;
    role: 'customer' | 'assistant' | 'system';
    content: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>,
  appointmentCreates: 0,
}));

vi.mock('@/security/auth', () => ({
  verifyOrganizationAccess: vi.fn().mockResolvedValue({
    organizationId: 'organization-1',
    organizationName: 'Studio Aurora',
    organizationSlug: 'studio-aurora',
    role: 'organization_owner',
    timezone: 'Europe/Rome',
    locale: 'it-IT',
    settingsJson: {},
  }),
}));

vi.mock('@/modules/assistant/assistant.service', () => ({
  getAssistantConfig: vi.fn().mockResolvedValue({
    id: 'assistant-1',
    organizationId: 'organization-1',
    name: 'Chiara',
    personalitySummary: 'Receptionist',
    language: 'it-IT',
    communicationTone: 'cordial_empathic',
    avatarPlaceholderUrl: 'C',
    isDefault: true,
    status: 'active',
    settingsJson: {},
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }),
}));

vi.mock('@/modules/calendar/calendar.service', () => ({
  listServices: vi.fn().mockResolvedValue([
    { id: 'service-tax', name: 'Consulenza Fiscale', durationMinutes: 60, status: 'active' },
  ]),
  listProfessionals: vi.fn().mockResolvedValue([
    { id: 'professional-1', name: 'Dott.ssa Bianchi', status: 'active' },
  ]),
}));

vi.mock('@/modules/crm/crm.service', async () => {
  const actual = await vi.importActual<typeof import('../../src/modules/crm/crm.service')>('../../src/modules/crm/crm.service');
  return {
    ...actual,
    listCustomers: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('@/modules/messages/messages.service', () => ({
  listConversations: vi.fn().mockResolvedValue([]),
  createConversation: vi.fn(),
  listMessages: vi.fn().mockImplementation(async () => [...acceptanceState.messages]),
  createMessage: vi.fn().mockImplementation(async (
    _client: unknown,
    _adminClient: unknown,
    _userId: string,
    _organizationSlug: string,
    input: { conversationId: string; role: 'customer' | 'assistant' | 'system'; content: string; metadata?: Record<string, unknown> },
  ) => {
    const created = {
      id: `message-${acceptanceState.messages.length + 1}`,
      organizationId: 'organization-1',
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      metadata: input.metadata || {},
      createdAt: new Date().toISOString(),
    };
    acceptanceState.messages.push(created);
    return { success: true, data: created };
  }),
}));

vi.mock('@/modules/tools/tools.service', () => ({
  DEFINED_TOOLS: [],
  executeToolByName: vi.fn().mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'checkAvailability') {
      if (!args.date) return { success: false, code: 'DATE_REQUIRED', error: 'Date required' };
      return {
        success: true,
        code: 'AVAILABILITY_FOUND',
        result: {
          date: args.date,
          availableSlots: ['09:00', '10:00'],
          slotsDetails: [
            { time: '09:00', professionalId: 'professional-1', professionalName: 'Dott.ssa Bianchi' },
            { time: '10:00', professionalId: 'professional-1', professionalName: 'Dott.ssa Bianchi' },
          ],
        },
      };
    }
    if (name === 'createCustomer') {
      return { success: true, code: 'CUSTOMER_CREATED', result: { customer: { id: 'customer-1', ...args } } };
    }
    if (name === 'createAppointment') {
      acceptanceState.appointmentCreates += 1;
      return {
        success: true,
        code: 'APPOINTMENT_CREATED',
        appointmentId: 'appointment-1',
        result: { appointment: { id: 'appointment-1', startAt: args.startAt } },
      };
    }
    return { success: false, code: 'UNEXPECTED_TOOL', error: name };
  }),
}));

import { processConversationTurn } from '../../src/modules/conversation/conversation.service';

describe('Chiara booking orchestration acceptance flow', () => {
  beforeEach(() => {
    acceptanceState.messages = [];
    acceptanceState.appointmentCreates = 0;
  });

  it('collects missing details in English and confirms only after the operational create succeeds', async () => {
    const client = {} as SupabaseClient;
    const adapter = new WebChatAdapter();
    const turn = (text: string, sequence: number) => processConversationTurn(
      client,
      client,
      'owner-1',
      'studio-aurora',
      adapter,
      { conversationId: 'conversation-1', text },
      `acceptance-${sequence}`,
    );

    const start = await turn('I would like to book a tax consultation', 1);
    expect(start.detectedIntent).toBe('CHECK_AVAILABILITY');
    expect(start.replyText).toContain('What date do you prefer?');
    expect(acceptanceState.appointmentCreates).toBe(0);

    const date = await turn('Tomorrow', 2);
    expect(date.replyText).toContain('Available times');
    expect(acceptanceState.appointmentCreates).toBe(0);

    const time = await turn('10:00', 3);
    expect(time.replyText).toContain('first name, last name');
    expect(time.replyText.toLowerCase()).not.toContain('confirmed');
    expect(acceptanceState.appointmentCreates).toBe(0);

    const identity = await turn('My name is John Smith and my phone is +44 7700 900123', 4);
    expect(identity.detectedIntent).toBe('CREATE_APPOINTMENT');
    expect(identity.replyText).toContain('booking is confirmed');
    expect(identity.toolCalls.map((call) => call.toolName)).toEqual(['checkAvailability', 'createCustomer', 'createAppointment']);
    expect(acceptanceState.appointmentCreates).toBe(1);
  });
});
