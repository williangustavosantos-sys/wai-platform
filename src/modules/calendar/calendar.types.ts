export type ServiceStatus = 'active' | 'archived';
export type ProfessionalStatus = 'active' | 'inactive';
export type AppointmentStatus = 'held' | 'confirmed' | 'cancelled' | 'completed';

export interface Service {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  bufferAfterMinutes: number;
  price: number | null;
  status: ServiceStatus;
  createdAt: string;
}

export interface Professional {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  phoneNormalized: string | null;
  status: ProfessionalStatus;
  createdAt: string;
}

export interface AvailableTimeSlot {
  id: string;
  organizationId: string;
  professionalId: string;
  dayOfWeek: number; // 0 = Domenica, 1 = Lunedì ... 6 = Sabato
  startTime: string; // HH:MM:SS
  endTime: string;   // HH:MM:SS
  isActive: boolean;
}

export interface Appointment {
  id: string;
  organizationId: string;
  customerId: string;
  serviceId: string;
  professionalId: string;
  startAt: string; // ISO 8601 string
  endAt: string;   // ISO 8601 string
  status: AppointmentStatus;
  notes: string | null;
  cancellationReason: string | null;
  heldUntil: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined display metadata
  customerName?: string;
  serviceName?: string;
  professionalName?: string;
}

export interface CreateServiceInput {
  name: string;
  description?: string;
  durationMinutes: number;
  price?: number;
}

export interface CreateProfessionalInput {
  name: string;
  email?: string;
  phone?: string;
}

export interface CreateTimeSlotInput {
  professionalId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface CreateAppointmentInput {
  customerId: string;
  serviceId: string;
  professionalId: string;
  startAt: string;
  notes?: string;
}
