export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export interface CheckAvailabilityInput {
  date?: string; // YYYY-MM-DD
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  serviceId?: string;
  userSearchText?: string;
  professionalId?: string;
}

export interface FindCustomerInput {
  phone: string;
  email?: string;
}

export interface CreateCustomerInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
}

export interface CreateAppointmentInput {
  customerId: string;
  serviceId: string;
  professionalId: string;
  startAt: string; // ISO String or YYYY-MM-DDTHH:mm:ss
  notes?: string;
}

export interface CancelAppointmentInput {
  appointmentId: string;
  reason?: string;
}

export interface RescheduleAppointmentInput {
  appointmentId: string;
  newStartAt: string; // ISO String
}

export interface ListServicesInput {
  search?: string;
}

export interface ListProfessionalsInput {
  search?: string;
}

export interface GetBusinessRulesInput {
  category?: string;
}

export interface ToolExecutionResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  isGistOverlapError?: boolean;
}

export interface ExtractedAvailability {
  date: string;
  availableSlots: string[];
  success: boolean;
  rawCall: unknown;
}

/**
 * Safely extracts checkAvailability tool results from any telemetry or toolCall format
 * without relying on arbitrary `as any` casts.
 */
export function extractAvailabilityFromToolCall(toolCall: unknown): ExtractedAvailability | null {
  if (!toolCall || typeof toolCall !== 'object') return null;
  const tc = toolCall as Record<string, unknown>;

  const name = (tc.toolName || tc.name) as string;
  if (name !== 'checkAvailability') return null;

  const args = (tc.arguments || tc.args || {}) as Record<string, unknown>;
  const date = (args.date) as string;
  if (!date || typeof date !== 'string') return null;

  const success = Boolean(tc.success !== false);

  const resObj = tc.result as Record<string, unknown> | undefined;
  const innerRes = (resObj?.result || resObj) as Record<string, unknown> | undefined;
  const rawSlots = innerRes?.availableSlots;

  if (!Array.isArray(rawSlots)) return null;

  const availableSlots = rawSlots.filter((s): s is string => typeof s === 'string');

  return {
    date,
    availableSlots,
    success,
    rawCall: toolCall
  };
}
