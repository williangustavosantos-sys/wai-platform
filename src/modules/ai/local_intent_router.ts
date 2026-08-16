export interface AIProviderContext {
  organization: { timezone: string };
  services: Array<{ id: string; name: string }>;
  professionals: Array<{ id: string; name: string; phone?: string | null; title?: string | null }>;
  customers: Array<{ id: string; name?: string; firstName?: string; lastName?: string; phone?: string | null; phoneNormalized?: string | null }>;
  customer?: { id: string; name?: string; firstName?: string; lastName?: string; isOwner?: boolean };
  isOwner?: boolean;
  workflow?: ConversationWorkflow;
}

import { Intent } from '../conversation/conversation.types';
import { getOrganizationDateKey, organizationLocalDateTimeToUtc } from '@/modules/shared/organization-timezone';

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
  | 'parking'
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
  startDate?: string;
  endDate?: string;
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
  requestedCustomerName?: string;
  requestedCustomerFirstName?: string;
  requestedCustomerLastName?: string;
  requestedCustomerPhone?: string;
  requestedPhoneChange?: boolean;
  // Owner command entities
  ownerCommandType?: 'list_agenda' | 'block_calendar' | 'move_appointment' | 'get_stats';
  ownerCommandReason?: string;
  ownerCommandCustomerName?: string;
  ownerCommandNewDateTime?: string;
}

export interface ConversationWorkflow {
  intent?: 'CHECK_AVAILABILITY' | 'RESCHEDULE_APPOINTMENT';
  entities?: Pick<RoutedEntities, 'service' | 'professional' | 'date' | 'time' | 'timePeriod' | 'requestedCustomerName' | 'requestedCustomerFirstName' | 'requestedCustomerLastName' | 'requestedCustomerPhone'>;
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

// Short weekday forms used by day cards (e.g. "Lun 17").
const SHORT_WEEKDAYS: Record<string, number> = {
  dom: 0, sun: 0,
  lun: 1, mon: 1,
  mar: 2, tue: 2, ter: 2,
  mer: 3, wed: 3, qua: 3,
  gio: 4, thu: 4, qui: 4,
  ven: 5, fri: 5, sex: 5,
  sab: 6, sat: 6,
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

function extractDate(text: string, timezone: string): Pick<RoutedEntities, 'date' | 'startDate' | 'endDate' | 'invalidDate'> {
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
  // Day-first with optional connector: "25 agosto", "25 di agosto", "25 de agosto", "25 of August".
  const dayFirstMatch = text.match(new RegExp(`\\b(\\d{1,2})\\s*(?:(?:di|de|of)\\s+)?(${monthNames})(?:\\s+(20\\d{2}))?\\b`));
  // Month-first (English): "August 25", "August 25, 2026". Tokens that also
  // name a short weekday (e.g. "mar" = martedì) are excluded so "mar 25"
  // keeps resolving to the weekday (Tuesday 25), never to a month.
  const monthFirstNames = Object.keys(MONTHS)
    .filter((name) => !(name in SHORT_WEEKDAYS))
    .sort((a, b) => b.length - a.length)
    .join('|');
  const monthFirstMatch = text.match(new RegExp(`\\b(${monthFirstNames})\\s+(\\d{1,2})(?:\\s*[,]?\\s*(20\\d{2}))?\\b`));
  const namedMatch = dayFirstMatch || monthFirstMatch;
  if (namedMatch) {
    const raw = namedMatch[0];
    const isDayFirst = Boolean(dayFirstMatch);
    const day = Number(isDayFirst ? namedMatch[1] : namedMatch[2]);
    const monthToken = isDayFirst ? namedMatch[2] : namedMatch[1];
    const dateYear = Number((isDayFirst ? namedMatch[3] : namedMatch[3]) || year);
    const date = formatDate(dateYear, MONTHS[monthToken], day);
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

  const shortWeekdayMatch = text.match(/\b(dom|lun|mar|mer|gio|ven|sab|sun|mon|tue|wed|thu|fri|sat|ter|qua|qui|sex)\b[.,]?\s+(\d{1,2})\b/)
    || text.match(/\b(\d{1,2})\s+(?:di\s+)?(dom|lun|mar|mer|gio|ven|sab|sun|mon|tue|wed|thu|fri|sat|ter|qua|qui|sex)\b/);
  if (shortWeekdayMatch) {
    const targetDay = SHORT_WEEKDAYS[shortWeekdayMatch[1].toLowerCase()] ?? SHORT_WEEKDAYS[shortWeekdayMatch[2].toLowerCase()];
    const dayOfMonth = Number(/^\d+$/.test(shortWeekdayMatch[1]) ? shortWeekdayMatch[1] : shortWeekdayMatch[2]);
    if (targetDay !== undefined && dayOfMonth >= 1 && dayOfMonth <= 31) {
      for (let offset = 0; offset <= 30; offset += 1) {
        const target = new Date(today);
        target.setUTCDate(target.getUTCDate() + offset);
        if (target.getUTCDay() === targetDay && target.getUTCDate() === dayOfMonth) {
          return { date: target.toISOString().slice(0, 10) };
        }
      }
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

function extractSelfIdentifiedName(userText: string, ctx?: { firstName?: string; catalogNames?: Set<string> }): Pick<RoutedEntities, 'requestedCustomerName' | 'requestedCustomerFirstName' | 'requestedCustomerLastName'> {
  // Structured form: "Nome Mario, cognome Rossi" / "Nome Mario cognome Rossi"
  // (order-agnostic: also "Cognome Rossi, nome Mario"). The form is the one
  // emitted by the IDENTITY structured form, and the free-text equivalent.
  const structuredFirstName = userText.match(
    /\b(?:nome|first\s*name)\s+([A-Za-zÀ-ÖØ-öø-ÿ'’-]+)[,\s]+(?:il\s+|o\s+)?(?:cognome|last\s*name|sobrenome|apelido)\s+([A-Za-zÀ-ÖØ-öø-ÿ'’-]+)\b/i,
  );
  const structuredLastNameFirst = userText.match(
    /\b(?:cognome|last\s*name|sobrenome|apelido)\s+([A-Za-zÀ-ÖØ-öø-ÿ'’-]+)[,\s]+(?:il\s+|o\s+)?(?:nome|first\s*name)\s+([A-Za-zÀ-ÖØ-öø-ÿ'’-]+)\b/i,
  );
  if (structuredFirstName || structuredLastNameFirst) {
    const first = structuredFirstName ? structuredFirstName[1] : structuredLastNameFirst![2];
    const last = structuredFirstName ? structuredFirstName[2] : structuredLastNameFirst![1];
    return {
      requestedCustomerName: `${first} ${last}`,
      requestedCustomerFirstName: first,
      requestedCustomerLastName: last,
    };
  }

  // Primary: detect names introduced by phrases like "mi chiamo", "sono", "my name is"
  const match = userText.match(/\b(?:mi\s+chiamo|sono|my\s+name\s+is|i\s+am|i['’]m|meu\s+nome\s+[ée]|me\s+chamo|chamo-me|sou)\s+([A-Za-zÀ-ÖØ-öø-ÿ'’-]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ'’-]+){0,4})/i);
  if (match) {
    const name = match[1]
      .split(/\s+(?:e\s+(?:il\s+)?mio|and\s+my|e\s+o\s+meu|minha|my|meu)?\s*(?:telefono|cellulare|phone|mobile|telefone|telem[oó]vel|tel)\b/i)[0]
      .trim()
      .replace(/[.,;:!?]+$/, '');
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return {};
    return {
      requestedCustomerName: name,
      requestedCustomerFirstName: parts[0],
      ...(parts.length >= 2 ? { requestedCustomerLastName: parts.slice(1).join(' ') } : {}),
    };
  }

  // Fallback: detect standalone full names (2-3 words, Italian/Portuguese pattern)
  // e.g. "Mario Rossi", "Giulia De Rossi", "Luca Bianchi"
  // Only matches when no explicit intro phrase is present and the text is a clean name
  const words = userText.trim().replace(/[.,;:!?]+$/, '').split(/\s+/).filter(Boolean);
  if (words.length === 2 || words.length === 3) {
    // All words must look like names (capitalized, not common stopwords)
    const namePattern = /^[A-Z][a-zàéèìòùúÀÉÈÌÒÙÚ]+[a-zàéèìòùúÀÉÈÌÒÙÚ'-]*$/;
    const italianStopwords = new Set(['e', 'di', 'da', 'del', 'della', 'per', 'con', 'ho', 'sono', 'il', 'la', 'i', 'gli', 'le', 'mi', 'ti', 'si']);
    if (words.every(w => italianStopwords.has(w.toLowerCase()) || namePattern.test(w))) {
      const filtered = words.filter(w => !italianStopwords.has(w.toLowerCase()));
      if (filtered.length >= 2) {
        const name = filtered.join(' ');
        const normalizedName = normalizeNaturalLanguage(name);
        // A "clean name" that matches a catalog label (service / professional)
        // is almost certainly a card option sent as text — never identity.
        // Example: the service label "Consulenza Fiscale Iniziale" must not be
        // parsed as the customer's name.
        if (ctx?.catalogNames?.has(normalizedName)) {
          return {};
        }
        // A bare-name phrase that EMBEDS a catalog label is a booking sentence,
        // not an identity: "Quero consulta inicial" / "Vorrei consulenza
        // fiscale" must never produce a phantom customer name like "Quero
        // Consulta Inicial".
        if (ctx?.catalogNames && [...ctx.catalogNames].some((catalog) => catalog && normalizedName.includes(catalog))) {
          return {};
        }
        return {
          requestedCustomerName: name,
          requestedCustomerFirstName: filtered[0],
          requestedCustomerLastName: filtered.slice(1).join(' '),
        };
      }
    }
  }

  return {};
}

export function extractCustomerPhone(userText: string): string | undefined {
  const international = userText.match(/(?:^|\s)((?:\+|00)[1-9]\d[\d\s()./-]{5,}\d)(?=$|\s|[,;!?])/);
  if (international) return international[1].trim();

  const labelled = userText.match(/\b(?:telefono|cellulare|phone|mobile|telefone|telem[oó]vel|tel)\s*(?:è|e|is|:)?\s*(\d[\d\s()./-]{6,}\d)/i);
  return labelled?.[1]?.trim();
}

function significantTokens(value: string): string[] {
  return normalizeNaturalLanguage(value)
    .split(' ')
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

const CONCEPT_ALIASES: Array<[RegExp, string]> = [
  [/^(?:consulenz\w*|consultation|consulting|consultoria|consulta)$/, 'consultation'],
  [/^(?:fiscal\w*|tax|taxes|tasse|impost\w*|tribut\w*|iva|partita|forfettari\w*)$/, 'tax'],
  [/^(?:contabil\w*|accounting|accountant|commercialista)$/, 'accounting'],
];

const CONCEPT_NAMES = new Set(CONCEPT_ALIASES.map(([, concept]) => concept));

// Domain concepts (tax, accounting) are strong signals that uniquely identify
// a catalog service (e.g. "tasse" -> the fiscal consultation). The generic
// "consultation" concept is a booking signal word (like "visita") and must
// NEVER auto-resolve a service by itself — a missing explicit service always
// sends the flow to the SERVICE step ("informação faltante → perguntar").
const CONCEPT_WEIGHTS: Record<string, number> = {
  consultation: 2,
  tax: 4,
  accounting: 4,
};

function conceptTokens(value: string): string[] {
  return normalizeNaturalLanguage(value).split(' ').map((rawToken) => {
    const token = rawToken.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
    const alias = CONCEPT_ALIASES.find(([pattern]) => pattern.test(token));
    return alias?.[1] || token;
  }).filter((token) => (token.length >= 4 || CONCEPT_NAMES.has(token)) && !STOP_WORDS.has(token));
}

function catalogMatchScore(text: string, entryName: string): number {
  const normalizedName = normalizeNaturalLanguage(entryName);
  if (normalizedName && text.includes(normalizedName)) return 20;

  const inputConcepts = new Set(conceptTokens(text));
  return conceptTokens(entryName).reduce((score, token) => score + (inputConcepts.has(token) ? (CONCEPT_WEIGHTS[token] ?? 2) : 0), 0);
}

function matchCatalogEntity<T extends { id: string; name: string }>(text: string, entries: T[]): T | undefined {
  const ranked = entries
    .map((entry) => ({ entry, score: catalogMatchScore(text, entry.name) }))
    .filter((candidate) => candidate.score >= 4)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length || (ranked[1] && ranked[0].score === ranked[1].score)) return undefined;
  return ranked[0].entry;
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
    // Catalog labels used to guard the identity fallback: a standalone
    // capitalized phrase that equals a service/professional label is a card
    // option, not a customer name.
    const catalogNames = new Set(
      [...catalogServices, ...(context?.professionals || [])].map((entry) => normalizeNaturalLanguage(entry.name)),
    );
    // A service only "matches" when the score is a real signal (>= 4), the
    // same threshold used by matchCatalogEntity. Using score > 0 here makes
    // catalogues with similar names ("Consulta Inicial" / "Consulta Retorno" /
    // "Consulta Online") flag an explicit, exact-name choice as ambiguous: the
    // weak concept overlap (score 2) drowns the exact match (score 20) and the
    // customer's chosen service is silently dropped.
    const matchedServices = catalogServices.filter((entry) => catalogMatchScore(text, entry.name) >= 4);
    // An explicit exact-name match (full normalized label present in the text,
    // score 20) is authoritative: a weak concept overlap from a similarly-named
    // catalog entry (e.g. the misspelled "cunsulenza fiscale ritorno" scoring 4
    // on the shared "fiscale" concept) must never turn the customer's explicit
    // choice into a false ambiguity. Without an exact match, a single
    // concept-level candidate may still resolve ("Vorrei una consulenza" with a
    // one-service catalog), but several concept-level candidates mean the
    // customer named multiple services — the flow must ask which one.
    const exactServiceMatches = catalogServices.filter((entry) => catalogMatchScore(text, entry.name) >= 20);
    const exactService = exactServiceMatches.length === 1 ? exactServiceMatches[0] : undefined;
    const service = exactService || (matchedServices.length === 1 ? matchCatalogEntity(text, catalogServices) : undefined);
    const serviceAmbiguous = matchedServices.length > 1 && !exactService;
    const professional = matchCatalogEntity(text, context?.professionals || []);
    const professionalName = professional ? normalizeNaturalLanguage(professional.name) : '';
    const professionalPersonName = professionalName.replace(/^(?:dott\w*|dr)\.?\s+/, '');
    const professionalUsedAsProfessional = Boolean(professionalPersonName && containsAny(text, [
      new RegExp(`\\b(con|with|com)\\s+(?:(?:il|la)\\s+)?(?:dott\\w*\\.?\\s+)?${professionalPersonName.replace(/\s+/g, '\\s+')}\\b`),
      new RegExp(`\\b(?:dott\\w*|dr)\\.?\\s+${professionalPersonName.replace(/\s+/g, '\\s+')}\\b`),
    ]));
    const namedCustomers = (context?.customers || []).filter((customer) => {
      const cName = customer.name || `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
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
      ? `${verifiedCustomer.firstName || ''} ${verifiedCustomer.lastName || ''}`.trim()
      : '';
    const selfIdentifiedName = extractSelfIdentifiedName(userText, { catalogNames });
    const verifiedName = normalizeNaturalLanguage(verifiedCustomerName);
    const claimedName = normalizeNaturalLanguage(selfIdentifiedName.requestedCustomerName || '');
    const completeClaimConflicts = Boolean(
      verifiedCustomer
      && selfIdentifiedName.requestedCustomerLastName
      && verifiedName
      && claimedName
      && claimedName !== verifiedName
      && /\b(prenot\w*|book\w*|agendar|marcar)\b/.test(text),
    );
    const customerConflict = Boolean(verifiedCustomer && namedCustomer && verifiedCustomer.id !== namedCustomer.id)
      || completeClaimConflicts;

    const entities: RoutedEntities = {
      ...(context?.workflow?.entities || {}),
      ...dateEntity,
      ...timeEntity,
      ...(service ? { service: { id: service.id, name: service.name } } : {}),
      ...(professional ? { professional: { id: professional.id, name: professional.name } } : {}),
      ...(verifiedCustomer || namedCustomer ? {
        customer: {
          id: verifiedCustomer?.id || namedCustomer?.id,
          name: verifiedCustomer?.name || (namedCustomer ? `${namedCustomer.firstName || ''} ${namedCustomer.lastName || ''}`.trim() : undefined),
          verified: Boolean(verifiedCustomer),
          conflictsWithVerifiedCustomer: customerConflict,
        },
      } : {}),
      ...(namedCustomers.length > 1 ? { multipleCustomerNames: true } : {}),
      ...(serviceAmbiguous ? { multipleServices: true } : {}),
      ...(containsAny(text, [
        /\b(per conto di|a nome (?:di|mio)|mio fratello|mia sorella|mia moglie|mio marito|moglie di|marito di|un parente)\b/,
      ]) ? { thirdPartyRequest: true } : {}),
      ...(/\b(anonim\w*|senza dare (?:il )?mio cognome)\b/.test(text) ? { anonymousRequest: true } : {}),
      ...selfIdentifiedName,
      ...(extractCustomerPhone(userText) ? { requestedCustomerPhone: extractCustomerPhone(userText) } : {}),
      ...(/\b(?:associ\w*|cambi\w*|modific\w*)\b.*\b(?:numero|telefono)\b|\b(?:numero|telefono)\b.*\b(?:associ\w*|cambi\w*|modific\w*)\b/.test(text) ? { requestedPhoneChange: true } : {}),
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
          const matchedCust = context?.customers.find(c => {
            const customerName = c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim();
            return Boolean(customerName) && (
              rawLower.includes(customerName.toLowerCase())
              || rawLower.includes(customerName.split(' ')[0].toLowerCase())
            );
          });
          ownerCommandCustomerName = matchedCust ? (matchedCust.name || `${matchedCust.firstName || ''} ${matchedCust.lastName || ''}`.trim()) : undefined;
          
          const newDate = dateEntity.date;
          const newTime = timeEntity.time;
          if (newDate && newTime) {
            ownerCommandNewDateTime = `${newDate}T${newTime}:00`;
          } else if (newDate) {
            ownerCommandNewDateTime = `${newDate}T09:00:00`;
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

    if (/\b(operatore|umano|humano|human|segretaria|secretary|human agent|atendente|operador|operator|pessoa|person|truffator\w*|reclamo)\b/.test(text)) {
      return { intent: 'HUMAN_HANDOFF', entities, confidence: 0.94, needsClarification: false };
    }

    let faqTopic = detectFaqTopic(text);
    // Cancel / reschedule signals cover the three supported languages:
    // Italian (disdire/cancellare/annullare, spostare/rimandare/riprogrammare),
    // Portuguese (cancelar/desmarcar, remarcar/reagendar/reprogramar, "mudar" +
    // appointment word) and English (cancel, reschedule).
    const cancelSignal = /\b(disdire|cancellare|annullare|annulla|cancel|cancelar|cancelo|desmarcar)\b/.test(text);
    const rescheduleSignal = /\b(spostare|rimandare|riprogrammare|reschedule|remarcar|reagendar|reprogramar)\b/.test(text)
      || /\bmudar\w*\b.*\b(?:horario|horário|orario|data|appuntamento|prenotazione|consulta|appointment)\b/.test(text);
    const workflowIntent = context?.workflow?.intent;
    const hypothetical = /\b(posso|potrei|se |quanto tempo|come funziona|come posso)\b/.test(text);
    const explicitBookingAction = /\b(ho bisogno|mi serve|devo|vorrei parlare|quero marcar|gostaria de marcar|need an appointment|would like to book|i want to book)\b/.test(text);
    const preliminaryBookingSignal = /\b(prenot\w*|appuntament\w*|fiss\w*|incontro|visita|consulta|consultation|booking|book|schedule|reserve|agend\w*|appointment|marcar|reservar|vorrei vederlo|mi serve|ho bisogno|devo(?: farmi)?|vorrei parlare|rns|app x)\b/.test(text);
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

    if (workflowIntent === 'RESCHEDULE_APPOINTMENT' && (entities.date || entities.time)) {
      return { intent: 'RESCHEDULE_APPOINTMENT', entities, confidence: 0.9, needsClarification: !verifiedCustomer || !entities.date || !entities.time };
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
        needsClarification: false,
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

    const availabilitySignal = /\b(disponibil\w*|availability|available|posto|posti|liber\w|orari\w*|slots?|times?|avete posto|quando posso|menos? ocupado|menos? cheio|meno affollato)\b/.test(text);
    const bookingSignal = preliminaryBookingSignal;
    const domainSignal = Boolean(service) || /\b(consulenza|consultation|consultoria|consulta|fiscal\w*|tax|taxes|tasse|impost\w*|bilancio|accounting|accountant|contabil\w*|commercialista|partita iva)\b/.test(text);

    // domainSignal (e.g. "consulenza", "fiscale") is also a booking-family
    // signal: with a single-service catalog it must resolve that service, and
    // the availability/professional auto-resolve must not miss domain-only turns.
    const continuingBooking = workflowIntent === 'CHECK_AVAILABILITY' || bookingSignal || availabilitySignal || domainSignal;
    if (continuingBooking && !entities.service && catalogServices.length === 1) {
      entities.service = { id: catalogServices[0].id, name: catalogServices[0].name };
    }
    if (continuingBooking && !entities.professional && (context?.professionals.length || 0) === 1) {
      const onlyProfessional = context!.professionals[0];
      entities.professional = { id: onlyProfessional.id, name: onlyProfessional.name };
    }
    if (continuingBooking && /\b(primo disponibile|qualsiasi|nessuna preferenza|senza preferenza|non ho preferenze|anyone|any professional|first available|qualquer profissional|primeiro disponivel|no preference|sem preferencia)\b/.test(text)) {
      entities.professional = { id: 'ANY', name: 'First available' };
    }

    const hasDateTime = entities.date && entities.time;
    if (workflowIntent === 'CHECK_AVAILABILITY' && (entities.date || entities.service || entities.professional || entities.time)) {
      return {
        intent: hasDateTime && Boolean(entities.service && entities.professional) ? 'CREATE_APPOINTMENT' : 'CHECK_AVAILABILITY',
        entities,
        confidence: 0.9,
        needsClarification: Boolean(entities.invalidDate),
      };
    }
    if (availabilitySignal || bookingSignal || domainSignal) {
      if (hasDateTime && !availabilitySignal) {
        const requiresCustomerIdentity = !verifiedCustomer && !entities.requestedCustomerLastName;
        const requiresProfessionalSelection = !entities.professional && (context?.professionals.length || 0) > 1;
        return {
          intent: !requiresCustomerIdentity && requiresProfessionalSelection ? 'CHECK_AVAILABILITY' : 'CREATE_APPOINTMENT',
          entities,
          confidence: bookingSignal ? 0.86 : 0.7,
          needsClarification: Boolean(entities.invalidDate),
        };
      } else {
        return {
          intent: 'CHECK_AVAILABILITY',
          entities,
          confidence: availabilitySignal || bookingSignal ? 0.9 : 0.78,
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

  convertToToolCalls(route: StructuredIntentRoute, organizationTimezone = 'Europe/Rome'): Array<{ name: string; args: Record<string, unknown> }> {
    const args: Record<string, unknown> = {};
    const e = route.entities;

    if (route.intent === 'CHECK_AVAILABILITY') {
      args.serviceId = e.service?.id || 'AUTO_RESOLVE';
      if (e.professional?.id) args.professionalId = e.professional.id;
    }
    if (route.intent === 'CREATE_APPOINTMENT' || route.intent === 'RESCHEDULE_APPOINTMENT') {
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
      args.dateTime = organizationLocalDateTimeToUtc(`${e.date}T${e.time}:00`, organizationTimezone) || '';
    }

    if (route.intent === 'OWNER_COMMAND') {
      if (e.ownerCommandType === 'list_agenda') {
        return [{ name: 'ownerListAgenda', args: { date: e.date || getOrganizationDateKey(new Date(), organizationTimezone) } }];
      }
      if (e.ownerCommandType === 'block_calendar') {
        return [{ name: 'ownerBlockCalendar', args: { date: e.date || getOrganizationDateKey(new Date(), organizationTimezone), reason: e.ownerCommandReason || 'Blocco da titolare' } }];
      }
      if (e.ownerCommandType === 'move_appointment') {
        const localDateTime = e.ownerCommandNewDateTime || '';
        return [{ name: 'ownerMoveAppointment', args: {
          customerName: e.ownerCommandCustomerName || '',
          newDateTime: organizationLocalDateTimeToUtc(localDateTime, organizationTimezone) || '',
        } }];
      }
      if (e.ownerCommandType === 'get_stats') {
        return [{ name: 'ownerGetStats', args: { date: e.date || getOrganizationDateKey(new Date(), organizationTimezone) } }];
      }
    }

    if (route.intent === 'CHECK_AVAILABILITY') {
      return [{ name: 'checkAvailability', args }];
    }
    
    if (route.intent === 'CREATE_APPOINTMENT') {
      if (e.customer?.name) args.customerName = e.customer.name;
      else args.customerName = "Ospite";
      if (hasDateTime) {
        args.startAt = organizationLocalDateTimeToUtc(`${e.date}T${e.time}:00`, organizationTimezone) || '';
      }
      const availabilityArgs: Record<string, unknown> = {
        date: e.date,
        serviceId: args.serviceId,
        professionalId: args.professionalId,
      };
      return [
        { name: 'checkAvailability', args: availabilityArgs },
        { name: 'createAppointment', args },
      ];
    }
    
    if (route.intent === 'CANCEL_APPOINTMENT') {
      args.appointmentId = 'AUTO_RESOLVE';
      args.reason = "Cancellazione tramite assistente";
      return [{ name: 'cancelAppointment', args }];
    }
    
    if (route.intent === 'RESCHEDULE_APPOINTMENT') {
      args.appointmentId = 'AUTO_RESOLVE';
      if (hasDateTime) {
        args.newStartAt = organizationLocalDateTimeToUtc(`${e.date}T${e.time}:00`, organizationTimezone) || '';
      }
      return [{ name: 'rescheduleAppointment', args }];
    }
    
    if (route.intent === 'COMPANY_INFORMATION') {
      args.queryType = e.faqTopic || 'general';
      return [{ name: 'getCompanyInformation', args }];
    }

    if (route.intent === 'CUSTOMER_INFORMATION') {
      return [{ name: 'findCustomer', args: { phone: e.customer?.phone || 'RESOLVED_FROM_CRM', queryType: e.faqTopic || 'customer_profile' } }];
    }
    
    if (route.intent === 'HUMAN_HANDOFF') {
      args.reason = "Richiesta operatore umano";
      return [{ name: 'handoff_to_human', args }];
    }
    
    return [];
  }
}
