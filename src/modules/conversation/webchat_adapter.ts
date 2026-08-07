import { ChannelAdapter } from './conversation.types';
import { ConversationChannel } from '../messages/messages.types';

export interface WebChatPayload {
  conversationId?: string;
  customerPhone?: string;
  text: string;
  sender?: string;
}

/**
 * Adaptador de canal para WebChat (Simulador e Widget Web), preparado para paridade arquitetural com o futuro WhatsAppAdapter.
 */
export class WebChatAdapter implements ChannelAdapter {
  readonly channelName: ConversationChannel = 'webchat';

  async receiveMessage(payload: unknown): Promise<{ conversationId?: string; customerPhone?: string; text: string }> {
    const data = payload as WebChatPayload;
    if (!data || typeof data.text !== 'string' || !data.text.trim()) {
      throw new Error('Payload webchat inválido ou vazio.');
    }

    return {
      conversationId: data.conversationId,
      customerPhone: data.customerPhone,
      text: data.text.trim()
    };
  }

  async sendReply(destination: string, text: string): Promise<boolean> {
    // No WebChat o retorno do Conversation Engine é exibido diretamente na interface do navegador
    return Boolean(destination && text);
  }
}
