import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pwxpibwwtpuudtzxlfed.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_tk_4hoqZFROywnN3de32Dg_j7YRjyNQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id, name');
  if (orgErr) throw orgErr;
  
  const aurora = orgs.find((o: any) => o.name === 'Studio Aurora');
  if (!aurora) throw new Error('Studio Aurora not found');

  const { data: profs, error: profErr } = await supabase.from('professionals').select('id, name, organization_id').eq('organization_id', aurora.id);
  if (profErr) throw profErr;

  const marco = profs.find((p: any) => p.name === 'Dott. Marco Rossi');
  if (!marco) throw new Error('Dott. Marco Rossi not found');

  // Seg à Quinta 09:00 - 18:00 (1 to 4)
  // Sexta 09:00 - 17:00 (5)
  const rules = [
    { organization_id: aurora.id, professional_id: marco.id, day_of_week: 1, start_time: '09:00:00', end_time: '18:00:00', is_active: true },
    { organization_id: aurora.id, professional_id: marco.id, day_of_week: 2, start_time: '09:00:00', end_time: '18:00:00', is_active: true },
    { organization_id: aurora.id, professional_id: marco.id, day_of_week: 3, start_time: '09:00:00', end_time: '18:00:00', is_active: true },
    { organization_id: aurora.id, professional_id: marco.id, day_of_week: 4, start_time: '09:00:00', end_time: '18:00:00', is_active: true },
    { organization_id: aurora.id, professional_id: marco.id, day_of_week: 5, start_time: '09:00:00', end_time: '17:00:00', is_active: true },
  ];

  // Delete existing rules for this prof to avoid duplicates
  await supabase.from('availability_rules').delete().eq('professional_id', marco.id);

  const { data: inserted, error: insertErr } = await supabase.from('availability_rules').insert(rules).select();
  if (insertErr) throw insertErr;

  console.log('Inserted rules successfully:', inserted.length);
}

run().catch(console.error);
