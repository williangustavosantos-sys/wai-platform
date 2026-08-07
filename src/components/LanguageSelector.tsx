'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  currentLang: 'pt-BR' | 'it-IT';
}

export function LanguageSelector({ currentLang }: Props) {
  const router = useRouter();
  const [lang, setLang] = useState<'pt-BR' | 'it-IT'>(currentLang);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value as 'pt-BR' | 'it-IT';
    setLang(newLang);
    
    // Persiste no cookie (validade 1 ano) e no localStorage
    document.cookie = `wai_admin_language=${newLang}; path=/; max-age=31536000; SameSite=Lax`;
    try {
      localStorage.setItem('wai_admin_language', newLang);
    } catch {
      // Ignorar possíveis restrições de storage no navegador
    }

    // Força re-renderização das rotas do Next.js App Router no servidor e cliente
    router.refresh();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }} title="Idioma da interface do administrador">
        🌐
      </span>
      <select
        value={lang}
        onChange={handleLanguageChange}
        style={{
          background: 'rgba(30, 41, 59, 0.8)',
          color: '#E2E8F0',
          border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
          borderRadius: '6px',
          padding: '0.25rem 0.6rem',
          fontSize: '0.82rem',
          fontWeight: 500,
          cursor: 'pointer',
          outline: 'none',
        }}
        aria-label="Seletor de Idioma do Painel"
      >
        <option value="pt-BR">🇧🇷 Português</option>
        <option value="it-IT">🇮🇹 Italiano</option>
      </select>
    </div>
  );
}
