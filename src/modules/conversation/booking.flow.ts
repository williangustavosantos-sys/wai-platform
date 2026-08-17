import { addDays } from 'date-fns';
import { CardSelection, ConversationWorkflowState, Intent } from './conversation.types';
import { RoutedEntities } from '../ai/local_intent_router';
import { getOrganizationDateKey, organizationLocalDateTimeToUtc } from '@/modules/shared/organization-timezone';
import { referenceNow } from '@/modules/shared/reference-time';

/**
 * Guided booking flow step machine (deterministic, system-controlled).
 *
 * The AI (LLM / LocalIntentRouter) is only allowed to *converse*: it extracts
 * intent and entities from natural language. This module decides the *next
 * operational step* and which tools may run — the AI can never decide
 * availability, create appointments, or invent data.
 *
 * Steps are skipped whenever the customer already provided the information in
 * natural language: e.g. "Vorrei una visita con Anna venerdì" (service +
 * professional + date known) goes straight to the time selection.
 */

export type BookingFlowStep =
  | 'NONE'
  | 'SERVICE'
  | 'PROFESSIONAL'
  | 'SLOTS'
  | 'DATE'
  | 'TIME'
  | 'IDENTITY'
  | 'CONFIRMATION'
  | 'CREATE';

export interface BookingFlowInput {
  intent: Intent;
  /** Entities already merged with the derived workflow state. */
  entities: RoutedEntities;
  selection?: CardSelection;
  services: Array<{ id: string; name: string }>;
  professionals: Array<{ id: string; name: string }>;
  hasVerifiedCustomer: boolean;
  timezone: string;
  /** Previous booking flow state to carry forward across turns (preserves service/professional/date/time). */
  previousState?: ConversationWorkflowState;
  /**
   * Test-only clock override (ISO 8601): the automatic availability window
   * ("next 10/30 days") is computed relative to this instant instead of the
   * wall clock, so guided-flow tests are deterministic.
   */
  referenceTime?: string;
}

export interface BookingFlowResult {
  isBookingFlow: boolean;
  step: BookingFlowStep;
  /** Workflow state to persist on the conversation (observability/UI). */
  state: ConversationWorkflowState;
  /**
   * Tool calls to run for this turn. booking.flow.ts is the sole authority
   * for booking tool calls: it always returns the concrete calls for the
   * decided step (never AUTO_RESOLVE service fallbacks, never silent
   * services[0] resolution). Empty array = no operational tool may run.
   */
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

function identityKnown(entities: RoutedEntities, hasVerifiedCustomer: boolean): boolean {
  return hasVerifiedCustomer || Boolean(entities.requestedCustomerFirstName && entities.requestedCustomerLastName);
}

function buildState(
  entities: RoutedEntities,
  selection: CardSelection | undefined,
  hasVerifiedCustomer: boolean,
  intent: Intent,
  previousState?: ConversationWorkflowState,
): ConversationWorkflowState {
  // The service is only ever captured from the customer: an explicit card
  // selection, an entity match from natural language, or a previously stored
  // workflow state. There is NO automatic services[0] fallback — a missing
  // service always sends the flow to the SERVICE step. When the customer names
  // several distinct services in one turn, the choice is ambiguous and must
  // never be auto-resolved — the flow asks which one (SERVICE step).
  const serviceAmbiguous = Boolean(entities.multipleServices);
  const serviceId = selection?.type === 'service'
    ? selection.id
    : (serviceAmbiguous ? null : (entities.service?.id || previousState?.serviceId || null));
  const serviceName = selection?.type === 'service'
    ? selection.label
    : (serviceAmbiguous ? null : (entities.service?.name || previousState?.serviceName || null));
  const professionalId = selection?.type === 'professional'
    ? (selection.id || entities.professional?.id || previousState?.professionalId || null)
    : (entities.professional?.id || previousState?.professionalId || null);
  const professionalPreference = professionalId === 'ANY' ? 'any' : professionalId ? 'specific' : null;
  const professional = professionalId
    ? professionalsNameOf(professionalId, entities, selection)
    : null;
  // The customer name may come from the CRM (verified) or from the identity the
  // customer stated in natural language (requestedCustomer* fields).
  const requestedCustomerName = entities.requestedCustomerFirstName
    ? [entities.requestedCustomerFirstName, entities.requestedCustomerLastName].filter(Boolean).join(' ')
    : null;

  const state: ConversationWorkflowState = {
    intent: intent === 'RESCHEDULE_APPOINTMENT' ? 'RESCHEDULE_APPOINTMENT' : 'CREATE_APPOINTMENT',
    serviceId: serviceId || undefined,
    serviceName: serviceName || undefined,
    professionalId: professionalId || null,
    professionalName: professional,
    professionalPreference,
    // A merged slot card carries BOTH the date and the time in one selection.
    date: selection?.type === 'date'
      ? selection.id
      : (selection?.type === 'slot' ? (selection.payload?.date as string | undefined) : (entities.date || previousState?.date || null)),
    startDate: entities.startDate || previousState?.startDate || null,
    endDate: entities.endDate || previousState?.endDate || null,
    time: selection?.type === 'time'
      ? selection.id
      : (selection?.type === 'slot' ? (selection.payload?.time as string | undefined) : (entities.time || previousState?.time || null)),
    customerId: entities.customer?.id || previousState?.customerId || null,
    customerName: entities.customer?.name || requestedCustomerName || previousState?.customerName || null,
    step: undefined,
  };
  return state;
}

function professionalsNameOf(
  professionalId: string,
  entities: RoutedEntities,
  selection: CardSelection | undefined,
): string | null {
  if (professionalId === 'ANY') return null;
  if (selection?.type === 'professional' && selection.label) return selection.label;
  return entities.professional?.name || null;
}

function bookingToolCalls(
  step: BookingFlowStep,
  state: ConversationWorkflowState,
  timezone: string,
  referenceTime?: string,
): Array<{ name: string; args: Record<string, unknown> }> {
  const now = referenceNow(referenceTime);
  const today = getOrganizationDateKey(now, timezone);
  const endDate = getOrganizationDateKey(addDays(now, 10), timezone);
  const farEndDate = getOrganizationDateKey(addDays(now, 30), timezone);

  switch (step) {
    case 'SERVICE':
      // No tool call needed — just show available services as cards.
      return [];
    case 'PROFESSIONAL':
      return [{
        name: 'checkAvailability',
        args: {
          ...(state.date ? { date: state.date } : { startDate: today, endDate }),
          serviceId: state.serviceId,
        },
      }];
    case 'SLOTS':
      // Automatic availability lookup: as soon as the customer chose service
      // and professional, query the REAL calendar over the next 30 days and
      // offer the next concrete free slots (date + time) — never ask "which
      // day?" first. The 30-day window also covers the "suggest next free
      // slots" fallback when nothing opens up in the near term.
      return [{
        name: 'checkAvailability',
        args: {
          startDate: today,
          endDate: farEndDate,
          serviceId: state.serviceId,
          professionalId: state.professionalId || undefined,
        },
      }];
    case 'DATE':
      if (state.serviceId && state.professionalId) {
        return [{
          name: 'checkAvailability',
          args: {
            ...(state.date ? { date: state.date } : {}),
            ...(state.startDate && state.endDate ? { startDate: state.startDate, endDate: state.endDate } : {}),
            ...(!state.date && !(state.startDate && state.endDate) ? { startDate: today, endDate } : {}),
            serviceId: state.serviceId,
            professionalId: state.professionalId,
          },
        }];
      }
      // Service is never auto-resolved here: the DATE step is only reached with
      // a customer-provided service, so a missing serviceId means we must ask.
      return [{
        name: 'checkAvailability',
        args: {
          ...(state.date ? { date: state.date } : (state.startDate && state.endDate ? { startDate: state.startDate, endDate: state.endDate } : {})),
          serviceId: state.serviceId,
        },
      }];
    case 'TIME':
    case 'CONFIRMATION':
      return [{
        name: 'checkAvailability',
        args: {
          date: state.date || undefined,
          serviceId: state.serviceId,
          professionalId: state.professionalId || undefined,
        },
      }];
    case 'IDENTITY':
      // No operational tool may run before the customer is identified.
      return [];
    default:
      return [];
  }
}

function buildCreateCalls(state: ConversationWorkflowState, timezone: string): Array<{ name: string; args: Record<string, unknown> }> {
  const startAt = state.date && state.time
    ? organizationLocalDateTimeToUtc(`${state.date}T${state.time}:00`, timezone) || undefined
    : undefined;
  return [
    {
      name: 'checkAvailability',
      args: { date: state.date, serviceId: state.serviceId, professionalId: state.professionalId || undefined },
    },
    {
      name: 'createAppointment',
      args: {
        serviceId: state.serviceId,
        professionalId: state.professionalId || 'AUTO_PRIMARY',
        customerName: state.customerName || 'Ospite',
        date: state.date,
        startAt,
      },
    },
  ];
}

/**
 * Decides the current guided step for a conversation turn.
 */
export function computeBookingFlow(input: BookingFlowInput): BookingFlowResult {
  const { intent, entities, selection, services, professionals, hasVerifiedCustomer, timezone, referenceTime } = input;
  const guided = Boolean(selection);
  // Rescheduling keeps its own text-driven flow; the guided card flow only
  // drives new bookings and availability checks.
  const bookingIntent = intent === 'CHECK_AVAILABILITY' || intent === 'CREATE_APPOINTMENT';

  if (!bookingIntent && !guided) {
    return { isBookingFlow: false, step: 'NONE', state: {}, toolCalls: [] };
  }

  const state = buildState(entities, selection, hasVerifiedCustomer, intent, input.previousState);
  const hasService = Boolean(state.serviceId);
  const hasProfessional = Boolean(state.professionalId);
  const hasDate = Boolean(state.date || state.startDate || state.endDate);
  const hasTime = Boolean(state.time);

  let step: BookingFlowStep;
  if (selection?.type === 'confirm') {
    if (!identityKnown(entities, hasVerifiedCustomer)) {
      step = 'IDENTITY';
      state.date = null;
      state.time = null;
    } else {
      step = 'CREATE';
    }
  } else if (selection?.type === 'modify') {
    // Back to the time selection to pick another slot.
    state.time = null;
    step = 'TIME';
  } else if (selection?.type === 'time' || selection?.type === 'slot') {
    step = identityKnown(entities, hasVerifiedCustomer) ? 'CONFIRMATION' : 'IDENTITY';
  } else if (!hasService) {
    step = 'SERVICE';
  } else if (!hasProfessional) {
    step = 'PROFESSIONAL';
  } else if (!hasDate && !hasTime) {
    // Service + professional chosen with no date yet: look up availability
    // automatically and show the next concrete free slots (date + time). A
    // real secretary never asks "which day?" before consulting the calendar.
    step = 'SLOTS';
  } else if (!hasDate) {
    // Edge case: a time without a date (e.g. the customer typed "alle 10:00"
    // with no day). Still needs the day — falls back to the day picker.
    step = 'DATE';
  } else if (!hasTime) {
    step = 'TIME';
  } else if (guided) {
    step = identityKnown(entities, hasVerifiedCustomer) ? 'CONFIRMATION' : 'IDENTITY';
  } else if (!identityKnown(entities, hasVerifiedCustomer)) {
    // Typed turns with every booking detail but no customer identity yet:
    // ask for name + phone (IDENTITY step) before anything can be created.
    step = 'IDENTITY';
  } else if (input.previousState?.step === 'IDENTITY') {
    // The customer just provided their identity mid-guided-flow: surface the
    // final confirmation card before the appointment is created.
    step = 'CONFIRMATION';
  } else {
    // Typed turns with every detail (including identity) go straight to the
    // operational create; the create tool enforces customer identity.
    step = 'CREATE';
  }
  state.step = step;

  // Scope guard: only professionals that exist in this tenant can be offered.
  if (step === 'PROFESSIONAL' && professionals.length === 0 && services.length === 0) {
    return { isBookingFlow: false, step: 'NONE', state: {}, toolCalls: [] };
  }

  let toolCalls: BookingFlowResult['toolCalls'];
  if (step === 'CREATE') {
    toolCalls = buildCreateCalls(state, timezone);
  } else {
    toolCalls = bookingToolCalls(step, state, timezone, referenceTime);
  }

  return { isBookingFlow: true, step, state, toolCalls };
}
