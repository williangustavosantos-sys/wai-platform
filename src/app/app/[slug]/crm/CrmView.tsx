'use client';

import React, { useState, useTransition } from 'react';
import { Customer } from '@/modules/crm/crm.types';
import { createCustomerAction, updateCustomerAction, archiveCustomerAction } from './actions';

interface Props {
  organizationSlug: string;
  initialCustomers: Customer[];
  readOnly?: boolean;
}

export function CrmView({ organizationSlug, initialCustomers, readOnly = false }: Props) {
  const [customers] = useState<Customer[]>(initialCustomers);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [status, setStatus] = useState<{ error?: string; success?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredCustomers = customers.filter(c => 
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phoneNormalized.includes(searchTerm) ||
    (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (readOnly) return;
    setStatus(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await createCustomerAction(organizationSlug, formData);
      if (res.error) {
        setStatus({ error: res.error });
      } else if (res.success) {
        setStatus({ success: res.message });
        setIsCreating(false);
      }
    });
  };

  const handleUpdateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (readOnly || !selectedCustomer) return;
    setStatus(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await updateCustomerAction(organizationSlug, selectedCustomer.id, formData);
      if (res.error) {
        setStatus({ error: res.error });
      } else if (res.success) {
        setStatus({ success: res.message });
        setSelectedCustomer(null);
      }
    });
  };

  const handleArchive = (id: string, name: string) => {
    if (readOnly) return;
    if (!confirm(`Confermi l'archiviazione del cliente ${name}? L'operazione sarà registrata nell'Audit Log.`)) return;
    setStatus(null);
    startTransition(async () => {
      const res = await archiveCustomerAction(organizationSlug, id);
      if (res.error) {
        setStatus({ error: res.error });
      } else if (res.success) {
        setStatus({ success: res.message });
      }
    });
  };

  return (
    <div>
      {status?.error && <div className="wai-alert wai-alert-error" style={{ marginBottom: '1.5rem' }}>{status.error}</div>}
      {status?.success && <div className="wai-alert wai-alert-success" style={{ marginBottom: '1.5rem' }}>{status.success}</div>}

      {/* Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
        <input
          type="text"
          className="wai-input"
          style={{ maxWidth: '360px', margin: 0 }}
          placeholder="Cerca per nome, telefono o email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {!readOnly && !isCreating && !selectedCustomer && (
          <button
            className="wai-button"
            onClick={() => { setIsCreating(true); setSelectedCustomer(null); setStatus(null); }}
          >
            + Registra Nuovo Cliente
          </button>
        )}
      </div>

      {/* Inline Create Form */}
      {isCreating && (
        <div className="wai-card" style={{ marginBottom: '2rem', border: '1px solid #3B82F6', background: 'rgba(59, 130, 246, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, color: '#93C5FD' }}>Registrazione Nuovo Cliente (Anagrafica & Consensi)</h3>
            <button className="wai-button wai-button-secondary" onClick={() => setIsCreating(false)} type="button" style={{ padding: '0.3rem 0.8rem' }}>
              Annulla
            </button>
          </div>
          <form onSubmit={handleCreateSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="wai-form-group">
              <label className="wai-label">Nome *</label>
              <input name="firstName" type="text" className="wai-input" required placeholder="es. Marco" disabled={isPending} />
            </div>
            <div className="wai-form-group">
              <label className="wai-label">Cognome *</label>
              <input name="lastName" type="text" className="wai-input" required placeholder="es. Rossi" disabled={isPending} />
            </div>
            <div className="wai-form-group">
              <label className="wai-label">Telefono (Formato E.164 o Nazionale) *</label>
              <input name="phone" type="text" className="wai-input" required placeholder="es. +39 340 1234567 o 3401234567" disabled={isPending} />
              <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Il numero verrà convertito automaticamente in formato E.164 internazionale.</span>
            </div>
            <div className="wai-form-group">
              <label className="wai-label">Indirizzo Email</label>
              <input name="email" type="email" className="wai-input" placeholder="marco.rossi@email.it" disabled={isPending} />
            </div>
            <div className="wai-form-group">
              <label className="wai-label">Data di Nascita</label>
              <input name="birthDate" type="date" className="wai-input" disabled={isPending} />
            </div>
            <div className="wai-form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <label className="wai-label" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                <input name="marketingConsent" type="checkbox" style={{ width: '18px', height: '18px' }} disabled={isPending} />
                <span>Consenso Marketing e Comunicazioni Promozionali</span>
              </label>
            </div>
            <div className="wai-form-group" style={{ gridColumn: 'span 2' }}>
              <label className="wai-label">Note Storiche e Preferenze Cliente</label>
              <textarea name="notes" className="wai-input" style={{ height: '70px', resize: 'vertical' }} placeholder="Annotazioni operative sul cliente..." disabled={isPending} />
            </div>
            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button type="submit" className="wai-button" disabled={isPending} style={{ width: '220px' }}>
                {isPending ? 'Salvataggio...' : 'Salva Scheda Cliente'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inline Edit Form */}
      {selectedCustomer && (
        <div className="wai-card" style={{ marginBottom: '2rem', border: '1px solid #10B981', background: 'rgba(16, 185, 129, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, color: '#6EE7B7' }}>Modifica Anagrafica: {selectedCustomer.firstName} {selectedCustomer.lastName}</h3>
            <button className="wai-button wai-button-secondary" onClick={() => setSelectedCustomer(null)} type="button" style={{ padding: '0.3rem 0.8rem' }}>
              Chiudi Modifica
            </button>
          </div>
          <form onSubmit={handleUpdateSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="wai-form-group">
              <label className="wai-label">Nome *</label>
              <input name="firstName" type="text" className="wai-input" defaultValue={selectedCustomer.firstName} required disabled={isPending} />
            </div>
            <div className="wai-form-group">
              <label className="wai-label">Cognome *</label>
              <input name="lastName" type="text" className="wai-input" defaultValue={selectedCustomer.lastName} required disabled={isPending} />
            </div>
            <div className="wai-form-group">
              <label className="wai-label">Telefono (Formato E.164) *</label>
              <input name="phone" type="text" className="wai-input" defaultValue={selectedCustomer.phoneNormalized} required disabled={isPending} />
            </div>
            <div className="wai-form-group">
              <label className="wai-label">Indirizzo Email</label>
              <input name="email" type="email" className="wai-input" defaultValue={selectedCustomer.email || ''} disabled={isPending} />
            </div>
            <div className="wai-form-group">
              <label className="wai-label">Data di Nascita</label>
              <input name="birthDate" type="date" className="wai-input" defaultValue={selectedCustomer.birthDate || ''} disabled={isPending} />
            </div>
            <div className="wai-form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <label className="wai-label" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                <input name="marketingConsent" type="checkbox" defaultChecked={selectedCustomer.marketingConsent} style={{ width: '18px', height: '18px' }} disabled={isPending} />
                <span>Consenso Marketing Attivo</span>
              </label>
            </div>
            <div className="wai-form-group" style={{ gridColumn: 'span 2' }}>
              <label className="wai-label">Note Storiche</label>
              <textarea name="notes" className="wai-input" style={{ height: '70px', resize: 'vertical' }} defaultValue={selectedCustomer.notes || ''} disabled={isPending} />
            </div>
            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button type="submit" className="wai-button" style={{ background: '#059669', width: '220px' }} disabled={isPending}>
                {isPending ? 'Aggiornamento...' : 'Aggiorna Cliente & Audit'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customers Table / Cards */}
      {filteredCustomers.length === 0 ? (
        <div className="wai-card" style={{ textAlign: 'center', padding: '3rem', color: '#64748B' }}>
          <h3 style={{ margin: 0 }}>Nessun cliente registrato in questo tenant</h3>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
            {searchTerm ? 'Nessun risultato corrisponde al criterio di ricerca.' : 'Utilizza il pulsante in alto per aggiungere la prima scheda anagrafica al CRM WAI.'}
          </p>
        </div>
      ) : (
        <div className="wai-card" style={{ padding: '0', overflow: 'hidden', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.95rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '1rem' }}>Nome Cognome</th>
                <th style={{ padding: '1rem' }}>Telefono (E.164)</th>
                <th style={{ padding: '1rem' }}>Email & Nascita</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Consenso Mktg</th>
                <th style={{ padding: '1rem' }}>Note Storiche</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((cust, i) => (
                <tr key={cust.id} style={{ borderBottom: i === filteredCustomers.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '1rem', fontWeight: '600', color: '#E2E8F0' }}>
                    {cust.firstName} {cust.lastName}
                    <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', fontWeight: 'normal' }}>
                      Stato: {cust.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', fontFamily: 'monospace', color: '#93C5FD', fontSize: '0.9rem' }}>
                    {cust.phoneNormalized}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.88rem', color: '#CBD5E1' }}>
                    <div>{cust.email || '—'}</div>
                    {cust.birthDate && <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Nato/a: {cust.birthDate}</div>}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    {cust.marketingConsent ? (
                      <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.2)', color: '#6EE7B7', fontSize: '0.75rem' }}>
                        ✔ Autorizzato
                      </span>
                    ) : (
                      <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#FCA5A5', fontSize: '0.75rem' }}>
                        ✘ Non Concesso
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.85rem', color: '#94A3B8', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cust.notes || 'Nessuna nota'}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {!readOnly && (
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          className="wai-button wai-button-secondary"
                          style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }}
                          onClick={() => { setSelectedCustomer(cust); setIsCreating(false); setStatus(null); }}
                        >
                          Modifica
                        </button>
                        <button
                          className="wai-button wai-button-secondary"
                          style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#FCA5A5' }}
                          onClick={() => handleArchive(cust.id, `${cust.firstName} ${cust.lastName}`)}
                        >
                          Archivia
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
