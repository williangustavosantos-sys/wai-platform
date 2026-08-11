import { Intent } from '../conversation/conversation.types';
import { ToolResultSummary } from './ai.types';
import { RoutedEntities } from './local_intent_router';

function formatItalianDateTime(value?: unknown, timezone = 'Europe/Rome'): string {
  if (typeof value !== 'string' || !value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

function asRecordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Converts deterministic tool outcomes into customer-facing language.
 * It deliberately does not inspect correlation IDs, scenario IDs, or fixture names.
 */
export class DeterministicResponseGenerator {
  generateReply(
    intent: Intent,
    toolResults: ToolResultSummary[],
    entities?: RoutedEntities,
    userText?: string,
    timezone = 'Europe/Rome',
  ): string {
    if (entities?.potentiallyDangerous) {
      return 'Queste informazioni sono riservate. Per privacy e sicurezza non posso eseguire questa richiesta.';
    }

    if (entities?.thirdPartyRequest && (intent === 'CANCEL_APPOINTMENT' || intent === 'RESCHEDULE_APPOINTMENT' || intent === 'CUSTOMER_INFORMATION')) {
      return 'Per privacy, una prenotazione può essere modificata o cancellata solo dal titolare tramite il suo recapito verificato.';
    }

    if (entities?.customer?.conflictsWithVerifiedCustomer) {
      return 'I dati indicati non corrispondono al recapito verificato. Per sicurezza, contatta la segreteria per completare la verifica.';
    }

    if (entities?.requestedPhoneChange) {
      return 'Per modificare il numero di telefono associato al profilo è necessaria una verifica di identità con la segreteria.';
    }

    if (entities?.anonymousRequest) {
      return 'Per procedere con una prenotazione sono necessari nome, cognome e un recapito verificabile.';
    }

    if (entities?.invalidDate) {
      return 'La data indicata non è valida. Indica un giorno corretto per verificare la disponibilità.';
    }

    if (intent === 'CUSTOMER_INFORMATION' && userText && /\b(?:pagato|pagamento|ultima consulenza|fattura)\b/i.test(userText)) {
      return 'Per verificare pagamenti o fatture, contatta il reparto amministrativo dello studio.';
    }

    if (intent === 'CUSTOMER_INFORMATION' && userText && /\b(?:email|e-mail)\b/i.test(userText)) {
      return 'Per confermare o comunicare l’indirizzo e-mail associato al profilo è necessaria una verifica di identità.';
    }

    if (intent === 'CUSTOMER_INFORMATION' && userText && /\b(?:cambia|cambiare|modifica|modificare|sovrascrivere)\b/i.test(userText)) {
      return 'Per modificare i dati del profilo è necessaria una verifica di identità con la segreteria.';
    }

    if (!toolResults.length) {
      if (intent === 'HUMAN_HANDOFF') return 'Ti metto in contatto con un operatore umano.';
      if (intent === 'UNKNOWN') return 'Non sono sicuro di aver capito. Puoi riformulare la richiesta o chiedere un operatore?';
      return 'Come posso aiutarti?';
    }

    const actionable = [...toolResults].reverse().find(result => result.toolName !== 'createCustomer') || toolResults[toolResults.length - 1];
    if (!actionable.success) {
      switch (actionable.code) {
        case 'DATE_REQUIRED':
          return 'Per verificare la disponibilità, indica il giorno desiderato.';
        case 'SERVICE_SELECTION_REQUIRED':
          return 'Quale servizio desideri prenotare?';
        case 'PROFESSIONAL_SELECTION_REQUIRED':
          return 'Con quale professionista desideri prenotare?';
        case 'CUSTOMER_FULL_NAME_REQUIRED':
          return 'Per prenotare sono obbligatori nome e cognome completi, oltre a un recapito verificabile.';
        case 'NEW_START_REQUIRED':
          return 'Quale nuova data e ora desideri per riprogrammare l’appuntamento?';
        case 'SLOT_OCCUPIED':
          return 'L’orario richiesto è già occupato. Scegli un’altra fascia disponibile.';
        case 'APPOINTMENT_NOT_FOUND':
          return 'Non ho trovato un appuntamento attivo da modificare.';
        case 'CUSTOMER_NOT_FOUND':
          return 'Non ho trovato un profilo associato al recapito indicato.';
        case 'PERMISSION_DENIED':
          return 'Questa operazione non è consentita con le autorizzazioni correnti.';
        default:
          return 'Non è stato possibile completare l’operazione. Riprova oppure contatta la segreteria.';
      }
    }

    const data = asRecord(actionable.result);
    switch (actionable.toolName) {
      case 'checkAvailability': {
        if (actionable.code === 'NO_AVAILABILITY') {
          return 'Non ci sono fasce disponibili per il giorno richiesto. Scegli un’altra data.';
        }
        if (data.requiresServiceSelection) {
          const services = asRecordArray(data.services).map((service) => nonEmptyString(service.name)).filter((name): name is string => Boolean(name));
          return services.length ? `Quale servizio desideri prenotare? Disponibili: ${services.join(', ')}.` : 'Quale servizio desideri prenotare?';
        }
        if (data.requiresProfessionalSelection) {
          const professionals = asRecordArray(data.professionals).map((professional) => nonEmptyString(professional.name)).filter((name): name is string => Boolean(name));
          return professionals.length ? `Con quale professionista desideri prenotare? Disponibili: ${professionals.join(', ')}.` : 'Con quale professionista desideri prenotare?';
        }
        if (Array.isArray(data.availableSlots) && data.availableSlots.length) {
          return `Orari disponibili per il ${data.date}: ${data.availableSlots.slice(0, 5).join(', ')}. Quale preferisci?`;
        }
        return 'Ho verificato la disponibilità. Indica servizio e professionista per continuare.';
      }
      case 'createAppointment': {
        const appointment = asRecord(data.appointment);
        const when = formatItalianDateTime(appointment.startAt || appointment.start_at || actionable.args?.startAt, timezone);
        return when ? `Prenotazione confermata per il ${when}.` : 'Prenotazione confermata.';
      }
      case 'cancelAppointment':
        return 'L’appuntamento è stato cancellato e lo slot è di nuovo disponibile.';
      case 'rescheduleAppointment': {
        const appointment = asRecord(data.appointment);
        const when = formatItalianDateTime(appointment.startAt || appointment.start_at || actionable.args?.newStartAt, timezone);
        return when ? `L’appuntamento è stato riprogrammato per il ${when}.` : 'L’appuntamento è stato riprogrammato.';
      }
      case 'getCompanyInformation': {
        const info = data;
        const query = actionable.args?.queryType;
        if (query === 'services' || query === 'price') {
          const services = asRecordArray(info.services);
          const list = services.map((service) => `${service.name}: ${service.duration} min${service.price !== null && service.price !== undefined ? `, ${service.price} €` : ''}`).join('; ');
          return list ? `Servizi disponibili: ${list}.` : 'Non ci sono servizi attivi configurati.';
        }
        if (query === 'address') {
          const hoursRequested = /\b(?:orari|aperto|chiuso)\b/i.test(userText || '');
          return hoursRequested ? `Lo studio si trova in ${info.address}. Orari: ${info.workingHours}.` : `Lo studio si trova in ${info.address}.`;
        }
        if (query === 'hours') return `Orari di apertura: ${info.workingHours}.`;
        if (query === 'phone') return `Il recapito dello studio è ${info.phone}.`;
        if (query === 'professionals') {
          const professionals = asRecordArray(info.professionals).map((professional) => nonEmptyString(professional.name)).filter((name): name is string => Boolean(name));
          return professionals.length ? `I professionisti disponibili sono: ${professionals.join(', ')}.` : 'Non ci sono professionisti attivi configurati.';
        }
        if (query === 'privacy') return 'Trattiamo i dati nel rispetto della privacy. Non posso comunicare informazioni riservate o di altri clienti.';
        return `Informazioni dello studio: ${info.name || ''} ${info.workingHours ? `— ${info.workingHours}` : ''}`.trim();
      }
      case 'findCustomer': {
        const customer = asRecord(data.customer);
        const appointments = asRecordArray(data.appointments);
        const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
        if (actionable.code === 'CUSTOMER_APPOINTMENTS_FOUND') {
          if (!appointments.length) return name ? `${name}, non risultano appuntamenti attivi.` : 'Non risultano appuntamenti attivi.';
          const summary = appointments.slice(0, 3).map((appointment) => formatItalianDateTime(appointment.startAt, timezone)).filter(Boolean).join(', ');
          return `${name || 'Il tuo profilo'}: appuntamenti registrati il ${summary}.`;
        }
        return name ? `Ho trovato il profilo di ${name}. Come posso aiutarti?` : 'Ho trovato il profilo associato al recapito.';
      }
      case 'handoff_to_human':
        return 'Ho inoltrato la richiesta alla segreteria. Un operatore ti risponderà appena possibile.';
      default:
        return 'Operazione completata.';
    }
  }
}
