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
} from '@/modules/calendar/calendar.service';
import {
  listCustomers,
  createCustomer as crmCreateCustomer,
  normalizePhoneNumber
} from '@/modules/crm/crm.service';
import { getBusinessRulesConfig, listBusinessExceptions, createBusinessException } from '@/modules/rules/rules.service';
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
  input: CheckAvailabilityInput
): Promise<ToolExecutionResponse> {
  try {
    // 1. Fetch organization timezone
    const { data: orgData, error: orgErr } = await client
      .from('organizations')
      .select('id, timezone')
      .eq('slug', organizationSlug)
      .single();

    if (orgErr || !orgData) {
      return { success: false, error: 'Organizzazione non trovata.' };
    }
    const timezone = orgData.timezone || 'Europe/Rome';

    // 2. Resolve professional and service
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
              result: { 
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
          result: { 
            message: 'Specifica il servizio per verificare la disponibilità.',
            requiresServiceSelection: true,
            services: services.map(s => ({ id: s.id, name: s.name, duration: s.durationMinutes }))
          } 
        };
      }
    }
    
    const targetService = services.find(s => s.id === input.serviceId);
    if (!targetService) return { success: false, error: 'Servizio non trovato.' };

    let targetProfs = [];
    if (!input.professionalId) {
      if (professionals.length === 1) {
        targetProfs = [professionals[0]];
      } else {
        return { 
          success: true, 
          result: { 
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
      else return { success: false, error: 'Professionista non trovato.' };
    }

    const duration = targetService.durationMinutes;
    // @ts-ignore
    const bufferAfter = targetService.bufferAfterMinutes || 0;
    const bufferBefore = 0; 

    // Handle date range
    let startD = input.date || input.startDate;
    let endD = input.date || input.endDate || startD;

    if (!startD || !endD) {
      return { success: false, error: 'Data mancante.' };
    }

    const reqStartDate = new Date(`${startD}T00:00:00Z`);
    const reqEndDate = new Date(`${endD}T00:00:00Z`);
    
    if (isNaN(reqStartDate.getTime()) || isNaN(reqEndDate.getTime())) {
      return { success: false, error: 'Data fornita non valida (usa YYYY-MM-DD).' };
    }

    // Limit to 30 days max
    if (reqEndDate.getTime() - reqStartDate.getTime() > 30 * 24 * 60 * 60 * 1000) {
       reqEndDate.setTime(reqStartDate.getTime() + 30 * 24 * 60 * 60 * 1000);
       endD = reqEndDate.toISOString().slice(0, 10);
    }

    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const todayStr = formatter.format(now);

    const rules = await getBusinessRulesConfig(client, client, userId, organizationSlug, 'check-avail-rules');
    const minAdvanceHours = rules?.minAdvanceBookingHours ?? 0;
    const minAdvanceTimeMs = now.getTime() + minAdvanceHours * 60 * 60 * 1000;

    const searchStart = new Date(reqStartDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const searchEnd = new Date(reqEndDate.getTime() + 48 * 60 * 60 * 1000).toISOString();

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

    const getUtcForLocal = (dateStr: string, h: number, m: number): number => {
      const tempDate = new Date(Date.UTC(
        parseInt(dateStr.substring(0,4)),
        parseInt(dateStr.substring(5,7)) - 1,
        parseInt(dateStr.substring(8,10)),
        12, 0 
      ));
      const tzString = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).format(tempDate);
      const match = tzString.match(/GMT([+-])(\d{2}):(\d{2})/);
      let offsetMinutes = 0;
      if (match) {
        const sign = match[1] === '+' ? 1 : -1;
        offsetMinutes = sign * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10));
      }
      return Date.UTC(
        parseInt(dateStr.substring(0,4)),
        parseInt(dateStr.substring(5,7)) - 1,
        parseInt(dateStr.substring(8,10)),
        h,
        m
      ) - (offsetMinutes * 60 * 1000);
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

      for (const targetProf of targetProfs) {
        const isDayBlocked = exceptions.some(ex => 
          ex.startDate <= dateStr && ex.endDate >= dateStr && ex.isFullDay
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
        motive = minAdvanceHours > 0 && now.getTime() < getUtcForLocal(dateStr, 23, 59) ? 'MIN_ADVANCE_TIME' : 'FULLY_BOOKED';
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
      return { success: true, result: results[0] || { availableSlots: [] } };
    }
    
    return { success: true, result: { days: results } };

  } catch (err: unknown) {
     logger.error('Errore durante il controllo della disponibilità', { error: err instanceof Error ? err.stack || err.message : String(err) });
    return { success: false, error: 'Errore interno nel controllo disponibilità' };
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
        return await executeCheckAvailability(client, userId, organizationSlug, args as CheckAvailabilityInput);
      case 'findCustomer':
        const customers = await listCustomers(client, userId, organizationSlug);
        const normPhone = normalizePhoneNumber(args.phone).normalized;
        const cust = customers.find(c => c.phoneNormalized === normPhone);
        if (cust) return { success: true, result: { customer: cust } };
        return { success: false, error: 'Customer not found' };
      case 'createCustomer':
        const created = await crmCreateCustomer(client, adminClient, userId, organizationSlug, args, 'tool-call');
        return { success: true, result: { customer: created.data } };
      case 'createAppointment':
        return await calendarCreateAppointment(client, adminClient, userId, organizationSlug, args, 'tool-call');
      case 'cancelAppointment':
        return await updateAppointmentStatus(client, adminClient, userId, organizationSlug, args.appointmentId, 'cancelled', null, 'tool-call');
      case 'rescheduleAppointment':
        return await rescheduleAppointment(client, adminClient, userId, organizationSlug, args.appointmentId, args.newStartAt, correlationId || 'tool-call');
      case 'getCompanyInformation':
        return await executeGetCompanyInformation(client, userId, organizationSlug);
      case 'ownerListAgenda':
        return await executeOwnerListAgenda(client, userId, organizationSlug, args.date);
      case 'ownerBlockCalendar':
        return await executeOwnerBlockCalendar(client, adminClient, userId, organizationSlug, args.date, args.reason);
      case 'ownerMoveAppointment':
        return await executeOwnerMoveAppointment(client, adminClient, userId, organizationSlug, args.customerName, args.newDateTime);
      case 'ownerGetStats':
        return await executeOwnerGetStats(client, userId, organizationSlug, args.date);
      default:
        return { success: false, error: 'Unknown tool' };
    }
  } catch(e: any) {
    logger.error('Error executing tool', { toolName, error: e });
    return { success: false, error: e.message || 'Error executing tool' };
  }
}

async function executeGetCompanyInformation(client: any, userId: string, organizationSlug: string): Promise<ToolExecutionResponse> {
  const orgResult = await client.from('organizations').select('*').eq('slug', organizationSlug).single();
  if (orgResult.error || !orgResult.data) {
    return { success: false, error: 'Organizzazione non trovata.' };
  }
  const org = orgResult.data;
  const settings = org.settings_json || {};
  const services = await listServices(client, userId, organizationSlug);
  const professionals = await listProfessionals(client, userId, organizationSlug);
  const rulesResult = await client.from('business_rules').select('*').eq('organization_id', org.id).maybeSingle();

  return {
    success: true,
    result: {
      name: org.name,
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
  const allAppts = await listAppointments(client, userId, organizationSlug);
  const filtered = allAppts.filter(a => a.startAt.startsWith(date));
  return { success: true, result: { appointments: filtered } };
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
    .filter(a => a.customerId === match.id && ['confirmed', 'held', 'pending'].includes(a.status))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  if (upcoming.length === 0) {
    return { success: false, error: `Nessun appuntamento attivo trovato per ${match.firstName} ${match.lastName}.` };
  }

  return await rescheduleAppointment(client, adminClient, userId, organizationSlug, upcoming[0].id, newDateTime, 'owner-command');
}

async function executeOwnerGetStats(client: any, userId: string, organizationSlug: string, date: string): Promise<ToolExecutionResponse> {
  const allAppts = await listAppointments(client, userId, organizationSlug);
  const filtered = allAppts.filter(a => a.startAt.startsWith(date));
  return {
    success: true,
    result: {
      date,
      counts: {
        total: filtered.length,
        confirmed: filtered.filter(a => a.status === 'confirmed').length,
        cancelled: filtered.filter(a => a.status === 'cancelled').length,
        held: filtered.filter(a => a.status === 'held').length,
        pending: filtered.filter(a => a.status === 'pending').length,
      }
    }
  };
}
