'use client';

import React, { useState, useTransition } from 'react';
import { Appointment } from '@/modules/calendar/calendar.types';
import { formatOrganizationDateTime, toOrganizationDateTimeInput } from '@/modules/shared/organization-timezone';
import { rescheduleAppointmentAction, updateAppointmentStatusAction } from './actions';

interface Props {
  appointment: Appointment | null;
  organizationSlug: string;
  timezone: string;
  readOnly: boolean;
  onClose: () => void;
  onResult: (result: { error?: string; success?: boolean; message?: string }) => void;
}

export function AppointmentDetailsDialog({ appointment, organizationSlug, timezone, readOnly, onClose, onResult }: Props) {
  const [isPending, startTransition] = useTransition();
  const [newStartAt, setNewStartAt] = useState(appointment ? toOrganizationDateTimeInput(appointment.startAt, timezone) : '');
  const [reason, setReason] = useState('');

  if (!appointment) return null;
  const canMutate = !readOnly && (appointment.status === 'confirmed' || appointment.status === 'held');

  const cancel = () => startTransition(async () => {
    const result = await updateAppointmentStatusAction(organizationSlug, appointment.id, 'cancelled', reason || 'Cancellazione dall’agenda');
    onResult(result);
    if (result.success) onClose();
  });
  const reschedule = () => startTransition(async () => {
    const result = await rescheduleAppointmentAction(organizationSlug, appointment.id, newStartAt);
    onResult(result);
    if (result.success) onClose();
  });

  return (
    <div className="wai-dialog-backdrop" role="presentation">
      <section className="wai-card wai-details-dialog" role="dialog" aria-modal="true" aria-label="Dettagli appuntamento">
        <button type="button" className="wai-dialog-close" onClick={onClose} disabled={isPending}>Chiudi</button>
        <h3>{appointment.customerName || 'Cliente'}</h3>
        <p>{appointment.serviceName || 'Servizio'} · {appointment.professionalName || 'Professionista'}</p>
        <p>{formatOrganizationDateTime(appointment.startAt, timezone)} – {formatOrganizationDateTime(appointment.endAt, timezone, 'it-IT', { hour: '2-digit', minute: '2-digit' })}</p>
        <p>Stato: <strong>{appointment.status}</strong></p>
        {appointment.notes && <p>Note: {appointment.notes}</p>}
        {appointment.cancellationReason && <p>Motivo cancellazione: {appointment.cancellationReason}</p>}
        {canMutate && (
          <div className="wai-details-actions">
            <label className="wai-label" htmlFor="newStartAt">Nuovo orario ({timezone})</label>
            <input id="newStartAt" className="wai-input" type="datetime-local" value={newStartAt} onChange={(event) => setNewStartAt(event.target.value)} disabled={isPending} />
            <button type="button" className="wai-button wai-button-secondary" onClick={reschedule} disabled={isPending || !newStartAt}>Riprogramma</button>
            <label className="wai-label" htmlFor="cancelReason">Motivo cancellazione</label>
            <input id="cancelReason" className="wai-input" value={reason} onChange={(event) => setReason(event.target.value)} disabled={isPending} />
            <button type="button" className="wai-button wai-button-danger" onClick={cancel} disabled={isPending}>Annulla appuntamento</button>
          </div>
        )}
      </section>
    </div>
  );
}
