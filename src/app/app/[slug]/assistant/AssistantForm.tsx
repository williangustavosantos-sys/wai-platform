'use client';

import React, { useState, useTransition } from 'react';
import { updateAssistantAction } from './actions';
import { DigitalEmployeeConfig, CommunicationTone } from '@/modules/assistant/assistant.types';

interface Props {
  organizationSlug: string;
  initialConfig: DigitalEmployeeConfig;
  readOnly?: boolean;
  dict?: {
    preview_title?: string;
    operating_lang?: string;
    tone_label?: string;
    personality_title?: string;
    personality_empty?: string;
    status_active?: string;
    status_inactive?: string;
    form_title?: string;
    name_label?: string;
    name_placeholder?: string;
    tone_select_label?: string;
    tone_cordial?: string;
    tone_formal?: string;
    tone_direct?: string;
    personality_label?: string;
    personality_placeholder?: string;
    language_label?: string;
    language_it?: string;
    language_en?: string;
    language_pt?: string;
    avatar_label?: string;
    submit_btn?: string;
    saving_btn?: string;
    readonly_notice?: string;
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
      case 'formal': return dict?.tone_formal || 'Formale e istituzionale';
      case 'cordial_empathic': return dict?.tone_cordial || 'Cordiale ed empatico';
      case 'direct': return dict?.tone_direct || 'Diretto e sintetico';
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
      {/* Visual Preview Card */}
      <div className="wai-card" style={{ padding: '1.5rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#60A5FA' }}>{dict?.preview_title || 'Anteprima Digital Employee'}</h3>
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
            <h4 style={{ margin: 0, fontSize: '1.25rem', color: '#E2E8F0' }}>{name || 'Digital Employee'}</h4>
            <span style={{ fontSize: '0.85rem', color: '#94A3B8', display: 'block' }}>{dict?.operating_lang || 'Lingua predefinita:'} <strong>{language}</strong></span>
            <span style={{ 
              display: 'inline-block', marginTop: '0.25rem', padding: '0.2rem 0.5rem', 
              background: 'rgba(59, 130, 246, 0.2)', color: '#93C5FD', borderRadius: '4px', fontSize: '0.75rem' 
            }}>
              {dict?.tone_label || 'Tono:'} {getToneLabel(tone)}
            </span>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
          <strong style={{ fontSize: '0.85rem', color: '#CBD5E1', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
            {dict?.personality_title || 'Personalità e comportamento'}
          </strong>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#94A3B8', lineHeight: '1.5', minHeight: '60px' }}>
            {personality || dict?.personality_empty || 'Nessuna descrizione specificata.'}
          </p>
        </div>
        <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#64748B', display: 'flex', justifyContent: 'space-between' }}>
          <span>Avatar: {avatar}</span>
          <span>{initialConfig.status === 'active' ? (dict?.status_active || '🟢 Attivo') : (dict?.status_inactive || '⚪ Disattivato')}</span>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="wai-card" style={{ padding: '1.5rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.25rem' }}>{dict?.form_title || 'Impostazioni operative (P1)'}</h3>
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
            <label className="wai-label" htmlFor="name">{dict?.name_label || 'Nome del Digital Employee'}</label>
            <input
              id="name"
              name="name"
              type="text"
              className="wai-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={dict?.name_placeholder || 'es. Nome del collaboratore...'}
              required
              disabled={readOnly || isPending}
            />
          </div>

          <div className="wai-form-group">
            <label className="wai-label" htmlFor="communicationTone">{dict?.tone_select_label || 'Tono di comunicazione'}</label>
            <select
              id="communicationTone"
              name="communicationTone"
              className="wai-select"
              value={tone}
              onChange={(e) => setTone(e.target.value as CommunicationTone)}
              disabled={readOnly || isPending}
            >
              <option value="cordial_empathic">{dict?.tone_cordial || 'Cordiale ed empatico'}</option>
              <option value="formal">{dict?.tone_formal || 'Formale e istituzionale'}</option>
              <option value="direct">{dict?.tone_direct || 'Diretto e sintetico'}</option>
            </select>
          </div>

          <div className="wai-form-group">
            <label className="wai-label" htmlFor="personalitySummary">{dict?.personality_label || 'Personalità e comportamento'}</label>
            <textarea
              id="personalitySummary"
              name="personalitySummary"
              className="wai-input"
              style={{ minHeight: '100px', resize: 'vertical' }}
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder={dict?.personality_placeholder || 'Descrivi carattere e comportamento...'}
              required
              disabled={readOnly || isPending}
            />
          </div>

          <div className="wai-form-group">
            <label className="wai-label" htmlFor="language">{dict?.language_label || 'Lingua predefinita / fallback'}</label>
            <select
              id="language"
              name="language"
              className="wai-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={readOnly || isPending}
            >
              <option value="it-IT">{dict?.language_it || '🇮🇹 Italiano — principale'}</option>
              <option value="en-US">{dict?.language_en || '🇬🇧 English — international'}</option>
              <option value="pt-BR">{dict?.language_pt || '🇧🇷 Português — support'}</option>
            </select>
          </div>

          <div className="wai-form-group">
            <label className="wai-label" htmlFor="avatarPlaceholderUrl">{dict?.avatar_label || 'Avatar (ID / URL)'}</label>
            <input
              id="avatarPlaceholderUrl"
              name="avatarPlaceholderUrl"
              type="text"
              className="wai-input"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="es. /avatars/default.svg"
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
              {isPending ? (dict?.saving_btn || 'Salvataggio...') : (dict?.submit_btn || 'Salva configurazione')}
            </button>
          )}
          {readOnly && (
            <div className="wai-alert" style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'center', marginTop: '1rem' }}>
              {dict?.readonly_notice || 'Modalità sola lettura per il ruolo visualizzatore.'}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
