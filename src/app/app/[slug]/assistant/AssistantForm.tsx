'use client';

import React, { useState, useTransition } from 'react';
import { updateAssistantAction } from './actions';
import { DigitalEmployeeConfig, CommunicationTone } from '@/modules/assistant/assistant.types';

interface Props {
  organizationSlug: string;
  initialConfig: DigitalEmployeeConfig;
  readOnly?: boolean;
}

export function AssistantForm({ organizationSlug, initialConfig, readOnly = false }: Props) {
  const [status, setStatus] = useState<{ error?: string; success?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(initialConfig.name);
  const [tone, setTone] = useState<CommunicationTone>(initialConfig.communicationTone);
  const [personality, setPersonality] = useState(initialConfig.personalitySummary);
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
      case 'formal': return 'Formale e Istituzionale';
      case 'cordial_empathic': return 'Cordiale ed Empatico';
      case 'direct': return 'Diretto e Sintetico';
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
      {/* Visual Preview Card */}
      <div className="wai-card" style={{ padding: '1.5rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#60A5FA' }}>Anteprima Collaboratore Digitale</h3>
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
            <span style={{ fontSize: '0.85rem', color: '#94A3B8', display: 'block' }}>Lingua Operativa: Italiano ({initialConfig.language})</span>
            <span style={{ 
              display: 'inline-block', marginTop: '0.25rem', padding: '0.2rem 0.5rem', 
              background: 'rgba(59, 130, 246, 0.2)', color: '#93C5FD', borderRadius: '4px', fontSize: '0.75rem' 
            }}>
              Tono: {getToneLabel(tone)}
            </span>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
          <strong style={{ fontSize: '0.85rem', color: '#CBD5E1', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
            Personalità e Comportamento
          </strong>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#94A3B8', lineHeight: '1.5', minHeight: '60px' }}>
            {personality || 'Nessuna descrizione specificata per la personalità operativa.'}
          </p>
        </div>
        <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#64748B', display: 'flex', justifyContent: 'space-between' }}>
          <span>Avatar: {avatar}</span>
          <span>Stato: {initialConfig.status === 'active' ? '🟢 Attivo' : '⚪ Disattivato'}</span>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="wai-card" style={{ padding: '1.5rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.25rem' }}>Impostazioni Operative (Fase 1)</h3>
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
            <label className="wai-label" htmlFor="name">Nome del Collaboratore Digitale</label>
            <input
              id="name"
              name="name"
              type="text"
              className="wai-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="es. Chiara, Marco, Giulia..."
              required
              disabled={readOnly || isPending}
            />
          </div>

          <div className="wai-form-group">
            <label className="wai-label" htmlFor="communicationTone">Tono di Comunicazione</label>
            <select
              id="communicationTone"
              name="communicationTone"
              className="wai-select"
              value={tone}
              onChange={(e) => setTone(e.target.value as CommunicationTone)}
              disabled={readOnly || isPending}
            >
              <option value="cordial_empathic">Cordiale ed Empatico (Consigliato)</option>
              <option value="formal">Formale e Istituzionale</option>
              <option value="direct">Diretto e Sintetico</option>
            </select>
          </div>

          <div className="wai-form-group">
            <label className="wai-label" htmlFor="personalitySummary">Personalità e Tratti Comportamentali</label>
            <textarea
              id="personalitySummary"
              name="personalitySummary"
              className="wai-input"
              style={{ minHeight: '100px', resize: 'vertical' }}
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="Descrizione del carattere, livello di formalità, pazienza ed energia comunicativa..."
              required
              disabled={readOnly || isPending}
            />
          </div>

          <div className="wai-form-group">
            <label className="wai-label" htmlFor="language">Lingua Principale</label>
            <input
              id="language"
              name="language"
              type="text"
              className="wai-input"
              defaultValue={initialConfig.language || 'it-IT'}
              readOnly
              title="Nel pilota iniziale la lingua è vincolata a Italiano (it-IT)"
            />
          </div>

          <div className="wai-form-group">
            <label className="wai-label" htmlFor="avatarPlaceholderUrl">Avatar Placeholder (ID / URL)</label>
            <input
              id="avatarPlaceholderUrl"
              name="avatarPlaceholderUrl"
              type="text"
              className="wai-input"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="es. /avatars/chiara.svg"
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
              {isPending ? 'Salvataggio in corso...' : 'Aggiorna Configurazione Assistente'}
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
