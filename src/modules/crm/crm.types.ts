export interface NormalizedPhoneResult {
  valid: boolean;
  normalized: string | null;
  countryCode: string | null;
  reason?: string;
}

export type CustomerStatus = 'active' | 'archived' | 'blocked';

export interface Customer {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  phoneNormalized: string;
  email: string | null;
  birthDate: string | null;
  marketingConsent: boolean;
  notes: string | null;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  birthDate?: string;
  marketingConsent?: boolean;
  notes?: string;
}

export interface UpdateCustomerInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string | null;
  birthDate?: string | null;
  marketingConsent?: boolean;
  notes?: string | null;
  status?: CustomerStatus;
}
