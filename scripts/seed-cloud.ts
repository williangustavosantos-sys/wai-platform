import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Carregar .env.local caso as variáveis de ambiente não estejam no process.env
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...rest] = trimmed.split('=');
      const val = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
      if (key && !process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ ERRO: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios no .env.local ou process.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getOrCreateUser(email: string): Promise<string> {
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;

  const existing = usersData.users.find(u => u.email === email);
  if (existing) {
    console.log(`✅ Usuário ${email} já existe na Cloud -> UUID: ${existing.id}`);
    return existing.id;
  }

  console.log(`⏳ Criando usuário via Auth Admin API: ${email}...`);
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: 'WaiCloudDev2026!',
    email_confirm: true,
    user_metadata: {},
  });

  if (error || !data.user) {
    throw error || new Error(`Falha ao criar usuário ${email}`);
  }

  console.log(`✨ Usuário criado com sucesso -> UUID: ${data.user.id}`);
  return data.user.id;
}

async function runCloudSeed() {
  console.log('🚀 Iniciando Seed Remoto no Supabase Cloud...');

  // 1. Criar usuários oficiais sem INSERT direto na auth.users
  const adminId = await getOrCreateUser('admin@wai.local');
  const ownerAId = await getOrCreateUser('owner-a@wai.local');
  const ownerBId = await getOrCreateUser('owner-b@wai.local');

  // 2. Popular platform_users com os UUIDs oficiais gerados pela Cloud
  console.log('📦 Sincronizando platform_users...');
  const { error: pUserErr } = await supabase.from('platform_users').upsert([
    { user_id: adminId, global_role: 'wai_admin', status: 'active' },
    { user_id: ownerAId, global_role: 'standard', status: 'active' },
    { user_id: ownerBId, global_role: 'standard', status: 'active' },
  ], { onConflict: 'user_id' });
  if (pUserErr) throw pUserErr;

  // 3. Criar Orgaizações: Studio Aurora e Studio Brera
  const orgAuroraId = '11111111-1111-1111-1111-111111111111';
  const orgBreraId = '22222222-2222-2222-2222-222222222222';
  console.log('🏢 Sincronizando organizações Studio Aurora e Studio Brera...');
  const { error: orgErr } = await supabase.from('organizations').upsert([
    { id: orgAuroraId, name: 'Studio Aurora', slug: 'studio-aurora', timezone: 'Europe/Rome', locale: 'it-IT', status: 'active', settings_json: { display_name: 'Studio Aurora', theme_preference: 'institutional' } },
    { id: orgBreraId, name: 'Studio Brera', slug: 'studio-brera', timezone: 'Europe/Rome', locale: 'it-IT', status: 'active', settings_json: { display_name: 'Studio Brera', theme_preference: 'balanced' } }
  ], { onConflict: 'slug' });
  if (orgErr) throw orgErr;

  // 4. Associar Membros às Organizações com os UUIDs dinâmicos oficiais
  console.log('👥 Sincronizando organization_members...');
  const { error: memErr } = await supabase.from('organization_members').upsert([
    { organization_id: orgAuroraId, user_id: ownerAId, role: 'organization_owner', status: 'active' },
    { organization_id: orgBreraId, user_id: ownerBId, role: 'organization_owner', status: 'active' },
  ], { onConflict: 'organization_id,user_id' });
  if (memErr) throw memErr;

  // 5. Configurações de Assistente (Digital Employees)
  console.log('🤖 Sincronizando assistentes digitais (Chiara & Marco)...');
  const { error: asstErr } = await supabase.from('digital_employees').upsert([
    { id: 'a1111111-1111-1111-1111-111111111111', organization_id: orgAuroraId, name: 'Chiara', personality_summary: 'Assistente cordiale, empatica ma altamente precisa per lo Studio Aurora.', language: 'it-IT', communication_tone: 'cordial_empathic', avatar_placeholder_url: '/avatars/chiara.svg' },
    { id: 'a2222222-2222-2222-2222-222222222222', organization_id: orgBreraId, name: 'Marco', personality_summary: 'Assistente formale e rigoroso per consulenze legali presso Studio Brera.', language: 'it-IT', communication_tone: 'formal', avatar_placeholder_url: '/avatars/marco.svg' }
  ], { onConflict: 'id' });
  if (asstErr) throw asstErr;

  // 6. Profissionais
  console.log('👔 Sincronizando profissionais...');
  const { error: profErr } = await supabase.from('professionals').upsert([
    { id: 'b1111111-1111-1111-1111-111111111111', organization_id: orgAuroraId, name: 'Dott. Marco Rossi', title: 'Titolare / Commercialista', email: 'rossi@aurora.local', phone: '+39021234567' },
    { id: 'b2222222-1111-1111-1111-111111111111', organization_id: orgAuroraId, name: 'Dott.ssa Sofia Bianchi', title: 'Esperta Contabile', email: 'bianchi@aurora.local', phone: '+39021234568' },
    { id: 'b3333333-2222-2222-2222-222222222222', organization_id: orgBreraId, name: 'Avv. Lorenzo Conti', title: 'Socio Fondatore', email: 'l.conti@brera.local', phone: '+39028899001' }
  ], { onConflict: 'id' });
  if (profErr) throw profErr;

  // 7. Serviços
  console.log('💼 Sincronizando serviços...');
  const { error: servErr } = await supabase.from('services').upsert([
    { id: 'c1111111-1111-1111-1111-111111111111', organization_id: orgAuroraId, name: 'Consulenza Fiscale Iniziale', description: 'Analisi preventiva per apertura Partita IVA o verifica assetto societario.', duration_minutes: 45, price_cents: 12000, buffer_after_minutes: 15 },
    { id: 'c2222222-1111-1111-1111-111111111111', organization_id: orgAuroraId, name: 'Revisione Bilancio Annuale', description: 'Incontro tecnico di verifica contabile e chiusura esercizio.', duration_minutes: 60, price_cents: 18000, buffer_after_minutes: 15 },
    { id: 'c3333333-2222-2222-2222-222222222222', organization_id: orgBreraId, name: 'Parere Legale e Contrattualistica', description: 'Consulenza specialistica su contratti societari e operazioni M&A.', duration_minutes: 60, price_cents: 25000, buffer_after_minutes: 30 }
  ], { onConflict: 'id' });
  if (servErr) throw servErr;

  // 8. Relacionamentos Profissional <-> Serviço
  console.log('🔗 Sincronizando vínculos profissional-serviço...');
  const { error: psErr } = await supabase.from('professional_services').upsert([
    { organization_id: orgAuroraId, professional_id: 'b1111111-1111-1111-1111-111111111111', service_id: 'c1111111-1111-1111-1111-111111111111' },
    { organization_id: orgAuroraId, professional_id: 'b1111111-1111-1111-1111-111111111111', service_id: 'c2222222-1111-1111-1111-111111111111' },
    { organization_id: orgAuroraId, professional_id: 'b2222222-1111-1111-1111-111111111111', service_id: 'c1111111-1111-1111-1111-111111111111' },
    { organization_id: orgBreraId, professional_id: 'b3333333-2222-2222-2222-222222222222', service_id: 'c3333333-2222-2222-2222-222222222222' }
  ], { onConflict: 'professional_id,service_id' });
  if (psErr) throw psErr;

  // 9. CRM Clientes
  console.log('📇 Sincronizando clientes CRM...');
  const { error: custErr } = await supabase.from('customers').upsert([
    { id: 'd1111111-1111-1111-1111-111111111111', organization_id: orgAuroraId, first_name: 'Giovanni', last_name: 'Verdi', phone_normalized: '+393401122333', email: 'giovanni.verdi@example.it', birth_date: '1985-04-12', marketing_consent: true, notes: 'Cliente storico del settore commercio al dettaglio.' },
    { id: 'd2222222-1111-1111-1111-111111111111', organization_id: orgAuroraId, first_name: 'Elena', last_name: 'Romano', phone_normalized: '+393409988777', email: 'elena.romano@example.it', birth_date: '1990-09-23', marketing_consent: false, notes: 'Richiesta consulenza sul regime forfettario.' },
    { id: 'd3333333-2222-2222-2222-222222222222', organization_id: orgBreraId, first_name: 'Alessandro', last_name: 'Ferrari', phone_normalized: '+393334455666', email: 'a.ferrari@example.it', birth_date: '1978-11-03', marketing_consent: true, notes: 'Amministratore Delegato di TechCorp Srl.' }
  ], { onConflict: 'organization_id,phone_normalized' });
  if (custErr) throw custErr;

  // 10. Regras de Negócio (Business Rules)
  console.log('📜 Sincronizando regras de negócio...');
  const { error: brErr } = await supabase.from('business_rules').upsert([
    { id: 'e1111111-1111-1111-1111-111111111111', organization_id: orgAuroraId, cancellation_policy: { min_hours_notice: 24, fee_percent: 0, refund_policy: 'standard' }, standard_messages: { confirmation: 'Gentile cliente di Studio Aurora, il suo appuntamento è confermato.', cancellation: 'Il suo appuntamento è stato cancellato.', reminder: 'Promemoria appuntamento domani presso Studio Aurora.' }, response_rules: { auto_confirm_appointments: true, max_advance_booking_days: 60, min_advance_booking_hours: 2 } },
    { id: 'e2222222-2222-2222-2222-222222222222', organization_id: orgBreraId, cancellation_policy: { min_hours_notice: 48, fee_percent: 0, refund_policy: 'strict' }, standard_messages: { confirmation: 'Studio Brera: confermiamo la sua prenotazione per la consulenza legale.', cancellation: 'La prenotazione presso Studio Brera è stata annullata.', reminder: 'Promemoria del suo colloquio domani presso Studio Brera.' }, response_rules: { auto_confirm_appointments: false, max_advance_booking_days: 30, min_advance_booking_hours: 24 } }
  ], { onConflict: 'organization_id' });
  if (brErr) throw brErr;

  console.log('🎉 Seed Remoto no Supabase Cloud concluído com total sucesso!');
}

runCloudSeed().catch((err) => {
  console.error('❌ Erro fatal ao rodar seed no Supabase Cloud:', err);
  process.exit(1);
});
