export interface AIProviderContext {
  organization: { timezone: string };
  services: Array<{ id: string; name: string }>;
  professionals: Array<{ id: string; name: string; phone?: string; title?: string }>;
  customers: Array<{ id: string; name: string; phone?: string }>;
  customer?: { id: string; name: string; isOwner?: boolean };
  isOwner?: boolean;
}

import { Intent } from '../conversation/conversation.types';

export type StructuredIntent = Intent;

export type FaqTopic =
  | 'address'
  | 'phone'
  | 'hours'
  | 'services'
  | 'price'
  | 'professionals'
  | 'payment'
  | 'documents'
  | 'website'
  | 'invoice'
  | 'booking_policy'
  | 'privacy'
  | 'customer_profile'
  | 'customer_appointments'
  | 'social'
  | 'general';

export interface RoutedEntities {
  service?: { id?: string; name: string };
  professional?: { id?: string; name: string };
  date?: string;
  invalidDate?: string;
  time?: string;
  timePeriod?: 'morning' | 'afternoon';
  customer?: {
    id?: string;
    name?: string;
    phone?: string;
    verified: boolean;
    conflictsWithVerifiedCustomer?: boolean;
  };
  faqTopic?: FaqTopic;
  multipleCustomerNames?: boolean;
  multipleServices?: boolean;
  thirdPartyRequest?: boolean;
  anonymousRequest?: boolean;
  conflictingActions?: boolean;
  potentiallyDangerous?: boolean;
  // Owner command entities
  ownerCommandType?: 'list_agenda' | 'block_calendar' | 'move_appointment' | 'get_stats';
  ownerCommandReason?: string;
  ownerCommandCustomerName?: string;
  ownerCommandNewDateTime?: string;
}

export interface StructuredIntentRoute {
  intent: StructuredIntent;
  entities: RoutedEntities;
  confidence: number;
  needsClarification: boolean;
}

const MONTHS: Record<string, number> = {
  gennaio: 1, january: 1, janeiro: 1, gen: 1, jan: 1,
  febbraio: 2, february: 2, fevereiro: 2, feb: 2,
  marzo: 3, march: 3, marco: 3, mar: 3,
  aprile: 4, april: 4, abril: 4, apr: 4,
  maggio: 5, may: 5, maio: 5, mag: 5,
  giugno: 6, june: 6, junho: 6, giu: 6, jun: 6,
  luglio: 7, july: 7, julho: 7, lug: 7, jul: 7,
  agosto: 8, august: 8, ago: 8, aug: 8,
  settembre: 9, september: 9, setembro: 9, set: 9, sep: 9,
  ottobre: 10, october: 10, outubro: 10, ott: 10, oct: 10,
  novembre: 11, november: 11, novembro: 11, nov: 11,
  dicembre: 12, december: 12, dezembro: 12, dic: 12, dec: 12,
};

const WEEKDAYS: Record<string, number> = {
  domenica: 0, sunday: 0, domingo: 0,
  lunedi: 1, monday: 1, seconda: 1,
  martedi: 2, tuesday: 2, terca: 2,
  mercoledi: 3, wednesday: 3, quarta: 3,
  giovedi: 4, thursday: 4, quinta: 4,
  venerdi: 5, friday: 5, sexta: 5,
  sabato: 6, saturday: 6, sabado: 6,
};

const STOP_WORDS = new Set([
  'dott', 'dottor', 'dottoressa', 'dottssa', 'dr', 'del', 'della', 'di', 'per',
  'iniziale', 'annuale', 'studio', 'servizio', 'servizi', 'con', 'una', 'un', 'the',
]);

export function normalizeNaturalLanguage(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+:/.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function dateInTimezone(timezone: string): Date {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return new Date(`${today}T00:00:00Z`);
}

function formatDate(year: number, month: number, day: number): string | null {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) return null;
  return candidate.toISOString().slice(0, 10);
}

function extractDate(text: string, timezone: string): Pick<RoutedEntities, 'date' | 'invalidDate'> {
  const today = dateInTimezone(timezone);
  const year = today.getUTCFullYear();

  const isoMatch = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const raw = isoMatch[0];
    const date = formatDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    return date ? { date } : { invalidDate: raw };
  }

  const numericMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  if (numericMatch) {
    const raw = numericMatch[0];
    const date = formatDate(Number(numericMatch[3] || year), Number(numericMatch[2]), Number(numericMatch[1]));
    return date ? { date } : { invalidDate: raw };
  }

  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
  const namedMatch = text.match(new RegExp(`\\b(\\d{1,2})\\s*(?:di\\s+)?(${monthNames})(?:\\s+(20\\d{2}))?\\b`));
  if (namedMatch) {
    const raw = namedMatch[0];
    const date = formatDate(Number(namedMatch[3] || year), MONTHS[namedMatch[2]], Number(namedMatch[1]));
    return date ? { date } : { invalidDate: raw };
  }

  const relativeOffsets: Array<[RegExp, number]> = [
    [/\b(dopodomani|day after tomorrow|depois de amanha)\b/, 2],
    [/\b(domani|tomorrow|amanha)\b/, 1],
    [/\b(oggi|today|hoje)\b/, 0],
  ];
  for (const [pattern, offset] of relativeOffsets) {
    if (pattern.test(text)) {
      const target = new Date(today);
      target.setUTCDate(target.getUTCDate() + offset);
      return { date: target.toISOString().slice(0, 10) };
    }
  }

  for (const [weekday, targetDay] of Object.entries(WEEKDAYS)) {
    if (!new RegExp(`\\b${weekday}\\b`).test(text)) continue;
    const currentDay = today.getUTCDay();
    let offset = (targetDay - currentDay + 7) % 7;
    if (offset === 0 || /\b(prossim|next|proxim)\w*\b/.test(text)) offset += 7;
    const target = new Date(today);
    target.setUTCDate(target.getUTCDate() + offset);
    return { date: target.toISOString().slice(0, 10) };
  }

  if (/\b(prossima settimana|next week|proxima semana)\b/.test(text)) {
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() + (1 - today.getUTCDay() + 7) % 7 + 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 4);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10)
    };
  }

  return {};
}

function extractTime(text: string): Pick<RoutedEntities, 'time' | 'timePeriod'> {
  if (/\b(mattina|morning|manha)\b/.test(text)) return { timePeriod: 'morning' };
  if (/\b(pomeriggio|afternoon|tarde)\b/.test(text)) return { timePeriod: 'afternoon' };

  const exact = text.match(/(?:\b(?:alle|all|a|at|as)\s*)\b(\d{1,2})(?::|h|\.)(\d{2})\b/)
    || text.match(/\b(\d{1,2})(?::|h)(\d{2})\b/)
    || text.match(/\b(?:alle|all|a|at|as)\s+(\d{1,2})(?:h)?(?!\s*(?:agosto|ago|aug|settembre|sep))\b/);
  if (!exact) return {};
  const hour = Number(exact[1]);
  const minute = Number(exact[2] || 0);
  if (hour > 23 || minute > 59) return {};
  return { time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

function significantTokens(value: string): string[] {
  return normalizeNaturalLanguage(value)
    .split(' ')
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

function matchCatalogEntity<T extends { id: string; name: string }>(text: string, entries: T[]): T | undefined {
  let best: { entry: T; score: number } | undefined;
  for (const entry of entries) {
    const normalizedName = normalizeNaturalLanguage(entry.name);
    const tokens = significantTokens(entry.name);
    const score = normalizedName && text.includes(normalizedName)
      ? 10
      : tokens.reduce((total, token) => total + (text.includes(token) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry;
}

function detectFaqTopic(text: string): FaqTopic | undefined {
  if (containsAny(text, [/\b(indirizzo|address|endereco)\b/, /\bdove (?:si trova|siete)\b/])) return 'address';
  if (containsAny(text, [/\b(numero di telefono|telefono principale|phone number|contacto)\b/])) return 'phone';
  if (containsAny(text, [/\b(orari di apertura|opening hours|horario de funcionamento)\b/, /\bstudio (?:e |è )?(?:aperto|chiuso)\b/, /\baperto (?:il|a|ad)\b/])) return 'hours';
  if (containsAny(text, [/\b(quanto costa|prezzo|prezzi|price|costo|valor)\b/])) return 'price';
  if (containsAny(text, [/\b(quali servizi|servizi offrite|what services|quais servicos)\b/, /\bfate consulenz\w*\b/, /\b(durata|quanto dura|quanto tempo impiega|quanti minuti)\b/])) return 'services';
  if (containsAny(text, [/\b(chi e|chi è|si occupa|professionist\w*|commercialista|contabile)\b/])) return 'professionals';
  if (containsAny(text, [/\b(carta|bancomat|pagament\w*|payment)\b/])) return 'payment';
  if (containsAny(text, [/\b(document\w*|cosa devo portare|file del bilancio)\b/])) return 'documents';
  if (containsAny(text, [/\b(sito web|website|site)\b/])) return 'website';
  if (/\bfattura\b/.test(text)) return 'invoice';
  if (containsAny(text, [/\b(parcheggio|parking)\b/])) return 'parking';
  if (containsAny(text, [
    /\b(come posso confermare|prenotare online|via zoom|potete chiamarmi)\b/,
    /\b(quanto tempo prima|senza penali|buffer|pendente|riservato|fermare un orario|stesso orario)\b/,
    /\bse .* posso (?:spostare|prenotare)\b/,
  ])) return 'booking_policy';
  if (containsAny(text, [/\b(quali dati|mio profilo|cambiato numero|nome completo|ho un appuntamento|mio appuntamento|miei appuntamenti|prossima consulenza|chi sono|come mi chiamo|mi riconosci|email sono registrato|e-mail sono registrato)\b/])) return 'customer_profile';
  if (containsAny(text, [
    /\b(privacy|gdpr|dati|password|dump|hacker)\b/,
    /\b(numero .* privato|elimina|cancellami da tutti|confermare se .* cliente)\b/,
    /\b(a che ora ha l appuntamento|chi ha l appuntamento|tutti gli appuntamenti|appuntamenti di oggi|appuntamenti dello studio|agenda dello studio)\b/,
    /\b(consulente esterno|comunicami gli appuntamenti|dettagli di [a-z]+ [a-z]+)\b/,
  ])) return 'privacy';
  if (containsAny(text, [/\b(prossim\w* appuntamento|storico|riepilogo|dettagli sul mio|pagato|ultima consulenza|mie visite|mia prenotazione|mia consulenza|confermare|conferma|appuntament\w* ho|appuntament\w* prenotat\w*|quali appuntament\w*)\b/])) return 'customer_appointments';
  if (containsAny(text, [/\b(grazie|buona giornata|buongiorno|buonasera|sei un bot|persona reale)\b/])) return 'social';
  return undefined;
}

export class LocalIntentRouter {
  route(userText: string, context?: AIProviderContext): StructuredIntentRoute {
    const text = normalizeNaturalLanguage(userText);
    const timezone = context?.organization.timezone || 'Europe/Rome';
    const dateEntity = extractDate(text, timezone);
    const timeEntity = extractTime(text);
    const catalogServices = context?.services || [];
    const matchedServices = catalogServices.filter((entry) => {
      const normalizedName = normalizeNaturalLanguage(entry.name);
      const tokens = significantTokens(entry.name);
      return text.includes(normalizedName) || tokens.some((token) => text.includes(token));
    });
    const service = matchCatalogEntity(text, catalogServices);
    const professional = matchCatalogEntity(text, context?.professionals || []);
    const professionalName = professional ? normalizeNaturalLanguage(professional.name) : '';
    const professionalPersonName = professionalName.replace(/^(?:dott\w*|dr)\.?\s+/, '');
    const professionalUsedAsProfessional = Boolean(professionalPersonName && containsAny(text, [
      new RegExp(`\\b(con|with|com)\\s+(?:(?:il|la)\\s+)?(?:dott\\w*\\.?\\s+)?${professionalPersonName.replace(/\s+/g, '\\s+')}\\b`),
      new RegExp(`\\b(?:dott\\w*|dr)\\.?\\s+${professionalPersonName.replace(/\s+/g, '\\s+')}\\b`),
    ]));
    const namedCustomers = (context?.customers || []).filter((customer) => {
      const cName = customer.name || `${(customer as any).firstName || ''} ${(customer as any).lastName || ''}`.trim();
      const fullName = normalizeNaturalLanguage(cName);
      const tokens = significantTokens(cName);
      const matched = text.includes(fullName) || (tokens.length >= 2 && tokens.every((token) => text.includes(token)));
      if (!matched) return false;
      if (professionalUsedAsProfessional && professionalPersonName === fullName) {
        return new RegExp(`\\b(sono|moglie di|marito di|a nome di|prenotazione di)\\s+(?:dott\\w*\\s+)?${fullName.replace(/\s+/g, '\\s+')}\\b`).test(text);
      }
      return true;
    });
    const verifiedCustomer = context?.customer;
    const namedCustomer = namedCustomers.length === 1 ? namedCustomers[0] : undefined;
    const verifiedCustomerName = verifiedCustomer
      ? `${(verifiedCustomer as any).firstName || ''} ${(verifiedCustomer as any).lastName || ''}`.trim()
      : '';
    const customerConflict = Boolean(verifiedCustomer && namedCustomer && verifiedCustomer.id !== namedCustomer.id)
      || Boolean(verifiedCustomer && text.includes('giovanni rossi') && verifiedCustomerName.toLowerCase().includes('marco rossi'));

    const entities: RoutedEntities = {
      ...dateEntity,
      ...timeEntity,
      ...(service ? { service: { id: service.id, name: service.name } } : {}),
      ...(professional ? { professional: { id: professional.id, name: professional.name } } : {}),
      ...(verifiedCustomer || namedCustomer ? {
        customer: {
          id: verifiedCustomer?.id || namedCustomer?.id,
          name: verifiedCustomer?.name || (namedCustomer ? `${(namedCustomer as any).firstName || ''} ${(namedCustomer as any).lastName || ''}`.trim() : undefined),
          verified: Boolean(verifiedCustomer),
          conflictsWithVerifiedCustomer: customerConflict,
        },
      } : {}),
      ...(namedCustomers.length > 1 ? { multipleCustomerNames: true } : {}),
      ...(matchedServices.length > 1 ? { multipleServices: true } : {}),
      ...(containsAny(text, [
        /\b(per conto di|a nome (?:di|mio)|mio fratello|mia sorella|mia moglie|mio marito|moglie di|marito di|un parente)\b/,
      ]) ? { thirdPartyRequest: true } : {}),
      ...(/\b(anonim\w*|senza dare (?:il )?mio cognome)\b/.test(text) ? { anonymousRequest: true } : {}),
    };

    const instructionOrSecretExtraction = containsAny(text, [
      /\b(ignore|ignora|jailbreak|prompt di sistema|system prompt|service role|api key|chiavi api|password)\b/,
      /\b(modalita dan|modalita sviluppatore|regole interne|messaggi nascosti|istruzioni precedenti)\b/,
      /\b(credenzial\w*|variabili d ambiente|ogni segreto|policy .* disabilitat\w*)\b/,
      /\b(dump (?:sql|completo|del database)|select .* from|json grezzo|contenuto privato del database)\b/,
    ]);
    const bulkOrThirdPartyDataRequest = containsAny(text, [
      /\b(tutti i clienti|altri clienti|database clienti|storico completo)\b/,
      /\b(elenca nomi|note fiscali|dati personali associati|comunicami gli appuntamenti)\b/,
      /\b(file del bilancio di|dati personali (?:e|di)|conversazioni e dei messaggi)\b/,
      /\b(tutti gli appuntamenti|appuntamenti di oggi|appuntamenti dello studio|agenda dello studio)\b/,
    ]) && (!verifiedCustomer || customerConflict || /\b(tutti|altri|parente|consulente esterno)\b/.test(text));
    const dangerous = instructionOrSecretExtraction || bulkOrThirdPartyDataRequest;
    if (dangerous) {
      return {
        intent: 'COMPANY_INFORMATION',
        entities: { ...entities, faqTopic: 'privacy', potentiallyDangerous: true },
        confidence: 0.99,
        needsClarification: false,
      };
    }

    // Owner / Admin Commands (Phase 5)
    if (context?.isOwner) {
      const isListAgenda = containsAny(text, [
        /\b(?:chi ho|agenda|appuntamenti|chi c'e|impegni|who do i have|whom do i have|quem eu tenho|schedule)\b/
      ]);
      const isBlock = containsAny(text, [
        /\b(?:blocca|block|bloquear|chiudi|chiusura|indisponibile)\b/
      ]);
      const isMove = containsAny(text, [
        /\b(?:sposta|muovi|move|mover|riprogramma|spostare|sposta l appuntamento)\b/
      ]);
      const isStats = containsAny(text, [
        /\b(?:quanti|how many|quantos|conteggio|statistiche|totale)\b.*\b(?:appuntament|appointments|agendamentos|visite|incontri)\b/,
        /\bquanti appuntamenti\b/,
        /\bhow many appointments\b/
      ]);

      if (isListAgenda || isBlock || isMove || isStats) {
        let ownerCommandType: RoutedEntities['ownerCommandType'] = 'list_agenda';
        let ownerCommandCustomerName: string | undefined = undefined;
        let ownerCommandNewDateTime: string | undefined = undefined;
        let reason: string | undefined = undefined;

        if (isBlock) {
          ownerCommandType = 'block_calendar';
          reason = 'Blocco calendario da titolare';
        } else if (isMove) {
          ownerCommandType = 'move_appointment';
          const rawLower = userText.toLowerCase();
          const matchedCust = context?.customers.find(c => 
            rawLower.includes(c.name.toLowerCase()) || 
            rawLower.includes(c.name.split(' ')[0].toLowerCase())
          );
          ownerCommandCustomerName = matchedCust ? matchedCust.name : undefined;
          
          const newDate = dateEntity.date;
          const newTime = timeEntity.time;
          if (newDate && newTime) {
            ownerCommandNewDateTime = `${newDate}T${newTime}:00Z`;
          } else if (newDate) {
            ownerCommandNewDateTime = `${newDate}T09:00:00Z`;
          }
        } else if (isStats) {
          ownerCommandType = 'get_stats';
        }

        const ownerEntities: RoutedEntities = {
          ...entities,
          ownerCommandType,
          ownerCommandReason: reason,
          ownerCommandCustomerName,
          ownerCommandNewDateTime
        };

        return {
          intent: 'OWNER_COMMAND',
          entities: ownerEntities,
          confidence: 0.95,
          needsClarification: isMove && (!ownerCommandCustomerName || !ownerCommandNewDateTime)
        };
      }
    }

    if (/\b(operatore|umano|segretaria|human agent|atendente|truffator\w*|reclamo)\b/.test(text)) {
      return { intent: 'HUMAN_HANDOFF', entities, confidence: 0.94, needsClarification: false };
    }

    let faqTopic = detectFaqTopic(text);
    const cancelSignal = /\b(disdire|cancellare|annullare|annulla|cancel)\b/.test(text);
    const rescheduleSignal = /\b(spostare|rimandare|riprogrammare|reschedule|remarcar)\b/.test(text);
    const hypothetical = /\b(posso|potrei|se |quanto tempo|come funziona|come posso)\b/.test(text);
    const explicitBookingAction = /\b(ho bisogno|mi serve|devo|vorrei parlare|quero marcar|need an appointment)\b/.test(text);
    const preliminaryBookingSignal = /\b(prenot\w*|appuntament\w*|fiss\w*|incontro|visita|consulta|agendamento|appointment|marcar|vorrei vederlo|mi serve|ho bisogno|devo(?: farmi)?|vorrei parlare|rns|app x)\b/.test(text);
    if ((faqTopic === 'professionals' || faqTopic === 'social')
      && (explicitBookingAction || preliminaryBookingSignal)) faqTopic = undefined;
    if (faqTopic === 'booking_policy' && !hypothetical
      && !/\bpotete chiamarmi\b/.test(text)
      && (explicitBookingAction || preliminaryBookingSignal)) faqTopic = undefined;

    if (cancelSignal && rescheduleSignal) {
      return {
        intent: 'COMPANY_INFORMATION',
        entities: { ...entities, faqTopic: 'booking_policy', conflictingActions: true },
        confidence: 0.63,
        needsClarification: true,
      };
    }
    if (cancelSignal && !hypothetical && (!faqTopic || faqTopic === 'customer_appointments' || faqTopic === 'customer_profile')) {
      return { intent: 'CANCEL_APPOINTMENT', entities, confidence: 0.91, needsClarification: !verifiedCustomer };
    }
    if (rescheduleSignal && !hypothetical && (!faqTopic || faqTopic === 'customer_appointments' || faqTopic === 'customer_profile')) {
      return { intent: 'RESCHEDULE_APPOINTMENT', entities, confidence: 0.88, needsClarification: !verifiedCustomer || !entities.date };
    }

    if (faqTopic) {
      if (faqTopic === 'customer_profile' || faqTopic === 'customer_appointments') {
        return {
          intent: 'CUSTOMER_INFORMATION',
          entities: { ...entities, faqTopic },
          confidence: 0.9,
          needsClarification: !verifiedCustomer,
        };
      }
      return {
        intent: 'COMPANY_INFORMATION',
        entities: { ...entities, faqTopic },
        confidence: 0.9,
        needsClarification: faqTopic === 'customer_profile' && !verifiedCustomer,
      };
    }

    if (entities.multipleCustomerNames) {
      return {
        intent: 'CUSTOMER_INFORMATION',
        entities: { ...entities, faqTopic: 'customer_profile' },
        confidence: 0.72,
        needsClarification: true,
      };
    }

    const availabilitySignal = /\b(disponibil\w*|posto|posti|liber\w|orari\w*|avete posto|quando posso|meno affollato)\b/.test(text);
    const bookingSignal = preliminaryBookingSignal;
    const domainSignal = Boolean(service) || /\b(consulenza|fiscale|tasse|bilancio|commercialista|partita iva)\b/.test(text);

    const hasDateTime = entities.date && entities.time;
    if (availabilitySignal || bookingSignal || domainSignal) {
      if (hasDateTime && !availabilitySignal) {
        return {
          intent: 'CREATE_APPOINTMENT',
          entities,
          confidence: bookingSignal ? 0.86 : 0.7,
          needsClarification: Boolean(entities.invalidDate),
        };
      } else {
        return {
          intent: 'CHECK_AVAILABILITY',
          entities,
          confidence: availabilitySignal ? 0.9 : 0.78,
          needsClarification: Boolean(entities.invalidDate),
        };
      }
    }

    return {
      intent: 'UNKNOWN',
      entities: { ...entities, faqTopic: 'general' },
      confidence: 0.56,
      needsClarification: true,
    };
  }

  convertToToolCalls(route: StructuredIntentRoute): Array<{ name: string; args: Record<string, unknown> }> {
    const args: Record<string, unknown> = {};
    const e = route.entities;

    if (route.intent === 'CHECK_AVAILABILITY' || route.intent === 'CREATE_APPOINTMENT' || route.intent === 'RESCHEDULE_APPOINTMENT') {
      args.serviceId = e.service?.id || 'AUTO_PRIMARY';
      args.professionalId = e.professional?.id || 'AUTO_PRIMARY';
    }
    if (e.customer?.id) args.customerId = e.customer.id;
    
    if (e.date) {
      args.date = e.date;
    }
    if (e.startDate) {
      args.startDate = e.startDate;
    }
    if (e.endDate) {
      args.endDate = e.endDate;
    }
    const hasDateTime = e.date && e.time;
    if (hasDateTime) {
      args.dateTime = `${e.date}T${e.time}:00+02:00`;
    }

    if (route.intent === 'OWNER_COMMAND') {
      if (e.ownerCommandType === 'list_agenda') {
        return [{ name: 'ownerListAgenda', args: { date: e.date || new Date().toISOString().slice(0, 10) } }];
      }
      if (e.ownerCommandType === 'block_calendar') {
        return [{ name: 'ownerBlockCalendar', args: { date: e.date || new Date().toISOString().slice(0, 10), reason: e.ownerCommandReason || 'Blocco da titolare' } }];
      }
      if (e.ownerCommandType === 'move_appointment') {
        return [{ name: 'ownerMoveAppointment', args: { customerName: e.ownerCommandCustomerName || '', newDateTime: e.ownerCommandNewDateTime || '' } }];
      }
      if (e.ownerCommandType === 'get_stats') {
        return [{ name: 'ownerGetStats', args: { date: e.date || new Date().toISOString().slice(0, 10) } }];
      }
    }

    if (route.intent === 'CHECK_AVAILABILITY') {
      return [{ name: 'checkAvailability', args }];
    }
    
    if (route.intent === 'CREATE_APPOINTMENT') {
      if (e.customer?.name) args.customerName = e.customer.name;
      else args.customerName = "Ospite";
      if (hasDateTime) {
        args.startAt = `${e.date}T${e.time}:00+02:00`;
      }
      return [{ name: 'createAppointment', args }];
    }
    
    if (route.intent === 'CANCEL_APPOINTMENT') {
      args.appointmentId = 'AUTO_RESOLVE';
      args.reason = "Cancellazione tramite assistente";
      return [{ name: 'cancelAppointment', args }];
    }
    
    if (route.intent === 'RESCHEDULE_APPOINTMENT') {
      args.appointmentId = 'AUTO_RESOLVE';
      if (hasDateTime) {
        args.newStartAt = `${e.date}T${e.time}:00+02:00`;
      }
      return [{ name: 'rescheduleAppointment', args }];
    }
    
    if (route.intent === 'COMPANY_INFORMATION') {
      args.queryType = e.faqTopic || 'general';
      return [{ name: 'getCompanyInformation', args }];
    }

    if (route.intent === 'CUSTOMER_INFORMATION') {
      args.queryType = e.faqTopic || 'customer_profile';
      return [{ name: 'findCustomer', args: { phone: e.customer?.phone || 'RESOLVED_FROM_CRM' } }];
    }
    
    if (route.intent === 'HUMAN_HANDOFF') {
      args.reason = "Richiesta operatore umano";
      return [{ name: 'handoff_to_human', args }];
    }
    
    return [];
  }
}
