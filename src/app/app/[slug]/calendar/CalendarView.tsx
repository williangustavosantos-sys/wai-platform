'use client';

import React, { useState, useTransition } from 'react';
import { Service, Professional, AvailableTimeSlot, Appointment, AppointmentStatus } from '@/modules/calendar/calendar.types';
import { Customer } from '@/modules/crm/crm.types';
import { 
  createServiceAction, createProfessionalAction, createTimeSlotAction, 
  createAppointmentAction, updateAppointmentStatusAction 
} from './actions';

interface Props {
  organizationSlug: string;
  services: Service[];
  professionals: Professional[];
  timeSlots: AvailableTimeSlot[];
  appointments: Appointment[];
  customers: Customer[];
  readOnly?: boolean;
}

export function CalendarView({ 
  organizationSlug, services, professionals, timeSlots, appointments, customers, readOnly = false 
}: Props) {
  const [activeTab, setActiveTab] = useState<'appointments' | 'services' | 'professionals'>('appointments');
  const [status, setStatus] = useState<{ error?: string; success?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Form toggles
  const [showAddAppointment, setShowAddAppointment] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [showAddProfessional, setShowAddProfessional] = useState(false);
  const [showAddTimeSlot, setShowAddTimeSlot] = useState(false);
  const [cancelModalAppointmentId, setCancelModalAppointmentId] = useState<string | null>(null);
  const [cancellationReasonInput, setCancellationReasonInput] = useState('');

  const handleCreateAppointment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (readOnly) return;
    setStatus(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createAppointmentAction(organizationSlug, formData);
      if (res.error) setStatus({ error: res.error });
      else if (res.success) {
        setStatus({ success: res.message });
        setShowAddAppointment(false);
      }
    });
  };

  const handleCreateService = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (readOnly) return;
    setStatus(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createServiceAction(organizationSlug, formData);
      if (res.error) setStatus({ error: res.error });
      else if (res.success) {
        setStatus({ success: res.message });
        setShowAddService(false);
      }
    });
  };

  const handleCreateProfessional = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (readOnly) return;
    setStatus(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createProfessionalAction(organizationSlug, formData);
      if (res.error) setStatus({ error: res.error });
      else if (res.success) {
        setStatus({ success: res.message });
        setShowAddProfessional(false);
      }
    });
  };

  const handleCreateTimeSlot = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (readOnly) return;
    setStatus(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createTimeSlotAction(organizationSlug, formData);
      if (res.error) setStatus({ error: res.error });
      else if (res.success) {
        setStatus({ success: res.message });
        setShowAddTimeSlot(false);
      }
    });
  };

  const handleStatusChange = (id: string, newStatus: AppointmentStatus, reason?: string) => {
    if (readOnly) return;
    setStatus(null);
    startTransition(async () => {
      const res = await updateAppointmentStatusAction(organizationSlug, id, newStatus, reason);
      if (res.error) setStatus({ error: res.error });
      else if (res.success) {
        setStatus({ success: res.message });
        setCancelModalAppointmentId(null);
      }
    });
  };

  const getDayName = (day: number) => {
    const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    return days[day] || 'Sconosciuto';
  };

  const getStatusBadge = (st: AppointmentStatus) => {
    switch (st) {
      case 'confirmed':
        return <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.2)', color: '#6EE7B7', fontSize: '0.75rem' }}>Confermato (Blocco GIST)</span>;
      case 'completed':
        return <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.2)', color: '#93C5FD', fontSize: '0.75rem' }}>Completato</span>;
      case 'cancelled':
        return <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.2)', color: '#FCA5A5', fontSize: '0.75rem' }}>Annullato</span>;
      default:
        return <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#FCD34D', fontSize: '0.75rem' }}>In Attesa / Hold</span>;
    }
  };

  return (
    <div>
      {status?.error && <div className="wai-alert wai-alert-error" style={{ marginBottom: '1.5rem' }}>{status.error}</div>}
      {status?.success && <div className="wai-alert wai-alert-success" style={{ marginBottom: '1.5rem' }}>{status.success}</div>}

      {/* Navigation sub-tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        <button
          className={`wai-button ${activeTab === 'appointments' ? '' : 'wai-button-secondary'}`}
          onClick={() => { setActiveTab('appointments'); setStatus(null); }}
          type="button"
        >
          📅 Appuntamenti & Prenotazioni ({appointments.length})
        </button>
        <button
          className={`wai-button ${activeTab === 'services' ? '' : 'wai-button-secondary'}`}
          onClick={() => { setActiveTab('services'); setStatus(null); }}
          type="button"
        >
          ✂️ Servizi e Prezzi ({services.length})
        </button>
        <button
          className={`wai-button ${activeTab === 'professionals' ? '' : 'wai-button-secondary'}`}
          onClick={() => { setActiveTab('professionals'); setStatus(null); }}
          type="button"
        >
          👤 Professionisti & Orari Disponibili ({professionals.length})
        </button>
      </div>

      {/* TAB 1: APPOINTMENTS */}
      {activeTab === 'appointments' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, color: '#E2E8F0' }}>Registro Appuntamenti del Tenant</h3>
            {!readOnly && !showAddAppointment && (
              <button className="wai-button" onClick={() => setShowAddAppointment(true)}>
                + Agendare Nuovo Appuntamento
              </button>
            )}
          </div>

          {showAddAppointment && (
            <div className="wai-card" style={{ marginBottom: '2rem', border: '1px solid #3B82F6', background: 'rgba(59, 130, 246, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h4 style={{ margin: 0, color: '#93C5FD', fontSize: '1.1rem' }}>Nuovo Appuntamento (Verifica Anti-Sovrapposizione)</h4>
                <button className="wai-button wai-button-secondary" type="button" onClick={() => setShowAddAppointment(false)} style={{ padding: '0.2rem 0.6rem' }}>Annulla</button>
              </div>
              <form onSubmit={handleCreateAppointment} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div className="wai-form-group">
                  <label className="wai-label">Cliente (CRM) *</label>
                  <select name="customerId" className="wai-select" required disabled={isPending || customers.length === 0}>
                    <option value="">Seleziona un cliente...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.phoneNormalized})</option>)}
                  </select>
                  {customers.length === 0 && <span style={{ fontSize: '0.75rem', color: '#FCA5A5' }}>Registra prima un cliente nella sezione CRM!</span>}
                </div>
                <div className="wai-form-group">
                  <label className="wai-label">Servizio Richiesto *</label>
                  <select name="serviceId" className="wai-select" required disabled={isPending || services.length === 0}>
                    <option value="">Seleziona servizio...</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name} ({s.durationMinutes} min - {s.price ? `€${s.price}` : 'Gratis'})</option>)}
                  </select>
                </div>
                <div className="wai-form-group">
                  <label className="wai-label">Professionista Assegnato *</label>
                  <select name="professionalId" className="wai-select" required disabled={isPending || professionals.length === 0}>
                    <option value="">Seleziona professionista...</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="wai-form-group">
                  <label className="wai-label">Data e Ora Inizio (ISO / Locale) *</label>
                  <input name="startAt" type="datetime-local" className="wai-input" required disabled={isPending} />
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>L&apos;orario di fine è calcolato in base alla durata del servizio.</span>
                </div>
                <div className="wai-form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="wai-label">Note o Richieste Particolari</label>
                  <input name="notes" type="text" className="wai-input" placeholder="es. Preferenza sala silenziosa..." disabled={isPending} />
                </div>
                <div style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="wai-button" disabled={isPending || customers.length === 0 || services.length === 0 || professionals.length === 0}>
                    {isPending ? 'Verifica Conflitti e Salvataggio...' : 'Conferma Prenotazione (Genera Audit Log)'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {appointments.length === 0 ? (
            <div className="wai-card" style={{ textAlign: 'center', padding: '3rem', color: '#64748B' }}>
              <p style={{ margin: 0 }}>Nessuna prenotazione presente nell&apos;agenda del tenant.</p>
            </div>
          ) : (
            <div className="wai-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.95rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '1rem' }}>Data e Ora</th>
                    <th style={{ padding: '1rem' }}>Cliente</th>
                    <th style={{ padding: '1rem' }}>Servizio & Professionista</th>
                    <th style={{ padding: '1rem', textAlign: 'center' }}>Stato</th>
                    <th style={{ padding: '1rem', textAlign: 'right' }}>Azioni Operative</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((app, idx) => (
                    <tr key={app.id} style={{ borderBottom: idx === appointments.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '1rem', fontWeight: '600', color: '#E2E8F0', whiteSpace: 'nowrap' }}>
                        {new Date(app.startAt).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        <div style={{ fontSize: '0.85rem', color: '#60A5FA', fontWeight: 'normal' }}>
                          {new Date(app.startAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} - {new Date(app.endAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td style={{ padding: '1rem', color: '#CBD5E1' }}>{app.customerName}</td>
                      <td style={{ padding: '1rem' }}>
                        <strong style={{ color: '#E2E8F0' }}>{app.serviceName}</strong>
                        <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Con: {app.professionalName}</div>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>{getStatusBadge(app.status)}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {!readOnly && app.status === 'confirmed' && (
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            <button 
                              className="wai-button wai-button-secondary" 
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.1)', color: '#6EE7B7' }}
                              onClick={() => handleStatusChange(app.id, 'completed')}
                            >
                              ✔ Completa
                            </button>
                            <button 
                              className="wai-button wai-button-secondary" 
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', borderColor: 'rgba(239, 68, 68, 0.5)', color: '#FCA5A5' }}
                              onClick={() => { setCancelModalAppointmentId(app.id); setCancellationReasonInput(''); }}
                            >
                              ✖ Annulla
                            </button>
                          </div>
                        )}
                        {app.status === 'cancelled' && app.cancellationReason && (
                          <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontStyle: 'italic' }}>
                            Motivo: {app.cancellationReason}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Cancellation Reason Dialog */}
          {cancelModalAppointmentId && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
              <div className="wai-card" style={{ width: '400px', border: '1px solid #EF4444' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: '#FCA5A5' }}>Annullamento Appuntamento (Audit Log)</h4>
                <div className="wai-form-group">
                  <label className="wai-label">Motivo della cancellazione</label>
                  <input 
                    type="text" 
                    className="wai-input" 
                    placeholder="es. Il cliente è impossibilitato a venire..." 
                    value={cancellationReasonInput} 
                    onChange={e => setCancellationReasonInput(e.target.value)} 
                    autoFocus
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                  <button className="wai-button wai-button-secondary" onClick={() => setCancelModalAppointmentId(null)}>Indietro</button>
                  <button className="wai-button" style={{ background: '#DC2626' }} onClick={() => handleStatusChange(cancelModalAppointmentId, 'cancelled', cancellationReasonInput || 'Nessuna specifica')}>
                    Conferma Annullamento
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SERVICES */}
      {activeTab === 'services' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, color: '#E2E8F0' }}>Catologo Servizi dell&apos;Azienda</h3>
            {!readOnly && !showAddService && (
              <button className="wai-button" onClick={() => setShowAddService(true)}>+ Aggiungi Servizio</button>
            )}
          </div>

          {showAddService && (
            <div className="wai-card" style={{ marginBottom: '2rem', border: '1px solid #10B981', background: 'rgba(16, 185, 129, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h4 style={{ margin: 0, color: '#6EE7B7' }}>Nuovo Servizio</h4>
                <button className="wai-button wai-button-secondary" type="button" onClick={() => setShowAddService(false)} style={{ padding: '0.2rem 0.6rem' }}>Annulla</button>
              </div>
              <form onSubmit={handleCreateService} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div className="wai-form-group">
                  <label className="wai-label">Nome Servizio *</label>
                  <input name="name" type="text" className="wai-input" required placeholder="es. Consulenza Fiscale o Taglio Capelli" disabled={isPending} />
                </div>
                <div className="wai-form-group">
                  <label className="wai-label">Durata (Minuti) *</label>
                  <input name="durationMinutes" type="number" className="wai-input" defaultValue={30} required min={5} max={480} disabled={isPending} />
                </div>
                <div className="wai-form-group">
                  <label className="wai-label">Prezzo (€)</label>
                  <input name="price" type="number" step="0.01" className="wai-input" placeholder="es. 45.00" disabled={isPending} />
                </div>
                <div className="wai-form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="wai-label">Descrizione Dettagliata</label>
                  <input name="description" type="text" className="wai-input" placeholder="Breve spiegazione delle caratteristiche del servizio..." disabled={isPending} />
                </div>
                <div style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="wai-button" style={{ background: '#059669' }} disabled={isPending}>
                    {isPending ? 'Salvataggio...' : 'Registra nel Catalogo Servizi'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {services.map(s => (
              <div key={s.id} className="wai-card" style={{ border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>{s.name}</h4>
                    <span style={{ fontWeight: 'bold', color: '#10B981', fontSize: '1.1rem' }}>
                      {s.price !== null ? `€${s.price.toFixed(2)}` : 'Su preventivo'}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.85rem', color: '#60A5FA', display: 'inline-block', marginBottom: '0.5rem' }}>
                    ⏱ Durata Stimata: {s.durationMinutes} min
                  </span>
                  <p style={{ fontSize: '0.9rem', color: '#94A3B8', margin: '0.5rem 0 1rem 0' }}>
                    {s.description || 'Nessuna descrizione del servizio specificata.'}
                  </p>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.8rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748B' }}>
                  <span>Stato: 🟢 Attivo</span>
                  <span>ID: {s.id.slice(0, 8)}...</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: PROFESSIONALS & SLOTS */}
      {activeTab === 'professionals' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, color: '#E2E8F0' }}>Professionisti & Riferimenti Orari</h3>
            {!readOnly && (
              <div style={{ display: 'flex', gap: '1rem' }}>
                {!showAddProfessional && <button className="wai-button" onClick={() => setShowAddProfessional(true)}>+ Nuovo Professionista</button>}
                {!showAddTimeSlot && professionals.length > 0 && <button className="wai-button wai-button-secondary" onClick={() => setShowAddTimeSlot(true)}>+ Nuova Fascia Oraria</button>}
              </div>
            )}
          </div>

          {showAddProfessional && (
            <div className="wai-card" style={{ marginBottom: '2rem', border: '1px solid #3B82F6', background: 'rgba(59, 130, 246, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h4 style={{ margin: 0, color: '#93C5FD' }}>Inserimento Nuovo Professionista / Collaboratore</h4>
                <button className="wai-button wai-button-secondary" type="button" onClick={() => setShowAddProfessional(false)} style={{ padding: '0.2rem 0.6rem' }}>Annulla</button>
              </div>
              <form onSubmit={handleCreateProfessional} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div className="wai-form-group">
                  <label className="wai-label">Nome Completo *</label>
                  <input name="name" type="text" className="wai-input" required placeholder="es. Dott.ssa Francesca" disabled={isPending} />
                </div>
                <div className="wai-form-group">
                  <label className="wai-label">Email Operativa</label>
                  <input name="email" type="email" className="wai-input" placeholder="francesca@studio.it" disabled={isPending} />
                </div>
                <div className="wai-form-group">
                  <label className="wai-label">Telefono di Contatto</label>
                  <input name="phone" type="text" className="wai-input" placeholder="+39 347 1122334" disabled={isPending} />
                </div>
                <div style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="wai-button" disabled={isPending}>Salva Professionista</button>
                </div>
              </form>
            </div>
          )}

          {showAddTimeSlot && (
            <div className="wai-card" style={{ marginBottom: '2rem', border: '1px solid #8B5CF6', background: 'rgba(139, 92, 246, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h4 style={{ margin: 0, color: '#C4B5FD' }}>Aggiungi Fascia Oraria di Disponibilità Ricevimento</h4>
                <button className="wai-button wai-button-secondary" type="button" onClick={() => setShowAddTimeSlot(false)} style={{ padding: '0.2rem 0.6rem' }}>Annulla</button>
              </div>
              <form onSubmit={handleCreateTimeSlot} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
                <div className="wai-form-group">
                  <label className="wai-label">Professionista *</label>
                  <select name="professionalId" className="wai-select" required disabled={isPending}>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="wai-form-group">
                  <label className="wai-label">Giorno della Settimana *</label>
                  <select name="dayOfWeek" className="wai-select" required disabled={isPending}>
                    <option value="1">Lunedì</option>
                    <option value="2">Martedì</option>
                    <option value="3">Mercoledì</option>
                    <option value="4">Giovedì</option>
                    <option value="5">Venerdì</option>
                    <option value="6">Sabato</option>
                    <option value="0">Domenica</option>
                  </select>
                </div>
                <div className="wai-form-group">
                  <label className="wai-label">Ora Inizio *</label>
                  <input name="startTime" type="time" className="wai-input" defaultValue="09:00" required disabled={isPending} />
                </div>
                <div className="wai-form-group">
                  <label className="wai-label">Ora Fine *</label>
                  <input name="endTime" type="time" className="wai-input" defaultValue="18:00" required disabled={isPending} />
                </div>
                <div style={{ gridColumn: 'span 4', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="wai-button" style={{ background: '#7C3AED' }} disabled={isPending}>Salva Fascia Oraria</button>
                </div>
              </form>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div className="wai-card" style={{ border: '1px solid var(--border-color)' }}>
              <h4 style={{ marginTop: 0, color: '#93C5FD', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                Elenco Professionisti del Tenant ({professionals.length})
              </h4>
              {professionals.length === 0 ? (
                <p style={{ color: '#64748B' }}>Nessun professionista censito.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {professionals.map(p => (
                    <li key={p.id} style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '1.05rem' }}>{p.name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginTop: '0.3rem' }}>
                        Email: {p.email || '—'} | Telefono: {p.phoneNormalized || '—'}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="wai-card" style={{ border: '1px solid var(--border-color)' }}>
              <h4 style={{ marginTop: 0, color: '#C4B5FD', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                Orari Configurati per Ricevimento ({timeSlots.length})
              </h4>
              {timeSlots.length === 0 ? (
                <p style={{ color: '#64748B' }}>Nessun orario di disponibilità specificato.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {timeSlots.map(ts => {
                    const prof = professionals.find(p => p.id === ts.professionalId);
                    return (
                      <li key={ts.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                        <div>
                          <strong style={{ color: '#E2E8F0', display: 'inline-block', width: '100px' }}>{getDayName(ts.dayOfWeek)}</strong>
                          <span style={{ color: '#94A3B8', fontSize: '0.9rem' }}>({prof ? prof.name : 'All'})</span>
                        </div>
                        <span style={{ fontFamily: 'monospace', color: '#10B981', fontWeight: '600' }}>
                          {ts.startTime.slice(0, 5)} - {ts.endTime.slice(0, 5)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
