export interface BusinessRulesConfig {
  id: string;
  organizationId: string;
  cancellationWindowHours: number;
  noShowPolicyNote: string | null;
  welcomeMessage: string;
  confirmationMessageTemplate: string;
  cancellationMessageTemplate: string;
  outOfHoursMessage: string;
  autoConfirmAppointments: boolean;
  maxAdvanceDaysBooking: number;
  minAdvanceBookingHours: number;
  customRulesJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessException {
  id: string;
  organizationId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  reason: string;
  isFullDay: boolean;
  createdAt: string;
}

export interface UpdateBusinessRulesInput {
  cancellationWindowHours?: number;
  noShowPolicyNote?: string | null;
  welcomeMessage?: string;
  confirmationMessageTemplate?: string;
  cancellationMessageTemplate?: string;
  outOfHoursMessage?: string;
  autoConfirmAppointments?: boolean;
  maxAdvanceDaysBooking?: number;
}

export interface CreateBusinessExceptionInput {
  startDate: string;
  endDate: string;
  reason: string;
  isFullDay?: boolean;
}
