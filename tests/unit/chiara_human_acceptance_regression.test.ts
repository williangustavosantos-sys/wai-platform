import { describe, expect, it } from 'vitest';
import { DeterministicResponseGenerator } from '../../src/modules/ai/deterministic_response_generator';
import {
  AIProviderContext,
  ConversationWorkflow,
  LocalIntentRouter,
  RoutedEntities,
} from '../../src/modules/ai/local_intent_router';
import { CustomerLanguage, detectCustomerLanguage } from '../../src/modules/conversation/customer_language';

const services = [
  { id: 'service-tax', name: 'Consulenza Fiscale' },
  { id: 'service-payroll', name: 'Gestione Paghe' },
];
const professionals = [{ id: 'professional-1', name: 'Dott.ssa Bianchi' }];
const baseContext: AIProviderContext = {
  organization: { timezone: 'Europe/Rome' },
  services,
  professionals,
  customers: [],
};

const router = new LocalIntentRouter();
const responses = new DeterministicResponseGenerator();

function startBooking(message: string, language: CustomerLanguage) {
  const route = router.route(message, baseContext);
  const calls = router.convertToToolCalls(route, baseContext.organization.timezone);
  // When no service is resolved, the booking flow asks for it (SERVICE step);
  // otherwise the check tool asks for a date first.
  const outcome = route.entities.service
    ? { toolName: 'checkAvailability', success: false, code: 'DATE_REQUIRED' }
    : { toolName: 'checkAvailability', success: true, code: 'SERVICE_SELECTION_REQUIRED', result: { requiresServiceSelection: true } };
  const reply = responses.generateReply(
    route.intent,
    [outcome],
    route.entities,
    message,
    baseContext.organization.timezone,
    language,
  );
  return { route, calls, reply };
}

function workflowFrom(entities: RoutedEntities): ConversationWorkflow {
  return { intent: 'CHECK_AVAILABILITY', entities };
}

describe('P1 human acceptance regressions — multilingual Chiara booking', () => {
  it('1. starts an Italian booking request in Italian and resolves the requested service', () => {
    const message = 'Vorrei prenotare una consulenza fiscale';
    const language = detectCustomerLanguage(message, 'en');
    const { route, calls, reply } = startBooking(message, language);

    expect(language).toBe('it');
    expect(route.intent).toBe('CHECK_AVAILABILITY');
    expect(route.entities.service).toMatchObject({ id: 'service-tax' });
    expect(calls).toEqual([{ name: 'checkAvailability', args: expect.objectContaining({ serviceId: 'service-tax' }) }]);
    expect(reply).toContain('Quale giorno preferisci?');
    expect(reply).not.toContain('Richiesta completata');
  });

  it('2. starts an English booking request in English against an Italian service catalog', () => {
    const message = 'I would like to book a consultation';
    const language = detectCustomerLanguage(message, 'it');
    const { route, reply } = startBooking(message, language);

    expect(language).toBe('en');
    expect(route.intent).toBe('CHECK_AVAILABILITY');
    // "consultation" is a generic booking word (like "visita"): with multiple
    // services available the service is NOT auto-resolved — the flow must ask.
    expect(route.entities.service).toBeUndefined();
    expect(reply).toContain('Which service would you like to book?');
  });

  it('3. starts a Portuguese booking request in Portuguese', () => {
    const message = 'Gostaria de marcar uma consulta';
    const language = detectCustomerLanguage(message, 'it');
    const { route, reply } = startBooking(message, language);

    expect(language).toBe('pt');
    expect(route.intent).toBe('CHECK_AVAILABILITY');
    // Same product rule as the English case: a generic "consulta" must not
    // auto-resolve a service when the catalog has several options.
    expect(route.entities.service).toBeUndefined();
    expect(reply).toContain('Qual serviço você gostaria de agendar?');
  });

  it('4. follows the customer when they change language during the booking conversation', () => {
    const first = router.route('Vorrei prenotare una consulenza fiscale', baseContext);
    const switchedMessage = 'Tomorrow at 10:00, please';
    const switchedLanguage = detectCustomerLanguage(switchedMessage, 'it');
    const switched = router.route(switchedMessage, { ...baseContext, workflow: workflowFrom(first.entities) });
    const reply = responses.generateReply(
      switched.intent,
      [{ toolName: 'createAppointment', success: false, code: 'CUSTOMER_FULL_NAME_REQUIRED' }],
      switched.entities,
      switchedMessage,
      baseContext.organization.timezone,
      switchedLanguage,
    );

    expect(switchedLanguage).toBe('en');
    expect(switched.intent).toBe('CREATE_APPOINTMENT');
    expect(reply).toContain('please provide your first name, last name');
  });

  it('5. keeps the booking workflow open while date, time, and customer details are missing', () => {
    const initial = router.route('I would like to book a tax consultation', baseContext);
    const withDate = router.route('Tomorrow', { ...baseContext, workflow: workflowFrom(initial.entities) });

    expect(withDate.intent).toBe('CHECK_AVAILABILITY');
    expect(withDate.entities.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const slotsReply = responses.generateReply(
      withDate.intent,
      [{
        toolName: 'checkAvailability',
        success: true,
        code: 'AVAILABILITY_FOUND',
        result: { date: withDate.entities.date, availableSlots: ['09:00', '10:00'] },
      }],
      withDate.entities,
      'Tomorrow',
      baseContext.organization.timezone,
      'en',
    );
    expect(slotsReply).toContain('Which one do you prefer?');

    const withTime = router.route('10:00', { ...baseContext, workflow: workflowFrom(withDate.entities) });
    const bookingCalls = router.convertToToolCalls(withTime, baseContext.organization.timezone);
    expect(withTime.intent).toBe('CREATE_APPOINTMENT');
    expect(bookingCalls.map((call) => call.name)).toEqual(['checkAvailability', 'createAppointment']);

    const identityReply = responses.generateReply(
      withTime.intent,
      [{ toolName: 'createAppointment', success: false, code: 'CUSTOMER_FULL_NAME_REQUIRED' }],
      withTime.entities,
      '10:00',
      baseContext.organization.timezone,
      'en',
    );
    expect(identityReply).toContain('verifiable phone number');

    const withIdentity = router.route(
      'My name is John Smith and my phone is +44 7700 900123',
      { ...baseContext, workflow: workflowFrom(withTime.entities) },
    );
    expect(withIdentity.intent).toBe('CREATE_APPOINTMENT');
    expect(withIdentity.entities).toMatchObject({
      requestedCustomerFirstName: 'John',
      requestedCustomerLastName: 'Smith',
      requestedCustomerPhone: '+44 7700 900123',
    });
  });

  it('6. confirms only after a successful persisted appointment creation', () => {
    const premature = responses.generateReply(
      'CHECK_AVAILABILITY',
      [{ toolName: 'checkAvailability', success: true, code: 'AVAILABILITY_FOUND', result: { date: '2026-08-20', availableSlots: ['10:00'] } }],
      {},
      '10:00',
      'Europe/Rome',
      'en',
    );
    const failed = responses.generateReply(
      'CREATE_APPOINTMENT',
      [{ toolName: 'createAppointment', success: false, code: 'SLOT_OCCUPIED' }],
      {},
      '10:00',
      'Europe/Rome',
      'en',
    );
    const unverifiedSuccess = responses.generateReply(
      'CREATE_APPOINTMENT',
      [{ toolName: 'createAppointment', success: true }],
      {},
      '10:00',
      'Europe/Rome',
      'en',
    );
    const confirmed = responses.generateReply(
      'CREATE_APPOINTMENT',
      [{
        toolName: 'createAppointment',
        success: true,
        code: 'APPOINTMENT_CREATED',
        appointmentId: 'appointment-1',
        result: { appointment: { id: 'appointment-1', startAt: '2026-08-20T08:00:00.000Z' } },
      }],
      {},
      '10:00',
      'Europe/Rome',
      'en',
    );

    expect(premature.toLowerCase()).not.toContain('confirm');
    expect(failed.toLowerCase()).not.toContain('confirm');
    expect(unverifiedSuccess.toLowerCase()).not.toContain('confirm');
    expect(confirmed).toContain('booking is confirmed');
  });

  it('keeps an Italian confirmation question in Italian despite the loanword agendamento', () => {
    expect(detectCustomerLanguage('Come posso confermare il mio agendamento?', 'pt')).toBe('it');
  });

  it('resolves Italian tax-domain aliases to the fiscal service', () => {
    const commercialista = router.route(
      'Ho bisogno di parlare con un commercialista per un problema con le tasse',
      baseContext,
    );
    const partitaIva = router.route(
      'Vorrei un incontro per parlare di Partita IVA forfettaria',
      baseContext,
    );

    expect(commercialista.entities.service).toMatchObject({ id: 'service-tax' });
    expect(partitaIva.entities.service).toMatchObject({ id: 'service-tax' });
  });

  it('requires verification for phone and registered-name changes', () => {
    const phoneChange = router.route(
      'Ho cambiato numero, il mio nuovo numero è +39 399 0001122',
      baseContext,
    );
    const nameChange = router.route(
      'Mi sono registrata come Francesca, ma il mio nome completo è Francesca Maria Romano',
      baseContext,
    );

    expect(phoneChange.entities.requestedPhoneChange).toBe(true);
    expect(responses.generateReply(
      nameChange.intent,
      [{ toolName: 'findCustomer', success: true, code: 'CUSTOMER_FOUND' }],
      nameChange.entities,
      'Mi sono registrata come Francesca, ma il mio nome completo è Francesca Maria Romano',
      'Europe/Rome',
      'it',
    )).toContain('verifica di identità');
  });

  it('detects a booking identity conflict without relying on fixture names or phone punctuation', () => {
    const route = router.route(
      'Buongiorno, sono Luca Bianchi (+39 340 1234567). Vorrei prenotare.',
      {
        ...baseContext,
        customer: { id: 'customer-verified', firstName: 'Andrea', lastName: 'Verdi' },
      },
    );

    expect(route.entities.customer?.conflictsWithVerifiedCustomer).toBe(true);
  });

  it('does not execute or confirm ambiguous cancellation and reschedule commands', () => {
    const route = router.route(
      'Vorrei disdire, anzi spostare, no aspetta annulla tutto',
      baseContext,
    );
    const reply = responses.generateReply(route.intent, [], route.entities, undefined, 'Europe/Rome', 'it');

    expect(route.entities.conflictingActions).toBe(true);
    expect(reply).toContain('una sola operazione');
    expect(reply.toLowerCase()).not.toContain('cancellato');
  });
});
