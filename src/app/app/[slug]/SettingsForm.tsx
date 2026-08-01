'use client';

import React, { useState, useTransition } from 'react';
import { updateSettingsAction } from './actions';

interface Props {
  organizationSlug: string;
  initialSettings: Record<string, unknown>;
}

export function SettingsForm({ organizationSlug, initialSettings }: Props) {
  const [status, setStatus] = useState<{ error?: string; success?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await updateSettingsAction(organizationSlug, formData);
      if (res.error) {
        setStatus({ error: res.error });
      } else if (res.success) {
        setStatus({ success: res.message });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {status?.error && (
        <div className="wai-alert wai-alert-error">
          {status.error}
        </div>
      )}
      {status?.success && (
        <div className="wai-alert wai-alert-success">
          {status.success}
        </div>
      )}

      <div className="wai-form-group">
        <label className="wai-label" htmlFor="displayName">Nome Visualizzato (Display Name)</label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          className="wai-input"
          defaultValue={(initialSettings?.displayName || initialSettings?.display_name || '') as string}
          placeholder="es. Studio Aurora Commercialisti"
          required
        />
      </div>

      <div className="wai-form-group">
        <label className="wai-label" htmlFor="themePreference">Tema Interfaccia (Preferenza)</label>
        <select
          id="themePreference"
          name="themePreference"
          className="wai-select"
          defaultValue={(initialSettings?.themePreference || 'institutional') as string}
        >
          <option value="institutional">Istituzionale Scuro (Default)</option>
          <option value="balanced">Bilanciato Moderno</option>
          <option value="cool">Blu Tecnico</option>
        </select>
      </div>

      <button
        type="submit"
        className="wai-button"
        style={{ width: '100%' }}
        disabled={isPending}
      >
        {isPending ? 'Registrazione e salvataggio...' : 'Salva Modifiche (Genera Audit Log)'}
      </button>
    </form>
  );
}
