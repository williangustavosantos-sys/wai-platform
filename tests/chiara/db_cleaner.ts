import { SupabaseClient } from '@supabase/supabase-js';

// Safe isolated QA records clearer
export async function clearQARecords(supabase: SupabaseClient, qaPhonePrefix: string = '+39000QA') {
   // Only deletes customers with the specific QA phone prefix to prevent corrupting real DB
   const { data: qaCustomers } = await supabase.from('customers').select('id').like('phone', `${qaPhonePrefix}%`);
   
   if (qaCustomers && qaCustomers.length > 0) {
      const customerIds = qaCustomers.map(c => c.id);
      
      // Delete their appointments
      await supabase.from('appointments').delete().in('customer_id', customerIds);
      
      // Delete the customers
      await supabase.from('customers').delete().in('id', customerIds);
   }
   
   // We could also clear conversations/messages created during test if needed
}
