'use client';

import React, { useState, useEffect, useRef } from 'react';
import { sendChatMessageAction, loadConversationStateAction } from './actions';
import { ConversationMessage } from '@/modules/messages/messages.types';
import { ToolCallTelemetry, Intent } from '@/modules/conversation/conversation.types';
import { extractAvailabilityFromToolCall } from '@/modules/tools/tools.types';
import { COUNTRY_DIAL_CODES, findCountryByCode } from '@/modules/shared/country-dial-codes';

interface ChatSimulatorViewProps {
  organizationSlug: string;
  organizationName: string;
  digitalEmployeeName: string;
  avatarPlaceholderUrl: string;
}

interface TelemetryLogItem {
  turnId: string;
  userMessage: string;
  intent?: Intent;
  toolCalls: ToolCallTelemetry[];
  processingTimeMs: number;
  timestamp: string;
}

export default function ChatSimulatorView({ organizationSlug, organizationName, digitalEmployeeName, avatarPlaceholderUrl }: ChatSimulatorViewProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryLogItem[]>([]);
  const [showInspector, setShowInspector] = useState(false);
  const [selectedSlotMap, setSelectedSlotMap] = useState<{ [msgId: string]: string }>({});
  
  // Form States for Data Collection
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formPhoneCountry, setFormPhoneCountry] = useState('+39');
  const [formPhoneNumber, setFormPhoneNumber] = useState('');
  
  // Custom Country Dropdown State
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const assistantInitial = digitalEmployeeName.charAt(0).toUpperCase() || 'W';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversation = async (forceNew: boolean = false) => {
    setIsLoading(true);
    if (forceNew) {
      setConversationId(undefined);
      setMessages([]);
      setTelemetryLogs([]);
    }
    const res = await loadConversationStateAction(organizationSlug, forceNew);
    if (res.error) {
      setErrorMessage(res.error);
    } else if (res.success && res.conversation) {
      setConversationId(res.conversation.id);
      setMessages(res.messages || []);
      
      const historyLogs: TelemetryLogItem[] = [];
      const msgList = res.messages || [];
      for (let i = 0; i < msgList.length; i++) {
        const m = msgList[i];
        if (m.role === 'assistant' && m.metadata && (m.metadata.intent || m.metadata.toolCalls)) {
          const userMsg = i > 0 ? msgList[i-1].content : 'N/D';
          historyLogs.push({
            turnId: m.id,
            userMessage: userMsg,
            intent: m.metadata.intent as Intent,
            toolCalls: (m.metadata.toolCalls || []) as ToolCallTelemetry[],
            processingTimeMs: (m.metadata.processingTimeMs as number) || 45,
            timestamp: new Date(m.createdAt).toLocaleTimeString('it-IT')
          });
        }
      }
      setTelemetryLogs(historyLogs);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadConversation();
  }, [organizationSlug]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  const handleSendMessage = async (textToSend?: string, onFailure?: () => void, displayMsg?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || isSending) return;

    const tempUserMsg: ConversationMessage = {
      id: `temp-${Date.now()}`,
      organizationId: organizationSlug,
      conversationId: conversationId || 'new',
      role: 'customer',
      content: text,
      metadata: {},
      createdAt: new Date().toISOString()
    };

    setMessages(prev => [...prev, tempUserMsg]);
    if (!textToSend) setInputText('');
    setIsSending(true);
    setErrorMessage(null);

    const result = await sendChatMessageAction(organizationSlug, text, conversationId);
    setIsSending(false);

    if (result.error || !result.success || !result.result) {
      if (onFailure) onFailure();
      setErrorMessage(result.error || "Errore nella comunicazione col server WAI.");
      const friendlyErrorMsg: ConversationMessage = {
        id: `error-${Date.now()}`,
        organizationId: organizationSlug,
        conversationId: conversationId || 'error',
        role: 'assistant',
        content: "Mi dispiace, si è verificato un temporaneo problema tecnico nei nostri sistemi d'elaborazione. Ti chiedo gentilmente di riprovare tra qualche istante oppure di consultare i dettagli tecnici nel WAI Inspector.",
        metadata: { intent: 'GENERAL_INFORMATION', error: true },
        createdAt: new Date().toISOString()
      };
      setMessages(prev => [...prev, friendlyErrorMsg]);
      return;
    }

    const turnRes = result.result;
    setConversationId(turnRes.conversationId);

    const tempAssistMsg: ConversationMessage = {
      id: `assist-${Date.now()}`,
      organizationId: organizationSlug,
      conversationId: turnRes.conversationId,
      role: 'assistant',
      content: turnRes.replyText,
      metadata: turnRes.metadata || { intent: turnRes.detectedIntent, toolCalls: turnRes.toolCalls },
      createdAt: new Date().toISOString()
    };

    setMessages(prev => [...prev, tempAssistMsg]);

    // Update Telemetry Inspector
    setTelemetryLogs(prev => [
      ...prev,
      {
        turnId: tempAssistMsg.id,
        userMessage: text,
        intent: turnRes.detectedIntent,
        toolCalls: turnRes.toolCalls,
        processingTimeMs: turnRes.processingTimeMs,
        timestamp: new Date().toLocaleTimeString('it-IT')
      }
    ]);
  };

  const handleOptionClick = (msgId: string, value: string, displayMsg?: string) => {
    if (isSending) return;
    setSelectedSlotMap(prev => ({ ...prev, [msgId]: value }));
    handleSendMessage(value, () => {
      setSelectedSlotMap(prev => {
        const copy = { ...prev };
        delete copy[msgId];
        return copy;
      });
    }, displayMsg);
  };

  const handleFormSubmit = (field: string, payloadObj: any, displayMsg: string) => {
    if (isSending) return;
    const payload = JSON.stringify({ type: 'FORM_SUBMIT', field, ...payloadObj });
    // We don't use displayMsg internally right now because parseCustomerMessage reconstructs it from JSON
    handleSendMessage(payload);
  };

  const quickPrompts = [
    "Vorrei prenotare una consulenza fiscale",
    "Per domani alle 10:00",
    "Quali sono i vostri servizi e regole?",
    "Vorrei parlare con un operatore umano"
  ];

  function getDayString(dateStr: string) {
    if (!dateStr) return '';
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(Date.UTC(y, m - 1, d));
      const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
      return `${days[dateObj.getUTCDay()]} ${d}`;
    } catch (e) {
      return dateStr;
    }
  }

  return (
    <div className="wai-chat-container">
      
      {/* Container central de chat com largura aproximada de 900px */}
      <div className="wai-chat-shell">
        
        {/* Header do chat */}
        <header className="wai-chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="wai-chat-avatar" data-avatar-placeholder={avatarPlaceholderUrl}>
              {assistantInitial}
            </div>
            <div className="wai-chat-header-info">
              <h2 className="wai-chat-header-title">{digitalEmployeeName}</h2>
              <span className="wai-chat-header-role">Assistente Digitale</span>
              <span className="wai-chat-header-org">{organizationName}</span>
            </div>
          </div>
          <button 
            onClick={() => loadConversation(true)}
            disabled={isLoading || isSending}
            style={{ 
              backgroundColor: 'transparent', border: '1px solid #475569', color: '#cbd5e1', 
              padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer'
            }}
          >
            Nuova conversazione
          </button>
        </header>

        {/* Área de mensagens */}
        <div className="wai-chat-messages">
          {isLoading ? (
            <div className="wai-chat-empty">
              <p style={{ fontSize: '1rem', fontWeight: 600, color: '#60a5fa' }}>⚡ Caricamento conversazione in corso...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="wai-chat-message-wrapper wai-chat-message-assistant" style={{ marginTop: '2rem' }}>
              <div className="wai-chat-message-avatar">{assistantInitial}</div>
              <div className="wai-chat-message-bubble">
                <div className="wai-chat-message-content">
                  Ciao! Come posso aiutarti?
                </div>
                <div className="wai-chat-slots-container" style={{ marginTop: '1rem' }}>
                  <div className="wai-chat-slots-grid">
                    <button type="button" className="wai-chat-slot-button" onClick={() => handleSendMessage('Vorrei prenotare un appuntamento')} disabled={isSending}>Nuovo appuntamento</button>
                    <button type="button" className="wai-chat-slot-button" onClick={() => handleSendMessage('Vorrei spostare un appuntamento')} disabled={isSending}>Sposta appuntamento</button>
                    <button type="button" className="wai-chat-slot-button" onClick={() => handleSendMessage('Vorrei annullare un appuntamento')} disabled={isSending}>Annulla appuntamento</button>
                    <button type="button" className="wai-chat-slot-button" onClick={() => handleSendMessage('Vorrei delle informazioni')} disabled={isSending}>Informazioni</button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'customer';
              const isLastAssistantMessage = messages.filter(m => m.role === 'assistant').pop()?.id === msg.id;

              let cleanContent = msg.content || '';
              if (isUser) {
                try {
                  const parsed = JSON.parse(cleanContent);
                  if (parsed.type === 'SELECT_SLOT') {
                    // Create friendly text like "Mercoledì 12 agosto alle 09:00" or just use formatted date
                    const dateObj = new Date(parsed.date);
                    const formattedDate = dateObj.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
                    cleanContent = `${formattedDate} alle ${parsed.time}`;
                  } else if (parsed.type === 'FORM_SUBMIT') {
                    if (parsed.field === 'phone') {
                      cleanContent = `${parsed.countryCode} ${parsed.number}`;
                    } else {
                      cleanContent = parsed.value;
                    }
                  }
                } catch (e) {
                  // Not a JSON or not a SELECT_SLOT, keep original content
                }
              }

              let stepMarker: string | null = null;
              if (!isUser && cleanContent.includes('[WAI_STEP_')) {
                const match = cleanContent.match(/\[(WAI_STEP_[A-Z_]+)\]/);
                if (match) {
                  stepMarker = match[1];
                  cleanContent = cleanContent.replace(match[0], '').trim();
                }
              }

              const tCalls = (msg.metadata?.toolCalls || []) as Array<any>;

              const renderButtons = (options: { label: string, value: string }[]) => {
                if (!isLastAssistantMessage || options.length === 0) return null;
                return (
                  <div className="wai-chat-slots-container">
                    <div className="wai-chat-slots-grid">
                      {options.map((opt) => {
                        const isSelected = selectedSlotMap[msg.id] === opt.value;
                        const hasSelectedAny = Boolean(selectedSlotMap[msg.id]);
                        const disabled = isSending || isLoading || (hasSelectedAny && !isSelected);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            className={`wai-chat-slot-button ${isSelected ? 'wai-chat-slot-button-selected' : ''}`}
                            disabled={disabled}
                            onClick={() => handleOptionClick(msg.id, opt.value)}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              };

              let cardsNode = null;
              if (stepMarker === 'WAI_STEP_SERVICE') {
                const srvCall = tCalls.find(t => (t.toolName || t.name) === 'listServices' || (t.toolName || t.name) === 'checkAvailability');
                const services = srvCall?.result?.result?.services || srvCall?.result?.services || [];
                const options = services.map((s: any) => ({ label: s.name, value: s.name }));
                cardsNode = renderButtons(options);
              } else if (stepMarker === 'WAI_STEP_INFO') {
                const options = [
                  { label: 'Orari', value: 'Quali sono i vostri orari?' },
                  { label: 'Indirizzo', value: 'Dove vi trovate?' },
                  { label: 'Telefono', value: 'Qual è il vostro numero di telefono?' },
                  { label: 'Servizi', value: 'Quali servizi offrite?' },
                  { label: 'Prezzi', value: 'Quali sono i vostri prezzi?' }
                ];
                cardsNode = renderButtons(options);
              } else if (stepMarker === 'WAI_STEP_PROFESSIONAL') {
                const availCall = tCalls.find(t => (t.toolName || t.name) === 'checkAvailability');
                const profs = availCall?.result?.result?.professionals || [];
                const options = [
                  ...profs.map((p: any) => ({ label: p.name, value: p.name })),
                  { label: 'Il primo disponibile', value: 'Il primo disponibile' },
                  { label: 'Annulla', value: 'Annulla' }
                ];
                cardsNode = renderButtons(options);
              } else if (stepMarker === 'WAI_STEP_SLOTS') {
                const availCall = tCalls.find(t => (t.toolName || t.name) === 'checkAvailability');
                const days = availCall?.result?.result?.days || [];
                
                if (days.length === 0) {
                    cardsNode = renderButtons([
                      { label: 'Vedi altre disponibilità', value: 'Vedi altre disponibilità' },
                      { label: 'Annulla', value: 'Annulla' }
                    ]);
                } else {
                    cardsNode = (
                        <div className="wai-chat-slots-grouped-container" style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {days.map((dayObj: any) => (
                                <div key={dayObj.date} className="wai-chat-slots-day-group">
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#94a3b8', marginBottom: '0.5rem', textTransform: 'capitalize' }}>
                                        {getDayString(dayObj.date)}
                                    </div>
                                    <div className="wai-chat-slots-grid">
                                        {dayObj.slotsDetails?.map((slot: any) => {
                                            const payload = JSON.stringify({
                                                type: 'SELECT_SLOT',
                                                date: dayObj.date,
                                                time: slot.time,
                                                professionalId: slot.professionalId,
                                                professionalName: slot.professionalName
                                            });
                                            const isSelected = selectedSlotMap[msg.id] === payload;
                                            const hasSelectedAny = Boolean(selectedSlotMap[msg.id]);
                                            const disabled = isSending || isLoading || (hasSelectedAny && !isSelected);
                                            return (
                                                <button
                                                    key={slot.time + slot.professionalId}
                                                    type="button"
                                                    className={`wai-chat-slot-button ${isSelected ? 'wai-chat-slot-button-selected' : ''}`}
                                                    disabled={disabled}
                                                    onClick={() => handleOptionClick(msg.id, payload)}
                                                >
                                                    {slot.time}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            <div style={{ marginTop: '0.5rem' }}>
                                {renderButtons([
                                  { label: 'Vedi altre disponibilità', value: 'Vedi altre disponibilità' },
                                  { label: 'Annulla', value: 'Annulla' }
                                ])}
                            </div>
                        </div>
                    );
                }
              } else if (stepMarker === 'WAI_STEP_FIRST_NAME' && isLastAssistantMessage) {
                cardsNode = (
                  <div className="wai-chat-form-container" style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#e2e8f0', marginBottom: '0.2rem' }}>Nome</div>
                    <input 
                      type="text" 
                      placeholder="Nome" 
                      value={formFirstName}
                      onChange={e => setFormFirstName(e.target.value)}
                      className="wai-chat-input"
                      style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#f8fafc' }}
                      onKeyDown={e => e.key === 'Enter' && handleFormSubmit('firstName', { value: formFirstName }, formFirstName)}
                    />
                    <button 
                      className="wai-chat-slot-button" 
                      style={{ marginTop: '0.2rem' }}
                      onClick={() => handleFormSubmit('firstName', { value: formFirstName }, formFirstName)}
                      disabled={!formFirstName.trim() || isSending}
                    >
                      Continua
                    </button>
                  </div>
                );
              } else if (stepMarker === 'WAI_STEP_LAST_NAME' && isLastAssistantMessage) {
                cardsNode = (
                  <div className="wai-chat-form-container" style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#e2e8f0', marginBottom: '0.2rem' }}>Cognome</div>
                    <input 
                      type="text" 
                      placeholder="Cognome" 
                      value={formLastName}
                      onChange={e => setFormLastName(e.target.value)}
                      className="wai-chat-input"
                      style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#f8fafc' }}
                      onKeyDown={e => e.key === 'Enter' && handleFormSubmit('lastName', { value: formLastName }, formLastName)}
                    />
                    <button 
                      className="wai-chat-slot-button" 
                      style={{ marginTop: '0.2rem' }}
                      onClick={() => handleFormSubmit('lastName', { value: formLastName }, formLastName)}
                      disabled={!formLastName.trim() || isSending}
                    >
                      Continua
                    </button>
                  </div>
                );
              } else if (stepMarker === 'WAI_STEP_PHONE' && isLastAssistantMessage) {
                const selectedCountry = findCountryByCode(formPhoneCountry) || COUNTRY_DIAL_CODES[0];
                const filteredCountries = COUNTRY_DIAL_CODES.filter(c => 
                  c.name.toLowerCase().includes(countrySearch.toLowerCase()) || 
                  c.code.includes(countrySearch)
                );
                
                cardsNode = (
                  <div className="wai-chat-form-container" style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#e2e8f0', marginBottom: '0.2rem' }}>WhatsApp</div>
                    
                    <div style={{ position: 'relative' }}>
                      <div 
                        onClick={() => {
                          setShowCountryDropdown(!showCountryDropdown);
                          if (!showCountryDropdown) setCountrySearch('');
                        }}
                        style={{ 
                          padding: '0.6rem', 
                          borderRadius: '6px', 
                          border: '1px solid #475569', 
                          backgroundColor: '#1e293b', 
                          color: '#f8fafc', 
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <span>{selectedCountry.flag} {selectedCountry.name} ({selectedCountry.code})</span>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>▼</span>
                      </div>
                      
                      {showCountryDropdown && (
                        <div style={{ 
                          position: 'absolute', 
                          top: '100%', 
                          left: 0, 
                          right: 0, 
                          marginTop: '4px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          zIndex: 50,
                          maxHeight: '250px',
                          display: 'flex',
                          flexDirection: 'column',
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                        }}>
                          <div style={{ padding: '0.5rem', borderBottom: '1px solid #334155' }}>
                            <input 
                              type="text" 
                              placeholder="Cerca paese o prefisso"
                              value={countrySearch}
                              onChange={e => setCountrySearch(e.target.value)}
                              onClick={e => e.stopPropagation()}
                              style={{ 
                                width: '100%', 
                                padding: '0.4rem', 
                                backgroundColor: '#1e293b', 
                                border: '1px solid #475569',
                                borderRadius: '4px',
                                color: '#f8fafc',
                                outline: 'none'
                              }}
                              autoFocus
                            />
                          </div>
                          <div style={{ overflowY: 'auto', flex: 1 }}>
                            {filteredCountries.map(c => (
                              <div 
                                key={c.code + c.iso}
                                onClick={() => {
                                  setFormPhoneCountry(c.code);
                                  setShowCountryDropdown(false);
                                }}
                                style={{ 
                                  padding: '0.6rem 0.8rem', 
                                  cursor: 'pointer',
                                  display: 'flex',
                                  gap: '0.5rem',
                                  alignItems: 'center',
                                  backgroundColor: formPhoneCountry === c.code ? '#1e293b' : 'transparent'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1e293b'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = formPhoneCountry === c.code ? '#1e293b' : 'transparent'}
                              >
                                <span>{c.flag}</span>
                                <span>{c.name}</span>
                                <span style={{ color: '#94a3b8', marginLeft: 'auto' }}>{c.code}</span>
                              </div>
                            ))}
                            {filteredCountries.length === 0 && (
                              <div style={{ padding: '0.8rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
                                Nessun risultato
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: '0.3rem' }}>
                      <input 
                        type="tel" 
                        placeholder="Numero WhatsApp" 
                        value={formPhoneNumber}
                        onChange={e => setFormPhoneNumber(e.target.value)}
                        className="wai-chat-input"
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#f8fafc' }}
                        onKeyDown={e => e.key === 'Enter' && handleFormSubmit('phone', { countryCode: formPhoneCountry, number: formPhoneNumber }, `${formPhoneCountry} ${formPhoneNumber}`)}
                      />
                    </div>
                    
                    <button 
                      className="wai-chat-slot-button" 
                      style={{ marginTop: '0.2rem' }}
                      onClick={() => handleFormSubmit('phone', { countryCode: formPhoneCountry, number: formPhoneNumber }, `${formPhoneCountry} ${formPhoneNumber}`)}
                      disabled={!formPhoneNumber.trim() || isSending}
                    >
                      Continua
                    </button>
                  </div>
                );
              } else if (stepMarker === 'WAI_STEP_SLOTS_EMPTY') {
                cardsNode = renderButtons([
                  { label: 'Vedi altre disponibilità', value: 'Vedi altre disponibilità' },
                  { label: 'Annulla', value: 'Annulla' }
                ]);
              } else if (stepMarker === 'WAI_STEP_CONFIRM_CARD') {
                const draft = msg.metadata?.bookingDraft as any || {};
                const displayClientName = draft.fullName || `${draft.firstName || ''} ${draft.lastName || ''}`.trim();
                
                // Extrair flag do countryCode armazenado (ou tentar inferir do telefone, se aplicável, mas já temos no draft agora)
                // Note: o telefone vem limpo de simple_ai_provider, precisamos do flag correto.
                let flag = '📱'; 
                // O draft não tem o countryCode separadamente, mas podemos tentar extrair o prefixo
                const phoneStr = draft.phone || '';
                const matchedCountry = COUNTRY_DIAL_CODES.find(c => phoneStr.startsWith(c.code));
                if (matchedCountry) {
                  flag = matchedCountry.flag;
                }
                
                cardsNode = (
                  <div className="wai-chat-confirmation-card" style={{ padding: '1rem', backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', marginTop: '0.5rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.8rem', fontSize: '1.05rem', color: '#f8fafc' }}>CONFERMA PRENOTAZIONE</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.2rem', fontSize: '0.95rem', color: '#e2e8f0' }}>
                      <div><strong style={{ color: '#94a3b8' }}>Servizio:</strong> {draft.serviceName}</div>
                      <div><strong style={{ color: '#94a3b8' }}>Data:</strong> {draft.formattedDate || draft.date}</div>
                      <div><strong style={{ color: '#94a3b8' }}>Orario:</strong> {draft.time}</div>
                      <div><strong style={{ color: '#94a3b8' }}>Nome:</strong> {draft.firstName}</div>
                      <div><strong style={{ color: '#94a3b8' }}>Cognome:</strong> {draft.lastName}</div>
                      <div><strong style={{ color: '#94a3b8' }}>WhatsApp:</strong> {flag} {draft.phone}</div>
                    </div>
                    
                    <div style={{ marginBottom: '1rem', color: '#f8fafc', fontSize: '0.95rem' }}>
                      Tutto corretto?
                    </div>
                    
                    {renderButtons([
                      { label: 'Conferma prenotazione', value: 'Conferma prenotazione' },
                      { label: 'Modifica', value: 'Modifica' },
                      { label: 'Annulla', value: 'Annulla' }
                    ])}
                  </div>
                );
              } else if (stepMarker === 'WAI_STEP_MODIFICA') {
                const options = [
                  { label: 'Nome', value: 'Nome' },
                  { label: 'Telefono', value: 'Telefono' },
                  { label: 'Data e orario', value: 'Data e orario' }
                ];
                cardsNode = renderButtons(options);
              }

              return (
                <div
                  key={msg.id}
                  className={`wai-chat-row ${isUser ? 'wai-chat-row-user' : 'wai-chat-row-assistant'}`}
                >
                  <div className={`wai-chat-bubble ${isUser ? 'wai-chat-bubble-user' : 'wai-chat-bubble-assistant'}`}>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{cleanContent}</div>
                    {cardsNode}
                  </div>
                </div>
              );
            })
          )}

          {isSending && (
            <div className="wai-chat-row wai-chat-row-assistant">
              <div className="wai-chat-bubble wai-chat-bubble-assistant wai-chat-typing">
                <span>Digitando</span>
                <span className="wai-chat-dots">
                  <span className="wai-chat-dot"></span>
                  <span className="wai-chat-dot"></span>
                  <span className="wai-chat-dot"></span>
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Footer */}
        <div className="wai-chat-composer">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            disabled={isSending || isLoading}
            placeholder="Scrivi un messaggio..."
            className="wai-chat-input"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={isSending || isLoading || !inputText.trim()}
            className="wai-chat-send-button"
          >
            <span>Invia</span>
            <svg width="16" height="16" style={{ width: '16px', height: '16px', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </button>
        </div>

      </div>

      {/* Área separada para Exemplos de teste */}
      <div className="wai-chat-examples">
        <div className="wai-chat-examples-title">
          <span>💡</span>
          <span>Exemplos de teste</span>
        </div>
        <div className="wai-chat-examples-grid">
          {quickPrompts.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(p)}
              disabled={isSending || isLoading}
              className="wai-chat-example-button"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Accordion do WAI Inspector no final da página */}
      <div className="wai-chat-inspector">
        <button
          onClick={() => setShowInspector(!showInspector)}
          className={`wai-chat-inspector-toggle ${showInspector ? 'wai-chat-inspector-toggle-active' : ''}`}
        >
          <span className="wai-chat-inspector-badge">
            <span>🔧</span>
            <span>WAI Inspector / Debug</span>
          </span>
          <span className="wai-chat-inspector-count">
            {telemetryLogs.length} {telemetryLogs.length === 1 ? 'log' : 'logs'} • {showInspector ? '▲ Fechar' : '▼ Expandir'}
          </span>
        </button>

        {showInspector && (
          <div className="wai-chat-inspector-body">
            {errorMessage && (
              <div className="wai-alert wai-alert-error" style={{ marginBottom: '0.5rem', fontFamily: 'monospace' }}>
                <div style={{ fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Erro Técnico / Exceção do Sistema:</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{errorMessage}</div>
              </div>
            )}

            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.75rem' }}>
                Telemetria & Logs de Ferramentas (Supabase):
              </div>
              {telemetryLogs.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', border: '1px dashed #2e3c56', borderRadius: '8px', color: '#64748b', fontStyle: 'italic' }}>
                  Nenhuma atividade técnica registrada nesta sessão.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '400px', overflowY: 'auto' }}>
                  {telemetryLogs.slice().reverse().map((log, index) => (
                    <div key={log.turnId || index} className="wai-chat-log-item">
                      <div className="wai-chat-log-header">
                        <span className="wai-chat-log-turn">Turno #{telemetryLogs.length - index}</span>
                        <span>{log.timestamp} • {log.processingTimeMs}ms</span>
                      </div>
                      
                      <div className="wai-chat-log-section">
                        <span className="wai-chat-log-label">Entrada do Usuário:</span>
                        <div style={{ fontStyle: 'italic', color: '#e2e8f0' }}>&quot;{log.userMessage}&quot;</div>
                      </div>

                      <div className="wai-chat-log-section">
                        <span className="wai-chat-log-label">Intent:</span>
                        <div style={{ color: '#10b981', fontWeight: 700 }}>{log.intent || 'GENERAL_INFORMATION'}</div>
                      </div>

                      <div className="wai-chat-log-section">
                        <span className="wai-chat-log-label">Ferramentas Usadas:</span>
                        {(!log.toolCalls || log.toolCalls.length === 0) ? (
                          <div style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.8rem' }}>Nenhuma ferramenta invocada no banco (resposta conversacional direta).</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.3rem' }}>
                            {log.toolCalls.map((t, idx) => (
                              <div key={idx} className="wai-chat-log-tool">
                                <div className="wai-chat-log-tool-name">{t.toolName}() — {t.executionTimeMs}ms</div>
                                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                                  <span style={{ fontWeight: 700, color: '#64748b' }}>Args: </span>
                                  <code className="wai-chat-log-code" style={{ color: '#93c5fd' }}>{JSON.stringify(t.arguments)}</code>
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#10b981', marginTop: '0.4rem' }}>
                                  <span style={{ fontWeight: 700, color: '#64748b' }}>Result: </span>
                                  <code className="wai-chat-log-code">{JSON.stringify(t.result)}</code>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>

    </div>
  );
}
