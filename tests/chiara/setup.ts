import { createClient, SupabaseClient } from '@supabase/supabase-js';

// We mock environment variables if they are not provided, assuming Vitest will run in a mocked local context
// For actual execution during testing, if external supabase is missing, tests will be marked as BLOCKED_BY_ENVIRONMENT
export function getTestSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key';
  
  if (url === 'http://127.0.0.1:54321' && process.env.STRICT_ENV) {
      return null;
  }
  
  return createClient(url, key, {
    auth: { persistSession: false }
  });
}

// Mock of ChannelAdapter to capture outbound messages
export class MockChannelAdapter {
  public channelName = 'webchat';
  public outboundMessages: unknown[] = [];
  
  async receiveMessage(payload: unknown) {
    return payload; // Assuming payload is already formatted correctly for the test
  }
  
  async sendMessage(userId: string, organizationSlug: string, message: unknown, metadata?: unknown) {
    this.outboundMessages.push({ userId, organizationSlug, message, metadata });
    return true;
  }

  async sendReply(payload: unknown) {
      return payload;
  }
}
