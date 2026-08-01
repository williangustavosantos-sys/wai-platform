'use client';

import React, { useState, useTransition } from 'react';
import { BusinessRulesConfig, BusinessException } from '@/modules/rules/rules.types';
import { updateRulesAction, createExceptionAction, deleteExceptionAction } from './actions';

interface Props {
  organizationSlug: string;
  initialConfig: BusinessRulesConfig;
  initialExceptions: BusinessException[];
  readOnly?: boolean;
}

export function RulesView({ organizationSlug, initialConfig, initialExceptions, readOnly = false }: Props) {
  const [exceptions] = useState<BusinessException[]>(initialExceptions);
  const [status, setStatus] = useState<{ error?: string; success?: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showAddException, setShowAddException] = useState(false);

  const handleRulesSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (readOnly) return;
    setStatus(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateRulesAction(organizationSlug, formData);
      if (res.error) setStatus({ error: res.error });
      else if (res.success) setStatus({ success: res.message });
    });
  };

  const handleCreateException = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (readOnly) return;
    setStatus(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createExceptionAction(organizationSlug, formData);
      if (res.error) setStatus({ error: res.error });
      else if (res.success) {
        setStatus({ success: res.message });
        setShowAddException(false);
      }
    });
  };

  const handleDeleteException = (id: string, reason: string) => {
    if (readOnly || !confirm(`Confermi la rimozione del periodo di chiusura "${reason}"?`)) return;
    setStatus(null);
    startTransition(async () => {
      const res = await deleteExceptionAction(organizationSlug, id);
      if (res.error) setStatus({ error: res.error });
      else if (res.success) setStatus({ success: res.message });
    });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '2rem', alignItems: 'start' }}>
      {/* LEFT: Business Rules & Messaging Templates */}
      <div className="wai-card" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.5rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#60A5FA' }}>
          Parametri Operativi e Messaggi Standard
        </h3>
        <p style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '1.5rem' }}>
          Queste regole determinano le risposte automatiche dell&apos;assistente digitale e le restrizioni per le prenotazioni online.
        </p>

        {status?.error && <div className="wai-alert wai-alert-error" style={{ marginBottom: '1rem' }}>{status.error}</div>}
        {status?.success && <div className="wai-alert wai-alert-success" style={{ marginBottom: '1rem' }}>{status.success}</div>}

        <form onSubmit={handleRulesSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="wai-form-group">
              <label className="wai-label" htmlFor="cancellationWindowHours">Preavviso Minimo Cancellazione (Ore)</label>
              <input 
                id="cancellationWindowHours" 
                name="cancellationWindowHours" 
                type="number" 
                className="wai-input" 
                defaultValue={initialConfig.cancellationWindowHours} 
                required 
                min={0} 
                max={168} 
                disabled={readOnly || isPending} 
              />
              <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Es. 24 = blocco cancellazioni autonome 24h prima.</span>
            </div>
            <div className="wai-form-group">
              <label className="wai-label" htmlFor="maxAdvanceDaysBooking">Orizzonte Massimo Prenotazione (Giorni)</label>
              <input 
                id="maxAdvanceDaysBooking" 
                name="maxAdvanceDaysBooking" 
                type="number" 
                className="wai-input" 
                defaultValue={initialConfig.maxAdvanceDaysBooking || 60} 
                required 
                min={1} 
                max={365} 
                disabled={readOnly || isPending} 
              />
            </div>
          </div>

          <div className="wai-form-group">
            <label className="wai-label" htmlFor="noShowPolicyNote">Nota Interna Politica Mancata Presentazione (No-Show)</label>
            <input 
              id="noShowPolicyNote" 
              name="noShowPolicyNote" 
              type="text" 
              className="wai-input" 
              defaultValue={initialConfig.noShowPolicyNote || ''} 
              placeholder="es. Dopo due assenze ingiustificate, l'appuntamento richiederà acconto..." 
              disabled={readOnly || isPending} 
            />
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: '#93C5FD', fontSize: '0.95rem', textTransform: 'uppercase' }}>
              Modelli di Comunicazione Predefinita
            </h4>
            
            <div className="wai-form-group">
              <label className="wai-label" htmlFor="welcomeMessage">Messaggio di Benvenuto / Saluto Iniziale</label>
              <textarea 
                id="welcomeMessage" 
                name="welcomeMessage" 
                className="wai-input" 
                style={{ height: '65px', resize: 'vertical' }} 
                defaultValue={initialConfig.welcomeMessage} 
                required 
                disabled={readOnly || isPending} 
              />
            </div>

            <div className="wai-form-group">
              <label className="wai-label" htmlFor="confirmationMessageTemplate">Modello Conferma Appuntamento</label>
              <textarea 
                id="confirmationMessageTemplate" 
                name="confirmationMessageTemplate" 
                className="wai-input" 
                style={{ height: '65px', resize: 'vertical' }} 
                defaultValue={initialConfig.confirmationMessageTemplate} 
                required 
                disabled={readOnly || isPending} 
              />
              <span style={{ fontSize: '0.75rem', color: '#60A5FA' }}>Variabili supportate: <code>&#123;data_ora&#125;</code>, <code>&#123;professionista&#125;</code></span>
            </div>

            <div className="wai-form-group">
              <label className="wai-label" htmlFor="cancellationMessageTemplate">Modello Notifica di Cancellazione</label>
              <textarea 
                id="cancellationMessageTemplate" 
                name="cancellationMessageTemplate" 
                className="wai-input" 
                style={{ height: '60px', resize: 'vertical' }} 
                defaultValue={initialConfig.cancellationMessageTemplate} 
                required 
                disabled={readOnly || isPending} 
              />
            </div>

            <div className="wai-form-group">
              <label className="wai-label" htmlFor="outOfHoursMessage">Messaggio Fuori Orario Lavorativo</label>
              <textarea 
                id="outOfHoursMessage" 
                name="outOfHoursMessage" 
                className="wai-input" 
                style={{ height: '65px', resize: 'vertical' }} 
                defaultValue={initialConfig.outOfHoursMessage} 
                required 
                disabled={readOnly || isPending} 
              />
            </div>

            <div className="wai-form-group" style={{ marginTop: '0.5rem' }}>
              <label className="wai-label" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input name="autoConfirmAppointments" type="checkbox" defaultChecked={initialConfig.autoConfirmAppointments} style={{ width: '18px', height: '18px' }} disabled={readOnly || isPending} />
                <span>Conferma Automatica degli Appuntamenti (senza intervento umano)</span>
              </label>
            </div>
          </div>

          {!readOnly && (
            <button type="submit" className="wai-button" style={{ width: '100%', marginTop: '0.5rem' }} disabled={isPending}>
              {isPending ? 'Salvataggio in corso...' : 'Salva Regole & Modelli Communicativi'}
            </button>
          )}
        </form>
      </div>

      {/* RIGHT: Exceptions and Holiday Periods */}
      <div className="wai-card" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, color: '#C4B5FD', fontSize: '1.25rem' }}>Chiusure & Eccezioni</h3>
          {!readOnly && !showAddException && (
            <button className="wai-button wai-button-secondary" onClick={() => setShowAddException(true)} style={{ padding: '0.3rem 0.7rem', fontSize: '0.85rem' }}>
              + Inserisci Periodo
            </button>
          )}
        </div>
        <p style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '1.25rem' }}>
          I periodi elencati bloccano qualsiasi richiesta di appuntamento per l&apos;intera struttura.
        </p>

        {showAddException && (
          <div className="wai-card" style={{ marginBottom: '1.5rem', border: '1px solid #8B5CF6', background: 'rgba(139, 92, 246, 0.05)', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
              <strong style={{ color: '#E2E8F0', fontSize: '0.95rem' }}>Nuova Chiusura o Festività</strong>
              <button className="wai-button wai-button-secondary" type="button" onClick={() => setShowAddException(false)} style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}>Chiudi</button>
            </div>
            <form onSubmit={handleCreateException} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div className="wai-form-group">
                  <label className="wai-label" style={{ fontSize: '0.8rem' }}>Dal *</label>
                  <input name="startDate" type="date" className="wai-input" required disabled={isPending} />
                </div>
                <div className="wai-form-group">
                  <label className="wai-label" style={{ fontSize: '0.8rem' }}>Al *</label>
                  <input name="endDate" type="date" className="wai-input" required disabled={isPending} />
                </div>
              </div>
              <div className="wai-form-group">
                <label className="wai-label" style={{ fontSize: '0.8rem' }}>Motivo *</label>
                <input name="reason" type="text" className="wai-input" placeholder="es. Ferie Estive o Chiusura Patronale" required disabled={isPending} />
              </div>
              <button type="submit" className="wai-button" style={{ background: '#7C3AED', width: '100%', padding: '0.5rem' }} disabled={isPending}>
                Salva Periodo (Blocca Agenda)
              </button>
            </form>
          </div>
        )}

        {exceptions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', color: '#64748B' }}>
            Nessun periodo di chiusura registrato.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {exceptions.map(exc => (
              <li key={exc.id} style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: '600', fontSize: '0.95rem' }}>{exc.reason}</div>
                  <div style={{ color: '#FCA5A5', fontFamily: 'monospace', fontSize: '0.82rem', marginTop: '0.2rem' }}>
                    📅 {exc.startDate.split('-').reverse().join('/')} ➔ {exc.endDate.split('-').reverse().join('/')}
                  </div>
                </div>
                {!readOnly && (
                  <button 
                    className="wai-button wai-button-secondary"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#FCA5A5' }}
                    onClick={() => handleDeleteException(exc.id, exc.reason)}
                  >
                    Rimuovi
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
