import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/logging/logger';
import {
  listProfessionals,
  listServices,
  listAppointments,
  listTimeSlots,
  createAppointment as calendarCreateAppointment,
  updateAppointmentStatus,
  rescheduleAppointment
} from '@/modules/calendar/calendar.service';import { listCustomers, createCustomer as crmCreateCustomer, normalizePhoneNumber } from '@/modules/crm/crm.service';
import { updateConversationStatus } from '@/modules/messages/messages.service';
import { getBusinessRulesConfig, listBusinessExceptions, createBusinessException } from '@/modules/rules/rules.service';
import { getOrganizationDateKey, getOrganizationDayRange, organizationLocalDateTimeToUtc } from '@/modules/shared/organization-timezone';
import { referenceNow } from '@/modules/shared/reference-time';
import { verifyOrganizationAccess } from '@/security/auth';
import {
  CheckAvailabilityInput,
  FindCustomerInput,
  CreateCustomerInput,
  CreateAppointmentInput,
  CancelAppointmentInput,
  RescheduleAppointmentInput,
  ListServicesInput,
  ListProfessionalsInput,
  GetBusinessRulesInput,
  ToolExecutionResponse,
  ToolDefinition
} from './tools.types';

export const DEFINED_TOOLS: ToolDefinition[] = [
  {
    name: 'listServices',
    description: 'Consulta il catalogo ufficiale dei servizi attivi dello studio (durata, prezzi, descrizione) in tempo reale dal DB.',
    parameters: {
      search: { type: 'string', description: 'Termine di ricerca opzionale per filtrare il nome o la descrizione del servizio', required: false }
    }
  },
  {
    name: 'listProfessionals',
    description: 'Consulta la lista dei professionisti, medici o consulenti attivi per questa organizzazione nel DB.',
    parameters: {
      search: { type: 'string', description: 'Filtro opzionale sul nome o qualifica del professionista', required: false }
    }
  },
  {
    name: 'getBusinessRules',
    description: 'Recupera le regole di business del tenant (preavviso di cancellazione, messaggistica standard e politiche orarie).',
    parameters: {
      category: { type: 'string', description: 'Categoria opzionale', required: false }
    }
  },
  {
    name: 'checkAvailability',
    description: 'Consulta disponibilità della clinica (professionisti, servizi, orari, blocchi, ferie) per una certa data.',
    parameters: {
      date: { type: 'string', description: 'Data formato YYYY-MM-DD', required: false },
      startDate: { type: 'string', description: 'Data inizio formato YYYY-MM-DD', required: false },
      endDate: { type: 'string', description: 'Data fine formato YYYY-MM-DD', required: false },
      serviceId: { type: 'string', description: 'UUID del servizio o AUTO_RESOLVE', required: false },
      userSearchText: { type: 'string', description: 'Testo del cliente per matching automatico servizio', required: false },
      professionalId: { type: 'string', description: 'UUID del professionista', required: false }
    }
  },
  {
    name: 'findCustomer',
    description: 'Cerca un cliente esistente per numero di telefono (o email) nel CRM dello studio.',
    parameters: {
      phone: { type: 'string', description: 'Numero di telefono da normalizzare in E.164', required: true }
    }
  },
  {
    name: 'createCustomer',
    description: 'Crea un nuovo profilo cliente nel CRM con validazione e consenso marketing.',
    parameters: {
      firstName: { type: 'string', description: 'Nome', required: true },
      lastName: { type: 'string', description: 'Cognome', required: true },
      phone: { type: 'string', description: 'Telefono', required: true },
      email: { type: 'string', description: 'Email', required: false }
    }
  },
  {
    name: 'createAppointment',
    description: 'Crea una nuova prenotazione verificando le regole aziendali e la protezione anti-overlap GIST.',
    parameters: {
      customerId: { type: 'string', description: 'UUID del cliente nel CRM', required: true },
      serviceId: { type: 'string', description: 'UUID del servizio da prenotare', required: true },
      professionalId: { type: 'string', description: 'UUID del professionista', required: true },
      startAt: { type: 'string', description: 'Timestamp ISO dell appuntamento', required: true }
    }
  },
  {
    name: 'cancelAppointment',
    description: 'Annulla un appuntamento esistente nel rispetto delle regole di preavviso dello studio.',
    parameters: {
      appointmentId: { type: 'string', description: 'UUID dell appuntamento', required: true },
      reason: { type: 'string', description: 'Motivo della cancellazione', required: false }
    }
  },
  {
    name: 'rescheduleAppointment',
    description: 'Sposta un appuntamento a una nuova data/ora disponibile.',
    parameters: {
      appointmentId: { type: 'string', description: 'UUID dell appuntamento', required: true },
      newStartAt: { type: 'string', description: 'Nuovo orario in ISO', required: true }
    }
  },
  {
    name: 'getCompanyInformation',
    description: 'Recupera le informazioni sulla società (indirizzo, telefono, orari, servizi, professionisti, cancellazione).',
    parameters: {
      queryType: { type: 'string', description: 'Tipo di query (hours, address, services, professionals, etc.)', required: false }
    }
  },
  {
    name: 'handoff_to_human',
    description: 'Passa la conversazione a un operatore umano: aggiorna lo stato della conversazione a human_handoff e registra la richiesta in auditoria.',
    parameters: {
      reason: { type: 'string', description: 'Motivo del passaggio a un operatore umano', required: false }
    }
  },
  {
    name: 'ownerListAgenda',
    description: 'Consente al titolare di visualizzare gli appuntamenti per una data specifica.',
    parameters: {
      date: { type: 'string', description: 'Data formato YYYY-MM-DD', required: true }
    }
  },
  {
    name: 'ownerBlockCalendar',
    description: 'Consente al titolare di bloccare il calendario/creare una chiusura per una certa data.',
    parameters: {
      date: { type: 'string', description: 'Data formato YYYY-MM-DD', required: true },
      reason: { type: 'string', description: 'Motivo del blocco', required: false }
    }
  },
  {
    name: 'ownerMoveAppointment',
    description: 'Consente al titolare di spostare l appuntamento di un cliente a un altro giorno/ora.',
    parameters: {
      customerName: { type: 'string', description: 'Nome o cognome del cliente', required: true },
      newDateTime: { type: 'string', description: 'Nuovo orario in ISO o YYYY-MM-DDTHH:MM', required: true }
    }
  },
  {
    name: 'ownerGetStats',
    description: 'Consente al titolare di visualizzare il conteggio e statistiche degli appuntamenti.',
    parameters: {
      date: { type: 'string', description: 'Data formato YYYY-MM-DD', required: true }
    }
  }
];

/**
 * Executes checkAvailability tool against real calendar data, time slots, and exceptions.
 */
export async function executeCheckAvailability(
  client: SupabaseClient,
  userId: string,
  organizationSlug: string,
  input: CheckAvailabilityInput,
  correlationId?: string,
): Promise<ToolExecutionResponse> {
  try {
    // 1. Fetch organization timezone
    const { data: orgData, error: orgErr } = await client
      .from('organizations')
      .select('id, timezone')
      .eq('slug', organizationSlug)
      .single();

    if (orgErr || !orgData) {
      return { success: false, code: 'ORGANIZATION_NOT_FOUND', error: 'Organizzazione non trovata.' };
    }
    const timezone = orgData.timezone || 'Europe/Rome';

    // 2. A date is required before asking the user to choose a service or professional.
    const requestedDate = input.date || input.startDate;
    if (!requestedDate) {
      return { success: false, code: 'DATE_REQUIRED', error: 'Data mancante.' };
    }

    // 3. Resolve professional and service
    const professionals = await listProfessionals(client, userId, organizationSlug);
    const services = await listServices(client, userId, organizationSlug);

    if (!input.serviceId || input.serviceId === 'AUTO_RESOLVE') {
      if (services.length === 1) {
        input.serviceId = services[0].id;
      } else if (input.serviceId === 'AUTO_RESOLVE' && input.userSearchText) {
        // Find exact match first
        const exactMatch = services.find(s => s.name.toLowerCase() === input.userSearchText!.toLowerCase());
        if (exactMatch) {
          input.serviceId = exactMatch.id;
        } else {
          // Find partial matches
          const partialMatches = services.filter(s => input.userSearchText!.toLowerCase().includes(s.name.toLowerCase()));
          if (partialMatches.length === 1) {
            input.serviceId = partialMatches[0].id;
          } else {
            return { 
              success: true, 
              code: 'SERVICE_SELECTION_REQUIRED',
              result: { 
            code: 'SERVICE_SELECTION_REQUIRED',
            message: 'Quale servizio desideri prenotare?',
                requiresServiceSelection: true,
                services: services.map(s => ({ id: s.id, name: s.name, duration: s.durationMinutes }))
              } 
            };
          }
        }
      } else {
        return { 
          success: true, 
          code: 'SERVICE_SELECTION_REQUIRED',
          result: { 
            code: 'SERVICE_SELECTION_REQUIRED',
            message: 'Specifica il servizio per verificare la disponibilità.',
            requiresServiceSelection: true,
            services: services.map(s => ({ id: s.id, name: s.name, duration: s.durationMinutes }))
          } 
        };
      }
    }
    
    const targetService = services.find(s => s.id === input.serviceId);
    if (!targetService) return { success: false, code: 'SERVICE_NOT_FOUND', error: 'Servizio non trovato.' };

    let targetProfs = [];
    if (!input.professionalId) {
      if (professionals.length === 1) {
        targetProfs = [professionals[0]];
      } else {
        return { 
          success: true, 
          code: 'PROFESSIONAL_SELECTION_REQUIRED',
          result: { 
            code: 'PROFESSIONAL_SELECTION_REQUIRED',
            message: 'Specifica il professionista per verificare la disponibilità.',
            requiresProfessionalSelection: true,
            service: { id: targetService.id, name: targetService.name },
            professionals: professionals.map(p => ({ id: p.id, name: p.name }))
          } 
        };
      }
    } else if (input.professionalId === 'ANY') {
      targetProfs = professionals;
    } else {
      const p = professionals.find(p => p.id === input.professionalId);
      if (p) targetProfs.push(p);
      else return { success: false, code: 'PROFESSIONAL_NOT_FOUND', error: 'Professionista non trovato.' };
    }

    const duration = targetService.durationMinutes;
    // @ts-ignore
    const bufferAfter = targetService.bufferAfterMinutes || 0;
    const bufferBefore = 0; 

    // Handle date range
    let startD = input.date || input.startDate;
    let endD = input.date || input.endDate || startD;

    if (!startD || !endD) return { success: false, code: 'DATE_REQUIRED', error: 'Data mancante.' };

    const reqStartDate = new Date(`${startD}T00:00:00Z`);
    const reqEndDate = new Date(`${endD}T00:00:00Z`);
    
    if (isNaN(reqStartDate.getTime()) || isNaN(reqEndDate.getTime())) {
      return { success: false, code: 'INVALID_DATE', error: 'Data fornita non valida (usa YYYY-MM-DD).' };
    }

    // Limit to 30 days max
    if (reqEndDate.getTime() - reqStartDate.getTime() > 30 * 24 * 60 * 60 * 1000) {
       reqEndDate.setTime(reqStartDate.getTime() + 30 * 24 * 60 * 60 * 1000);
       endD = reqEndDate.toISOString().slice(0, 10);
    }

    // Test-only clock override: min-advance and the "today" boundary are
    // computed against the controlled clock (explicit referenceTime or
    // WAI_REFERENCE_TIME), so availability is deterministic in tests.
    const now = referenceNow(input.referenceTime);
    const todayStr = getOrganizationDateKey(now, timezone);

    const rules = await getBusinessRulesConfig(client, client, userId, organizationSlug, correlationId || 'check-avail-rules');
    const minAdvanceHours = rules?.minAdvanceBookingHours ?? 0;
    const minAdvanceTimeMs = now.getTime() + minAdvanceHours * 60 * 60 * 1000;

    const searchStart = getOrganizationDayRange(startD, timezone).startAt;
    const searchEnd = getOrganizationDayRange(endD, timezone).endAt;

    const profIds = targetProfs.map(p => p.id);

    const { data: rawAppointments } = await client
      .from('appointments')
      .select('id, start_at, end_at, status, professional_id')
      .eq('organization_id', orgData.id)
      .in('professional_id', profIds)
      .gte('start_at', searchStart)
      .lte('start_at', searchEnd)
      .in('status', ['confirmed', 'held']);
    
    const bookedAppointments = rawAppointments || [];
    const exceptions = await listBusinessExceptions(client, userId, organizationSlug);

    const getUtcForLocal = (dateStr: string, h: number, m: number): number | null => {
      const local = `${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
      const instant = organizationLocalDateTimeToUtc(local, timezone);
      return instant ? new Date(instant).getTime() : null;
    };

    const results = [];
    const maxDaysWithSlots = 3; // Paginating limit for UI
    let daysWithSlots = 0;

    let currentDate = new Date(reqStartDate.getTime());
    while (currentDate <= reqEndDate) {
      const dateStr = currentDate.toISOString().slice(0, 10);
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);

      if (dateStr < todayStr) {
        continue;
      }

      // Find slots for this date across all targetProfs
      const allSlotsForDate: { time: string, professionalId: string, professionalName: string }[] = [];
      const reqDayOfWeek = new Date(`${dateStr}T00:00:00Z`).getUTCDay();

      let motive = undefined;
      const dayRange = getOrganizationDayRange(dateStr, timezone);

      for (const targetProf of targetProfs) {
        const isDayBlocked = exceptions.some(ex =>
          new Date(ex.startDate).getTime() < new Date(dayRange.endAt).getTime()
          && new Date(ex.endDate).getTime() > new Date(dayRange.startAt).getTime()
        );

        if (isDayBlocked) continue;

        const { data: availRules } = await client
          .from('availability_rules')
          .select('*')
          .eq('organization_id', orgData.id)
          .eq('professional_id', targetProf.id)
          .eq('day_of_week', reqDayOfWeek)
          .eq('is_active', true);

        if (!availRules || availRules.length === 0) continue;

        const profBookedApps = bookedAppointments.filter(a => a.professional_id === targetProf.id);

        for (const rule of availRules) {
          const [startH, startM] = rule.start_time.split(':').map(Number);
          const [endH, endM] = rule.end_time.split(':').map(Number);

          let currentSlotStart = getUtcForLocal(dateStr, startH, startM);
          const ruleEnd = getUtcForLocal(dateStr, endH, endM);
          if (currentSlotStart === null || ruleEnd === null) continue;

          while (currentSlotStart + duration * 60 * 1000 <= ruleEnd) {
            const slotEnd = currentSlotStart + duration * 60 * 1000;
            
            if (currentSlotStart < minAdvanceTimeMs) {
              currentSlotStart += duration * 60 * 1000;
              continue;
            }

            let hasConflict = false;
            for (const app of profBookedApps) {
              const appStart = new Date(app.start_at).getTime() - bufferBefore * 60 * 1000;
              const appEnd = new Date(app.end_at).getTime() + bufferAfter * 60 * 1000;

              if (currentSlotStart < appEnd && slotEnd > appStart) {
                hasConflict = true;
                break;
              }
            }

            if (!hasConflict) {
              const d = new Date(currentSlotStart);
              const localStr = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
              // Avoid duplicates (if multiple profs have the same time)
              if (!allSlotsForDate.some(s => s.time === localStr)) {
                allSlotsForDate.push({ time: localStr, professionalId: targetProf.id, professionalName: targetProf.name });
              }
            }

            currentSlotStart += duration * 60 * 1000;
          }
        }
      }

      allSlotsForDate.sort((a, b) => a.time.localeCompare(b.time));

      if (allSlotsForDate.length > 0) {
        daysWithSlots++;
      } else {
        const endOfDay = getUtcForLocal(dateStr, 23, 59);
        motive = minAdvanceHours > 0 && endOfDay !== null && now.getTime() < endOfDay ? 'MIN_ADVANCE_TIME' : 'FULLY_BOOKED';
      }

      results.push({
        date: dateStr,
        service: { id: targetService.id, name: targetService.name, duration: targetService.durationMinutes, price: targetService.price },
        availableSlots: allSlotsForDate.map(s => s.time),
        slotsDetails: allSlotsForDate, // contains prof details per slot
        motive,
        message: allSlotsForDate.length > 0 ? `Trovati ${allSlotsForDate.length} orari disponibili.` : 'Nessun orario disponibile.'
      });
      
      if (daysWithSlots >= maxDaysWithSlots && (input.startDate && input.endDate)) {
        // If we are range searching, break early to not overwhelm UI
        // Wait, if it's a specific 'date' check, we should not break.
        if (!input.date) {
            break;
        }
      }
    }

    if (input.date) {
      const result = results[0] || { availableSlots: [] };
      return { success: true, code: result.availableSlots.length > 0 ? 'AVAILABILITY_FOUND' : 'NO_AVAILABILITY', result };
    }
    
    return { success: true, code: results.some(day => day.availableSlots.length > 0) ? 'AVAILABILITY_FOUND' : 'NO_AVAILABILITY', result: { days: results } };

  } catch (err: unknown) {
     logger.error('Errore durante il controllo della disponibilità', { error: err instanceof Error ? err.stack || err.message : String(err) });
    return { success: false, code: 'AVAILABILITY_CHECK_FAILED', error: 'Errore interno nel controllo disponibilità' };
  }
}

export async function executeToolByName(
  toolName: string,
  args: any,
  client: any,
  adminClient: any,
  userId: string,
  organizationSlug: string,
  correlationId?: string
): Promise<ToolExecutionResponse> {
  try {
    switch (toolName) {
      case 'listServices':
        return { success: true, result: await listServices(client, userId, organizationSlug) };
      case 'listProfessionals':
        return { success: true, result: await listProfessionals(client, userId, organizationSlug) };
      case 'getBusinessRules':
        return { success: true, result: await getBusinessRulesConfig(client, adminClient, userId, organizationSlug, args.category) };
      case 'checkAvailability':
        return await executeCheckAvailability(client, userId, organizationSlug, args as CheckAvailabilityInput, correlationId);
      case 'findCustomer':
        const customers = await listCustomers(client, userId, organizationSlug);
        const normPhone = normalizePhoneNumber(args.phone).normalized;
        const cust = customers.find(c => c.phoneNormalized === normPhone);
        if (cust) {
          const appointments = await listAppointments(client, userId, organizationSlug);
          const customerAppointments = appointments.filter(appointment => appointment.customerId === cust.id);
          return {
            success: true,
            code: args.queryType === 'customer_appointments' ? 'CUSTOMER_APPOINTMENTS_FOUND' : 'CUSTOMER_FOUND',
            result: { customer: cust, appointments: customerAppointments }
          };
        }
        return { success: false, code: 'CUSTOMER_NOT_FOUND', error: 'Customer not found' };
      case 'createCustomer':
        const created = await crmCreateCustomer(client, adminClient, userId, organizationSlug, args, 'tool-call');
        return created.success
          ? { success: true, code: 'CUSTOMER_CREATED', result: { customer: created.data } }
          : { success: false, code: 'CUSTOMER_CREATE_FAILED', error: created.error };
      case 'createAppointment':
        {
          const createdAppointment = await calendarCreateAppointment(client, adminClient, userId, organizationSlug, args, correlationId || 'tool-call');
          return {
            success: createdAppointment.success,
            code: createdAppointment.code,
            appointmentId: createdAppointment.appointmentId,
            result: createdAppointment.data ? { appointment: createdAppointment.data } : undefined,
            error: createdAppointment.error,
            isGistOverlapError: createdAppointment.isGistOverlapError,
          };
        }
      case 'cancelAppointment':
        {
          const cancelled = await updateAppointmentStatus(client, adminClient, userId, organizationSlug, args.appointmentId, 'cancelled', null, correlationId || 'tool-call');
          return { success: cancelled.success, code: cancelled.code, appointmentId: cancelled.appointmentId, error: cancelled.error };
        }
      case 'rescheduleAppointment':
        {
          const rescheduled = await rescheduleAppointment(client, adminClient, userId, organizationSlug, args.appointmentId, args.newStartAt, correlationId || 'tool-call');
          return {
            success: rescheduled.success,
            code: rescheduled.code,
            appointmentId: rescheduled.appointmentId,
            result: rescheduled.data ? { appointment: rescheduled.data } : undefined,
            error: rescheduled.error,
            isGistOverlapError: rescheduled.isGistOverlapError,
          };
        }
      case 'getCompanyInformation':
        {
          const information = await executeGetCompanyInformation(client, userId, organizationSlug);
          return { ...information, code: information.success ? 'COMPANY_INFORMATION_FOUND' : information.code };
        }
      case 'handoff_to_human': {
        // Operational handoff: the system updates the conversation to
        // `human_handoff` and records the audit. The reply is only rendered
        // after this call succeeds — never claim a transfer that wasn't persisted.
        const conversationId = typeof args?.conversationId === 'string' ? args.conversationId : undefined;
        if (!conversationId) {
          return { success: false, code: 'HANDOFF_MISSING_CONVERSATION', error: 'Conversazione non identificata per il passaggio a un operatore umano.' };
        }
        const updated = await updateConversationStatus(
          client,
          adminClient,
          userId,
          organizationSlug,
          conversationId,
          'human_handoff',
          correlationId || 'handoff',
        );
        if (!updated.success) {
          return { success: false, code: 'HANDOFF_FAILED', error: updated.error || 'Impossibile trasferire la conversazione a un operatore umano.' };
        }
        return { success: true, code: 'HANDOFF_REQUESTED', result: { status: 'human_handoff' } };
      }
      case 'ownerListAgenda':
        return await executeOwnerListAgenda(client, userId, organizationSlug, args.date);
      case 'ownerBlockCalendar':
        return await executeOwnerBlockCalendar(client, adminClient, userId, organizationSlug, args.date, args.reason);
      case 'ownerMoveAppointment':
        return await executeOwnerMoveAppointment(client, adminClient, userId, organizationSlug, args.customerName, args.newDateTime);
      case 'ownerGetStats':
        return await executeOwnerGetStats(client, userId, organizationSlug, args.date);
      default:
        return { success: false, code: 'UNKNOWN_TOOL', error: 'Unknown tool' };
    }
  } catch(e: any) {
    logger.error('Error executing tool', { toolName, error: e });
    return { success: false, code: 'TOOL_EXECUTION_FAILED', error: e.message || 'Error executing tool' };
  }
}

async function executeGetCompanyInformation(client: any, userId: string, organizationSlug: string): Promise<ToolExecutionResponse> {
  const orgResult = await client.from('organizations').select('*').eq('slug', organizationSlug).single();
  if (orgResult.error || !orgResult.data) {
    return { success: false, error: 'Organizzazione non trovata.' };
  }
  const org = orgResult.data;
  const settings = org.settings_json || {};
  const organizationName = typeof org.name === 'string' && org.name.trim()
    ? org.name.trim()
    : typeof settings.displayName === 'string' && settings.displayName.trim()
      ? settings.displayName.trim()
      : 'Organizzazione';
  const services = await listServices(client, userId, organizationSlug);
  const professionals = await listProfessionals(client, userId, organizationSlug);
  const rulesResult = await client.from('business_rules').select('*').eq('organization_id', org.id).maybeSingle();

  return {
    success: true,
    result: {
      name: organizationName,
      address: settings.address || 'Non specificato',
      phone: settings.phone || 'Non specificato',
      whatsapp: settings.whatsapp || 'Non specificato',
      email: settings.email || 'Non specificato',
      workingHours: settings.working_hours || 'Non specificato',
      services: services.map(s => ({ name: s.name, price: s.price !== null ? s.price / 100 : null, duration: s.durationMinutes })),
      professionals: professionals.map(p => ({ name: p.name, title: p.title || (p.status === 'active' ? 'Professionista' : 'Inattivo') })),
      cancellationPolicy: rulesResult?.data?.cancellation_policy || {}
    }
  };
}

async function executeOwnerListAgenda(client: any, userId: string, organizationSlug: string, date: string): Promise<ToolExecutionResponse> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access || !['organization_owner', 'organization_operator'].includes(access.role)) {
    return { success: false, code: 'PERMISSION_DENIED', error: 'Permessi insufficienti per consultare l’agenda.' };
  }
  const range = getOrganizationDayRange(date, access.timezone);
  const appointments = await listAppointments(client, userId, organizationSlug, range);
  return { success: true, result: { appointments } };
}

async function executeOwnerBlockCalendar(client: any, adminClient: any, userId: string, organizationSlug: string, date: string, reason?: string): Promise<ToolExecutionResponse> {
  const res = await createBusinessException(client, adminClient, userId, organizationSlug, {
    startDate: date,
    endDate: date,
    reason: reason || 'Blocco calendario da titolare',
    isFullDay: true
  }, 'owner-command');
  return res;
}

async function executeOwnerMoveAppointment(client: any, adminClient: any, userId: string, organizationSlug: string, customerName: string, newDateTime: string): Promise<ToolExecutionResponse> {
  const customers = await listCustomers(client, userId, organizationSlug);
  const match = customers.find(c => 
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(customerName.toLowerCase()) ||
    c.firstName.toLowerCase().includes(customerName.toLowerCase()) ||
    c.lastName.toLowerCase().includes(customerName.toLowerCase())
  );
  if (!match) {
    return { success: false, error: `Cliente "${customerName}" non trovato.` };
  }

  const appts = await listAppointments(client, userId, organizationSlug);
  const upcoming = appts
    .filter(a => a.customerId === match.id && ['confirmed', 'held'].includes(a.status))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  if (upcoming.length === 0) {
    return { success: false, error: `Nessun appuntamento attivo trovato per ${match.firstName} ${match.lastName}.` };
  }

  return await rescheduleAppointment(client, adminClient, userId, organizationSlug, upcoming[0].id, newDateTime, 'owner-command');
}

async function executeOwnerGetStats(client: any, userId: string, organizationSlug: string, date: string): Promise<ToolExecutionResponse> {
  const access = await verifyOrganizationAccess(client, userId, organizationSlug);
  if (!access || !['organization_owner', 'organization_operator'].includes(access.role)) {
    return { success: false, code: 'PERMISSION_DENIED', error: 'Permessi insufficienti per consultare le statistiche.' };
  }
  const filtered = await listAppointments(client, userId, organizationSlug, getOrganizationDayRange(date, access.timezone));
  return {
    success: true,
    result: {
      date,
      counts: {
        total: filtered.length,
        confirmed: filtered.filter(a => a.status === 'confirmed').length,
        cancelled: filtered.filter(a => a.status === 'cancelled').length,
        held: filtered.filter(a => a.status === 'held').length,
        pending: 0,
      }
    }
  };
}
