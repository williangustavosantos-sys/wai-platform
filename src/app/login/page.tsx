'use client';

import React, { useState, useTransition } from 'react';
import { loginAction } from './actions';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await loginAction(formData);
      if (res && res.error) {
        setError(res.error);
      }
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="wai-card" style={{ maxWidth: '420px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 className="wai-logo" style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>WAI PLATFORM</h1>
          <p className="wai-subtitle">Accedi al Portale di Gestione IA</p>
        </div>

        {error && (
          <div className="wai-alert wai-alert-error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="wai-form-group">
            <label className="wai-label" htmlFor="email">Indirizzo Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="wai-input"
              placeholder="nome@studio.it"
              autoComplete="email"
            />
          </div>

          <div className="wai-form-group">
            <label className="wai-label" htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="wai-input"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="wai-button"
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={isPending}
          >
            {isPending ? 'Autenticazione in corso...' : 'Accedi'}
          </button>
        </form>

        <p style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Area operativa sicura e isolata per organizzazione.
        </p>
      </div>
    </div>
  );
}
