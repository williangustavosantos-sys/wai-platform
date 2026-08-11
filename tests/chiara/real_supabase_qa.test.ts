import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { config as loadEnvironment } from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCustomer, listCustomers } from '../../src/modules/crm/crm.service';
import type { Customer } from '../../src/modules/crm/crm.types';
import {
  createAppointment,
  listProfessionals,
  listServices,
  rescheduleAppointment,
} from '../../src/modules/calendar/calendar.service';
import { createConversation } from '../../src/modules/messages/messages.service';
import { processConversationTurn } from '../../src/modules/conversation/conversation.service';
import { WebChatAdapter } from '../../src/modules/conversation/webchat_adapter';
import { executeToolByName } from '../../src/modules/tools/tools.service';
import type { ToolExecutionResponse } from '../../src/modules/tools/tools.types';

loadEnvironment({ path: resolve(process.cwd(), '.env.test'), quiet: true });

const QA_PROJECT_REF = 'crlftiwjpplrqidjvpaj';
const QA_ORGANIZATION_ID = '11111111-1111-1111-1111-111111111111';
const QA_ORGANIZATION_SLUG = 'studio-aurora';
const QA_OPERATOR_USER_ID = '00000000-0000-0000-0000-000000000002';
const RUN_PREFIX = `qa-codex-${Date.now()}-${randomUUID().slice(0, 8)}`;
const RUN_SUFFIX = RUN_PREFIX.replace(/[^a-z0-9]/gi, '').slice(-12);
const TEST_ENABLED = process.env.RUN_REAL_SUPABASE_QA === 'true';
const qaDescribe = TEST_ENABLED ? describe.sequential : describe.skip;

function qaPhone(offset: number): string {
  const base = Number(String(Date.now()).slice(-7));
  return `+39991${String((base + offset) % 10_000_000).padStart(7, '0')}`;
}

function futureBusinessDate(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 28 + offset);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

function at(date: string, time: string): string {
  return `${date}T${time}:00+02:00`;
}

function requireSuccess<T extends { success: boolean; error?: string; data?: unknown }>(result: T, operation: string): T {
  if (!result.success) throw new Error(`${operation} failed: ${result.error || 'unknown error'}`);
  return result;
}

qaDescribe('WAI Core — real isolated Supabase QA', () => {
  let adminClient: SupabaseClient;
  let rlsClientA: SupabaseClient;
  let rlsClientB: SupabaseClient;
  let previousOfflineMode: string | undefined;

  let customerA: Customer;
  let customerB: Customer;
  let professionalId: string;
  let serviceId: string;
  let tempOrganizationId: string;
  let tempOrganizationSlug: string;
  let authUserAId: string;
  let authUserBId: string;

  let bookingAppointmentId: string;
  let ownershipAppointmentId: string;

  const customerIds = new Set<string>();
  const appointmentIds = new Set<string>();
  const conversationIds = new Set<string>();
  const authUserIds = new Set<string>();

  const customerAPhone = qaPhone(1);
  const customerBPhone = qaPhone(2);
  const unauthorizedPhone = qaPhone(3);

  const bookingDate = futureBusinessDate(0);
  const cancellationDate = futureBusinessDate(1);
  const rescheduleDate = futureBusinessDate(2);
  const ownershipDate = futureBusinessDate(3);
  const tenantDate = futureBusinessDate(4);
  const conversationDate = futureBusinessDate(5);

  beforeAll(async () => {
    const url = process.env.CHIARA_QA_SUPABASE_URL;
    const serviceRoleKey = process.env.CHIARA_QA_SUPABASE_SERVICE_ROLE_KEY;

    if (!url) throw new Error('CHIARA_QA_SUPABASE_URL is required');
    if (!serviceRoleKey) throw new Error('CHIARA_QA_SUPABASE_SERVICE_ROLE_KEY is required');
    if (process.env.CHIARA_QA_ALLOW_WRITES !== 'true') {
      throw new Error('CHIARA_QA_ALLOW_WRITES must be exactly true');
    }
    if (new URL(url).hostname !== `${QA_PROJECT_REF}.supabase.co`) {
      throw new Error(`Refusing writes outside isolated QA project ${QA_PROJECT_REF}`);
    }

    previousOfflineMode = process.env.OFFLINE_AI_TEST;
    process.env.OFFLINE_AI_TEST = 'true';

    adminClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const { data: organization, error: organizationError } = await adminClient
      .from('organizations')
      .select('id, slug, name, status')
      .eq('id', QA_ORGANIZATION_ID)
      .eq('slug', QA_ORGANIZATION_SLUG)
      .single();
    if (organizationError || organization?.name !== 'Studio Aurora' || organization.status !== 'active') {
      throw new Error('Dedicated QA organization identity check failed');
    }

    const { data: qaOperator, error: qaOperatorError } = await adminClient.auth.admin.getUserById(QA_OPERATOR_USER_ID);
    if (qaOperatorError || qaOperator.user?.id !== QA_OPERATOR_USER_ID) {
      throw new Error('Dedicated QA operator auth user is missing');
    }

    const [professionals, services] = await Promise.all([
      listProfessionals(adminClient, QA_OPERATOR_USER_ID, QA_ORGANIZATION_SLUG),
      listServices(adminClient, QA_OPERATOR_USER_ID, QA_ORGANIZATION_SLUG),
    ]);
    if (!professionals[0] || !services[0]) throw new Error('QA professional/service fixtures are missing');
    professionalId = professionals[0].id;
    serviceId = services[0].id;

    tempOrganizationSlug = `${RUN_PREFIX}-tenant-b`;
    const { data: tempOrganization, error: tempOrganizationError } = await adminClient
      .from('organizations')
      .insert({
        name: `WAI QA Tenant B ${RUN_SUFFIX}`,
        slug: tempOrganizationSlug,
        timezone: 'Europe/Rome',
        locale: 'it-IT',
        status: 'active',
        settings_json: { qa_run: RUN_PREFIX },
      })
      .select('id, slug')
      .single();
    if (tempOrganizationError || !tempOrganization) {
      throw new Error(`Temporary tenant creation failed: ${tempOrganizationError?.message || 'unknown error'}`);
    }
    tempOrganizationId = tempOrganization.id;

    const { data: tempCustomer, error: tempCustomerError } = await adminClient
      .from('customers')
      .insert({
        organization_id: tempOrganizationId,
        first_name: 'WAI',
        last_name: `TenantB${RUN_SUFFIX}`,
        phone_normalized: customerBPhone,
        email: `${RUN_PREFIX}-tenant-b@example.test`,
        notes: RUN_PREFIX,
        status: 'active',
      })
      .select('*')
      .single();
    if (tempCustomerError || !tempCustomer) {
      throw new Error(`Temporary tenant customer creation failed: ${tempCustomerError?.message || 'unknown error'}`);
    }
    customerB = {
      id: tempCustomer.id,
      organizationId: tempCustomer.organization_id,
      firstName: tempCustomer.first_name,
      lastName: tempCustomer.last_name,
      phoneNormalized: tempCustomer.phone_normalized,
      email: tempCustomer.email,
      birthDate: tempCustomer.birth_date,
      marketingConsent: Boolean(tempCustomer.marketing_consent),
      notes: tempCustomer.notes,
      status: tempCustomer.status,
      createdAt: tempCustomer.created_at,
      updatedAt: tempCustomer.updated_at,
    };
    customerIds.add(customerB.id);

    const passwordA = `Wai!${randomUUID()}A1`;
    const passwordB = `Wai!${randomUUID()}B1`;
    const emailA = `${RUN_PREFIX}-rls-a@example.test`;
    const emailB = `${RUN_PREFIX}-rls-b@example.test`;

    const { data: authA, error: authAError } = await adminClient.auth.admin.createUser({
      email: emailA,
      password: passwordA,
      email_confirm: true,
    });
    if (authAError || !authA.user) throw new Error(`RLS user A creation failed: ${authAError?.message || 'unknown error'}`);
    authUserAId = authA.user.id;
    authUserIds.add(authUserAId);

    const { data: authB, error: authBError } = await adminClient.auth.admin.createUser({
      email: emailB,
      password: passwordB,
      email_confirm: true,
    });
    if (authBError || !authB.user) throw new Error(`RLS user B creation failed: ${authBError?.message || 'unknown error'}`);
    authUserBId = authB.user.id;
    authUserIds.add(authUserBId);

    const { error: profilesError } = await adminClient.from('platform_users').insert([
      { user_id: authUserAId, global_role: 'standard', status: 'active' },
      { user_id: authUserBId, global_role: 'standard', status: 'active' },
    ]);
    if (profilesError) throw new Error(`RLS profiles creation failed: ${profilesError.message}`);

    const { error: membershipsError } = await adminClient.from('organization_members').insert([
      { organization_id: QA_ORGANIZATION_ID, user_id: authUserAId, role: 'organization_viewer', status: 'active' },
      { organization_id: tempOrganizationId, user_id: authUserBId, role: 'organization_owner', status: 'active' },
    ]);
    if (membershipsError) throw new Error(`RLS memberships creation failed: ${membershipsError.message}`);

    rlsClientA = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    rlsClientB = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const [{ data: sessionA, error: signInAError }, { data: sessionB, error: signInBError }] = await Promise.all([
      rlsClientA.auth.signInWithPassword({ email: emailA, password: passwordA }),
      rlsClientB.auth.signInWithPassword({ email: emailB, password: passwordB }),
    ]);
    if (signInAError || sessionA.user?.id !== authUserAId) throw new Error('RLS user A sign-in failed');
    if (signInBError || sessionB.user?.id !== authUserBId) throw new Error('RLS user B sign-in failed');
  }, 60_000);

  afterAll(async () => {
    if (previousOfflineMode === undefined) delete process.env.OFFLINE_AI_TEST;
    else process.env.OFFLINE_AI_TEST = previousOfflineMode;
    if (!adminClient) return;

    const createdCustomerIds = [...customerIds];
    const createdConversationIds = [...conversationIds];
    const createdAppointmentIds = [...appointmentIds];

    if (createdConversationIds.length) {
      const { error: messagesError } = await adminClient.from('messages').delete().in('conversation_id', createdConversationIds);
      if (messagesError) throw new Error(`QA cleanup messages failed: ${messagesError.message}`);
    }
    if (createdAppointmentIds.length) {
      const { error: eventsError } = await adminClient.from('appointment_events').delete().in('appointment_id', createdAppointmentIds);
      if (eventsError) throw new Error(`QA cleanup appointment events failed: ${eventsError.message}`);
    }
    if (createdCustomerIds.length) {
      const { error: appointmentsError } = await adminClient.from('appointments').delete().in('customer_id', createdCustomerIds);
      if (appointmentsError) throw new Error(`QA cleanup appointments failed: ${appointmentsError.message}`);
    }
    if (createdConversationIds.length) {
      const { error: conversationsError } = await adminClient.from('conversations').delete().in('id', createdConversationIds);
      if (conversationsError) throw new Error(`QA cleanup conversations failed: ${conversationsError.message}`);
    }

    const { error: auditError } = await adminClient.from('audit_logs').delete().like('correlation_id', `${RUN_PREFIX}%`);
    if (auditError) throw new Error(`QA cleanup audit logs failed: ${auditError.message}`);

    const { error: customersError } = await adminClient.from('customers').delete().eq('notes', RUN_PREFIX);
    if (customersError) throw new Error(`QA cleanup customers failed: ${customersError.message}`);

    for (const userId of authUserIds) {
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw new Error(`QA cleanup auth user failed: ${error.message}`);
    }

    if (tempOrganizationId) {
      const { error: organizationError } = await adminClient.from('organizations').delete().eq('id', tempOrganizationId);
      if (organizationError) throw new Error(`QA cleanup tenant failed: ${organizationError.message}`);
    }
  }, 60_000);

  it('A. creates a customer through WAI and reads it back from the real database', async () => {
    const result = requireSuccess(await createCustomer(
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      QA_ORGANIZATION_SLUG,
      {
        firstName: 'WAI',
        lastName: `CustomerA${RUN_SUFFIX}`,
        phone: customerAPhone,
        email: `${RUN_PREFIX}-customer-a@example.test`,
        notes: RUN_PREFIX,
      },
      `${RUN_PREFIX}-customer-create`,
    ), 'customer create');
    customerA = result.data as Customer;
    customerIds.add(customerA.id);

    const { data: persisted, error } = await adminClient
      .from('customers')
      .select('id, organization_id, first_name, last_name, phone_normalized, email, status')
      .eq('id', customerA.id)
      .single();
    expect(error).toBeNull();
    expect(persisted).toMatchObject({
      id: customerA.id,
      organization_id: QA_ORGANIZATION_ID,
      first_name: 'WAI',
      last_name: `CustomerA${RUN_SUFFIX}`,
      phone_normalized: customerAPhone,
      status: 'active',
    });
  });

  it('B. creates an appointment through WAI and reads all booking fields back', async () => {
    const result = requireSuccess(await createAppointment(
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      QA_ORGANIZATION_SLUG,
      {
        customerId: customerA.id,
        professionalId,
        serviceId,
        startAt: at(bookingDate, '10:00'),
        notes: RUN_PREFIX,
      },
      `${RUN_PREFIX}-booking-create`,
    ), 'appointment create');
    bookingAppointmentId = result.appointmentId as string;
    appointmentIds.add(bookingAppointmentId);

    const { data: persisted, error } = await adminClient
      .from('appointments')
      .select('id, organization_id, customer_id, professional_id, service_id, start_at, end_at, status')
      .eq('id', bookingAppointmentId)
      .single();
    expect(error).toBeNull();
    if (!persisted) throw new Error('Booking read-back returned no row');
    expect(persisted).toMatchObject({
      id: bookingAppointmentId,
      organization_id: QA_ORGANIZATION_ID,
      customer_id: customerA.id,
      professional_id: professionalId,
      service_id: serviceId,
      status: 'confirmed',
    });
    expect(new Date(persisted.start_at).toISOString()).toBe(new Date(at(bookingDate, '10:00')).toISOString());
  });

  it('C. translates a real PostgreSQL GIST overlap rejection into SLOT_OCCUPIED', async () => {
    const result = await executeToolByName(
      'createAppointment',
      { customerId: customerA.id, professionalId, serviceId, startAt: at(bookingDate, '10:15'), notes: RUN_PREFIX },
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      QA_ORGANIZATION_SLUG,
      `${RUN_PREFIX}-double-booking`,
    );
    expect(result).toMatchObject({ success: false, code: 'SLOT_OCCUPIED', isGistOverlapError: true });

    const { count, error } = await adminClient
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', QA_ORGANIZATION_ID)
      .eq('professional_id', professionalId)
      .eq('start_at', new Date(at(bookingDate, '10:15')).toISOString());
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it('D. cancels through WAI and persists cancelled status', async () => {
    const created = requireSuccess(await createAppointment(
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      QA_ORGANIZATION_SLUG,
      { customerId: customerA.id, professionalId, serviceId, startAt: at(cancellationDate, '11:00'), notes: RUN_PREFIX },
      `${RUN_PREFIX}-cancel-create`,
    ), 'cancellation appointment create');
    const appointmentId = created.appointmentId as string;
    appointmentIds.add(appointmentId);

    const cancelled = await executeToolByName(
      'cancelAppointment',
      { appointmentId, reason: 'WAI real QA' },
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      QA_ORGANIZATION_SLUG,
      `${RUN_PREFIX}-cancel`,
    );
    expect(cancelled).toMatchObject({ success: true, code: 'APPOINTMENT_CANCELLED', appointmentId });

    const { data: persisted, error } = await adminClient.from('appointments').select('status').eq('id', appointmentId).single();
    expect(error).toBeNull();
    if (!persisted) throw new Error('Cancellation read-back returned no row');
    expect(persisted.status).toBe('cancelled');
  });

  it('E. books a new appointment in the slot released by cancellation', async () => {
    const result = requireSuccess(await createAppointment(
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      QA_ORGANIZATION_SLUG,
      { customerId: customerA.id, professionalId, serviceId, startAt: at(cancellationDate, '11:00'), notes: RUN_PREFIX },
      `${RUN_PREFIX}-cancelled-slot-release`,
    ), 'released slot appointment create');
    const appointmentId = result.appointmentId as string;
    appointmentIds.add(appointmentId);

    const { data: persisted, error } = await adminClient.from('appointments').select('id, status').eq('id', appointmentId).single();
    expect(error).toBeNull();
    expect(persisted).toMatchObject({ id: appointmentId, status: 'confirmed' });
  });

  it('F. reschedules through WAI and persists the new slot', async () => {
    const created = requireSuccess(await createAppointment(
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      QA_ORGANIZATION_SLUG,
      { customerId: customerA.id, professionalId, serviceId, startAt: at(rescheduleDate, '10:00'), notes: RUN_PREFIX },
      `${RUN_PREFIX}-reschedule-create`,
    ), 'reschedule appointment create');
    const appointmentId = created.appointmentId as string;
    appointmentIds.add(appointmentId);

    const result = requireSuccess(await rescheduleAppointment(
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      QA_ORGANIZATION_SLUG,
      appointmentId,
      at(rescheduleDate, '12:00'),
      `${RUN_PREFIX}-reschedule`,
    ), 'appointment reschedule');
    expect(result.code).toBe('APPOINTMENT_RESCHEDULED');

    const { data: persisted, error } = await adminClient
      .from('appointments')
      .select('id, customer_id, professional_id, service_id, start_at, status')
      .eq('id', appointmentId)
      .single();
    expect(error).toBeNull();
    if (!persisted) throw new Error('Reschedule read-back returned no row');
    expect(persisted).toMatchObject({
      id: appointmentId,
      customer_id: customerA.id,
      professional_id: professionalId,
      service_id: serviceId,
      status: 'confirmed',
    });
    expect(new Date(persisted.start_at).toISOString()).toBe(new Date(at(rescheduleDate, '12:00')).toISOString());
  });

  it('G. books the old slot after rescheduling released it', async () => {
    const result = requireSuccess(await createAppointment(
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      QA_ORGANIZATION_SLUG,
      { customerId: customerA.id, professionalId, serviceId, startAt: at(rescheduleDate, '10:00'), notes: RUN_PREFIX },
      `${RUN_PREFIX}-old-slot-release`,
    ), 'old slot appointment create');
    const appointmentId = result.appointmentId as string;
    appointmentIds.add(appointmentId);

    const { data: persisted, error } = await adminClient.from('appointments').select('id, status').eq('id', appointmentId).single();
    expect(error).toBeNull();
    expect(persisted).toMatchObject({ id: appointmentId, status: 'confirmed' });
  });

  it('H. prevents customer B from cancelling customer A appointment through the conversation path', async () => {
    const created = requireSuccess(await createAppointment(
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      QA_ORGANIZATION_SLUG,
      { customerId: customerA.id, professionalId, serviceId, startAt: at(ownershipDate, '10:00'), notes: RUN_PREFIX },
      `${RUN_PREFIX}-ownership-create`,
    ), 'ownership appointment create');
    ownershipAppointmentId = created.appointmentId as string;
    appointmentIds.add(ownershipAppointmentId);

    const conversation = requireSuccess(await createConversation(
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      QA_ORGANIZATION_SLUG,
      { channel: 'webchat', status: 'active' },
      `${RUN_PREFIX}-ownership-conversation`,
    ), 'ownership conversation create');
    const conversationId = conversation.data?.id as string;
    conversationIds.add(conversationId);

    const turn = await processConversationTurn(
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      QA_ORGANIZATION_SLUG,
      new WebChatAdapter(),
      {
        conversationId,
        customerPhone: customerBPhone,
        text: `Voglio cancellare l'appuntamento per conto di ${customerA.firstName} ${customerA.lastName}`,
      },
      `${RUN_PREFIX}-ownership-attempt`,
    );
    expect(turn.metadata?.policyDecision?.code).toBe('THIRD_PARTY_ACTION_DENIED');
    expect(turn.toolCalls).toHaveLength(0);

    const { data: persisted, error } = await adminClient.from('appointments').select('status').eq('id', ownershipAppointmentId).single();
    expect(error).toBeNull();
    if (!persisted) throw new Error('Ownership read-back returned no row');
    expect(persisted.status).toBe('confirmed');
  });

  it('I. enforces application tenant isolation including foreign customer identifiers', async () => {
    const tenantBCustomers = await listCustomers(adminClient, QA_OPERATOR_USER_ID, tempOrganizationSlug);
    expect(tenantBCustomers).toEqual([]);

    const unauthorizedCustomerCreate = await createCustomer(
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      tempOrganizationSlug,
      { firstName: 'Unauthorized', lastName: RUN_SUFFIX, phone: unauthorizedPhone, notes: RUN_PREFIX },
      `${RUN_PREFIX}-tenant-denied-customer`,
    );
    expect(unauthorizedCustomerCreate.success).toBe(false);

    const crossTenantBooking = await createAppointment(
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      QA_ORGANIZATION_SLUG,
      { customerId: customerB.id, professionalId, serviceId, startAt: at(tenantDate, '10:00'), notes: RUN_PREFIX },
      `${RUN_PREFIX}-tenant-cross-customer`,
    );
    expect(crossTenantBooking).toMatchObject({ success: false, code: 'CUSTOMER_NOT_FOUND' });

    const { count, error } = await adminClient
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', tempOrganizationId)
      .eq('phone_normalized', unauthorizedPhone);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it('I-RLS. validates lower-privilege row policies independently from service-role scoping', async () => {
    const [{ data: rowsA, error: errorA }, { data: rowsB, error: errorB }] = await Promise.all([
      rlsClientA.from('customers').select('id, organization_id'),
      rlsClientB.from('customers').select('id, organization_id'),
    ]);
    expect(errorA).toBeNull();
    expect(errorB).toBeNull();
    expect(rowsA?.some((row) => row.id === customerA.id)).toBe(true);
    expect(rowsA?.every((row) => row.organization_id === QA_ORGANIZATION_ID)).toBe(true);
    expect(rowsB?.some((row) => row.id === customerB.id)).toBe(true);
    expect(rowsB?.every((row) => row.organization_id === tempOrganizationId)).toBe(true);

    const { data: crossTenantRows, error: crossTenantError } = await rlsClientB
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', ownershipAppointmentId)
      .select('id');
    expect(crossTenantError).toBeNull();
    expect(crossTenantRows).toEqual([]);

    const { data: persisted, error: persistedError } = await adminClient
      .from('appointments')
      .select('status')
      .eq('id', ownershipAppointmentId)
      .single();
    expect(persistedError).toBeNull();
    if (!persisted) throw new Error('RLS ownership read-back returned no row');
    expect(persisted.status).toBe('confirmed');
  });

  it('J. executes processConversationTurn through WAI Core and reads the real mutation and messages back', async () => {
    const conversation = requireSuccess(await createConversation(
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      QA_ORGANIZATION_SLUG,
      { channel: 'webchat', status: 'active', customerId: customerA.id },
      `${RUN_PREFIX}-e2e-conversation`,
    ), 'full conversation create');
    const conversationId = conversation.data?.id as string;
    conversationIds.add(conversationId);

    const professionals = await listProfessionals(adminClient, QA_OPERATOR_USER_ID, QA_ORGANIZATION_SLUG);
    const services = await listServices(adminClient, QA_OPERATOR_USER_ID, QA_ORGANIZATION_SLUG);
    const professional = professionals.find((entry) => entry.id === professionalId);
    const service = services.find((entry) => entry.id === serviceId);
    if (!professional || !service) throw new Error('Full conversation fixture resolution failed');

    const turn = await processConversationTurn(
      adminClient,
      adminClient,
      QA_OPERATOR_USER_ID,
      QA_ORGANIZATION_SLUG,
      new WebChatAdapter(),
      {
        conversationId,
        customerPhone: customerAPhone,
        text: `Vorrei prenotare ${service.name} con ${professional.name} il ${conversationDate} alle 14:00`,
      },
      `${RUN_PREFIX}-e2e-turn`,
    );

    const appointmentCall = turn.toolCalls.find((call) => call.toolName === 'createAppointment');
    const toolResult = appointmentCall?.result as ToolExecutionResponse | undefined;
    expect(turn.detectedIntent).toBe('CREATE_APPOINTMENT');
    expect(toolResult).toMatchObject({ success: true, code: 'APPOINTMENT_CREATED' });
    expect(toolResult?.appointmentId).toBeTruthy();
    const appointmentId = toolResult?.appointmentId as string;
    appointmentIds.add(appointmentId);

    const [{ data: persistedAppointment, error: appointmentError }, { data: persistedMessages, error: messagesError }] = await Promise.all([
      adminClient
        .from('appointments')
        .select('id, organization_id, customer_id, professional_id, service_id, start_at, status')
        .eq('id', appointmentId)
        .single(),
      adminClient
        .from('messages')
        .select('role, content, conversation_id')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }),
    ]);
    expect(appointmentError).toBeNull();
    expect(messagesError).toBeNull();
    if (!persistedAppointment) throw new Error('Full conversation appointment read-back returned no row');
    expect(persistedAppointment).toMatchObject({
      id: appointmentId,
      organization_id: QA_ORGANIZATION_ID,
      customer_id: customerA.id,
      professional_id: professionalId,
      service_id: serviceId,
      status: 'confirmed',
    });
    expect(new Date(persistedAppointment.start_at).toISOString()).toBe(new Date(at(conversationDate, '14:00')).toISOString());
    expect(persistedMessages?.map((message) => message.role)).toEqual(['customer', 'assistant']);
    expect(turn.replyText).toContain('Prenotazione confermata');
  }, 30_000);
});
