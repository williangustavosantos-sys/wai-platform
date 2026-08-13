import { Intent } from '../conversation/conversation.types';
import { CustomerLanguage } from '../conversation/customer_language';
import { ToolResultSummary } from './ai.types';
import { RoutedEntities } from './local_intent_router';

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
  appointmentNotFound: string;
  customerNotFound: string;
  identityRequired: string;
  permissionDenied: string;
  genericFailure: string;
  noAvailability: string;
  availableSlots: (date: unknown, slots: string[]) => string;
  availabilityNeedsDetails: string;
  confirmed: (when?: string) => string;
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
    profileVerification: 'Per modificare i dati del profilo è necessaria una verifica di identità con la segreteria.',
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
    appointmentNotFound: 'Non ho trovato un appuntamento attivo da modificare.',
    customerNotFound: 'Non ho trovato un profilo associato al recapito indicato.',
    identityRequired: 'Per modificare o cancellare un appuntamento, usa il recapito verificato del titolare.',
    permissionDenied: 'Questa operazione non è consentita con le autorizzazioni correnti.',
    genericFailure: 'Non è stato possibile completare l’operazione. Riprova oppure contatta la segreteria.',
    noAvailability: 'Non ci sono fasce disponibili per il giorno richiesto. Scegli un’altra data.',
    availableSlots: (date, slots) => `Orari disponibili per il ${String(date)}: ${slots.slice(0, 5).join(', ')}. Quale preferisci?`,
    availabilityNeedsDetails: 'Ho verificato la disponibilità. Indica servizio e professionista per continuare.',
    confirmed: (when) => when ? `Prenotazione confermata per il ${when}.` : 'Prenotazione confermata.',
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
    profileVerification: 'Identity verification with the reception team is required to change profile details.',
    humanHandoff: 'I’ll connect you with a human operator.',
    unknown: 'I’m not sure I understood. Could you rephrase your request or ask for a human operator?',
    genericQuestion: 'How can I help you?',
    dateRequired: (service) => service
      ? `Certainly. I can help you book ${service}. What date do you prefer? I’ll check availability for you.`
      : 'Certainly. What date do you prefer for the appointment? I’ll check availability for you.',
    serviceSelection: (services) => services.length
      ? `Which service would you like to book? Available services: ${services.join(', ')}.`
      : 'Which service would you like to book?',
    professionalSelection: (professionals) => professionals.length
      ? `Which professional would you like to book with? Available professionals: ${professionals.join(', ')}.`
      : 'Which professional would you like to book with?',
    customerDetailsRequired: 'To complete the booking, please provide your first name, last name, and a verifiable phone number.',
    newStartRequired: 'What new date and time would you like for the appointment?',
    slotUnavailable: 'The requested time is not available. Please choose another available time.',
    appointmentNotFound: 'I could not find an active appointment to change.',
    customerNotFound: 'I could not find a profile linked to the contact details provided.',
    identityRequired: 'To change or cancel an appointment, please use the booking owner’s verified contact details.',
    permissionDenied: 'This operation is not allowed with the current permissions.',
    genericFailure: 'I could not complete the operation. Please try again or contact the reception team.',
    noAvailability: 'There are no available times on the requested date. Please choose another date.',
    availableSlots: (date, slots) => `Available times on ${String(date)}: ${slots.slice(0, 5).join(', ')}. Which one do you prefer?`,
    availabilityNeedsDetails: 'I checked availability. Please provide the service and professional to continue.',
    confirmed: (when) => when ? `Your booking is confirmed for ${when}.` : 'Your booking is confirmed.',
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
    profileVerification: 'É necessária uma verificação de identidade com a recepção para alterar os dados do perfil.',
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
    appointmentNotFound: 'Não encontrei uma consulta ativa para alterar.',
    customerNotFound: 'Não encontrei um perfil associado ao contato informado.',
    identityRequired: 'Para alterar ou cancelar uma consulta, use o contato verificado do titular.',
    permissionDenied: 'Esta operação não é permitida com as autorizações atuais.',
    genericFailure: 'Não foi possível concluir a operação. Tente novamente ou fale com a recepção.',
    noAvailability: 'Não há horários disponíveis na data solicitada. Escolha outra data.',
    availableSlots: (date, slots) => `Horários disponíveis em ${String(date)}: ${slots.slice(0, 5).join(', ')}. Qual você prefere?`,
    availabilityNeedsDetails: 'Verifiquei a disponibilidade. Informe o serviço e o profissional para continuar.',
    confirmed: (when) => when ? `Sua reserva está confirmada para ${when}.` : 'Sua reserva está confirmada.',
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

/** Converts verified tool outcomes into the language used in the current customer turn. */
export class DeterministicResponseGenerator {
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
        case 'SLOT_NOT_AVAILABLE': return copy.slotUnavailable;
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
        return copy.confirmed(when);
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
