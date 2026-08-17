import { SupabaseClient } from '@supabase/supabase-js';

/**
 * In-memory Supabase double for the guided booking flow tests (Studio Aurora).
 * Supports the exact query chains used by the conversation engine and tools:
 *   - services / professionals / organizations / organization_members /
 *     digital_employees / business_rules / availability_rules / closures
 *   - customers / appointments (insert with GIST double-booking check, update)
 *   - conversations (insert + update workflow_state) / messages
 */

export interface MockStores {
  customersStore: any[];
  servicesStore: any[];
  professionalsStore: any[];
  appointmentsStore: any[];
  availabilityRulesStore: any[];
  conversationsStore: any[];
  messagesStore: any[];
  organizationsStore: any[];
  membersStore: any[];
  employeesStore: any[];
  businessRulesStore: any[];
  closuresStore: any[];
}

export const ORG_ID = '11111111-1111-1111-1111-111111111111';

export function getInitialStores(): MockStores {
  const servicesStore = [
    { id: 'c1111111', organization_id: ORG_ID, name: 'Consulenza Fiscale Iniziale', duration_minutes: 45, price_cents: 12000, price: 12000, buffer_after_minutes: 15, status: 'active' },
    { id: 'c2222222', organization_id: ORG_ID, name: 'Revisione Bilancio Annuale', duration_minutes: 60, price_cents: 18000, price: 18000, buffer_after_minutes: 15, status: 'active' },
  ];
  const professionalsStore = [
    { id: 'b1111111', organization_id: ORG_ID, name: 'Dott. Marco Rossi', title: 'Titolare / Commercialista', phone: '+39021234567', phone_normalized: '+39021234567', status: 'active' },
    { id: 'b2222222', organization_id: ORG_ID, name: 'Dott.ssa Sofia Bianchi', title: 'Esperta Contabile', phone: '+39027654321', phone_normalized: '+39027654321', status: 'active' },
  ];
  const customersStore = [
    { id: 'd0000001', organization_id: ORG_ID, first_name: 'Marco', last_name: 'Rossi', phone_normalized: '+393401234567', email: 'marco.rossi@example.it', status: 'active' },
    { id: 'd0000002', organization_id: ORG_ID, first_name: 'Marco', last_name: 'Russo', phone_normalized: '+393407654321', email: 'marco.russo@example.it', status: 'active' },
    { id: 'd0000003', organization_id: ORG_ID, first_name: 'Sofia', last_name: 'Rossi', phone_normalized: '+393471122334', email: 'sofia.rossi@example.it', status: 'active' },
    { id: 'd0000004', organization_id: ORG_ID, first_name: 'Matteo', last_name: 'Corti', phone_normalized: '+393359988776', email: 'matteo.corti@example.it', status: 'active' },
    { id: 'd0000005', organization_id: ORG_ID, first_name: 'Matteo', last_name: 'Conti', phone_normalized: '+393385544332', email: 'matteo.conti@example.it', status: 'active' },
    { id: 'd0000006', organization_id: ORG_ID, first_name: 'Giulia', last_name: 'Bianchi', phone_normalized: '+393204455667', email: 'giulia.bianchi@example.it', status: 'active' },
    { id: 'd0000007', organization_id: ORG_ID, first_name: 'Luca', last_name: 'Ferrari', phone_normalized: '+393338877665', email: 'luca.ferrari@example.it', status: 'active' },
    { id: 'd0000008', organization_id: ORG_ID, first_name: 'Elena', last_name: 'Esposito', phone_normalized: '+393496677889', email: 'elena.esposito@example.it', status: 'active' },
    { id: 'd0000009', organization_id: ORG_ID, first_name: 'Alessandro', last_name: 'Marino', phone_normalized: '+393392233445', email: 'alessandro.marino@example.it', status: 'active' },
    { id: 'd0000010', organization_id: ORG_ID, first_name: 'Francesca', last_name: 'Romano', phone_normalized: '+393289900112', email: 'francesca.romano@example.it', status: 'active' },
  ];
  const appointmentsStore = [
    { id: 'AG-101', organization_id: ORG_ID, customer_id: 'd0000001', professional_id: 'b1111111', service_id: 'c2222222', start_at: '2026-08-03T09:00:00+02:00', end_at: '2026-08-03T10:15:00+02:00', status: 'confirmed' },
    { id: 'AG-107', organization_id: ORG_ID, customer_id: 'd0000001', professional_id: 'b1111111', service_id: 'c2222222', start_at: '2026-08-10T09:00:00+02:00', end_at: '2026-08-10T10:15:00+02:00', status: 'confirmed' },
    { id: 'AG-108', organization_id: ORG_ID, customer_id: 'd0000005', professional_id: 'b1111111', service_id: 'c1111111', start_at: '2026-08-10T10:30:00+02:00', end_at: '2026-08-10T11:30:00+02:00', status: 'confirmed' },
    { id: 'AG-109', organization_id: ORG_ID, customer_id: 'd0000008', professional_id: 'b1111111', service_id: 'c2222222', start_at: '2026-08-10T11:45:00+02:00', end_at: '2026-08-10T13:00:00+02:00', status: 'confirmed' },
    { id: 'AG-110', organization_id: ORG_ID, customer_id: 'd0000006', professional_id: 'b2222222', service_id: 'c1111111', start_at: '2026-08-10T14:30:00+02:00', end_at: '2026-08-10T15:30:00+02:00', status: 'confirmed' },
    { id: 'AG-112', organization_id: ORG_ID, customer_id: 'd0000002', professional_id: 'b2222222', service_id: 'c1111111', start_at: '2026-08-11T09:30:00+02:00', end_at: '2026-08-11T10:30:00+02:00', status: 'confirmed' },
    { id: 'AG-113', organization_id: ORG_ID, customer_id: 'd0000003', professional_id: 'b2222222', service_id: 'c2222222', start_at: '2026-08-11T11:00:00+02:00', end_at: '2026-08-11T12:15:00+02:00', status: 'confirmed' },
    { id: 'AG-118', organization_id: ORG_ID, customer_id: 'd0000008', professional_id: 'b2222222', service_id: 'c1111111', start_at: '2026-08-17T09:00:00+02:00', end_at: '2026-08-17T10:00:00+02:00', status: 'confirmed' },
    { id: 'AG-119', organization_id: ORG_ID, customer_id: 'd0000001', professional_id: 'b1111111', service_id: 'c2222222', start_at: '2026-08-17T10:00:00+02:00', end_at: '2026-08-17T11:15:00+02:00', status: 'confirmed' },
    { id: 'AG-120', organization_id: ORG_ID, customer_id: 'd0000003', professional_id: 'b1111111', service_id: 'c1111111', start_at: '2026-08-17T11:30:00+02:00', end_at: '2026-08-17T12:30:00+02:00', status: 'confirmed' },
    { id: 'AG-128', organization_id: ORG_ID, customer_id: 'd0000003', professional_id: 'b2222222', service_id: 'c2222222', start_at: '2026-08-26T09:15:00+02:00', end_at: '2026-08-26T10:30:00+02:00', status: 'cancelled' },
    { id: 'AG-132', organization_id: ORG_ID, customer_id: 'd0000005', professional_id: 'b1111111', service_id: 'c2222222', start_at: '2026-08-31T11:30:00+02:00', end_at: '2026-08-31T12:45:00+02:00', status: 'pending' },
  ];
  const availabilityRulesStore: any[] = [];
  for (const d of [1, 2, 3, 4, 5]) {
    availabilityRulesStore.push({ id: `r1-${d}`, organization_id: ORG_ID, professional_id: 'b1111111', day_of_week: d, start_time: '09:00', end_time: '18:00', is_active: true });
    availabilityRulesStore.push({ id: `r2-${d}`, organization_id: ORG_ID, professional_id: 'b2222222', day_of_week: d, start_time: '09:00', end_time: '18:00', is_active: true });
  }

  return {
    customersStore,
    servicesStore,
    professionalsStore,
    appointmentsStore,
    availabilityRulesStore,
    conversationsStore: [],
    messagesStore: [],
    organizationsStore: [{
      id: ORG_ID, name: 'Studio Aurora', slug: 'studio-aurora', timezone: 'Europe/Rome', locale: 'it-IT', status: 'active',
      settings_json: { address: 'Via Roma 45, Milano (MI)', phone: '+39 02 1234567', working_hours: 'Lun-Ven 09:00 - 18:00' },
    }],
    membersStore: [{ organization_id: ORG_ID, user_id: 'user-admin-aurora', role: 'organization_owner', status: 'active' }],
    employeesStore: [{
      id: 'a1111111', organization_id: ORG_ID, name: 'Chiara', personality_summary: 'Receptionist',
      language: 'it-IT', communication_tone: 'cordial_empathic', avatar_placeholder_url: '/avatars/chiara.svg',
      enable_ai_humanization: false, is_default: true, status: 'active', settings_json: {},
    }],
    businessRulesStore: [{
      id: 'rule-1', organization_id: ORG_ID,
      cancellation_policy: { min_hours_notice: 24, fee_percent: 0, refund_policy: 'standard', no_show_note: '' },
      standard_messages: { welcome: '', confirmation: '', cancellation: '', out_of_hours: '' },
      response_rules: { auto_confirm_appointments: true, max_advance_booking_days: 30, min_advance_booking_hours: 2 },
    }],
    closuresStore: [
      { id: 'ex-1', organization_id: ORG_ID, start_at: '2026-08-14', end_at: '2026-08-14', reason: 'Chiusura estiva / Ferie', closure_type: 'holiday' },
    ],
  };
}

/**
 * Builds an update chain supporting multiple `.eq()` filters followed by
 * `.select().single()` or `.then()`. Applies an optional per-row guard
 * (e.g. GIST conflict check) that can veto the update.
 */
function makeUpdateChain(store: any[], payload: any, guard?: (target: any, updates: any) => { data: null; error: any } | null) {
  let targets = [...store];
  const chain = {
    eq: (col: string, val: any) => {
      if (col !== 'organization_id') targets = targets.filter((t) => t[col] === val);
      return chain;
    },
    select: () => ({
      single: async () => {
        if (targets.length === 0) return { data: null, error: { message: 'Not found' } };
        const veto = guard ? guard(targets[0], payload) : null;
        if (veto) return veto;
        Object.assign(targets[0], payload);
        return { data: targets[0], error: null };
      },
    }),
    then: (fn: any) => {
      if (targets.length === 0) return fn({ data: [], error: null });
      for (const t of targets) {
        const veto = guard ? guard(t, payload) : null;
        if (veto) return veto;
        Object.assign(t, payload);
      }
      return fn({ data: targets, error: null });
    },
  };
  return chain;
}

export function createMockClients(stores: MockStores): { userClient: SupabaseClient; adminClient: SupabaseClient } {
  const resolveJoins = (items: any[]) => items.map((item) => {
    const resolved = { ...item };
    if (item.customer_id) {
      const c = stores.customersStore.find((cust) => cust.id === item.customer_id);
      resolved.customers = c ? { first_name: c.first_name, last_name: c.last_name } : null;
    }
    if (item.service_id) {
      const s = stores.servicesStore.find((srv) => srv.id === item.service_id);
      resolved.services = s ? { name: s.name } : null;
    }
    if (item.professional_id) {
      const p = stores.professionalsStore.find((prof) => prof.id === item.professional_id);
      resolved.professionals = p ? { name: p.name } : null;
    }
    return resolved;
  });

  const makeChain = (storeRef: () => any[]) => {
    let currentData = [...storeRef()];
    const chain: any = {
      eq: (col: string, val: any) => {
        if (col === 'organization_id') return chain;
        if (col === 'phone_normalized' || col === 'phone') {
          const target = val ? String(val).replace(/\D/g, '') : '';
          currentData = currentData.filter((item) => {
            const pNorm = (item.phone_normalized || item.phone || '').replace(/\D/g, '');
            return pNorm === target || pNorm.includes(target) || target.includes(pNorm);
          });
          return chain;
        }
        currentData = currentData.filter((item) => item[col] === val);
        return chain;
      },
      neq: (col: string, val: any) => {
        currentData = currentData.filter((item) => item[col] !== val);
        return chain;
      },
      in: (col: string, vals: any[]) => {
        currentData = currentData.filter((item) => vals.includes(item[col]));
        return chain;
      },
      gte: (col: string, val: any) => {
        currentData = currentData.filter((item) => new Date(item[col]).getTime() >= new Date(val).getTime());
        return chain;
      },
      lte: (col: string, val: any) => {
        currentData = currentData.filter((item) => new Date(item[col]).getTime() <= new Date(val).getTime());
        return chain;
      },
      lt: (col: string, val: any) => {
        currentData = currentData.filter((item) => new Date(item[col]).getTime() < new Date(val).getTime());
        return chain;
      },
      order: (col: string, options?: { ascending?: boolean }) => {
        const asc = options?.ascending !== false;
        currentData.sort((a, b) => {
          const valA = a[col];
          const valB = b[col];
          if (typeof valA === 'string' && typeof valB === 'string') return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
          return asc ? (valA - valB) : (valB - valA);
        });
        return chain;
      },
      or: () => chain,
      limit: (n: number) => {
        currentData = currentData.slice(0, n);
        return chain;
      },
      select: () => chain,
      single: async () => {
        const resolved = resolveJoins(currentData);
        if (resolved.length === 0) return { data: null, error: { message: 'Not found', code: 'PGRST116' } };
        return { data: resolved[0], error: null };
      },
      maybeSingle: async () => {
        const resolved = resolveJoins(currentData);
        return { data: resolved[0] || null, error: null };
      },
      then: (fn: any) => fn({ data: resolveJoins(currentData), error: null }),
    };
    return chain;
  };

  const makeInsert = (storeRef: () => any[], transform: (item: any) => any) => (rec: any) => {
    const item = Array.isArray(rec) ? rec[0] : rec;
    const created = transform(item);
    storeRef().push(created);
    return { select: () => ({ single: async () => ({ data: created, error: null }) }) };
  };

  const userClient = {
    from: (table: string) => {
      if (table === 'customers') {
        return {
          select: () => makeChain(() => stores.customersStore),
          insert: makeInsert(() => stores.customersStore, (item) => ({
            id: `cust-${Date.now()}`,
            organization_id: item.organization_id || ORG_ID,
            first_name: item.first_name || item.firstName || '',
            last_name: item.last_name || item.lastName || '',
            phone_normalized: item.phone_normalized || item.phoneNormalized || item.phone || '',
            email: item.email || null,
            birth_date: item.birth_date || null,
            marketing_consent: item.marketing_consent ?? false,
            notes: item.notes || null,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })),
          update: (payload: any) => makeUpdateChain(stores.customersStore, payload, undefined),
        };
      }
      if (table === 'appointments') {
        const insertAppointment = (item: any) => {
          const startAt = item.start_at || item.startAt;
          const endAt = item.end_at || item.endAt;
          const professionalId = item.professional_id || item.professionalId;
          const conflict = stores.appointmentsStore.find((a) =>
            a.status !== 'cancelled'
            && a.professional_id === professionalId
            && new Date(a.start_at).getTime() < new Date(endAt).getTime()
            && new Date(a.end_at).getTime() > new Date(startAt).getTime(),
          );
          if (conflict) {
            const err = { code: '23P01', message: 'Exclusion constraint conflict: Double booking' };
            throw Object.assign(err, { __gistConflict: true });
          }
          return {
            id: `AG-${Date.now()}`,
            organization_id: item.organization_id || ORG_ID,
            customer_id: item.customer_id || item.customerId,
            service_id: item.service_id || item.serviceId,
            professional_id: professionalId,
            start_at: startAt,
            end_at: endAt,
            status: item.status || 'confirmed',
            notes: item.notes || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        };
        return {
          select: () => makeChain(() => stores.appointmentsStore),
          insert: (rec: any) => {
            const item = Array.isArray(rec) ? rec[0] : rec;
            try {
              const created = insertAppointment(item);
              stores.appointmentsStore.push(created);
              return { select: () => ({ single: async () => ({ data: created, error: null }) }) };
            } catch (err: any) {
              if (err.__gistConflict) {
                return { select: () => ({ single: async () => ({ data: null, error: { code: '23P01', message: err.message } }) }) };
              }
              throw err;
            }
          },
          update: (payload: any) => makeUpdateChain(stores.appointmentsStore, payload, (target, updates) => {
            if (updates.start_at) {
              const conflict = stores.appointmentsStore.find((a) =>
                a.id !== target.id
                && a.status !== 'cancelled'
                && a.professional_id === target.professional_id
                && new Date(a.start_at).getTime() < new Date(updates.end_at).getTime()
                && new Date(a.end_at).getTime() > new Date(updates.start_at).getTime(),
              );
              if (conflict) return { data: null, error: { code: '23P01', message: 'Exclusion constraint conflict: Double booking' } };
            }
            return null;
          }),
        };
      }
      if (table === 'conversations') {
        return {
          select: () => makeChain(() => stores.conversationsStore),
          insert: (rec: any) => makeInsert(() => stores.conversationsStore, (item) => ({
            id: `conv-${Date.now()}`,
            organization_id: item.organization_id || ORG_ID,
            customer_id: item.customer_id || null,
            channel: item.channel || 'webchat',
            status: item.status || 'active',
            workflow_state: item.workflow_state ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }))(rec),
          update: (payload: any) => makeUpdateChain(stores.conversationsStore, payload, undefined),
        };
      }
      if (table === 'messages') {
        return {
          select: () => makeChain(() => stores.messagesStore),
          insert: (rec: any) => makeInsert(() => stores.messagesStore, (item) => ({
            id: `msg-${Date.now()}`,
            organization_id: item.organization_id || ORG_ID,
            conversation_id: item.conversation_id || item.conversationId,
            role: item.role,
            content: item.content,
            metadata: item.metadata || {},
            created_at: new Date().toISOString(),
          }))(rec),
        };
      }
      if (table === 'services') return { select: () => makeChain(() => stores.servicesStore) };
      if (table === 'professionals') return { select: () => makeChain(() => stores.professionalsStore) };
      if (table === 'organizations') return { select: () => makeChain(() => stores.organizationsStore) };
      if (table === 'organization_members') return { select: () => makeChain(() => stores.membersStore) };
      if (table === 'digital_employees') return { select: () => makeChain(() => stores.employeesStore) };
      if (table === 'business_rules') {
        return {
          select: () => makeChain(() => stores.businessRulesStore),
          insert: (rec: any) => makeInsert(() => stores.businessRulesStore, (item) => ({
            id: `rule-${Date.now()}`,
            organization_id: item.organization_id || ORG_ID,
            cancellation_policy: item.cancellation_policy || {},
            standard_messages: item.standard_messages || {},
            response_rules: item.response_rules || {},
          }))(rec),
        };
      }
      if (table === 'availability_rules') return { select: () => makeChain(() => stores.availabilityRulesStore) };
      if (table === 'closures') return { select: () => makeChain(() => stores.closuresStore) };
      return { select: () => makeChain(() => []) };
    },
    auth: { getUser: async () => ({ data: { user: { id: 'user-admin-aurora' } }, error: null }) },
  } as unknown as SupabaseClient;

  // Admin client only needs insert chains (audit logs).
  const adminClient = {
    from: (table: string) => ({
      insert: (data: any) => ({ select: () => ({ single: async () => ({ data: { id: 'uuid-1', ...(Array.isArray(data) ? data[0] : data) }, error: null }) }) }),
    }),
  } as unknown as SupabaseClient;

  return { userClient, adminClient };
}
