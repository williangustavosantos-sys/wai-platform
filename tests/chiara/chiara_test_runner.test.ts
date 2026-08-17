import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { processConversationTurn } from '../../src/modules/conversation/conversation.service';
import { WebChatAdapter } from '../../src/modules/conversation/webchat_adapter';
import { Intent } from '../../src/modules/conversation/conversation.types';
import { CustomerLanguage } from '../../src/modules/conversation/customer_language';
import { SupabaseClient } from '@supabase/supabase-js';

// Activating Test Mode
interface TestCase {
  id: string;
  category: 'novo_agendamento' | 'cliente_existente' | 'seguranca_identidade' | 'agenda' | 'informacoes' | 'erros_linguagem';
  input: string;
  customerPhone: string;
  customerName: string;
  expected: {
    intent: string;
    keywords?: string[];
    forbiddenKeywords?: string[];
    identityCheckRequired?: boolean;
    shouldNotOverlap?: boolean;
  };
}

interface CurrentExpectation {
  intent: Intent;
  outcomeCode?: string;
  policyCode?: string;
  language?: CustomerLanguage;
  replyIncludes?: string[];
  noFalseCompletion?: boolean;
}

/**
 * The original 100-case corpus predates the structured P1 conversation layer.
 * These overrides keep its useful inputs while validating current contracts
 * instead of obsolete reply copy and legacy intent names.
 */
const CURRENT_EXPECTATIONS: Record<string, CurrentExpectation> = {
  '001': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '002': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'PROFESSIONAL_SELECTION_REQUIRED', noFalseCompletion: true },
  '006': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '008': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '009': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '010': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '011': { intent: 'CREATE_APPOINTMENT', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '012': { intent: 'COMPANY_INFORMATION', outcomeCode: 'COMPANY_INFORMATION_FOUND', language: 'it', noFalseCompletion: true },
  '013': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '014': { intent: 'COMPANY_INFORMATION', outcomeCode: 'COMPANY_INFORMATION_FOUND', noFalseCompletion: true },
  '015': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'AVAILABILITY_FOUND', noFalseCompletion: true },
  '016': { intent: 'CREATE_APPOINTMENT', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '021': { intent: 'RESCHEDULE_APPOINTMENT', outcomeCode: 'NEW_START_REQUIRED', noFalseCompletion: true },
  '022': { intent: 'CANCEL_APPOINTMENT', policyCode: 'CUSTOMER_IDENTITY_CONFLICT', noFalseCompletion: true },
  '028': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '029': { intent: 'RESCHEDULE_APPOINTMENT', outcomeCode: 'APPOINTMENT_NOT_FOUND', noFalseCompletion: true },
  '030': { intent: 'CUSTOMER_INFORMATION', outcomeCode: 'CUSTOMER_APPOINTMENTS_FOUND', replyIncludes: ['amministrativo'], noFalseCompletion: true },
  '031': { intent: 'CUSTOMER_INFORMATION', outcomeCode: 'CUSTOMER_NOT_FOUND', replyIncludes: ['verifica'], noFalseCompletion: true },
  '033': { intent: 'CUSTOMER_INFORMATION', outcomeCode: 'CUSTOMER_FOUND', replyIncludes: ['verifica'], noFalseCompletion: true },
  '034': { intent: 'COMPANY_INFORMATION', policyCode: 'SENSITIVE_REQUEST_DENIED', noFalseCompletion: true },
  '035': { intent: 'CANCEL_APPOINTMENT', policyCode: 'CUSTOMER_IDENTITY_CONFLICT', noFalseCompletion: true },
  '037': { intent: 'CHECK_AVAILABILITY', policyCode: 'CUSTOMER_IDENTITY_CONFLICT', noFalseCompletion: true },
  '041': { intent: 'COMPANY_INFORMATION', outcomeCode: 'COMPANY_INFORMATION_FOUND', noFalseCompletion: true },
  '047': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '048': { intent: 'COMPANY_INFORMATION', policyCode: 'SENSITIVE_REQUEST_DENIED', noFalseCompletion: true },
  '049': { intent: 'COMPANY_INFORMATION', policyCode: 'SENSITIVE_REQUEST_DENIED', noFalseCompletion: true },
  '053': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '055': { intent: 'COMPANY_INFORMATION', outcomeCode: 'COMPANY_INFORMATION_FOUND', noFalseCompletion: true },
  '056': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '057': { intent: 'CREATE_APPOINTMENT', outcomeCode: 'SLOT_OCCUPIED', noFalseCompletion: true },
  '059': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '060': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '062': { intent: 'CREATE_APPOINTMENT', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '063': { intent: 'COMPANY_INFORMATION', outcomeCode: 'COMPANY_INFORMATION_FOUND', noFalseCompletion: true },
  '064': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '065': { intent: 'COMPANY_INFORMATION', outcomeCode: 'COMPANY_INFORMATION_FOUND', noFalseCompletion: true },
  '068': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '069': { intent: 'COMPANY_INFORMATION', outcomeCode: 'COMPANY_INFORMATION_FOUND', noFalseCompletion: true },
  '070': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '078': { intent: 'COMPANY_INFORMATION', outcomeCode: 'COMPANY_INFORMATION_FOUND', noFalseCompletion: true },
  '079': { intent: 'COMPANY_INFORMATION', outcomeCode: 'COMPANY_INFORMATION_FOUND', noFalseCompletion: true },
  '080': { intent: 'COMPANY_INFORMATION', outcomeCode: 'COMPANY_INFORMATION_FOUND', noFalseCompletion: true },
  '082': { intent: 'COMPANY_INFORMATION', outcomeCode: 'COMPANY_INFORMATION_FOUND', noFalseCompletion: true },
  '085': { intent: 'COMPANY_INFORMATION', outcomeCode: 'COMPANY_INFORMATION_FOUND', noFalseCompletion: true },
  '088': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '089': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '090': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '091': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', language: 'en', noFalseCompletion: true },
  '092': { intent: 'COMPANY_INFORMATION', policyCode: 'CONFLICTING_ACTIONS', replyIncludes: ['una sola operazione'], noFalseCompletion: true },
  '095': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '097': { intent: 'CUSTOMER_INFORMATION', outcomeCode: 'CUSTOMER_FOUND', noFalseCompletion: true },
  '087': { intent: 'CHECK_AVAILABILITY', outcomeCode: 'SERVICE_SELECTION_REQUIRED', noFalseCompletion: true },
  '099': { intent: 'COMPANY_INFORMATION', outcomeCode: 'COMPANY_INFORMATION_FOUND', noFalseCompletion: true },
  '100': { intent: 'COMPANY_INFORMATION', outcomeCode: 'COMPANY_INFORMATION_FOUND', noFalseCompletion: true },
};

describe('Bateria Completa de Testes da Chiara (Studio Aurora - v0.1.1)', () => {
  let mockUserClient: SupabaseClient;
  let mockAdminClient: SupabaseClient;
  let customersStore: any[];
  let appointmentsStore: any[];
  let conversationsStore: any[];
  let messagesStore: any[];

  const testCasesPath = path.join(__dirname, 'chiara_cases.json');
  const testCases: TestCase[] = JSON.parse(fs.readFileSync(testCasesPath, 'utf8'));

  const resultsSummary: Record<string, { pass: number; total: number; errors: string[] }> = {
    novo_agendamento: { pass: 0, total: 0, errors: [] },
    cliente_existente: { pass: 0, total: 0, errors: [] },
    seguranca_identidade: { pass: 0, total: 0, errors: [] },
    agenda: { pass: 0, total: 0, errors: [] },
    informacoes: { pass: 0, total: 0, errors: [] },
    erros_linguagem: { pass: 0, total: 0, errors: [] }
  };

  beforeEach(() => {
    // Controlled clock: the Chiara corpus (fixture dates in August 2026) must be
    // deterministic regardless of the real wall clock. The min-advance cutoff
    // (2h) and relative dates ("oggi"/"domani") are computed against this
    // instant, so the morning slots of the fixture dates are always offerable.
    process.env.WAI_REFERENCE_TIME = '2026-08-17T07:00:00+02:00';
    // Reset Fictitious Store (10 Customers & 32 Appointments)
    customersStore = [
      { id: 'd0000001', organization_id: '11111111-1111-1111-1111-111111111111', status: 'active', first_name: 'Marco', last_name: 'Rossi', phone_normalized: '+393401234567', email: 'marco.rossi@example.it' },
      { id: 'd0000002', organization_id: '11111111-1111-1111-1111-111111111111', status: 'active', first_name: 'Marco', last_name: 'Russo', phone_normalized: '+393407654321', email: 'marco.russo@example.it' },
      { id: 'd0000003', organization_id: '11111111-1111-1111-1111-111111111111', status: 'active', first_name: 'Sofia', last_name: 'Rossi', phone_normalized: '+393471122334', email: 'sofia.rossi@example.it' },
      { id: 'd0000004', organization_id: '11111111-1111-1111-1111-111111111111', status: 'active', first_name: 'Matteo', last_name: 'Corti', phone_normalized: '+393359988776', email: 'matteo.corti@example.it' },
      { id: 'd0000005', organization_id: '11111111-1111-1111-1111-111111111111', status: 'active', first_name: 'Matteo', last_name: 'Conti', phone_normalized: '+393385544332', email: 'matteo.conti@example.it' },
      { id: 'd0000006', organization_id: '11111111-1111-1111-1111-111111111111', status: 'active', first_name: 'Giulia', last_name: 'Bianchi', phone_normalized: '+393204455667', email: 'giulia.bianchi@example.it' },
      { id: 'd0000007', organization_id: '11111111-1111-1111-1111-111111111111', status: 'active', first_name: 'Luca', last_name: 'Ferrari', phone_normalized: '+393338877665', email: 'luca.ferrari@example.it' },
      { id: 'd0000008', organization_id: '11111111-1111-1111-1111-111111111111', status: 'active', first_name: 'Elena', last_name: 'Esposito', phone_normalized: '+393496677889', email: 'elena.esposito@example.it' },
      { id: 'd0000009', organization_id: '11111111-1111-1111-1111-111111111111', status: 'active', first_name: 'Alessandro', last_name: 'Marino', phone_normalized: '+393392233445', email: 'alessandro.marino@example.it' },
      { id: 'd0000010', organization_id: '11111111-1111-1111-1111-111111111111', status: 'active', first_name: 'Francesca', last_name: 'Romano', phone_normalized: '+393289900112', email: 'francesca.romano@example.it' }
    ];

    appointmentsStore = [
      { id: 'AG-101', customer_id: 'd0000001', professional_id: 'b1111111', service_id: 'c2222222', start_at: '2026-08-03T09:00:00+02:00', end_at: '2026-08-03T10:15:00+02:00', status: 'confirmed' },
      { id: 'AG-107', customer_id: 'd0000001', professional_id: 'b1111111', service_id: 'c2222222', start_at: '2026-08-10T09:00:00+02:00', end_at: '2026-08-10T10:15:00+02:00', status: 'confirmed' },
      { id: 'AG-108', customer_id: 'd0000005', professional_id: 'b1111111', service_id: 'c1111111', start_at: '2026-08-10T10:30:00+02:00', end_at: '2026-08-10T11:30:00+02:00', status: 'confirmed' },
      { id: 'AG-109', customer_id: 'd0000008', professional_id: 'b1111111', service_id: 'c2222222', start_at: '2026-08-10T11:45:00+02:00', end_at: '2026-08-10T13:00:00+02:00', status: 'confirmed' },
      { id: 'AG-110', customer_id: 'd0000006', professional_id: 'b2222222', service_id: 'c1111111', start_at: '2026-08-10T14:30:00+02:00', end_at: '2026-08-10T15:30:00+02:00', status: 'confirmed' },
      { id: 'AG-112', customer_id: 'd0000002', professional_id: 'b2222222', service_id: 'c1111111', start_at: '2026-08-11T09:30:00+02:00', end_at: '2026-08-11T10:30:00+02:00', status: 'confirmed' },
      { id: 'AG-113', customer_id: 'd0000003', professional_id: 'b2222222', service_id: 'c2222222', start_at: '2026-08-11T11:00:00+02:00', end_at: '2026-08-11T12:15:00+02:00', status: 'confirmed' },
      { id: 'AG-118', customer_id: 'd0000008', professional_id: 'b2222222', service_id: 'c1111111', start_at: '2026-08-17T09:00:00+02:00', end_at: '2026-08-17T10:00:00+02:00', status: 'confirmed' },
      { id: 'AG-119', customer_id: 'd0000001', professional_id: 'b1111111', service_id: 'c2222222', start_at: '2026-08-17T10:00:00+02:00', end_at: '2026-08-17T11:15:00+02:00', status: 'confirmed' },
      { id: 'AG-120', customer_id: 'd0000003', professional_id: 'b1111111', service_id: 'c1111111', start_at: '2026-08-17T11:30:00+02:00', end_at: '2026-08-17T12:30:00+02:00', status: 'confirmed' },
      { id: 'AG-128', customer_id: 'd0000003', professional_id: 'b2222222', service_id: 'c2222222', start_at: '2026-08-26T09:15:00+02:00', end_at: '2026-08-26T10:30:00+02:00', status: 'cancelled' },
      { id: 'AG-132', customer_id: 'd0000005', professional_id: 'b1111111', service_id: 'c2222222', start_at: '2026-08-31T11:30:00+02:00', end_at: '2026-08-31T12:45:00+02:00', status: 'pending' }
    ];

    conversationsStore = [];
    messagesStore = [];

    mockAdminClient = {
      from: (table: string) => ({
        insert: (data: any) => ({
          select: () => ({ single: async () => ({ data: { id: 'uuid-1', ...(Array.isArray(data) ? data[0] : data) }, error: null }) })
        })
      })
    } as unknown as SupabaseClient;

    mockUserClient = {
      from: (table: string) => {
        const createQueryChain = (store: any[]) => {
          let currentData = [...store];
          const chain: any = {
            eq: (col: string, val: any) => {
              if (col === 'organization_id') return chain;
              if (col === 'phone_normalized' || col === 'phone') {
                const target = val ? String(val).replace(/\D/g, '') : '';
                currentData = currentData.filter(item => {
                  const pNorm = (item.phone_normalized || item.phone || '').replace(/\D/g, '');
                  return pNorm === target || pNorm.includes(target) || target.includes(pNorm);
                });
              } else if (col === 'id') {
                currentData = currentData.filter(item => item.id === val);
              } else {
                currentData = currentData.filter(item => item[col] === val);
              }
              return chain;
            },
            neq: (col: string, val: any) => {
              currentData = currentData.filter(item => item[col] !== val);
              return chain;
            },
            in: (col: string, vals: any[]) => {
              currentData = currentData.filter(item => vals.includes(item[col]));
              return chain;
            },
            gte: (col: string, val: any) => {
              currentData = currentData.filter(item => new Date(item[col]) >= new Date(val));
              return chain;
            },
            lte: (col: string, val: any) => {
              currentData = currentData.filter(item => new Date(item[col]) <= new Date(val));
              return chain;
            },
            order: (col: string, options?: { ascending?: boolean }) => {
              const asc = options?.ascending !== false;
              currentData.sort((a, b) => {
                const valA = a[col];
                const valB = b[col];
                if (typeof valA === 'string' && typeof valB === 'string') {
                  return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
                }
                return asc ? (valA - valB) : (valB - valA);
              });
              return chain;
            },
            limit: (n: number) => {
              currentData = currentData.slice(0, n);
              return chain;
            },
            select: () => chain,
            single: async () => {
              const resolved = resolveJoins(currentData);
              if (resolved.length === 0) {
                return { data: null, error: { message: 'Not found', code: 'PGRST116' } };
              }
              return { data: resolved[0], error: null };
            },
            maybeSingle: async () => {
              const resolved = resolveJoins(currentData);
              return { data: resolved[0] || null, error: null };
            },
            then: (fn: any) => {
              const resolved = resolveJoins(currentData);
              return fn({ data: resolved, error: null });
            }
          };
          return chain;
        };

        const resolveJoins = (items: any[]) => {
          return items.map(item => {
            const resolved = { ...item };
            if (item.customer_id) {
              const c = customersStore.find(cust => cust.id === item.customer_id);
              resolved.customers = c ? { first_name: c.first_name, last_name: c.last_name } : null;
            }
            if (item.service_id) {
              const srvs = [
                { id: 'c1111111', name: 'Consulenza Fiscale Iniziale' },
                { id: 'c2222222', name: 'Revisione Bilancio Annuale' }
              ];
              const s = srvs.find(srv => srv.id === item.service_id);
              resolved.services = s ? { name: s.name } : null;
            }
            if (item.professional_id) {
              const profs = [
                { id: 'b1111111', name: 'Dott. Marco Rossi' },
                { id: 'b2222222', name: 'Dott.ssa Sofia Bianchi' }
              ];
              const p = profs.find(prof => prof.id === item.professional_id);
              resolved.professionals = p ? { name: p.name } : null;
            }
            return resolved;
          });
        };

        if (table === 'organizations') {
          const orgData = { id: '11111111-1111-1111-1111-111111111111', name: 'Studio Aurora', slug: 'studio-aurora', status: 'active', settings_json: { address: 'Via Roma 45, Milano (MI)', phone: '+39 02 1234567', working_hours: 'Lun-Ven 09:00 - 18:00' } };
          return { select: () => createQueryChain([orgData]) };
        }
        if (table === 'organization_members') {
          const memData = { role: 'organization_owner', status: 'active', user_id: 'user-admin-aurora', organization_id: '11111111-1111-1111-1111-111111111111' };
          return { select: () => createQueryChain([memData]) };
        }
        if (table === 'digital_employees') {
          const empData = { id: 'a1111111', name: 'Chiara', language: 'it-IT', communication_tone: 'cordial_empathic', status: 'active' };
          return { select: () => createQueryChain([empData]) };
        }
        if (table === 'business_rules') {
          const ruleData = {
            id: 'rule-1',
            organization_id: '11111111-1111-1111-1111-111111111111',
            cancellation_policy: { min_hours_notice: 24, fee_percent: 0, refund_policy: 'standard', no_show_note: '' },
            standard_messages: { welcome: '', confirmation: '', cancellation: '', out_of_hours: '' },
            response_rules: { auto_confirm_appointments: true, max_advance_booking_days: 30, min_advance_booking_hours: 2 }
          };
          return {
            select: () => createQueryChain([ruleData]),
            insert: (rec: any) => ({ select: () => ({ single: async () => ({ data: ruleData, error: null }) }) })
          };
        }
        if (table === 'availability_rules') {
          const rules: any[] = [];
          for (const d of [1, 2, 3, 4, 5]) {
            rules.push({ id: `r1-${d}`, professional_id: 'b1111111', day_of_week: d, start_time: '09:00', end_time: '18:00', is_active: true, organization_id: '11111111-1111-1111-1111-111111111111' });
            rules.push({ id: `r2-${d}`, professional_id: 'b2222222', day_of_week: d, start_time: '09:00', end_time: '18:00', is_active: true, organization_id: '11111111-1111-1111-1111-111111111111' });
          }
          return { select: () => createQueryChain(rules) };
        }
        if (table === 'closures') {
          const excs = [
            { id: 'ex-1', start_at: '2026-08-14', end_at: '2026-08-14', reason: 'Chiusura estiva / Ferie', organization_id: '11111111-1111-1111-1111-111111111111' }
          ];
          return { select: () => createQueryChain(excs) };
        }
        if (table === 'customers') {
          return {
            select: () => createQueryChain(customersStore),
            insert: (rec: any) => {
              const item = Array.isArray(rec) ? rec[0] : rec;
              const newCust = {
                id: `cust-${Date.now()}`,
                first_name: item.first_name || item.firstName || '',
                last_name: item.last_name || item.lastName || '',
                phone_normalized: item.phone_normalized || item.phoneNormalized || item.phone || '',
                email: item.email || null,
                birth_date: item.birth_date || null,
                marketing_consent: item.marketing_consent ?? false,
                notes: item.notes || null,
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              customersStore.push(newCust);
              return { select: () => ({ single: async () => ({ data: newCust, error: null }) }) };
            },
            update: (updatePayload: any) => {
              let queryData = [...customersStore];
              const updateChain = {
                eq: (col: string, val: any) => {
                  if (col === 'organization_id') return updateChain;
                  queryData = queryData.filter(c => c[col] === val);
                  return updateChain;
                },
                select: () => ({
                  single: async () => {
                    if (queryData.length > 0) {
                      Object.assign(queryData[0], updatePayload);
                      return { data: queryData[0], error: null };
                    }
                    return { data: null, error: { message: 'Not found' } };
                  }
                }),
                then: (fn: any) => {
                  queryData.forEach(c => Object.assign(c, updatePayload));
                  return fn({ data: queryData, error: null });
                }
              };
              return updateChain;
            }
          };
        }
        if (table === 'services') {
          const srvs = [
            { id: 'c1111111', name: 'Consulenza Fiscale Iniziale', duration_minutes: 45, price_cents: 12000, price: 12000, buffer_after_minutes: 15, status: 'active' },
            { id: 'c2222222', name: 'Revisione Bilancio Annuale', duration_minutes: 60, price_cents: 18000, price: 18000, buffer_after_minutes: 15, status: 'active' }
          ];
          return { select: () => createQueryChain(srvs) };
        }
        if (table === 'professionals') {
          const profs = [
            { id: 'b1111111', name: 'Dott. Marco Rossi', title: 'Titolare / Commercialista', phone: '+39021234567', phone_normalized: '+39021234567', status: 'active' },
            { id: 'b2222222', name: 'Dott.ssa Sofia Bianchi', title: 'Esperta Contabile', phone: '+39027654321', phone_normalized: '+39027654321', status: 'active' }
          ];
          return { select: () => createQueryChain(profs) };
        }
        if (table === 'appointments') {
          return {
            select: () => createQueryChain(appointmentsStore),
            insert: (rec: any) => {
              const item = Array.isArray(rec) ? rec[0] : rec;
              const start_at = item.start_at || item.startAt;
              const end_at = item.end_at || item.endAt;
              const customer_id = item.customer_id || item.customerId;
              const service_id = item.service_id || item.serviceId;
              const professional_id = item.professional_id || item.professionalId;
              
              // Simulate GIST exclusion overlap check (Double booking check)
              const conflict = appointmentsStore.find(a => 
                a.status !== 'cancelled' &&
                a.professional_id === professional_id &&
                new Date(a.start_at) < new Date(end_at) &&
                new Date(a.end_at) > new Date(start_at)
              );

              if (conflict) {
                // Return overlapping exclusion error matching Postgres 23P01
                const err = { code: '23P01', message: 'Exclusion constraint conflict: Double booking' };
                return { select: () => ({ single: async () => ({ data: null, error: err }) }) };
              }

              const newApp = {
                id: `AG-${Date.now()}`,
                organization_id: item.organization_id || item.organizationId || '11111111-1111-1111-1111-111111111111',
                customer_id,
                service_id,
                professional_id,
                start_at,
                end_at,
                status: item.status || 'confirmed',
                notes: item.notes || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              appointmentsStore.push(newApp);
              return { select: () => ({ single: async () => ({ data: newApp, error: null }) }) };
            },
            update: (updatePayload: any) => {
              let queryData = [...appointmentsStore];
              const updateChain = {
                eq: (col: string, val: any) => {
                  if (col === 'organization_id') return updateChain;
                  queryData = queryData.filter(a => a[col] === val);
                  return updateChain;
                },
                select: () => ({
                  single: async () => {
                    if (queryData.length > 0) {
                      // Exclusion check for updates (rescheduling conflicts)
                      if (updatePayload.start_at) {
                        const newStart = updatePayload.start_at;
                        const newEnd = updatePayload.end_at;
                        const conflict = appointmentsStore.find(a =>
                          a.id !== queryData[0].id &&
                          a.status !== 'cancelled' &&
                          a.professional_id === queryData[0].professional_id &&
                          new Date(a.start_at) < new Date(newEnd) &&
                          new Date(a.end_at) > new Date(newStart)
                        );
                        if (conflict) {
                          return { data: null, error: { code: '23P01', message: 'Exclusion constraint conflict: Double booking' } };
                        }
                      }
                      Object.assign(queryData[0], updatePayload);
                      return { data: queryData[0], error: null };
                    }
                    return { data: null, error: { message: 'Not found' } };
                  }
                }),
                then: (fn: any) => {
                  queryData.forEach(a => Object.assign(a, updatePayload));
                  return fn({ data: queryData, error: null });
                }
              };
              return updateChain;
            }
          };
        }
        if (table === 'conversations') {
          return {
            select: () => createQueryChain(conversationsStore),
            insert: (rec: any) => {
              const item = Array.isArray(rec) ? rec[0] : rec;
              const newConv = { ...item, id: `conv-${Date.now()}` };
              conversationsStore.push(newConv);
              return { select: () => ({ single: async () => ({ data: newConv, error: null }) }) };
            }
          };
        }
        if (table === 'messages') {
          return {
            select: () => createQueryChain(messagesStore),
            insert: (rec: any) => {
              const item = Array.isArray(rec) ? rec[0] : rec;
              const newMsg = { ...item, id: `msg-${Date.now()}` };
              messagesStore.push(newMsg);
              return { select: () => ({ single: async () => ({ data: newMsg, error: null }) }) };
            }
          };
        }
        return { select: () => createQueryChain([]) };
      }
    } as unknown as SupabaseClient;
  });

  for (const tc of testCases) {
    it(`[ID ${tc.id}] [${tc.category.toUpperCase()}] ${tc.input.slice(0, 45)}...`, async () => {
      const cat = tc.category;
      resultsSummary[cat].total += 1;

      const adapter = new WebChatAdapter();
      const payload = {
        conversationId: `conv-tc-${tc.id}`,
        text: tc.input,
        customerPhone: tc.customerPhone
      };
      conversationsStore.push({
        id: payload.conversationId,
        organization_id: '11111111-1111-1111-1111-111111111111',
        customer_id: null,
        channel: 'webchat',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      try {
        const result = await processConversationTurn(
          mockUserClient,
          mockAdminClient,
          'user-admin-aurora',
          'studio-aurora',
          adapter,
          payload,
          `corr-${tc.id}`
        );

        // Verification 1: Intention / Response
        expect(result.replyText).toBeDefined();
        const metadata = result.metadata as {
          intent: Intent;
          toolCalls: Array<{ result?: { code?: string } }>;
          policyDecision?: { code?: string };
          customerLanguage?: CustomerLanguage;
        } | undefined;
        expect(metadata).toBeDefined();
        if (!metadata) throw new Error('Conversation metadata is required by the Chiara regression contract.');

        const currentExpectation = CURRENT_EXPECTATIONS[tc.id];
        const toolCodes = metadata.toolCalls
          .map((call) => call.result?.code)
          .filter((code): code is string => typeof code === 'string');

        // Current P1 contracts take precedence over obsolete legacy copy checks.
        if (currentExpectation) {
          expect(metadata.intent).toBe(currentExpectation.intent);
          if (currentExpectation.outcomeCode) {
            expect(toolCodes).toContain(currentExpectation.outcomeCode);
          }
          if (currentExpectation.policyCode) {
            expect(metadata.policyDecision?.code).toBe(currentExpectation.policyCode);
          }
          if (currentExpectation.language) {
            expect(metadata.customerLanguage).toBe(currentExpectation.language);
          }
          for (const expectedCopy of currentExpectation.replyIncludes || []) {
            expect(result.replyText.toLowerCase()).toContain(expectedCopy.toLowerCase());
          }
          if (currentExpectation.noFalseCompletion) {
            const replyLower = result.replyText.toLowerCase();
            expect(replyLower).not.toMatch(/(?:prenotazione|booking|reserva) (?:e |è |is |esta |está )?(?:confermat|confirmed|confirmada)/);
            expect(replyLower).not.toMatch(/(?:richiesta|request|pedido|operazione|operation|operacao|operação) (?:e |è |is |foi )?(?:completat|completed|concluid|concluíd)/);
          }
        // Verification 2: unchanged legacy cases retain their historical copy contract.
        } else if (tc.expected.keywords && tc.expected.keywords.length > 0) {
          const replyLower = result.replyText.toLowerCase();
          const hasMatch = tc.expected.keywords.some(kw => replyLower.includes(kw.toLowerCase()));
          if (!hasMatch) {
            // Check if keywords are satisfied in reply or turn metadata
            const isMatchMetadata = tc.expected.keywords.some(kw => JSON.stringify(metadata).toLowerCase().includes(kw.toLowerCase()));
            if (!(hasMatch || isMatchMetadata)) {
              console.log(
                `FAIL ID ${tc.id}: Input=${JSON.stringify(tc.input)} Reply=${JSON.stringify(result.replyText)}`
                + ` Intent=${metadata.intent} ToolCodes=${JSON.stringify(toolCodes)}`
                + ` Policy=${metadata.policyDecision?.code || 'none'}`
                + ` ToolCalls=${JSON.stringify(metadata.toolCalls)}`
                + ` Keywords=${JSON.stringify(tc.expected.keywords)}`,
              );
            }
            expect(hasMatch || isMatchMetadata).toBe(true);
          }
        }

        // Verification 3: Forbidden Keywords (if specified)
        if (tc.expected.forbiddenKeywords && tc.expected.forbiddenKeywords.length > 0) {
          const replyLower = result.replyText.toLowerCase();
          for (const forbidden of tc.expected.forbiddenKeywords) {
            expect(replyLower).not.toContain(forbidden.toLowerCase());
          }
        }

        resultsSummary[cat].pass += 1;
      } catch (err: any) {
        resultsSummary[cat].errors.push(`Test ID ${tc.id}: ${err.message || String(err)}`);
        throw err;
      }
    });
  }

  afterAll(() => {
    delete process.env.WAI_REFERENCE_TIME;
    const executedTests = Object.values(resultsSummary).reduce((total, category) => total + category.total, 0);
    if (executedTests !== testCases.length) return;
    const passedTests = Object.values(resultsSummary).reduce((total, category) => total + category.pass, 0);
    console.log(`Legacy Chiara corpus: ${passedTests}/${executedTests} passed.`);
  });
});
