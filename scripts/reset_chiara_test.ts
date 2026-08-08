import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const QA_PROJECT_REF = 'crlftiwjpplrqidjvpaj';
const QA_ORGANIZATION_ID = '11111111-1111-1111-1111-111111111111';
const QA_ORGANIZATION_SLUG = 'studio-aurora';

const RESET_ORDER = [
  'messages',
  'conversations',
  'appointment_events',
  'appointments',
  'audit_logs',
  'closures',
  'customers',
  'availability_rules',
  'professional_services',
  'services',
  'professionals',
  'business_rules',
  'digital_employees',
] as const;

const SEED_ORDER = [
  'digital_employees',
  'professionals',
  'services',
  'professional_services',
  'availability_rules',
  'customers',
  'business_rules',
  'appointments',
] as const;

function parseSqlValue(rawValue: string): unknown {
  const raw = rawValue.trim();
  const isJson = /::jsonb$/i.test(raw);
  const withoutCast = raw.replace(/::jsonb$/i, '').trim();

  if (withoutCast.toUpperCase() === 'NULL') return null;
  if (withoutCast.toLowerCase() === 'true') return true;
  if (withoutCast.toLowerCase() === 'false') return false;
  if (/^-?\d+$/.test(withoutCast)) return Number(withoutCast);

  if (withoutCast.startsWith("'") && withoutCast.endsWith("'")) {
    const value = withoutCast.slice(1, -1).replace(/''/g, "'");
    return isJson ? JSON.parse(value) : value;
  }

  throw new Error(`Unsupported SQL seed value: ${raw}`);
}

function splitTuple(tuple: string): string[] {
  const values: string[] = [];
  let current = '';
  let inString = false;

  for (let index = 0; index < tuple.length; index += 1) {
    const char = tuple[index];
    const next = tuple[index + 1];

    if (char === "'" && inString && next === "'") {
      current += "''";
      index += 1;
      continue;
    }
    if (char === "'") inString = !inString;

    if (char === ',' && !inString) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

function parseSeedRows(sql: string, table: string): Record<string, unknown>[] {
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const statement = new RegExp(
    `INSERT\\s+INTO\\s+public\\.${escapedTable}\\s*\\(([^)]+)\\)\\s*VALUES\\s*([\\s\\S]*?)\\s*ON\\s+CONFLICT`,
    'i',
  ).exec(sql);

  if (!statement) throw new Error(`Seed statement not found for public.${table}`);

  const columns = statement[1].split(',').map((column) => column.trim());
  const valuesBlock = statement[2];
  const tuples: string[] = [];
  let depth = 0;
  let inString = false;
  let start = -1;

  for (let index = 0; index < valuesBlock.length; index += 1) {
    const char = valuesBlock[index];
    const next = valuesBlock[index + 1];

    if (char === "'" && inString && next === "'") {
      index += 1;
      continue;
    }
    if (char === "'") inString = !inString;
    if (inString) continue;

    if (char === '(') {
      if (depth === 0) start = index + 1;
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0 && start >= 0) tuples.push(valuesBlock.slice(start, index));
    }
  }

  return tuples.map((tuple) => {
    const values = splitTuple(tuple).map(parseSqlValue);
    if (values.length !== columns.length) {
      throw new Error(`Column/value mismatch for public.${table}`);
    }
    return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
  });
}

function loadQaEnvironment() {
  const url = process.env.CHIARA_QA_SUPABASE_URL;
  const serviceRoleKey = process.env.CHIARA_QA_SUPABASE_SERVICE_ROLE_KEY;
  const allowWrites = process.env.CHIARA_QA_ALLOW_WRITES;

  if (!url || !serviceRoleKey) {
    throw new Error('CHIARA_QA_SUPABASE_URL and CHIARA_QA_SUPABASE_SERVICE_ROLE_KEY are required');
  }
  if (allowWrites !== 'true') {
    throw new Error('CHIARA_QA_ALLOW_WRITES must be exactly true');
  }

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== `${QA_PROJECT_REF}.supabase.co`) {
    throw new Error(`Refusing reset: URL must target the dedicated QA project ${QA_PROJECT_REF}`);
  }

  return { url, serviceRoleKey };
}

async function assertNoError(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

export async function resetChiaraTestEnvironment() {
  const { url, serviceRoleKey } = loadQaEnvironment();
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('id, slug, name')
    .eq('id', QA_ORGANIZATION_ID)
    .eq('slug', QA_ORGANIZATION_SLUG)
    .single();
  await assertNoError('QA organization safety check', organizationError);
  if (!organization || organization.name !== 'Studio Aurora') {
    throw new Error('Refusing reset: dedicated QA organization identity check failed');
  }

  for (const table of RESET_ORDER) {
    const { error } = await supabase.from(table).delete().eq('organization_id', QA_ORGANIZATION_ID);
    await assertNoError(`Delete public.${table}`, error);
  }

  const seedPath = path.join(process.cwd(), 'supabase/seed_chiara_test.sql');
  const seedSql = fs.readFileSync(seedPath, 'utf8');

  for (const table of SEED_ORDER) {
    const rows = parseSeedRows(seedSql, table);
    if (rows.some((row) => row.organization_id !== QA_ORGANIZATION_ID)) {
      throw new Error(`Refusing seed: public.${table} contains a non-QA organization`);
    }
    const { error } = await supabase.from(table).insert(rows);
    await assertNoError(`Seed public.${table}`, error);
  }

  const [{ count: customerCount, error: customerError }, { count: appointmentCount, error: appointmentError }] =
    await Promise.all([
      supabase.from('customers').select('*', { count: 'exact', head: true }).eq('organization_id', QA_ORGANIZATION_ID),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('organization_id', QA_ORGANIZATION_ID),
    ]);
  await assertNoError('Verify customers', customerError);
  await assertNoError('Verify appointments', appointmentError);

  if (customerCount !== 10 || appointmentCount !== 32) {
    throw new Error(`Reset verification failed: customers=${customerCount}, appointments=${appointmentCount}`);
  }

  console.log('Chiara QA reset complete: Studio Aurora, 10 customers, 32 appointments.');
  return { success: true, organizationId: QA_ORGANIZATION_ID, customerCount, appointmentCount };
}

if (require.main === module) {
  resetChiaraTestEnvironment().catch((error) => {
    console.error('Chiara QA reset failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
