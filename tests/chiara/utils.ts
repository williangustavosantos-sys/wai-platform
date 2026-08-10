import { processConversationTurn } from '@/modules/conversation/conversation.service';
import { getTestSupabaseClient, MockChannelAdapter } from './setup';

export async function runChiaraTurn(userInput: string, adapter: MockChannelAdapter, correlationId: string, supabaseClient = getTestSupabaseClient()) {
   // The processConversationTurn takes the following arguments:
   // client: SupabaseClient,
   // adminClient: SupabaseClient,
   // userId: string,
   // organizationSlug: string,
   // channelAdapter: ChannelAdapter,
   // rawPayload: unknown,
   // correlationId: string

   if (!supabaseClient) {
       throw new Error("Missing Supabase credentials - Environment Blocker");
   }

   const payload = {
      conversationId: correlationId, // simplistic mapping, but let's just make it distinct per test
      text: userInput,
      // what else is normally in the payload? Let's check how SimpleAIProvider works.
   };

   // For test purposes, userId and organizationSlug
   const userId = `qa-user-${correlationId}`;
   const organizationSlug = 'studio-aurora';
   
   return processConversationTurn(
      supabaseClient as unknown as import('@supabase/supabase-js').SupabaseClient,
      supabaseClient as unknown as import('@supabase/supabase-js').SupabaseClient,
      userId,
      organizationSlug,
      adapter as unknown as import('@/modules/conversation/conversation.types').ChannelAdapter,
      payload,
      correlationId
   );
}
