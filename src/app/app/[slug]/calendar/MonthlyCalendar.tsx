'use client';

import React from 'react';
import { Appointment } from '@/modules/calendar/calendar.types';
import { MonthlyCalendarViewModel } from './calendar-view-model';
import { formatOrganizationDateTime } from '@/modules/shared/organization-timezone';

interface Props {
  model: MonthlyCalendarViewModel;
  timezone: string;
  onSelectAppointment: (appointment: Appointment) => void;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export function MonthlyCalendar({ model, timezone, onSelectAppointment }: Props) {
  return (
    <section aria-label={`Calendario mensile ${model.month}`}>
      <div className="wai-month-grid wai-month-weekdays" aria-hidden="true">
        {WEEKDAYS.map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="wai-month-grid">
        {model.days.map((day) => (
          <div key={day.date} className={`wai-month-day ${day.isCurrentMonth ? '' : 'wai-month-day-outside'}`}>
            <time dateTime={day.date} className="wai-month-day-number">{Number(day.date.slice(-2))}</time>
            {day.exceptions.map((exception) => (
              <div key={exception.id} className="wai-month-block" title={exception.reason}>Blocco: {exception.reason}</div>
            ))}
            {day.appointments.map((appointment) => (
              <button
                key={appointment.id}
                type="button"
                className={`wai-month-appointment wai-month-appointment-${appointment.status}`}
                onClick={() => onSelectAppointment(appointment)}
                title={`${appointment.customerName || 'Cliente'} — ${appointment.serviceName || 'Servizio'}`}
              >
                <span>{formatOrganizationDateTime(appointment.startAt, timezone, 'it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                <span>{appointment.customerName || 'Cliente'}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
