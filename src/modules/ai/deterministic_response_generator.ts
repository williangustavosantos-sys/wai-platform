import { Intent, OperationalResult, StructuredMessage, StructuredMessageOption } from '../conversation/conversation.types';
import { CustomerLanguage } from '../conversation/customer_language';
import { ToolResultSummary } from './ai.types';
import { RoutedEntities, ConversationWorkflow } from './local_intent_router';
import { DigitalEmployeeConfig } from '../assistant/assistant.types';
import { Customer } from '../crm/crm.types';
import { BookingFlowStep } from '../conversation/booking.flow';

interface DRGConfig {
  organization: { id: string; name?: string; timezone?: string; settingsJson?: Record<string, unknown> };
  customer?: Customer | { id: string; firstName?: string; lastName?: string; phoneNormalized: string; organizationId: string; status: Customer['status'] };
  conversation: { id: string; organization_id: string; channel: string; status: string; created_at: string; updated_at: string };
  digitalEmployee: DigitalEmployeeConfig | { id: string; name: string; language: string; communicationTone: string; status: string; organizationId: string; enableAiHumanization?: boolean };
  language: string;
}

type UnknownRecord = Record<string, unknown>;

interface ResponseCopy {
  privacyDenied: string;
  thirdPartyDenied: string;
  identityConflict: string;
  phoneChange: string;
  anonymous: string;
  invalidDate: string;
  conflictingActions: string;
  paymentAdmin: string;
  emailVerification: string;
  profileVerification: string;
  humanHandoff: string;
  unknown: string;
  genericQuestion: string;
  dateRequired: (service?: string) => string;
  serviceSelection: (services: string[]) => string;
  professionalSelection: (professionals: string[]) => string;
  customerDetailsRequired: string;
  newStartRequired: string;
  slotUnavailable: string;
  slotOccupiedWith: (when: string) => string;
  appointmentNotFound: string;
  customerNotFound: string;
  identityRequired: string;
  permissionDenied: string;
  genericFailure: string;
  noAvailability: string;
  availableSlots: (date: unknown, slots: string[]) => string;
  availabilityNeedsDetails: string;
  professionalSelectionWithService: (service: string | undefined, professionals: string[]) => string;
  daySelection: (service: string | undefined, professional: string | undefined, days: string[]) => string;
  slotSelection: (service: string | undefined, professional: string | undefined, slots: string[]) => string;
  noAvailabilityWindow: (days: number) => string;
  confirmBooking: () => string;
  confirmed: (when?: string, service?: string, professional?: string) => string;
  cancelled: string;
  rescheduled: (when?: string) => string;
  services: (items: string[]) => string;
  noServices: string;
  address: (address: unknown, hours?: unknown) => string;
  hours: (hours: unknown) => string;
  phone: (phone: unknown) => string;
  professionals: (names: string[]) => string;
  noProfessionals: string;
  privacyInfo: string;
  companyInfo: (name: unknown, hours?: unknown) => string;
  noAppointments: (name?: string) => string;
  appointments: (name: string | undefined, summary: string) => string;
  profileFound: (name?: string) => string;
  handoffCompleted: string;
  operationCompleted: string;
}

const COPY: Record<CustomerLanguage, ResponseCopy> = {
  it: {
    privacyDenied: 'Queste informazioni sono riservate. Per privacy e sicurezza non posso eseguire questa richiesta.',
    thirdPartyDenied: 'Per privacy, una prenotazione può essere modificata o cancellata solo dal titolare tramite il suo recapito verificato.',
    identityConflict: 'I dati indicati non corrispondono al recapito verificato. Per sicurezza, contatta la segreteria per completare la verifica.',
    phoneChange: 'Per modificare il numero di telefono associato al profilo è necessaria una verifica di identità con la segreteria.',
    anonymous: 'Per procedere con una prenotazione sono necessari nome, cognome e un recapito verificabile.',
    invalidDate: 'La data indicata non è valida. Indica un giorno corretto per verificare la disponibilità.',
    conflictingActions: 'Hai indicato azioni diverse. Per sicurezza, specifica una sola operazione e l’appuntamento interessato.',
    paymentAdmin: 'Per verificare pagamenti o fatture, contatta il reparto amministrativo dello studio.',
    emailVerification: 'Per confermare o comunicare l’indirizzo e-mail associato al profilo è necessaria una verifica di identità.',
    profileVerification: 'Per aggiornare i dati del profilo è necessaria una verifica di identità con la segreteria.',
    humanHandoff: 'Ti metto in contatto con un operatore umano.',
    unknown: 'Non sono sicuro di aver capito. Puoi riformulare la richiesta o chiedere un operatore?',
    genericQuestion: 'Come posso aiutarti?',
    dateRequired: (service) => service
      ? `Certamente. Posso aiutarti a prenotare ${service}. Quale giorno preferisci? Così verifico la disponibilità.`
      : 'Certamente. Quale giorno preferisci per l’appuntamento? Così verifico la disponibilità.',
    serviceSelection: (services) => services.length
      ? `Quale servizio desideri prenotare? Disponibili: ${services.join(', ')}.`
      : 'Quale servizio desideri prenotare?',
    professionalSelection: (professionals) => professionals.length
      ? `Con quale professionista desideri prenotare? Disponibili: ${professionals.join(', ')}.`
      : 'Con quale professionista desideri prenotare?',
    customerDetailsRequired: 'Per completare la prenotazione, indicami nome, cognome e un numero di telefono verificabile.',
    newStartRequired: 'Quale nuova data e ora desideri per riprogrammare l’appuntamento?',
    slotUnavailable: 'L’orario richiesto non è disponibile. Scegli un’altra fascia disponibile.',
    slotOccupiedWith: (when) => `L’orario richiesto (${when}) non è disponibile. Scegli un’altra fascia disponibile.`,
    appointmentNotFound: 'Non ho trovato un appuntamento attivo da modificare.',
    customerNotFound: 'Non ho trovato un profilo associato al recapito indicato.',
    identityRequired: 'Per modificare o cancellare un appuntamento, usa il recapito verificato del titolare.',
    permissionDenied: 'Questa operazione non è consentita con le autorizzazioni correnti.',
    genericFailure: 'Non è stato possibile completare l’operazione. Riprova oppure contatta la segreteria.',
    noAvailability: 'Non ci sono fasce disponibili per il giorno richiesto. Scegli un’altra data.',
    availableSlots: (date, slots) => `Orari disponibili per il ${String(date)}: ${slots.slice(0, 5).join(', ')}. Quale preferisci?`,
    availabilityNeedsDetails: 'Ho verificato la disponibilità. Indica servizio e professionista per continuare.',
    professionalSelectionWithService: (service, professionals) => {
      const head = service
        ? `Per prenotare il servizio ${service}, preferisce un professionista specifico?`
        : 'Preferisce un professionista specifico?';
      return professionals.length ? `${head} Disponibili: ${professionals.join(', ')}.` : head;
    },
    daySelection: (service, professional, days) => `Perfetto. Per ${service || 'la tua prenotazione'}${professional ? ` con ${professional}` : ''}, ecco le giornate con disponibilità: ${days.join(', ')}. Quale giorno preferisci?`,
    slotSelection: (service, professional, slots) => {
      const subject = [service && `per ${service}`, professional && `con ${professional}`].filter(Boolean).join(' ');
      return `Ho trovato questi orari disponibili${subject ? ` ${subject}` : ''}: ${slots.join(', ')}. Quale orario preferisci?`;
    },
    noAvailabilityWindow: (days) => `Non ho trovato disponibilità nei prossimi ${days} giorni. Posso avvisarla appena si libera un orario?`,
    confirmBooking: () => 'Confermi la prenotazione? Ecco il riepilogo:',
    confirmed: (when, service, professional) => {
      if (!when && !service && !professional) return 'Prenotazione confermata.';
      const subject = [service && `${service}`, professional && `con ${professional}`].filter(Boolean).join(' ');
      return subject ? `Prenotazione confermata: ${subject}, ${when}.` : `Prenotazione confermata per il ${when}.`;
    },
    cancelled: 'L’appuntamento è stato cancellato e lo slot è di nuovo disponibile.',
    rescheduled: (when) => when ? `L’appuntamento è stato riprogrammato per il ${when}.` : 'L’appuntamento è stato riprogrammato.',
    services: (items) => `Servizi disponibili: ${items.join('; ')}.`,
    noServices: 'Non ci sono servizi attivi configurati.',
    address: (address, hours) => hours ? `Lo studio si trova in ${String(address)}. Orari: ${String(hours)}.` : `Lo studio si trova in ${String(address)}.`,
    hours: (hours) => `Orari di apertura: ${String(hours)}.`,
    phone: (phone) => `Il recapito dello studio è ${String(phone)}.`,
    professionals: (names) => `I professionisti disponibili sono: ${names.join(', ')}.`,
    noProfessionals: 'Non ci sono professionisti attivi configurati.',
    privacyInfo: 'Trattiamo i dati nel rispetto della privacy. Non posso comunicare informazioni riservate o di altri clienti.',
    companyInfo: (name, hours) => `Informazioni dello studio: ${String(name || '')}${hours ? ` — ${String(hours)}` : ''}`.trim(),
    noAppointments: (name) => name ? `${name}, non risultano appuntamenti attivi.` : 'Non risultano appuntamenti attivi.',
    appointments: (name, summary) => `${name || 'Il tuo profilo'}: appuntamenti registrati il ${summary}.`,
    profileFound: (name) => name ? `Ho trovato il profilo di ${name}. Come posso aiutarti?` : 'Ho trovato il profilo associato al recapito.',
    handoffCompleted: 'Ho inoltrato la richiesta alla segreteria. Un operatore ti risponderà appena possibile.',
    operationCompleted: 'Operazione completata.',
  },
  en: {
    privacyDenied: 'This information is confidential. For privacy and security reasons, I cannot complete this request.',
    thirdPartyDenied: 'For privacy reasons, a booking can only be changed or cancelled by its owner using their verified contact details.',
    identityConflict: 'The details provided do not match the verified contact. Please contact the reception team to complete verification.',
    phoneChange: 'Changing the phone number linked to a profile requires identity verification with the reception team.',
    anonymous: 'To proceed with a booking, I need your first name, last name, and a verifiable contact number.',
    invalidDate: 'That date is not valid. Please provide a valid date so I can check availability.',
    conflictingActions: 'You requested different actions. For safety, please specify one operation and the appointment involved.',
    paymentAdmin: 'Please contact the administrative team to check payments or invoices.',
    emailVerification: 'Identity verification is required to confirm or share the email address linked to the profile.',
    profileVerification: 'To update your profile details, identity verification with the reception team is required.',
    humanHandoff: 'I’ll connect you with a human operator.',
    unknown: 'I’m not sure I understood. Could you rephrase your request or ask for a human operator?',
    genericQuestion: 'How can I help you?',
    dateRequired: (service) => service
      ? `Certainly. I can help you book ${service}. What date do you prefer? I’ll check availability for you.`
      : 'Certainly. What date do you prefer? I’ll check availability for you.',
    serviceSelection: (services) => services.length
      ? `Which service would you like to book? Available services: ${services.join(', ')}.`
      : 'Which service would you like to book?',
    professionalSelection: (professionals) => professionals.length
      ? `Which professional would you like to book with? Available professionals: ${professionals.join(', ')}.`
      : 'Which professional would you like to book with?',
    customerDetailsRequired: 'To complete the booking, please provide your first name, last name, and a verifiable phone number.',
    newStartRequired: 'What new date and time would you like for the appointment?',
    slotUnavailable: 'The requested time is not available. Please choose another available time.',
    slotOccupiedWith: (when) => `The requested time (${when}) is not available. Please choose another available time.`,
    appointmentNotFound: 'I could not find an active appointment to change.',
    customerNotFound: 'I could not find a profile linked to the contact details provided.',
    identityRequired: 'To change or cancel an appointment, please use the booking owner’s verified contact details.',
    permissionDenied: 'This operation is not allowed with the current permissions.',
    genericFailure: 'I could not complete the operation. Please try again or contact the reception team.',
    noAvailability: 'There are no available times on the requested date. Please choose another date.',
    availableSlots: (date, slots) => `Available times on ${String(date)}: ${slots.slice(0, 5).join(', ')}. Which one do you prefer?`,
    availabilityNeedsDetails: 'I checked availability. Please provide the service and professional to continue.',
    professionalSelectionWithService: (service, professionals) => {
      const head = service
        ? `To book the ${service} service, do you prefer a specific professional?`
        : 'Do you prefer a specific professional?';
      return professionals.length ? `${head} Available: ${professionals.join(', ')}.` : head;
    },
    daySelection: (service, professional, days) => `Great. For ${service || 'your booking'}${professional ? ` with ${professional}` : ''}, these are the days with availability: ${days.join(', ')}. Which day do you prefer?`,
    slotSelection: (service, professional, slots) => {
      const subject = [service && `for ${service}`, professional && `with ${professional}`].filter(Boolean).join(' ');
      return `Here are the available times${subject ? ` ${subject}` : ''}: ${slots.join(', ')}. Which one do you prefer?`;
    },
    noAvailabilityWindow: (days) => `I couldn't find any availability in the next ${days} days. Should I notify you as soon as a slot opens up?`,
    confirmBooking: () => 'Shall I confirm the booking? Here is the summary:',
    confirmed: (when, service, professional) => {
      if (!when && !service && !professional) return 'Your booking is confirmed.';
      const subject = [service && `${service}`, professional && `with ${professional}`].filter(Boolean).join(' ');
      return subject ? `Your booking is confirmed: ${subject}, ${when}.` : `Your booking is confirmed for ${when}.`;
    },
    cancelled: 'The appointment has been cancelled and the time is available again.',
    rescheduled: (when) => when ? `The appointment has been rescheduled for ${when}.` : 'The appointment has been rescheduled.',
    services: (items) => `Available services: ${items.join('; ')}.`,
    noServices: 'There are no active services configured.',
    address: (address, hours) => hours ? `The office is located at ${String(address)}. Opening hours: ${String(hours)}.` : `The office is located at ${String(address)}.`,
    hours: (hours) => `Opening hours: ${String(hours)}.`,
    phone: (phone) => `The office phone number is ${String(phone)}.`,
    professionals: (names) => `The available professionals are: ${names.join(', ')}.`,
    noProfessionals: 'There are no active professionals configured.',
    privacyInfo: 'We handle data in accordance with privacy requirements. I cannot disclose confidential information or information about other customers.',
    companyInfo: (name, hours) => `Office information: ${String(name || '')}${hours ? ` — ${String(hours)}` : ''}`.trim(),
    noAppointments: (name) => name ? `${name}, there are no active appointments on record.` : 'There are no active appointments on record.',
    appointments: (name, summary) => `${name || 'Your profile'}: appointments are recorded for ${summary}.`,
    profileFound: (name) => name ? `I found the profile for ${name}. How can I help you?` : 'I found the profile linked to this contact.',
    handoffCompleted: 'I forwarded your request to the reception team. A human operator will reply as soon as possible.',
    operationCompleted: 'Operation completed.',
  },
  pt: {
    privacyDenied: 'Estas informações são confidenciais. Por motivos de privacidade e segurança, não posso realizar este pedido.',
    thirdPartyDenied: 'Por motivos de privacidade, uma reserva só pode ser alterada ou cancelada pelo titular usando o contato verificado.',
    identityConflict: 'Os dados informados não correspondem ao contato verificado. Fale com a recepção para concluir a verificação.',
    phoneChange: 'A alteração do telefone associado ao perfil exige verificação de identidade com a recepção.',
    anonymous: 'Para prosseguir com uma reserva, preciso do seu nome, sobrenome e um telefone verificável.',
    invalidDate: 'A data informada não é válida. Informe uma data correta para eu verificar a disponibilidade.',
    conflictingActions: 'Você pediu ações diferentes. Por segurança, informe uma única operação e a consulta correspondente.',
    paymentAdmin: 'Fale com o setor administrativo para verificar pagamentos ou faturas.',
    emailVerification: 'É necessária uma verificação de identidade para confirmar ou informar o e-mail associado ao perfil.',
    profileVerification: 'Para atualizar os dados do perfil, é necessária uma verificação de identidade com a recepção.',
    humanHandoff: 'Vou conectar você a um atendente humano.',
    unknown: 'Não tenho certeza se entendi. Pode reformular o pedido ou solicitar um atendente humano?',
    genericQuestion: 'Como posso ajudar?',
    dateRequired: (service) => service
      ? `Claro. Posso ajudar você a marcar ${service}. Qual data você prefere? Vou verificar a disponibilidade.`
      : 'Claro. Qual data você prefere para a consulta? Vou verificar a disponibilidade.',
    serviceSelection: (services) => services.length
      ? `Qual serviço você gostaria de agendar? Serviços disponíveis: ${services.join(', ')}.`
      : 'Qual serviço você gostaria de agendar?',
    professionalSelection: (professionals) => professionals.length
      ? `Com qual profissional você gostaria de agendar? Profissionais disponíveis: ${professionals.join(', ')}.`
      : 'Com qual profissional você gostaria de agendar?',
    customerDetailsRequired: 'Para concluir a reserva, informe seu nome, sobrenome e um número de telefone verificável.',
    newStartRequired: 'Qual nova data e horário você deseja para a consulta?',
    slotUnavailable: 'O horário solicitado não está disponível. Escolha outro horário disponível.',
    slotOccupiedWith: (when) => `O horário solicitado (${when}) não está disponível. Escolha outro horário disponível.`,
    appointmentNotFound: 'Não encontrei uma consulta ativa para alterar.',
    customerNotFound: 'Não encontrei um perfil associado ao contato informado.',
    identityRequired: 'Para alterar ou cancelar uma consulta, use o contato verificado do titular.',
    permissionDenied: 'Esta operação não é permitida com as autorizações atuais.',
    genericFailure: 'Não foi possível concluir a operação. Tente novamente ou fale com a recepção.',
    noAvailability: 'Não há horários disponíveis na data solicitada. Escolha outra data.',
    availableSlots: (date, slots) => `Horários disponíveis em ${String(date)}: ${slots.slice(0, 5).join(', ')}. Qual você prefere?`,
    availabilityNeedsDetails: 'Verifiquei a disponibilidade. Informe o serviço e o profissional para continuar.',
    professionalSelectionWithService: (service, professionals) => {
      const head = service
        ? `Para agendar o serviço ${service}, prefere um profissional específico?`
        : 'Prefere um profissional específico?';
      return professionals.length ? `${head} Disponíveis: ${professionals.join(', ')}.` : head;
    },
    daySelection: (service, professional, days) => `Perfeito. Para ${service || 'a sua reserva'}${professional ? ` com ${professional}` : ''}, estes são os dias com disponibilidade: ${days.join(', ')}. Qual dia você prefere?`,
    slotSelection: (service, professional, slots) => {
      const subject = [service && `para ${service}`, professional && `com ${professional}`].filter(Boolean).join(' ');
      return `Tenho estes horários disponíveis${subject ? ` ${subject}` : ''}: ${slots.join(', ')}. Qual horário prefere?`;
    },
    noAvailabilityWindow: (days) => `Não encontrei disponibilidade nos próximos ${days} dias. Posso avisá-la assim que um horário for liberado?`,
    confirmBooking: () => 'Confirma a reserva? Aqui está o resumo:',
    confirmed: (when, service, professional) => {
      if (!when && !service && !professional) return 'Sua reserva está confirmada.';
      const subject = [service && `${service}`, professional && `com ${professional}`].filter(Boolean).join(' ');
      return subject ? `Sua reserva está confirmada: ${subject}, ${when}.` : `Sua reserva está confirmada para ${when}.`;
    },
    cancelled: 'A consulta foi cancelada e o horário está disponível novamente.',
    rescheduled: (when) => when ? `A consulta foi remarcada para ${when}.` : 'A consulta foi remarcada.',
    services: (items) => `Serviços disponíveis: ${items.join('; ')}.`,
    noServices: 'Não há serviços ativos configurados.',
    address: (address, hours) => hours ? `O escritório fica em ${String(address)}. Horários: ${String(hours)}.` : `O escritório fica em ${String(address)}.`,
    hours: (hours) => `Horário de funcionamento: ${String(hours)}.`,
    phone: (phone) => `O telefone do escritório é ${String(phone)}.`,
    professionals: (names) => `Os profissionais disponíveis são: ${names.join(', ')}.`,
    noProfessionals: 'Não há profissionais ativos configurados.',
    privacyInfo: 'Tratamos os dados de acordo com as regras de privacidade. Não posso divulgar informações confidenciais ou de outros clientes.',
    companyInfo: (name, hours) => `Informações do escritório: ${String(name || '')}${hours ? ` — ${String(hours)}` : ''}`.trim(),
    noAppointments: (name) => name ? `${name}, não há consultas ativas registradas.` : 'Não há consultas ativas registradas.',
    appointments: (name, summary) => `${name || 'Seu perfil'}: há consultas registradas para ${summary}.`,
    profileFound: (name) => name ? `Encontrei o perfil de ${name}. Como posso ajudar?` : 'Encontrei o perfil associado a este contato.',
    handoffCompleted: 'Encaminhei seu pedido para a recepção. Um atendente responderá assim que possível.',
    operationCompleted: 'Operação concluída.',
  },
};

function formatDateTime(value: unknown, timezone: string, language: CustomerLanguage): string {
  if (typeof value !== 'string' || !value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const locale = language === 'en' ? 'en-GB' : language === 'pt' ? 'pt-BR' : 'it-IT';
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

function asRecordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function lastCheckAvailabilityResult(toolResults: ToolResultSummary[]): UnknownRecord | undefined {
  const result = [...toolResults].reverse().find((item) => item.toolName === 'checkAvailability');
  return result?.result && typeof result.result === 'object' ? result.result as UnknownRecord : undefined;
}

interface FlowDay {
  date: string;
  availableSlots: string[];
  slotsDetails?: UnknownRecord[];
}

function availabilityDays(result: UnknownRecord | undefined): FlowDay[] {
  if (!result || !Array.isArray(result.days)) return [];
  return (result.days as UnknownRecord[])
    .map((day) => ({
      date: typeof day.date === 'string' ? day.date : '',
      availableSlots: Array.isArray(day.availableSlots) ? day.availableSlots.filter((slot): slot is string => typeof slot === 'string') : [],
      slotsDetails: Array.isArray(day.slotsDetails) ? day.slotsDetails : [],
    }))
    .filter((day) => Boolean(day.date) && day.availableSlots.length > 0);
}

function availabilitySlots(result: UnknownRecord | undefined): string[] {
  if (!result || !Array.isArray(result.availableSlots)) return [];
  return result.availableSlots.filter((slot): slot is string => typeof slot === 'string');
}

function availabilitySlotDetails(result: UnknownRecord | undefined): Array<{ time?: string; professionalId?: string; professionalName?: string }> {
  if (!result || !Array.isArray(result.slotsDetails)) return [];
  return (result.slotsDetails as UnknownRecord[]).map((slot) => ({
    time: nonEmptyString(slot.time),
    professionalId: nonEmptyString(slot.professionalId),
    professionalName: nonEmptyString(slot.professionalName),
  }));
}

function formatDayLabel(value: string, language: CustomerLanguage): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  const locale = language === 'en' ? 'en-GB' : language === 'pt' ? 'pt-BR' : 'it-IT';
  // Include the month so the date fact is never ambiguous ("mar 25" could be
  // martedì or marzo without it) and survives fact validation in any language.
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
}

/** Renders a concrete slot as "lun 17 agosto alle 10:00" / "seg 17 ago às 10:00". */
function formatSlotLabel(date: string, time: string, language: CustomerLanguage): string {
  const connector = language === 'en' ? ' at ' : language === 'pt' ? ' às ' : ' alle ';
  return `${formatDayLabel(date, language)}${connector}${time}`;
}

/** Converts verified tool outcomes into the language used in the current customer turn. */
export class DeterministicResponseGenerator {
  private config?: DRGConfig;

  constructor(config?: DRGConfig) {
    this.config = config;
  }

  generateResponse(
    intent: Intent,
    context: {
      toolResults: ToolResultSummary[];
      workflowState?: ConversationWorkflow;
      professionals?: Array<{ id: string; name: string; title?: string | null }>;
      services?: Array<{ id: string; name: string }>;
      flowStep?: BookingFlowStep;
      turnEntities?: RoutedEntities;
      userText?: string;
    },
  ): { baseReplyText: string; structuredContent: StructuredMessage | undefined; operationalResult: OperationalResult } {
    const { toolResults, workflowState, professionals, services, flowStep, turnEntities, userText } = context;
    const config = this.config;
    const language = config?.language || 'it';
    const customerLanguage = language as CustomerLanguage;
    const timezone = config?.organization?.timezone || 'Europe/Rome';
    const employeeName = config?.digitalEmployee ? (config.digitalEmployee as DigitalEmployeeConfig).name : 'Assistente Digitale';

    // Build entities from the workflow state plus the current turn (the workflow
    // is derived from history and does not include the current message yet).
    const entities: RoutedEntities = {
      ...(workflowState?.entities || {}),
      ...(turnEntities || {}),
    };

    if (flowStep && flowStep !== 'NONE') {
      return this.generateFlowResponse(flowStep, intent, toolResults, entities, professionals, services, customerLanguage, timezone, userText);
    }

    const baseReplyText = this.generateReply(
      intent,
      toolResults,
      entities,
      userText,
      timezone,
      customerLanguage,
    );

    // Build OperationalResult
    const operationalResult = this.buildOperationalResult(intent, toolResults, entities, baseReplyText, customerLanguage, professionals, services);

    // Build structured content (simplified for UI rendering)
    const structuredContent = this.buildStructuredContent(intent, operationalResult, employeeName);

    return { baseReplyText, structuredContent, operationalResult };
  }

  /**
   * Renders the reply + card stack for the current guided flow step.
   * The reply text always stays grounded on verified tool outcomes; the cards
   * only offer the real options (professionals, days with availability, free slots).
   */
  private generateFlowResponse(
    flowStep: BookingFlowStep,
    intent: Intent,
    toolResults: ToolResultSummary[],
    entities: RoutedEntities,
    professionals: Array<{ id: string; name: string; title?: string | null }> | undefined,
    services: Array<{ id: string; name: string }> | undefined,
    language: CustomerLanguage,
    timezone: string,
    userText?: string,
  ): { baseReplyText: string; structuredContent: StructuredMessage | undefined; operationalResult: OperationalResult } {
    const copy = COPY[language];
    const serviceName = nonEmptyString(entities.service?.name);
    const professionalName = nonEmptyString(entities.professional?.name);
    const employeeName = this.config?.digitalEmployee
      ? (this.config.digitalEmployee as DigitalEmployeeConfig).name
      : 'Assistente Digitale';

    // Safety guards take precedence over any guided step (same as generateReply).
    if (entities.anonymousRequest) {
      const operationalResult: OperationalResult = { type: 'CUSTOMER_FULL_NAME_REQUIRED', data: {}, language, criticalData: [], baseReplyText: copy.anonymous };
      return { baseReplyText: copy.anonymous, structuredContent: undefined, operationalResult };
    }
    if (entities.potentiallyDangerous) {
      const operationalResult: OperationalResult = { type: 'COMPANY_INFORMATION_FOUND', data: {}, language, criticalData: [], baseReplyText: copy.privacyDenied };
      return { baseReplyText: copy.privacyDenied, structuredContent: undefined, operationalResult };
    }
    if (entities.conflictingActions) {
      const operationalResult: OperationalResult = { type: 'UNKNOWN_INTENT', data: {}, language, criticalData: [], baseReplyText: copy.conflictingActions };
      return { baseReplyText: copy.conflictingActions, structuredContent: undefined, operationalResult };
    }
    if (entities.invalidDate) {
      const operationalResult: OperationalResult = { type: 'DATE_REQUIRED', data: {}, language, criticalData: [], baseReplyText: copy.invalidDate };
      return { baseReplyText: copy.invalidDate, structuredContent: undefined, operationalResult };
    }

    const availability = lastCheckAvailabilityResult(toolResults);
    const days = availabilityDays(availability);
    const slots = availabilitySlots(availability);
    const slotDetails = availabilitySlotDetails(availability);
    const data: Record<string, unknown> = {};
    const criticalData: string[] = [];

    let resultType: OperationalResult['type'] = 'UNKNOWN_INTENT';
    let baseReplyText: string;
    let structuredContent: StructuredMessage | undefined;

    switch (flowStep) {
      case 'SERVICE': {
        baseReplyText = copy.serviceSelection((services || []).map((service) => service.name));
        resultType = 'SERVICE_SELECTION_REQUIRED';
        structuredContent = {
          type: 'SERVICE_SELECTION',
          content: baseReplyText,
          options: (services || []).map((service) => ({
            id: service.id,
            label: service.name,
            payload: { serviceId: service.id },
          })),
        };
        break;
      }
      case 'PROFESSIONAL': {
        const names = (professionals || []).map((professional) => professional.name);
        baseReplyText = copy.professionalSelectionWithService(serviceName, names);
        resultType = 'PROFESSIONAL_SELECTION_REQUIRED';
        const options: StructuredMessageOption[] = (professionals || []).map((professional) => ({
          id: professional.id,
          label: professional.name,
          description: professional.title || undefined,
          payload: { professionalId: professional.id },
        }));
        options.push({
          id: 'ANY',
          label: language === 'en' ? 'No preference' : language === 'pt' ? 'Sem preferência' : 'Nessuna preferenza',
          payload: { professionalId: 'ANY' },
        });
        structuredContent = { type: 'PROFESSIONAL_SELECTION', content: baseReplyText, options };
        break;
      }
      case 'SLOTS': {
        // Automatic availability lookup after service + professional: instead of
        // asking "which day?", offer the next CONCRETE free slots (date + time)
        // straight from the real calendar. Never falls back to "no availability
        // on the requested date" — the customer never picked a date.
        const MAX_SLOT_OPTIONS = 12;
        const options: Array<{ date: string; time: string; professionalId?: string; professionalName?: string }> = [];
        for (const day of days) {
          for (const time of day.availableSlots) {
            const detail = (day.slotsDetails || []).find((slot) => slot.time === time) as { professionalId?: string; professionalName?: string } | undefined;
            options.push({ date: day.date, time, professionalId: detail?.professionalId, professionalName: detail?.professionalName });
            if (options.length >= MAX_SLOT_OPTIONS) break;
          }
          if (options.length >= MAX_SLOT_OPTIONS) break;
        }
        if (options.length > 0) {
          const labels = options.map((option) => formatSlotLabel(option.date, option.time, language));
          baseReplyText = copy.slotSelection(serviceName, professionalName, labels);
          resultType = 'SLOTS_AVAILABLE';
          structuredContent = {
            type: 'SLOT_SELECTION',
            content: baseReplyText,
            options: options.map((option) => ({
              id: `${option.date}T${option.time}`,
              label: formatSlotLabel(option.date, option.time, language),
              payload: {
                date: option.date,
                time: option.time,
                ...(option.professionalId ? { professionalId: option.professionalId, professionalName: option.professionalName } : {}),
              },
            })),
          };
          criticalData.push(...labels.slice(0, 8));
        } else {
          baseReplyText = copy.noAvailabilityWindow(30);
          resultType = 'NO_SLOTS_AVAILABLE';
          structuredContent = undefined;
        }
        break;
      }
      case 'DATE': {
        if (days.length > 0) {
          const labels = days.map((day) => formatDayLabel(day.date, language));
          baseReplyText = copy.daySelection(serviceName, professionalName, labels);
          resultType = 'SLOTS_AVAILABLE';
          structuredContent = {
            type: 'DAY_SELECTION',
            content: baseReplyText,
            options: days.map((day) => ({
              id: day.date,
              label: formatDayLabel(day.date, language),
              payload: { date: day.date },
            })),
          };
          criticalData.push(...labels);
        } else {
          baseReplyText = copy.dateRequired(serviceName);
          resultType = 'DATE_REQUIRED';
          structuredContent = undefined;
        }
        break;
      }
      case 'TIME': {
        if (slots.length > 0) {
          baseReplyText = copy.availableSlots(formatDayLabel(String(entities.date || ''), language), slots);
          resultType = 'SLOTS_AVAILABLE';
          data.slots = slots;
          data.date = entities.date;
          structuredContent = {
            type: 'TIME_SELECTION',
            content: baseReplyText,
            options: slots.map((time) => {
              const detail = slotDetails.find((slot) => slot.time === time);
              return {
                id: time,
                label: time,
                payload: {
                  time,
                  professionalId: detail?.professionalId,
                  professionalName: detail?.professionalName,
                },
              };
            }),
          };
          criticalData.push(...slots.slice(0, 5));
        } else {
          baseReplyText = copy.noAvailability;
          resultType = 'NO_SLOTS_AVAILABLE';
          structuredContent = undefined;
        }
        break;
      }
      case 'IDENTITY': {
        baseReplyText = copy.customerDetailsRequired;
        resultType = 'CUSTOMER_FULL_NAME_REQUIRED';
        // Structured identity form: nome / cognome / telefono. On submit the UI
        // composes free text ("Mi chiamo ... telefono ...") which the identity
        // parser turns back into firstName/lastName/phone — no new protocol.
        const isEn = language === 'en';
        const isPt = language === 'pt';
        structuredContent = {
          type: 'IDENTITY_FORM',
          content: baseReplyText,
          fields: [
            {
              id: 'firstName',
              label: isEn ? 'First name' : isPt ? 'Nome' : 'Nome',
              placeholder: isEn ? 'e.g. Mario' : 'Es. Mario',
              required: true,
            },
            {
              id: 'lastName',
              label: isEn ? 'Last name' : isPt ? 'Sobrenome' : 'Cognome',
              placeholder: isEn ? 'e.g. Rossi' : 'Es. Rossi',
              required: true,
            },
            {
              id: 'phone',
              label: isEn ? 'Phone' : isPt ? 'Telefone' : 'Telefono',
              type: 'tel',
              placeholder: '+39 340 1234567',
              required: true,
            },
          ],
        };
        break;
      }
      case 'CONFIRMATION': {
        baseReplyText = copy.confirmBooking();
        resultType = 'CONFIRMATION_REQUIRED';
        const summaryDate = formatDayLabel(String(entities.date || ''), language) || entities.date || '';
        data.serviceName = serviceName;
        data.professionalName = professionalName;
        data.date = entities.date;
        data.time = entities.time;
        const statedCustomerName = [entities.requestedCustomerFirstName, entities.requestedCustomerLastName].filter(Boolean).join(' ');
        data.customerName = entities.customer?.name || statedCustomerName || undefined;
        structuredContent = {
          type: 'CONFIRMATION_CARD',
          content: baseReplyText,
          payload: {
            serviceName,
            professionalName: professionalName || (language === 'en' ? 'First available' : 'Primo disponibile'),
            date: entities.date,
            time: entities.time,
            dateLabel: summaryDate,
            customerName: data.customerName,
          },
          actions: [
            { id: 'confirm', label: language === 'en' ? 'Confirm' : language === 'pt' ? 'Confirmar' : 'Conferma', variant: 'primary' },
            { id: 'modify', label: language === 'en' ? 'Change' : language === 'pt' ? 'Alterar' : 'Modifica', variant: 'secondary' },
          ],
        };
        break;
      }
      default: {
        // CREATE and unexpected steps use the standard grounded reply generator
        // plus the standard operational result (keeps booking validation intact).
        baseReplyText = this.generateReply(intent, toolResults, entities, userText, timezone, language);
        const standard = this.buildOperationalResult(intent, toolResults, entities, baseReplyText, language, professionals, services);
        // After a successful create, surface the booking summary card.
        const summary = this.buildStructuredContent(intent, standard, employeeName);
        return { baseReplyText, structuredContent: summary, operationalResult: standard };
      }
    }

    const operationalResult: OperationalResult = {
      type: resultType,
      data,
      language,
      criticalData,
      baseReplyText,
    };

    return { baseReplyText, structuredContent, operationalResult };
  }

  private buildOperationalResult(
    intent: Intent,
    toolResults: ToolResultSummary[],
    entities: RoutedEntities,
    baseReplyText: string,
    language: CustomerLanguage,
    _professionals: Array<{ id: string; name: string }> | undefined,
    _services: Array<{ id: string; name: string }> | undefined,
  ): OperationalResult {
    const criticalData: string[] = [];
    let resultType: OperationalResult['type'] = 'UNKNOWN_INTENT';
    const data: Record<string, unknown> = {};

    const actionable = [...toolResults].reverse().find(result => result.toolName !== 'createCustomer') || toolResults[toolResults.length - 1];

    if (intent === 'START_CONVERSATION') {
      resultType = 'WELCOME';
    } else if (intent === 'CREATE_APPOINTMENT') {
      if (actionable?.success && actionable?.code === 'APPOINTMENT_CREATED') {
        resultType = 'BOOKING_CREATED';
        const appointment = actionable.result as Record<string, unknown> | undefined;
        const appointmentData = appointment?.appointment as Record<string, unknown> | undefined;
        const startAt = appointmentData?.startAt || appointmentData?.start_at || actionable.args?.startAt;
        if (typeof startAt === 'string') {
          data.startAt = startAt;
          const formatted = formatDateTime(startAt, 'Europe/Rome', language);
          criticalData.push(formatted);
        }
        const professionalName = appointmentData?.professionalName || actionable.args?.professionalName || entities.professional?.name;
        if (typeof professionalName === 'string' && professionalName) {
          data.professionalName = professionalName;
          criticalData.push(professionalName);
        }
        const serviceName = appointmentData?.serviceName || actionable.args?.serviceName || entities.service?.name;
        if (typeof serviceName === 'string' && serviceName) {
          data.serviceName = serviceName;
          criticalData.push(serviceName);
        }
        const customerName = appointmentData?.customerName || actionable.args?.customerName;
        if (typeof customerName === 'string') {
          data.customerName = customerName;
        }
      } else if (actionable?.code === 'SLOT_OCCUPIED' || actionable?.code === 'SLOT_NOT_AVAILABLE') {
        resultType = 'SLOT_OCCUPIED';
        // The requested slot is a hard fact the humanizer must never change.
        const requested = actionable.args?.startAt || actionable.args?.date;
        if (typeof requested === 'string' && requested) {
          data.requestedSlot = requested;
          const formatted = requested.includes('T')
            ? formatDateTime(requested, 'Europe/Rome', language)
            : formatDayLabel(requested, language);
          criticalData.push(formatted);
        }
      } else if (actionable?.code === 'NO_SLOTS_AVAILABLE') {
        resultType = 'NO_SLOTS_AVAILABLE';
      } else {
        resultType = 'APPOINTMENT_CREATION_FAILED';
      }
    } else if (intent === 'CHECK_AVAILABILITY') {
      if (actionable?.success) {
        const availData = actionable.result as Record<string, unknown> | undefined;
        if (availData?.availableSlots) {
          resultType = 'SLOTS_AVAILABLE';
          const slots = Array.isArray(availData.availableSlots) ? availData.availableSlots : [];
          data.slots = slots;
          criticalData.push(...slots.map(String));
        } else if (availData?.requiresServiceSelection) {
          resultType = 'DATE_REQUIRED';
        } else if (availData?.requiresProfessionalSelection) {
          resultType = 'PROFESSIONAL_SELECTION_REQUIRED';
        } else {
          resultType = 'SLOTS_AVAILABLE';
        }
      } else {
        resultType = 'NO_SLOTS_AVAILABLE';
      }
    } else if (intent === 'CANCEL_APPOINTMENT') {
      resultType = 'APPOINTMENT_CANCELLED';
    } else if (intent === 'RESCHEDULE_APPOINTMENT') {
      if (actionable?.success && actionable.code === 'APPOINTMENT_RESCHEDULED') {
        resultType = 'APPOINTMENT_RESCHEDULED';
        const appointment = actionable.result as Record<string, unknown> | undefined;
        const appointmentData = appointment?.appointment as Record<string, unknown> | undefined;
        const startAt = appointmentData?.startAt || appointmentData?.start_at;
        if (typeof startAt === 'string') {
          data.startAt = startAt;
          criticalData.push(formatDateTime(startAt, 'Europe/Rome', language));
        }
      } else {
        resultType = 'APPOINTMENT_CREATION_FAILED';
      }
    } else if (intent === 'CUSTOMER_INFORMATION') {
      if (actionable?.success && actionable?.code === 'CUSTOMER_APPOINTMENTS_FOUND') {
        resultType = 'COMPANY_INFORMATION_FOUND';
      } else if (actionable?.success) {
        resultType = 'COMPANY_INFORMATION_FOUND';
      } else {
        resultType = 'CUSTOMER_FULL_NAME_REQUIRED';
      }
    } else if (intent === 'COMPANY_INFORMATION' || intent === 'GENERAL_INFORMATION') {
      resultType = 'COMPANY_INFORMATION_FOUND';
      data.answer = baseReplyText;
      criticalData.push(baseReplyText);
    } else if (intent === 'HUMAN_HANDOFF') {
      const handoffDone = toolResults.some((result) =>
        result.toolName === 'handoff_to_human' && result.success && result.code === 'HANDOFF_REQUESTED'
      );
      resultType = 'HUMAN_HANDOFF_REQUESTED';
      if (handoffDone) criticalData.push(baseReplyText);
    }

    return {
      type: resultType,
      data,
      language: language === 'en' ? 'en' : language === 'pt' ? 'pt' : 'it',
      criticalData,
      baseReplyText,
    };
  }

  private buildStructuredContent(
    intent: Intent,
    operationalResult: OperationalResult,
    employeeName: string,
  ): StructuredMessage | undefined {
    if (intent === 'CHECK_AVAILABILITY' && operationalResult.type === 'SLOTS_AVAILABLE') {
      const slots = operationalResult.data.slots as string[] | undefined;
      if (slots && slots.length > 3) {
        return {
          type: 'TIME_SELECTION',
          content: `Qualora preferisca un orario diverso, ecco le opzioni disponibili: ${slots.slice(0, 5).join(', ')}`,
        };
      }
    }
    if (intent === 'COMPANY_INFORMATION' || intent === 'GENERAL_INFORMATION') {
      return {
        type: 'TEXT',
        content: operationalResult.baseReplyText,
      };
    }
    // After a booking is created, surface a summary card with the appointment details.
    if (intent === 'CREATE_APPOINTMENT' && operationalResult.type === 'BOOKING_CREATED') {
      const startAt = operationalResult.data.startAt as string | undefined;
      const professionalName = operationalResult.data.professionalName as string | undefined;
      const summaryDate = startAt ? formatDateTime(startAt, 'Europe/Rome', operationalResult.language as CustomerLanguage) : '';
      const time = startAt ? new Date(startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      return {
        type: 'SUMMARY',
        content: operationalResult.baseReplyText,
        payload: {
          serviceName: operationalResult.data.serviceName as string | undefined,
          professionalName,
          date: startAt,
          dateLabel: summaryDate,
          time,
          customerName: operationalResult.data.customerName as string | undefined,
        },
      };
    }
    void employeeName; // Reserved for branded replies
    return undefined;
  }

  generateReply(
    intent: Intent,
    toolResults: ToolResultSummary[],
    entities?: RoutedEntities,
    userText?: string,
    timezone = 'Europe/Rome',
    language: CustomerLanguage = 'it',
  ): string {
    const copy = COPY[language];

    if (entities?.potentiallyDangerous) return copy.privacyDenied;
    if (entities?.conflictingActions) return copy.conflictingActions;
    if (entities?.thirdPartyRequest && (intent === 'CANCEL_APPOINTMENT' || intent === 'RESCHEDULE_APPOINTMENT' || intent === 'CUSTOMER_INFORMATION')) return copy.thirdPartyDenied;
    if (entities?.customer?.conflictsWithVerifiedCustomer) return copy.identityConflict;
    if (entities?.requestedPhoneChange) return copy.phoneChange;
    if (entities?.anonymousRequest) return copy.anonymous;
    if (entities?.invalidDate) return copy.invalidDate;

    if (intent === 'CUSTOMER_INFORMATION' && userText && /\b(?:pagato|pagamento|ultima consulenza|fattura|paid|payment|invoice|pagamento|fatura)\b/i.test(userText)) return copy.paymentAdmin;
    if (intent === 'CUSTOMER_INFORMATION' && userText && /\b(?:email|e-mail)\b/i.test(userText)) return copy.emailVerification;
    if (intent === 'CUSTOMER_INFORMATION' && userText && (
      /\b(?:cambi\w*|modific\w*|sovrascrivere|change|update|alterar|mudar)\b/i.test(userText)
      || /\b(?:registrat\w*|corregg\w*|corrett\w*)\b.*\bnome completo\b/i.test(userText)
    )) return copy.profileVerification;

    if (!toolResults.length) {
      if (intent === 'HUMAN_HANDOFF') return copy.humanHandoff;
      if (intent === 'UNKNOWN') return copy.unknown;
      if (intent === 'CHECK_AVAILABILITY' && !entities?.date) return copy.dateRequired(entities?.service?.name);
      if (intent === 'CREATE_APPOINTMENT') return copy.customerDetailsRequired;
      return copy.genericQuestion;
    }

    const actionable = [...toolResults].reverse().find(result => result.toolName !== 'createCustomer') || toolResults[toolResults.length - 1];
    if (!actionable.success) {
      switch (actionable.code) {
        case 'DATE_REQUIRED': return copy.dateRequired(entities?.service?.name);
        case 'SERVICE_SELECTION_REQUIRED': return copy.serviceSelection([]);
        case 'PROFESSIONAL_SELECTION_REQUIRED': return copy.professionalSelection([]);
        case 'CUSTOMER_FULL_NAME_REQUIRED': return copy.customerDetailsRequired;
        case 'NEW_START_REQUIRED': return copy.newStartRequired;
        case 'SLOT_OCCUPIED':
        case 'SLOT_NOT_AVAILABLE': {
          // Always state which slot was requested (never let the AI guess it),
          // then surface real free alternatives when the same query found them.
          const requestedRaw = actionable.args?.startAt || actionable.args?.date;
          const requestedLabel = typeof requestedRaw === 'string' && requestedRaw.includes('T')
            ? formatDateTime(requestedRaw, timezone, language)
            : (typeof requestedRaw === 'string' ? formatDayLabel(requestedRaw, language) : undefined);
          const occupied = requestedLabel
            ? copy.slotOccupiedWith(requestedLabel)
            : copy.slotUnavailable;
          const altAvailability = lastCheckAvailabilityResult(toolResults);
          const altSlots = availabilitySlots(altAvailability);
          if (altSlots.length && typeof altAvailability?.date === 'string') {
            const dayLabel = formatDayLabel(altAvailability.date, language);
            return `${occupied} ${copy.availableSlots(dayLabel, altSlots)}`;
          }
          return occupied;
        }
        case 'NO_SLOTS_AVAILABLE': return copy.noAvailability;
        case 'APPOINTMENT_NOT_FOUND': return copy.appointmentNotFound;
        case 'CUSTOMER_NOT_FOUND': return copy.customerNotFound;
        case 'CUSTOMER_IDENTITY_REQUIRED': return copy.identityRequired;
        case 'PERMISSION_DENIED': return copy.permissionDenied;
        default: return copy.genericFailure;
      }
    }

    const data = asRecord(actionable.result);
    switch (actionable.toolName) {
      case 'checkAvailability': {
        if (actionable.code === 'NO_AVAILABILITY') return copy.noAvailability;
        if (data.requiresServiceSelection) {
          const services = asRecordArray(data.services).map((service) => nonEmptyString(service.name)).filter((name): name is string => Boolean(name));
          return copy.serviceSelection(services);
        }
        if (data.requiresProfessionalSelection) {
          const professionals = asRecordArray(data.professionals).map((professional) => nonEmptyString(professional.name)).filter((name): name is string => Boolean(name));
          return copy.professionalSelection(professionals);
        }
        if (Array.isArray(data.availableSlots) && data.availableSlots.length) {
          return copy.availableSlots(data.date, data.availableSlots.filter((slot): slot is string => typeof slot === 'string'));
        }
        return copy.availabilityNeedsDetails;
      }
      case 'createAppointment': {
        const appointment = asRecord(data.appointment);
        const persistedId = actionable.appointmentId || nonEmptyString(appointment.id);
        if (actionable.code !== 'APPOINTMENT_CREATED' || !persistedId) return copy.genericFailure;
        const when = formatDateTime(appointment.startAt || appointment.start_at || actionable.args?.startAt, timezone, language);
        // The confirmation always states what was booked: service + professional
        // + when. These facts also flow into criticalData so the humanizer can
        // never drop them (validator enforces them on the humanized text).
        const serviceName = nonEmptyString(appointment.serviceName) || nonEmptyString(actionable.args?.serviceName) || nonEmptyString(entities?.service?.name);
        const professionalName = nonEmptyString(appointment.professionalName) || nonEmptyString(actionable.args?.professionalName) || nonEmptyString(entities?.professional?.name);
        return copy.confirmed(when, serviceName, professionalName);
      }
      case 'cancelAppointment': return copy.cancelled;
      case 'rescheduleAppointment': {
        const appointment = asRecord(data.appointment);
        const when = formatDateTime(appointment.startAt || appointment.start_at || actionable.args?.newStartAt, timezone, language);
        return copy.rescheduled(when);
      }
      case 'getCompanyInformation': {
        const query = actionable.args?.queryType;
        if (query === 'services' || query === 'price') {
          const services = asRecordArray(data.services);
          const list = services.map((service) => `${String(service.name)}: ${String(service.duration)} min${service.price !== null && service.price !== undefined ? `, ${String(service.price)} €` : ''}`);
          return list.length ? copy.services(list) : copy.noServices;
        }
        if (query === 'address') {
          const hoursRequested = /\b(?:orari|aperto|chiuso|hours|open|closed|horario|aberto|fechado)\b/i.test(userText || '');
          return copy.address(data.address, hoursRequested ? data.workingHours : undefined);
        }
        if (query === 'hours') return copy.hours(data.workingHours);
        if (query === 'phone') return copy.phone(data.phone);
        if (query === 'professionals') {
          const professionals = asRecordArray(data.professionals).map((professional) => nonEmptyString(professional.name)).filter((name): name is string => Boolean(name));
          return professionals.length ? copy.professionals(professionals) : copy.noProfessionals;
        }
        if (query === 'privacy') return copy.privacyInfo;
        return copy.companyInfo(data.name, data.workingHours);
      }
      case 'findCustomer': {
        const customer = asRecord(data.customer);
        const appointments = asRecordArray(data.appointments);
        const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
        if (actionable.code === 'CUSTOMER_APPOINTMENTS_FOUND') {
          if (!appointments.length) return copy.noAppointments(name);
          const summary = appointments.slice(0, 3).map((appointment) => formatDateTime(appointment.startAt, timezone, language)).filter(Boolean).join(', ');
          return copy.appointments(name, summary);
        }
        return copy.profileFound(name);
      }
      case 'handoff_to_human': return copy.handoffCompleted;
      default: return copy.operationCompleted;
    }
  }
}
