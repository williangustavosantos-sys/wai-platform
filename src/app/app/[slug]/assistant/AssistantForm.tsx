'use client';

import React, { useState, useTransition } from 'react';
import { updateAssistantAction } from './actions';
import { DigitalEmployeeConfig, CommunicationTone } from '@/modules/assistant/assistant.types';

interface Props {
  organizationSlug: string;
  initialConfig: DigitalEmployeeConfig;
  readOnly?: boolean;
  dict?: {
    form_name_label?: string;
    form_lang_label?: string;
    form_tone_label?: string;
    form_persona_label?: string;
    submit_btn?: string;
    saving_btn?: string;
  };
}

export function AssistantForm({ organizationSlug, initialConfig, readOnly = false, dict }: Props) {
  const [status, setStatus] = useState<{ error?: string; success?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(initialConfig.name);
  const [tone, setTone] = useState<CommunicationTone>(initialConfig.communicationTone);
  const [personality, setPersonality] = useState(initialConfig.personalitySummary);
  const [language, setLanguage] = useState(initialConfig.language || 'it-IT');
  const [avatar, setAvatar] = useState(initialConfig.avatarPlaceholderUrl);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (readOnly) return;
    setStatus(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await updateAssistantAction(organizationSlug, formData);
      if (res.error) {
        setStatus({ error: res.error });
      } else if (res.success) {
        setStatus({ success: res.message });
      }
    });
  };

  const getToneLabel = (t: CommunicationTone) => {
    switch (t) {
      case 'formal': return 'Formal / Istituzionale';
      case 'cordial_empathic': return 'Cordiale / Empatico';
      case 'direct': return 'Direto / Sintetico';
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
      {/* Visual Preview Card */}
      <div className="wai-card" style={{ padding: '1.5rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#60A5FA' }}>Preview / Anteprima (Digital Employee)</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', fontWeight: 'bold', color: 'white'
          }}>
            {name ? name.charAt(0).toUpperCase() : 'W'}
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '1.25rem', color: '#E2E8F0' }}>{name || 'Assistente WAI'}</h4>
            <span style={{ fontSize: '0.85rem', color: '#94A3B8', display: 'block' }}>Lingua / Idioma IA: <strong>{language}</strong></span>
            <span style={{ 
              display: 'inline-block', marginTop: '0.25rem', padding: '0.2rem 0.5rem', 
              background: 'rgba(59, 130, 246, 0.2)', color: '#93C5FD', borderRadius: '4px', fontSize: '0.75rem' 
            }}>
              Tone: {getToneLabel(tone)}
            </span>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
          <strong style={{ fontSize: '0.85rem', color: '#CBD5E1', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
            Personalità / Trata Comportamentais
          </strong>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#94A3B8', lineHeight: '1.5', minHeight: '60px' }}>
            {personality || 'Nenhuma descrição de personalidade e comportamento.'}
          </p>
        </div>
        <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#64748B', display: 'flex', justifyContent: 'space-between' }}>
          <span>Avatar: {avatar}</span>
          <span>Status: {initialConfig.status === 'active' ? '🟢 Active' : '⚪ Inactive'}</span>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="wai-card" style={{ padding: '1.5rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.25rem' }}>Parâmetros do Assistente IA (Fase 1)</h3>
        <form onSubmit={handleSubmit}>
          {status?.error && (
            <div className="wai-alert wai-alert-error" style={{ marginBottom: '1rem' }}>
              {status.error}
            </div>
          )}
          {status?.success && (
            <div className="wai-alert wai-alert-success" style={{ marginBottom: '1rem' }}>
              {status.success}
            </div>
          )}

          <div className="wai-form-group">
            <label className="wai-label" htmlFor="name">{dict?.form_name_label || 'Nome do Assistente IA'}</label>
            <input
              id="name"
              name="name"
              type="text"
              className="wai-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Chiara, Marco..."
              required
              disabled={readOnly || isPending}
            />
          </div>

          <div className="wai-form-group">
            <label className="wai-label" htmlFor="communicationTone">{dict?.form_tone_label || 'Tono di Comunicazione'}</label>
            <select
              id="communicationTone"
              name="communicationTone"
              className="wai-select"
              value={tone}
              onChange={(e) => setTone(e.target.value as CommunicationTone)}
              disabled={readOnly || isPending}
            >
              <option value="cordial_empathic">Cordiale ed Empatico / Cordial (Consigliato)</option>
              <option value="formal">Formale / Istituzionale</option>
              <option value="direct">Diretto e Sintetico / Direto</option>
            </select>
          </div>

          <div className="wai-form-group">
            <label className="wai-label" htmlFor="personalitySummary">{dict?.form_persona_label || 'Personalidade e Instruções de Sistema'}</label>
            <textarea
              id="personalitySummary"
              name="personalitySummary"
              className="wai-input"
              style={{ minHeight: '100px', resize: 'vertical' }}
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="Instruções e comportamento..."
              required
              disabled={readOnly || isPending}
            />
          </div>

          <div className="wai-form-group">
            <label className="wai-label" htmlFor="language">{dict?.form_lang_label || 'Idioma de Comunicação IA (Modelo Lógico)'}</label>
            <select
              id="language"
              name="language"
              className="wai-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={readOnly || isPending}
            >
              <option value="it-IT">🇮🇹 Italiano (Italia - Padrão Chiara Studio Aurora)</option>
              <option value="pt-BR">🇧🇷 Português (Brasil)</option>
              <option value="en-US">🇺🇸 English (US) - Suporte Futuro</option>
            </select>
          </div>

          <div className="wai-form-group">
            <label className="wai-label" htmlFor="avatarPlaceholderUrl">Avatar (ID / URL Placeholder)</label>
            <input
              id="avatarPlaceholderUrl"
              name="avatarPlaceholderUrl"
              type="text"
              className="wai-input"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="ex: /avatars/chiara.svg"
              required
              disabled={readOnly || isPending}
            />
          </div>

          {!readOnly && (
            <button
              type="submit"
              className="wai-button"
              style={{ width: '100%', marginTop: '0.5rem' }}
              disabled={isPending}
            >
              {isPending ? (dict?.saving_btn || 'Salvando...') : (dict?.submit_btn || 'Salvar Configuração IA')}
            </button>
          )}
          {readOnly && (
            <div className="wai-alert" style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'center', marginTop: '1rem' }}>
              Modalità sola lettura per il tuo ruolo di visualizzatore.
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
