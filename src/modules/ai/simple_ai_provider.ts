import { logger } from '@/logging/logger';
import { ConversationMessage } from '../messages/messages.types';
import { Intent } from '../conversation/conversation.types';
import { ToolDefinition } from '../tools/tools.types';
import { DigitalEmployeeConfig } from '../assistant/assistant.types';
import { AIProvider, AIProviderTurnOutput, ToolResultSummary } from './ai.types';
import { normalizePhoneNumber } from '../crm/crm.service';

function getDateInTimezone(offsetDays: number, timezone = 'Europe/Rome'): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const todayStr = formatter.format(now);
  if (offsetDays === 0) return todayStr;
  
  const [year, month, day] = todayStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return dateObj.toISOString().slice(0, 10);
}

import { extractAvailabilityFromToolCall } from '../tools/tools.types';

export class SimpleAIProvider implements AIProvider {
  readonly providerName = 'SimpleAIProvider (Guided Booking Engine)';

  async processTurn(
    config: DigitalEmployeeConfig | null,
    history: ConversationMessage[],
    userText: string,
    _availableTools: ToolDefinition[],
    organizationSlug: string
  ): Promise<AIProviderTurnOutput> {
    const textLower = userText.toLowerCase().trim();
    const revHistory = [...history].reverse();
    const lastAssistantMsgObj = revHistory.find(m => m.role === 'assistant');
    const lastAssistantMsg = lastAssistantMsgObj?.content || '';
    
    let detectedIntent: Intent = 'BOOK_APPOINTMENT';
    const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    
    let bookingDraft: Record<string, any> = (lastAssistantMsgObj?.metadata?.bookingDraft as Record<string, any>) || {};

    if (textLower === 'annulla' || textLower.includes('annulla prenotazione')) {
       return { replyText: 'La richiesta di prenotazione è stata annullata.', detectedIntent: 'GENERAL_INFORMATION', toolCalls: [], customMetadata: { bookingDraft: null } };
    }
    if (textLower.includes('cancellare') || textLower.includes('disdire')) {
      return { replyText: '', detectedIntent: 'CANCEL_APPOINTMENT', toolCalls: [{ name: 'cancelAppointment', args: { appointmentId: 'AUTO_RESOLVE', reason: 'Richiesta del cliente in chat' } }], customMetadata: { bookingDraft: null } };
    }
    if (textLower.includes('operatore') || textLower.includes('umano') || textLower.includes('segretaria')) {
      return { replyText: '', detectedIntent: 'HUMAN_HANDOFF', toolCalls: [], customMetadata: { bookingDraft: null } };
    }

    if (textLower.includes('modifica dati')) {
       return { replyText: '[WAI_STEP_DETAILS]', detectedIntent, toolCalls: [], customMetadata: { bookingDraft } };
    }
    if (textLower.includes('modifica') && textLower.trim() === 'modifica') {
       return { replyText: '[WAI_STEP_MODIFICA]', detectedIntent, toolCalls, customMetadata: { bookingDraft } };
    }

    // "Vedi altre disponibilità" (More slots)
    if (textLower.includes('vedi altre disponibilità') || textLower.includes('altre disponibilità')) {
        bookingDraft.searchOffsetDays = (bookingDraft.searchOffsetDays || 0) + 1;
        const startDate = getDateInTimezone(bookingDraft.searchOffsetDays);
        const endDate = getDateInTimezone(bookingDraft.searchOffsetDays + 30);
        toolCalls.push({ name: 'checkAvailability', args: { serviceId: bookingDraft.serviceId, professionalId: bookingDraft.professionalId || 'AUTO_PRIMARY', startDate, endDate } });
        return { replyText: '[WAI_STEP_SLOTS]', detectedIntent, toolCalls, customMetadata: { bookingDraft } };
    }

    // Step 7: Confirm
    if (lastAssistantMsg.includes('[WAI_STEP_CONFIRM_CARD]') && textLower.includes('conferma prenotazione')) {
         toolCalls.push({ name: 'checkAvailability', args: { date: bookingDraft.date } });
         toolCalls.push({ name: 'createCustomer', args: { firstName: bookingDraft.firstName, lastName: bookingDraft.lastName, phone: bookingDraft.phone } });
         toolCalls.push({
           name: 'createAppointment',
           args: {
             customerId: 'RESOLVED_FROM_CRM',
             serviceId: bookingDraft.serviceId,
             professionalId: bookingDraft.professionalId,
             startAt: `${bookingDraft.date}T${bookingDraft.time}:00`
           }
         });
         return { replyText: '[WAI_STEP_CONFIRM]', detectedIntent, toolCalls, customMetadata: { bookingDraft } };
    }

    // Form Submit Payloads (First Name, Last Name, Phone)
    let parsedPayload: any = null;
    try {
        parsedPayload = JSON.parse(userText);
    } catch(e) {}

    if (parsedPayload && parsedPayload.type === 'FORM_SUBMIT') {
       if (parsedPayload.field === 'firstName') {
           bookingDraft.firstName = parsedPayload.value;
           return { replyText: '[WAI_STEP_LAST_NAME]\nQual è il tuo cognome?', detectedIntent, toolCalls: [], customMetadata: { bookingDraft } };
       } else if (parsedPayload.field === 'lastName') {
           bookingDraft.lastName = parsedPayload.value;
           bookingDraft.fullName = `${bookingDraft.firstName} ${bookingDraft.lastName}`.trim();
           return { replyText: '[WAI_STEP_PHONE]\nQual è il tuo numero di telefono?', detectedIntent, toolCalls: [], customMetadata: { bookingDraft } };
       } else if (parsedPayload.field === 'phone') {
           let extractedPhone = `${parsedPayload.countryCode}${parsedPayload.number}`.replace(/\s+/g, '');
           let phoneRes = normalizePhoneNumber(extractedPhone, parsedPayload.countryCode);
           
           if (!phoneRes.valid || !phoneRes.normalized) {
               return { replyText: '[WAI_STEP_PHONE]\nIl numero non sembra corretto. Controllalo e riprova.', detectedIntent, toolCalls: [], customMetadata: { bookingDraft } };
           }
           bookingDraft.phone = phoneRes.normalized;
           return { replyText: '[WAI_STEP_CONFIRM_CARD]', detectedIntent, toolCalls: [], customMetadata: { bookingDraft } };
       }
    }

    // Step 8: Legacy text-based fallbacks (Just in case, but forms are used now)
    if (lastAssistantMsg.includes('[WAI_STEP_PHONE]')) {
       // Should be handled by FORM_SUBMIT above
       return { replyText: '[WAI_STEP_PHONE]\nPer favore, usa il modulo qui sotto per inserire il numero.', detectedIntent, toolCalls: [], customMetadata: { bookingDraft } };
    }

    if (lastAssistantMsg.includes('[WAI_STEP_LAST_NAME]') || lastAssistantMsg.includes('[WAI_STEP_FIRST_NAME]')) {
       // Should be handled by FORM_SUBMIT above
       return { replyText: `[${lastAssistantMsg.includes('LAST') ? 'WAI_STEP_LAST_NAME' : 'WAI_STEP_FIRST_NAME'}]\nPer favore, usa il modulo qui sotto.`, detectedIntent, toolCalls: [], customMetadata: { bookingDraft } };
    }

    if (lastAssistantMsg.includes('[WAI_STEP_NAME]')) {
       // Old legacy state
       return { replyText: '[WAI_STEP_FIRST_NAME]\nCome ti chiami?', detectedIntent, toolCalls: [], customMetadata: { bookingDraft } };
    }

    if (parsedPayload && parsedPayload.type === 'SELECT_SLOT') {
       bookingDraft.date = parsedPayload.date;
       bookingDraft.time = parsedPayload.time;
       bookingDraft.professionalId = parsedPayload.professionalId;
       bookingDraft.professionalName = parsedPayload.professionalName;
       
       const dateObj = new Date(bookingDraft.date);
       bookingDraft.formattedDate = dateObj.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

       return { replyText: '[WAI_STEP_FIRST_NAME]\nCome ti chiami?', detectedIntent, toolCalls: [], customMetadata: { bookingDraft } };
    }

    // Step 2: Choose Professional (if asked)
    if (lastAssistantMsg.includes('[WAI_STEP_PROFESSIONAL]')) {
       bookingDraft.professionalId = 'AUTO_PRIMARY';
       if (textLower.includes('primo disponibile') || textLower.includes('qualsiasi')) {
           bookingDraft.professionalId = 'ANY';
           bookingDraft.professionalName = 'Il primo disponibile';
       } else {
           const listToolCalls = (lastAssistantMsgObj?.metadata?.toolCalls || []) as any[];
           const checkCall = listToolCalls.find((t: any) => (t.toolName || t.name) === 'checkAvailability');
           if (checkCall?.result?.professionals) {
               const p = checkCall.result.professionals.find((pr: any) => textLower.includes(pr.name.toLowerCase()));
               if (p) {
                   bookingDraft.professionalId = p.id;
                   bookingDraft.professionalName = p.name;
               }
           }
       }
       
       bookingDraft.searchOffsetDays = 0;
       const startDate = getDateInTimezone(0);
       const endDate = getDateInTimezone(30);
       toolCalls.push({ name: 'checkAvailability', args: { serviceId: bookingDraft.serviceId, professionalId: bookingDraft.professionalId, startDate, endDate } });
       
       return { replyText: '[WAI_STEP_SLOTS]', detectedIntent, toolCalls, customMetadata: { bookingDraft } };
    }

    // Step 1: Choose Service
    if (bookingDraft.step === 'SERVICE_CHECK' || lastAssistantMsg.includes('[WAI_STEP_SERVICE]')) {
       bookingDraft = { ...bookingDraft, step: 'CHECKING', serviceId: 'AUTO_RESOLVE', searchOffsetDays: 0 };
       const startDate = getDateInTimezone(0);
       const endDate = getDateInTimezone(30);
       
       toolCalls.push({ name: 'checkAvailability', args: { serviceId: 'AUTO_RESOLVE', userSearchText: userText, professionalId: 'AUTO_PRIMARY', startDate, endDate } });
       
       return { replyText: '[WAI_STEP_SLOTS]', detectedIntent, toolCalls, customMetadata: { bookingDraft } };
    }

    if (textLower.includes('informazioni') || textLower.includes('info')) {
      return { replyText: '[WAI_STEP_INFO]', detectedIntent: 'GENERAL_INFORMATION', toolCalls: [], customMetadata: { bookingDraft: null } };
    }

    // Intent detection
    if (textLower.includes('prenotare') || textLower.includes('visita') || textLower.includes('appuntamento') || textLower.includes('fissare') || textLower.includes('disponibil') || textLower.includes('orari')) {
      bookingDraft = { ...bookingDraft, step: 'CHECKING', serviceId: 'AUTO_RESOLVE', searchOffsetDays: 0 };
      const startDate = getDateInTimezone(0);
      const endDate = getDateInTimezone(30);
      toolCalls.push({ name: 'checkAvailability', args: { serviceId: 'AUTO_RESOLVE', userSearchText: userText, professionalId: 'AUTO_PRIMARY', startDate, endDate } });
      return { replyText: '[WAI_STEP_SLOTS]', detectedIntent, toolCalls, customMetadata: { bookingDraft } };
    }

    if (bookingDraft && bookingDraft.serviceId) {
      if (bookingDraft.date) {
         return { replyText: '[WAI_STEP_DETAILS]', detectedIntent, toolCalls, customMetadata: { bookingDraft } };
      }
      bookingDraft.searchOffsetDays = 0;
      const startDate = getDateInTimezone(0);
      const endDate = getDateInTimezone(30);
      toolCalls.push({ name: 'checkAvailability', args: { serviceId: bookingDraft.serviceId, professionalId: bookingDraft.professionalId || 'AUTO_PRIMARY', startDate, endDate } });
      return { replyText: '[WAI_STEP_SLOTS]', detectedIntent, toolCalls, customMetadata: { bookingDraft } };
    }

    return { replyText: '', detectedIntent: 'GENERAL_INFORMATION', toolCalls: [], customMetadata: { bookingDraft: null } };
  }

  async generateReplyFromToolResults(
    config: DigitalEmployeeConfig | null,
    intent: Intent,
    userText: string,
    toolResults: ToolResultSummary[],
    organizationSlug: string,
    draftReply?: string,
    _history?: ConversationMessage[],
    bookingDraft?: Record<string, any>
  ): Promise<string> {
    const assistantName = config?.name || 'Chiara';
    const studioName = organizationSlug === 'studio-aurora' ? 'Studio Aurora' : 'Studio Brera';
    
    if (intent === 'HUMAN_HANDOFF') {
      return `Ho inviato la segnalazione al personale di ${studioName}. Un operatore ti risponderà appena disponibile.`;
    }
    if (intent === 'CANCEL_APPOINTMENT') {
       return `Procedo subito alla verifica e all'annullamento del tuo appuntamento...`;
    }

    if (draftReply?.includes('[WAI_STEP_SERVICE_CHECK]') || draftReply?.includes('[WAI_STEP_SERVICE]')) {
       return `[WAI_STEP_SERVICE]\nQuale servizio desideri prenotare?`;
    }

    if (draftReply?.includes('[WAI_STEP_SLOTS]')) {
       const availResult = toolResults.find(t => (t.toolName || (t as any).name) === 'checkAvailability');
       if ((availResult?.result as any)?.requiresProfessionalSelection) {
           return `[WAI_STEP_PROFESSIONAL]\nPreferisci un professionista specifico o il primo disponibile?`;
       }
       if ((availResult?.result as any)?.requiresServiceSelection) {
           return `[WAI_STEP_SERVICE]\nQuale servizio desideri prenotare?`;
       }
       
       if ((availResult?.result as any)?.days && ((availResult?.result as any).days as any[]).length > 0) {
           return `[WAI_STEP_SLOTS]\nOttimo. Ecco i prossimi orari disponibili. Scegli quello che preferisci:`;
       }
       
       return `[WAI_STEP_SLOTS_EMPTY]\nMi dispiace, non ci sono più disponibilità per questo periodo. Vuoi cercare in date successive?`;
    }

    if (draftReply?.includes('[WAI_STEP_DETAILS]')) {
       return draftReply;
    }
    if (draftReply?.includes('[WAI_STEP_CONFIRM_CARD]')) {
       return `[WAI_STEP_CONFIRM_CARD]`;
    }
    if (draftReply?.includes('[WAI_STEP_MODIFICA]')) {
       return `[WAI_STEP_MODIFICA]`;
    }
    
    if (draftReply?.includes('[WAI_STEP_CONFIRM]')) {
       const appResult = toolResults.find(t => (t.toolName || (t as any).name) === 'createAppointment');
       if (appResult?.success) {
         const resObj = appResult.result as any;
         const dtStr = resObj?.appointment?.startAt || resObj?.scheduledAt || '';
         let dateF = dtStr.slice(0, 10);
         let timeF = dtStr.includes('T') ? dtStr.slice(11, 16) : '10:00';
         return `[WAI_STEP_CONFIRM]\nPrenotazione confermata per il ${dateF} alle ore ${timeF}. A presto!`;
       } else if (appResult?.isGistOverlapError) {
         return `[WAI_STEP_SLOTS_EMPTY]\nMi dispiace, questo orario non è più disponibile. Scegli un altro orario.`;
       }
       return `Si è verificato un errore tecnico durante la registrazione del tuo appuntamento. Riprova o contatta la segretaria.`;
    }

    if (draftReply) return draftReply;
    return `Ciao! Sono ${assistantName} di ${studioName}. Posso aiutarti a trovare un orario disponibile per la tua visita oppure gestire un appuntamento esistente. Come vorresti procedere?`;
  }
}
