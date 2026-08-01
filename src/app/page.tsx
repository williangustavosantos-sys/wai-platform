import { createServerClient } from '@/db/server';
import { getCurrentSession, isWaiAdmin } from '@/security/auth';
import { redirect } from 'next/navigation';

export default async function Home() {
  const supabase = await createServerClient();
  const session = await getCurrentSession(supabase);

  if (!session) {
    redirect('/login');
  }

  const admin = await isWaiAdmin(supabase, session.userId);
  if (admin) {
    redirect('/admin');
  }

  // Check user memberships to determine primary workspace
  const { data: member } = await supabase
    .from('organization_members')
    .select('organizations(slug)')
    .eq('user_id', session.userId)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (member && member.organizations && typeof member.organizations === 'object' && 'slug' in member.organizations) {
    redirect(`/app/${(member.organizations as { slug: string }).slug}`);
  }

  // Fallback if no membership found
  redirect('/login?error=' + encodeURIComponent('Nessun accesso a una organizzazione attiva trovato.'));
}
