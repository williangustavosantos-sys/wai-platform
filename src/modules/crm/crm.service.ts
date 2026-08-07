import { SupabaseClient } from '@supabase/supabase-js';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { Logger } from '@/logging/logger';
import { verifyOrganizationAccess } from '@/security/auth';
import { Customer, CreateCustomerInput, UpdateCustomerInput, CustomerStatus, NormalizedPhoneResult } from './crm.types';

/**
 * Normalizes and validates phone number to international E.164 specification.
 * Never alters original digits; only strips formatting characters and prepends country code when missing.
 */
export function normalizePhoneNumber(rawPhone: string, defaultCountryCode = '+39'): NormalizedPhoneResult {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return { valid: false, normalized: null, countryCode: null, reason: 'Il numero di telefono è obbligatorio.' };
  }

  const cleaned = rawPhone.replace(/[\s\-\.\/\(\)]/g, '');
  if (!cleaned) {
    return { valid: false, normalized: null, countryCode: null, reason: 'Il numero di telefono è vuoto.' };
  }

  let phone = cleaned;
  if (phone.startsWith('00')) {
    phone = '+' + phone.slice(2);
  } else if (!phone.startsWith('+')) {
    const cc = defaultCountryCode.startsWith('+') ? defaultCountryCode : `+${defaultCountryCode}`;
    phone = cc + phone;
  }

  const e164Regex = /^\+[1-9]\d{6,14}$/;
  if (!e164Regex.test(phone)) {
    return {
      valid: false,
      normalized: null,
      countryCode: null,
      reason: `Formato telefono non valido per lo standard E.164: (${rawPhone}).`
    };
  }

  return { valid: true, normalized: phone, countryCode: defaultCountryCode };
}

function mapDbToCustomer(row: Record<string, unknown>): Customer {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    phoneNormalized: row.phone_normalized as string,
    email: (row.email as string) || null,
    birthDate: (row.birth_date as string) || null,
    marketingConsent: Boolean(row.marketing_consent),
    notes: (row.notes as string) || null,
    status: (row.status as CustomerStatus) || 'active',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Lists organization customers under RLS isolation.
 */
export async function listCustomers(
  client: SupabaseClient,
  userId: string,
  organizationSlug: string,
  search?: string,
  logger?: Logger
): Promise<Customer[]> {
  const log = logger || new Logger({ userId, organizationSlug });
  const access = await verifyOrganizationAccess(client, userId, organizationSlug, log);
  if (!access) return [];

  let query = client
    .from('customers')
    .select('*')
    .eq('organization_id', access.organizationId)
    .neq('status', 'blocked')
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  if (search && search.trim() !== '') {
    const term = `%${search.trim()}%`;
    query = query.or(`first_name.ilike.${term},last_name.ilike.${term},phone_normalized.ilike.${term},email.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) {
    log.error('Failed to list customers', { error });
    throw new Error(`Errore durante il recupero della clientela: ${error.message}`);
  }

  return (data || []).map((row) => mapDbToCustomer(row as Record<string, unknown>));
}

/**
 * Creates a new CRM customer with strict phone normalization and Audit Log emission.
 */
export async function createCustomer(
  client: SupabaseClient,
  adminClient: SupabaseClient,
  userId: string,
  organizationSlug: string,
  input: CreateCustomerInput,
  correlationId: string,
  logger?: Logger
): Promise<{ success: boolean; data?: Customer; error?: string }> {
  const log = logger || new Logger({ correlationId, userId, organizationSlug });
  const access = await verifyOrganizationAccess(client, userId, organizationSlug, log);

  if (!access) {
    return { success: false, error: 'Accesso negato al tenant specificato.' };
  }
  if (access.role !== 'organization_owner' && access.role !== 'organization_operator') {
    return { success: false, error: 'Operazione consentita solo a operatori o proprietari.' };
  }

  const phoneRes = normalizePhoneNumber(input.phone);
  if (!phoneRes.valid || !phoneRes.normalized) {
    return { success: false, error: phoneRes.reason || 'Il numero di telefono inserito non è valido.' };
  }
  const normalizedPhone = phoneRes.normalized;

  // Deduplicação preventiva: verifica se já existe cliente cadastrado no tenant
  const existingCustomers = await listCustomers(client, userId, organizationSlug, normalizedPhone, log);
  const foundExisting = existingCustomers.find(c => c.phoneNormalized === normalizedPhone);
  if (foundExisting) {
    log.info('Existing customer reused by normalized phone match', { customerId: foundExisting.id, phone: normalizedPhone });
    return { success: true, data: foundExisting };
  }

  const insertRecord = {
    organization_id: access.organizationId,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    phone_normalized: normalizedPhone,
    email: input.email ? input.email.trim() : null,
    birth_date: input.birthDate ? input.birthDate : null,
    marketing_consent: Boolean(input.marketingConsent),
    notes: input.notes ? input.notes.trim() : null,
    status: 'active',
  };

  const { data: created, error: createError } = await client
    .from('customers')
    .insert([insertRecord])
    .select('*')
    .single();

  if (createError || !created) {
    log.error('Error inserting CRM customer', { error: createError });
    if (createError?.code === '23505') {
      const retryList = await listCustomers(client, userId, organizationSlug, normalizedPhone, log);
      const retryFound = retryList.find(c => c.phoneNormalized === normalizedPhone);
      if (retryFound) {
        return { success: true, data: retryFound };
      }
      return { success: false, error: `Esiste già un cliente registrato con il numero di telefono ${normalizedPhone} in questa organizzazione.` };
    }
    return { success: false, error: `Impossibile registrare il cliente: ${createError?.message || 'Errore DB'}` };
  }

  const newCustomer = mapDbToCustomer(created as Record<string, unknown>);
  await recordAuditLog(
    {
      organizationId: access.organizationId,
      actorUserId: userId,
      actorType: 'user',
      action: 'CREATE_CUSTOMER',
      entityType: 'customer',
      entityId: newCustomer.id,
      afterData: { ...insertRecord },
      metadata: { phone_normalized: normalizedPhone },
      correlationId,
    },
    adminClient,
    log
  );

  log.info('CRM customer created successfully', { customerId: newCustomer.id });
  return { success: true, data: newCustomer };
}

/**
 * Updates existing CRM customer details under RLS isolation and records Audit Log.
 */
export async function updateCustomer(
  client: SupabaseClient,
  adminClient: SupabaseClient,
  userId: string,
  organizationSlug: string,
  customerId: string,
  input: UpdateCustomerInput,
  correlationId: string,
  logger?: Logger
): Promise<{ success: boolean; data?: Customer; error?: string }> {
  const log = logger || new Logger({ correlationId, userId, organizationSlug });
  const access = await verifyOrganizationAccess(client, userId, organizationSlug, log);

  if (!access || (access.role !== 'organization_owner' && access.role !== 'organization_operator')) {
    return { success: false, error: 'Accesso negato o privilegi insufficienti per modificare l\'anagrafica.' };
  }

  const { data: currentRow, error: fetchError } = await client
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('organization_id', access.organizationId)
    .single();

  if (fetchError || !currentRow) {
    return { success: false, error: 'Cliente non trovato o non accessibile all\'interno dell\'organizzazione.' };
  }

  const current = mapDbToCustomer(currentRow as Record<string, unknown>);
  const beforeData = {
    first_name: current.firstName,
    last_name: current.lastName,
    phone_normalized: current.phoneNormalized,
    email: current.email,
    birth_date: current.birthDate,
    marketing_consent: current.marketingConsent,
    notes: current.notes,
    status: current.status,
  };

  const updatePayload: Record<string, unknown> = {};
  if (input.firstName !== undefined) updatePayload.first_name = input.firstName.trim();
  if (input.lastName !== undefined) updatePayload.last_name = input.lastName.trim();
  if (input.phone !== undefined) {
    const phoneRes = normalizePhoneNumber(input.phone);
    if (!phoneRes.valid || !phoneRes.normalized) {
      return { success: false, error: phoneRes.reason || 'Numero di telefono non valido.' };
    }
    updatePayload.phone_normalized = phoneRes.normalized;
  }
  if (input.email !== undefined) updatePayload.email = input.email ? input.email.trim() : null;
  if (input.birthDate !== undefined) updatePayload.birth_date = input.birthDate || null;
  if (input.marketingConsent !== undefined) updatePayload.marketing_consent = input.marketingConsent;
  if (input.notes !== undefined) updatePayload.notes = input.notes ? input.notes.trim() : null;
  if (input.status !== undefined) updatePayload.status = input.status;

  const { data: updated, error: updateError } = await client
    .from('customers')
    .update(updatePayload)
    .eq('id', customerId)
    .eq('organization_id', access.organizationId)
    .select('*')
    .single();

  if (updateError || !updated) {
    if (updateError?.code === '23505') {
      return { success: false, error: 'Numero di telefono già in uso da un altro cliente del tenant.' };
    }
    return { success: false, error: `Impossibile aggiornare l'anagrafica: ${updateError?.message || 'Errore di salvataggio'}` };
  }

  const updatedCustomer = mapDbToCustomer(updated as Record<string, unknown>);
  const afterData = {
    first_name: updatedCustomer.firstName,
    last_name: updatedCustomer.lastName,
    phone_normalized: updatedCustomer.phoneNormalized,
    email: updatedCustomer.email,
    birth_date: updatedCustomer.birthDate,
    marketing_consent: updatedCustomer.marketingConsent,
    notes: updatedCustomer.notes,
    status: updatedCustomer.status,
  };

  await recordAuditLog(
    {
      organizationId: access.organizationId,
      actorUserId: userId,
      actorType: 'user',
      action: 'UPDATE_CUSTOMER',
      entityType: 'customer',
      entityId: customerId,
      beforeData,
      afterData,
      correlationId,
    },
    adminClient,
    log
  );

  return { success: true, data: updatedCustomer };
}

/**
 * Archives a CRM customer and records Audit Log.
 */
export async function archiveCustomer(
  client: SupabaseClient,
  adminClient: SupabaseClient,
  userId: string,
  organizationSlug: string,
  customerId: string,
  correlationId: string,
  logger?: Logger
): Promise<{ success: boolean; error?: string }> {
  return updateCustomer(
    client,
    adminClient,
    userId,
    organizationSlug,
    customerId,
    { status: 'archived' },
    correlationId,
    logger
  );
}
