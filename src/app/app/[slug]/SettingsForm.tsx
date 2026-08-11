'use client';

import React, { useState, useTransition } from 'react';
import { updateSettingsAction } from './actions';

interface Props {
  organizationSlug: string;
  organizationName: string;
  initialSettings: Record<string, unknown>;
  locale?: string;
  dict: {
    display_name_label: string;
    display_name_placeholder: string;
    org_language_label: string;
    theme_label: string;
    theme_institutional: string;
    theme_balanced: string;
    theme_cool: string;
    submit_btn: string;
    saving_btn: string;
    success_msg: string;
  };
}

export function SettingsForm({ organizationSlug, organizationName, initialSettings, locale, dict }: Props) {
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
        setStatus({ success: res.message || dict.success_msg });
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
        <label className="wai-label" htmlFor="businessName">Nome dell’azienda</label>
        <input
          id="businessName"
          name="businessName"
          type="text"
          className="wai-input"
          defaultValue={organizationName || ((initialSettings?.displayName || initialSettings?.display_name || '') as string)}
          placeholder={dict.display_name_placeholder}
          required
          disabled={isPending}
        />
      </div>

      <div className="wai-form-group">
        <label className="wai-label" htmlFor="address">Indirizzo / sede</label>
        <input id="address" name="address" type="text" className="wai-input" defaultValue={(initialSettings?.address || '') as string} disabled={isPending} />
      </div>

      <div className="wai-form-group">
        <label className="wai-label" htmlFor="phone">Telefono</label>
        <input id="phone" name="phone" type="tel" className="wai-input" defaultValue={(initialSettings?.phone || '') as string} disabled={isPending} />
      </div>

      <div className="wai-form-group">
        <label className="wai-label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="wai-input" defaultValue={(initialSettings?.email || '') as string} disabled={isPending} />
      </div>

      <div className="wai-form-group">
        <label className="wai-label" htmlFor="workingHours">Orari di apertura</label>
        <textarea id="workingHours" name="workingHours" className="wai-input" style={{ minHeight: '84px', resize: 'vertical' }} defaultValue={(initialSettings?.working_hours || initialSettings?.workingHours || '') as string} disabled={isPending} />
      </div>

      <div className="wai-form-group">
        <label className="wai-label" htmlFor="locale">{dict.org_language_label}</label>
        <select
          id="locale"
          name="locale"
          className="wai-select"
          defaultValue={locale || 'it-IT'}
          disabled={isPending}
        >
          <option value="it-IT">🇮🇹 Italiano</option>
          <option value="pt-BR">🇧🇷 Português (Brasil)</option>
        </select>
      </div>

      <div className="wai-form-group">
        <label className="wai-label" htmlFor="themePreference">{dict.theme_label}</label>
        <select
          id="themePreference"
          name="themePreference"
          className="wai-select"
          defaultValue={(initialSettings?.themePreference || 'institutional') as string}
          disabled={isPending}
        >
          <option value="institutional">{dict.theme_institutional}</option>
          <option value="balanced">{dict.theme_balanced}</option>
          <option value="cool">{dict.theme_cool}</option>
        </select>
      </div>

      <button
        type="submit"
        className="wai-button"
        style={{ width: '100%' }}
        disabled={isPending}
      >
        {isPending ? dict.saving_btn : dict.submit_btn}
      </button>
    </form>
  );
}
