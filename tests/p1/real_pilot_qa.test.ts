import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { config as loadEnvironment } from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { updateOrganizationSettings } from '../../src/modules/organizations/organization.service';
import { getAssistantConfig, updateAssistantConfig } from '../../src/modules/assistant/assistant.service';
import {
  createAppointment,
  createProfessional,
  createService,
  createTimeSlot,
  listAppointments,
  listProfessionals,
  listServices,
  rescheduleAppointment,
  updateProfessional,
  updateService,
} from '../../src/modules/calendar/calendar.service';
import { createCustomer } from '../../src/modules/crm/crm.service';
import { createBusinessException } from '../../src/modules/rules/rules.service';
import { executeCheckAvailability, executeToolByName } from '../../src/modules/tools/tools.service';
import { createConversation } from '../../src/modules/messages/messages.service';
import { processConversationTurn } from '../../src/modules/conversation/conversation.service';
import { WebChatAdapter } from '../../src/modules/conversation/webchat_adapter';
import { buildMonthlyCalendar } from '../../src/app/app/[slug]/calendar/calendar-view-model';
import { getOrganizationMonth, getOrganizationMonthRange, organizationLocalDateTimeToUtc } from '../../src/modules/shared/organization-timezone';

loadEnvironment({ path: resolve(process.cwd(), '.env.test'), quiet: true });

const QA_PROJECT_REF = 'crlftiwjpplrqidjvpaj';
const TEST_ENABLED = process.env.RUN_REAL_SUPABASE_QA === 'true';
const qaDescribe = TEST_ENABLED ? describe.sequential : describe.skip;
const RUN_PREFIX = `wai-p1-${Date.now()}-${randomUUID().slice(0, 8)}`;
const RUN_SUFFIX = RUN_PREFIX.replace(/[^a-z0-9]/gi, '').slice(-10);

function futureBusinessDate(offset: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + 45 + offset);
  while (value.getUTCDay() === 0 || value.getUTCDay() === 6) value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function requireSuccess<T extends { success: boolean; error?: string }>(result: T, step: string): T {
  if (!result.success) throw new Error(`${step} failed: ${result.error || 'unknown error'}`);
  return result;
}

qaDescribe('WAI P1 — real pilot preparation QA', () => {
  let adminClient: SupabaseClient;
  let organizationClient: SupabaseClient;
  let ownerId: string;
  let organizationId: string;
  let organizationSlug: string;
  let serviceId: string;
  let professionalId: string;
  let customerId: string;
  let appointmentId: string;
  let bookingDate: string;
  let rescheduleDate: string;
  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const url = process.env.CHIARA_QA_SUPABASE_URL;
    const serviceRoleKey = process.env.CHIARA_QA_SUPABASE_SERVICE_ROLE_KEY;
    if (!url) throw new Error('CHIARA_QA_SUPABASE_URL is required');
    if (!serviceRoleKey) throw new Error('CHIARA_QA_SUPABASE_SERVICE_ROLE_KEY is required');
    if (process.env.CHIARA_QA_ALLOW_WRITES !== 'true') throw new Error('CHIARA_QA_ALLOW_WRITES must be exactly true');
    if (new URL(url).hostname !== `${QA_PROJECT_REF}.supabase.co`) throw new Error('Refusing writes outside isolated QA Supabase');

    adminClient = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    organizationSlug = `${RUN_PREFIX}-org`;
    const { data: organization, error: organizationError } = await adminClient.from('organizations').insert({
      name: `WAI P1 ${RUN_SUFFIX}`,
      slug: organizationSlug,
      timezone: 'Europe/Rome',
      locale: 'it-IT',
      status: 'active',
      settings_json: { displayName: `Legacy ${RUN_SUFFIX}`, qa_run: RUN_PREFIX },
    }).select('id').single();
    if (organizationError || !organization) throw new Error(`P1 organization setup failed: ${organizationError?.message || 'unknown error'}`);
    organizationId = organization.id;
    createdOrganizationIds.push(organizationId);

    const password = `Wai!${randomUUID()}A1`;
    const email = `${RUN_PREFIX}-owner@example.test`;
    const { data: authResult, error: authError } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
    if (authError || !authResult.user) throw new Error(`P1 owner setup failed: ${authError?.message || 'unknown error'}`);
    ownerId = authResult.user.id;
    createdUserIds.push(ownerId);

    const { error: membershipError } = await adminClient.from('organization_members').insert({
      organization_id: organizationId, user_id: ownerId, role: 'organization_owner', status: 'active',
    });
    if (membershipError) throw new Error(`P1 membership setup failed: ${membershipError.message}`);

    organizationClient = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: signedIn, error: signInError } = await organizationClient.auth.signInWithPassword({ email, password });
    if (signInError || signedIn.user?.id !== ownerId) throw new Error('P1 authenticated owner sign-in failed');
  }, 60_000);

  afterAll(async () => {
    if (!adminClient) return;
    const { error: auditError } = await adminClient.from('audit_logs').delete().like('correlation_id', `${RUN_PREFIX}%`);
    if (auditError) throw new Error(`P1 audit cleanup failed: ${auditError.message}`);
    for (const userId of createdUserIds) {
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw new Error(`P1 user cleanup failed: ${error.message}`);
    }
    for (const id of createdOrganizationIds) {
      const { error } = await adminClient.from('organizations').delete().eq('id', id);
      if (error) throw new Error(`P1 organization cleanup failed: ${error.message}`);
    }
  }, 60_000);

  it('1. persists the canonical company name while preserving the legacy displayName fallback', async () => {
    requireSuccess(await updateOrganizationSettings(
      organizationClient, adminClient, ownerId, organizationSlug,
      { businessName: `Company ${RUN_SUFFIX}`, address: 'Via QA 1', phone: '+390200000000', email: `${RUN_PREFIX}@example.test`, workingHours: 'Lun-Ven 09:00-18:00' },
      `${RUN_PREFIX}-settings`,
    ), 'company settings');

    const { data, error } = await adminClient.from('organizations').select('name, settings_json').eq('id', organizationId).single();
    expect(error).toBeNull();
    expect(data?.name).toBe(`Company ${RUN_SUFFIX}`);
    expect(data?.settings_json).toMatchObject({ displayName: `Legacy ${RUN_SUFFIX}`, address: 'Via QA 1', working_hours: 'Lun-Ven 09:00-18:00' });
  });

  it('2. persists a Digital Employee identity separately from the company name', async () => {
    const initial = await getAssistantConfig(organizationClient, adminClient, ownerId, organizationSlug, `${RUN_PREFIX}-assistant-create`);
    expect(initial?.name).toBe('Digital Employee');
    const updated = requireSuccess(await updateAssistantConfig(
      organizationClient, adminClient, ownerId, organizationSlug,
      { name: `Employee ${RUN_SUFFIX}`, personalitySummary: 'Operativo e cordiale.' },
      `${RUN_PREFIX}-assistant-update`,
    ), 'digital employee update');
    expect(updated.data?.name).toBe(`Employee ${RUN_SUFFIX}`);
    const { data, error } = await adminClient.from('digital_employees').select('name, organization_id').eq('id', updated.data?.id || '').single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ name: `Employee ${RUN_SUFFIX}`, organization_id: organizationId });
    expect(data?.name).not.toBe(`Company ${RUN_SUFFIX}`);
  });

  it('3. creates, deactivates and reactivates a service with persisted state', async () => {
    const created = requireSuccess(await createService(
      organizationClient, adminClient, ownerId, organizationSlug,
      { name: `Service ${RUN_SUFFIX}`, description: 'P1 service', durationMinutes: 45, price: 12_500 },
      `${RUN_PREFIX}-service-create`,
    ), 'service create');
    serviceId = created.data!.id;
    requireSuccess(await updateService(organizationClient, adminClient, ownerId, organizationSlug, serviceId, { status: 'inactive' }, `${RUN_PREFIX}-service-off`), 'service deactivate');
    expect((await listServices(organizationClient, ownerId, organizationSlug)).some((service) => service.id === serviceId)).toBe(false);
    requireSuccess(await updateService(organizationClient, adminClient, ownerId, organizationSlug, serviceId, { status: 'active' }, `${RUN_PREFIX}-service-on`), 'service reactivate');
    const { data, error } = await adminClient.from('services').select('organization_id, price_cents, status').eq('id', serviceId).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ organization_id: organizationId, price_cents: 12_500, status: 'active' });
  });

  it('4. creates, deactivates and reactivates a professional with persisted state', async () => {
    const created = requireSuccess(await createProfessional(
      organizationClient, adminClient, ownerId, organizationSlug,
      { name: `Professional ${RUN_SUFFIX}`, title: 'Consulente', email: `${RUN_PREFIX}-professional@example.test`, phone: '+393401234567' },
      `${RUN_PREFIX}-professional-create`,
    ), 'professional create');
    professionalId = created.data!.id;
    requireSuccess(await updateProfessional(organizationClient, adminClient, ownerId, organizationSlug, professionalId, { status: 'inactive' }, `${RUN_PREFIX}-professional-off`), 'professional deactivate');
    expect((await listProfessionals(organizationClient, ownerId, organizationSlug)).some((professional) => professional.id === professionalId)).toBe(false);
    requireSuccess(await updateProfessional(organizationClient, adminClient, ownerId, organizationSlug, professionalId, { status: 'active' }, `${RUN_PREFIX}-professional-on`), 'professional reactivate');
    const { data, error } = await adminClient.from('professionals').select('organization_id, title, phone, status').eq('id', professionalId).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ organization_id: organizationId, title: 'Consulente', status: 'active' });
  });

  it('5. books through processConversationTurn and makes the persisted appointment visible in the monthly model', async () => {
    bookingDate = futureBusinessDate(0);
    rescheduleDate = futureBusinessDate(1);
    const dayOfWeek = new Date(`${bookingDate}T00:00:00Z`).getUTCDay();
    requireSuccess(await createTimeSlot(organizationClient, adminClient, ownerId, organizationSlug, {
      professionalId, dayOfWeek, startTime: '09:00', endTime: '18:00',
    }, `${RUN_PREFIX}-availability`), 'availability rule create');
    const customer = requireSuccess(await createCustomer(organizationClient, adminClient, ownerId, organizationSlug, {
      firstName: 'WAI', lastName: `Customer${RUN_SUFFIX}`, phone: '+393491234567', notes: RUN_PREFIX,
    }, `${RUN_PREFIX}-customer`), 'customer create');
    customerId = customer.data!.id;
    const conversation = requireSuccess(await createConversation(organizationClient, adminClient, ownerId, organizationSlug, {
      channel: 'webchat', status: 'active', customerId,
    }, `${RUN_PREFIX}-conversation`), 'conversation create');
    const service = (await listServices(organizationClient, ownerId, organizationSlug)).find((entry) => entry.id === serviceId)!;
    const professional = (await listProfessionals(organizationClient, ownerId, organizationSlug)).find((entry) => entry.id === professionalId)!;
    const turn = await processConversationTurn(
      organizationClient, adminClient, ownerId, organizationSlug, new WebChatAdapter(),
      { conversationId: conversation.data!.id, customerPhone: '+393491234567', text: `Vorrei prenotare ${service.name} con ${professional.name} il ${bookingDate} alle 10:00` },
      `${RUN_PREFIX}-conversation-booking`, { source: 'organization_workspace' },
    );
    const bookingResult = turn.toolCalls.find((call) => call.toolName === 'createAppointment')?.result as { success?: boolean; appointmentId?: string } | undefined;
    expect(bookingResult).toMatchObject({ success: true });
    appointmentId = bookingResult?.appointmentId || '';
    const { data, error } = await adminClient.from('appointments').select('organization_id, customer_id, service_id, professional_id, status').eq('id', appointmentId).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ organization_id: organizationId, customer_id: customerId, service_id: serviceId, professional_id: professionalId, status: 'confirmed' });
    const month = getOrganizationMonth(new Date(organizationLocalDateTimeToUtc(`${bookingDate}T10:00:00`, 'Europe/Rome')!), 'Europe/Rome');
    const visible = buildMonthlyCalendar(month, 'Europe/Rome', await listAppointments(organizationClient, ownerId, organizationSlug, getOrganizationMonthRange(month, 'Europe/Rome')), []);
    expect(visible.days.flatMap((day) => day.appointments).some((appointment) => appointment.id === appointmentId)).toBe(true);
  }, 30_000);

  it('6. reaches the authenticated owner agenda path without phone or fixture recognition', async () => {
    const conversation = requireSuccess(await createConversation(organizationClient, adminClient, ownerId, organizationSlug, {
      channel: 'webchat', status: 'active',
    }, `${RUN_PREFIX}-agenda-conversation`), 'agenda conversation create');
    const turn = await processConversationTurn(
      organizationClient, adminClient, ownerId, organizationSlug, new WebChatAdapter(),
      { conversationId: conversation.data!.id, text: `Who do I have on ${bookingDate}?` },
      `${RUN_PREFIX}-agenda-turn`, { source: 'organization_workspace' },
    );
    const agendaCall = turn.toolCalls.find((call) => call.toolName === 'ownerListAgenda');
    expect(agendaCall?.result).toMatchObject({ success: true });
    const result = agendaCall?.result as { result?: { appointments?: Array<{ id: string }> } };
    expect(result.result?.appointments?.some((appointment) => appointment.id === appointmentId)).toBe(true);
  }, 30_000);

  it('7. reschedules and reflects the new persisted slot in the monthly model', async () => {
    const newStartAt = organizationLocalDateTimeToUtc(`${rescheduleDate}T11:00:00`, 'Europe/Rome')!;
    requireSuccess(await rescheduleAppointment(organizationClient, adminClient, ownerId, organizationSlug, appointmentId, newStartAt, `${RUN_PREFIX}-reschedule`), 'reschedule');
    const { data, error } = await adminClient.from('appointments').select('start_at, status').eq('id', appointmentId).single();
    expect(error).toBeNull();
    expect(new Date(data!.start_at).toISOString()).toBe(new Date(newStartAt).toISOString());
    const month = getOrganizationMonth(new Date(newStartAt), 'Europe/Rome');
    const model = buildMonthlyCalendar(month, 'Europe/Rome', await listAppointments(organizationClient, ownerId, organizationSlug, getOrganizationMonthRange(month, 'Europe/Rome')), []);
    expect(model.days.find((day) => day.date === rescheduleDate)?.appointments.some((appointment) => appointment.id === appointmentId)).toBe(true);
  });

  it('8. cancels through the service and persists the visible cancelled state', async () => {
    const cancelled = await executeToolByName('cancelAppointment', { appointmentId, reason: 'P1 QA cancellation' }, organizationClient, adminClient, ownerId, organizationSlug, `${RUN_PREFIX}-cancel`);
    expect(cancelled).toMatchObject({ success: true, code: 'APPOINTMENT_CANCELLED' });
    const { data, error } = await adminClient.from('appointments').select('status').eq('id', appointmentId).single();
    expect(error).toBeNull();
    expect(data?.status).toBe('cancelled');
  });

  it('9. persists a business block and applies it to real availability', async () => {
    const blockDate = futureBusinessDate(2);
    const dayOfWeek = new Date(`${blockDate}T00:00:00Z`).getUTCDay();
    requireSuccess(await createTimeSlot(organizationClient, adminClient, ownerId, organizationSlug, {
      professionalId, dayOfWeek, startTime: '09:00', endTime: '18:00',
    }, `${RUN_PREFIX}-block-availability`), 'block availability rule create');
    const block = requireSuccess(await createBusinessException(organizationClient, adminClient, ownerId, organizationSlug, {
      startDate: blockDate, endDate: blockDate, reason: `Block ${RUN_SUFFIX}`, isFullDay: true,
    }, `${RUN_PREFIX}-block`), 'business block create');
    const { data, error } = await adminClient.from('closures').select('organization_id, reason').eq('id', block.data!.id).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ organization_id: organizationId, reason: `Block ${RUN_SUFFIX}` });
    const availability = await executeCheckAvailability(organizationClient, ownerId, organizationSlug, { date: blockDate, serviceId, professionalId }, `${RUN_PREFIX}-availability-check`);
    expect(availability).toMatchObject({ success: true, code: 'NO_AVAILABILITY' });
  });

  it('10. blocks cross-organization reads and mutations at the application service boundary', async () => {
    const foreignSlug = `${RUN_PREFIX}-foreign`;
    const { data: foreign, error: foreignError } = await adminClient.from('organizations').insert({
      name: `Foreign ${RUN_SUFFIX}`, slug: foreignSlug, timezone: 'Europe/Rome', locale: 'it-IT', status: 'active', settings_json: { qa_run: RUN_PREFIX },
    }).select('id').single();
    if (foreignError || !foreign) throw new Error('foreign tenant setup failed');
    createdOrganizationIds.push(foreign.id);
    expect(await listServices(organizationClient, ownerId, foreignSlug, { includeInactive: true })).toEqual([]);
    const crossTenantUpdate = await updateService(organizationClient, adminClient, ownerId, foreignSlug, serviceId, { status: 'inactive' }, `${RUN_PREFIX}-cross-tenant`);
    expect(crossTenantUpdate.success).toBe(false);
    const { data, error } = await adminClient.from('services').select('organization_id, status').eq('id', serviceId).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ organization_id: organizationId, status: 'active' });
  });
});
