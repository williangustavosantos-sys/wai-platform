import { ConversationMessage } from '../messages/messages.types';

export type CustomerLanguage = 'it' | 'en' | 'pt';

const LANGUAGE_PATTERNS: Record<CustomerLanguage, Array<[RegExp, number]>> = {
  it: [
    [/\b(vorrei|desidero|prenotare|fissare|appuntamento|consulenza|confermare|domani|oggi|giorno|orario|posto|libero|disponibile|mattina|pomeriggio|settimana|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|ricetta|indirizzo)\b/g, 3],
    [/\b(sono|mio|mia|per|con|alle|qual[ei]?|posso|grazie|ciao|buongiorno|buonasera|della|dello|degli|delle|nella|nelle)\b/g, 1],
  ],
  en: [
    [/\b(i would like|would like|book|booking|schedule|reserve|appointment|consultation|tomorrow|today|date|time|slot|free|available|morning|afternoon|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, 3],
    [/\b(i|my|for|with|at|what|which|can|please|thanks|hello)\b/g, 1],
  ],
  pt: [
    [/\b(gostaria|quero|marcar|agendar|reservar|agendamento|consulta|amanha|hoje|data|horario|vaga|livre|disponivel|manha|tarde|semana|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/g, 3],
    [/\b(meu|minha|para|com|qual|posso|tem|por favor|obrigad[oa]|ola|sou)\b/g, 1],
  ],
};

function normalizeForDetection(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function configuredCustomerLanguage(value?: string | null): CustomerLanguage {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized.startsWith('en')) return 'en';
  if (normalized.startsWith('pt')) return 'pt';
  return 'it';
}

/**
 * Detects only supported customer languages. Short or language-neutral replies
 * (dates, times, names and structured UI payloads) intentionally keep the
 * current conversation language through the supplied fallback.
 */
export function detectCustomerLanguage(userText: string, fallback: CustomerLanguage = 'it'): CustomerLanguage {
  const text = normalizeForDetection(userText);
  if (!text || /^(?:type )?(?:form_submit|select_slot)\b/.test(text)) return fallback;

  const scores = (Object.keys(LANGUAGE_PATTERNS) as CustomerLanguage[]).map((language) => {
    const score = LANGUAGE_PATTERNS[language].reduce((total, [pattern, weight]) => {
      const matches = text.match(pattern);
      return total + (matches?.length || 0) * weight;
    }, 0);
    return { language, score };
  }).sort((a, b) => b.score - a.score);

  if (scores[0].score === 0 || scores[0].score === scores[1].score) return fallback;
  return scores[0].language;
}

export function resolveCustomerLanguage(
  userText: string,
  previousHistory: ConversationMessage[],
  configuredFallback?: string | null,
): CustomerLanguage {
  const configured = configuredCustomerLanguage(configuredFallback);
  let previous = configured;

  for (let index = previousHistory.length - 1; index >= 0; index -= 1) {
    const message = previousHistory[index];
    const metadataLanguage = message.metadata?.customerLanguage;
    if (metadataLanguage === 'it' || metadataLanguage === 'en' || metadataLanguage === 'pt') {
      previous = metadataLanguage;
      break;
    }
    if (message.role === 'customer') {
      previous = detectCustomerLanguage(message.content, configured);
      break;
    }
  }

  return detectCustomerLanguage(userText, previous);
}
