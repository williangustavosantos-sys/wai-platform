'use client';

export default function TenantError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="wai-container" style={{ paddingTop: '4rem' }}>
      <div className="wai-card wai-alert-error" style={{ textAlign: 'center' }}>
        <h2>Impossibile caricare l&apos;area operativa</h2>
        <p style={{ marginTop: '0.75rem' }}>Riprova. Se il problema persiste, contatta il responsabile dell&apos;organizzazione.</p>
        <button type="button" className="wai-button" style={{ marginTop: '1rem' }} onClick={() => reset()}>Riprova</button>
      </div>
    </div>
  );
}
