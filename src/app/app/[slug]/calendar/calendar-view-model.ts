import { Appointment } from '@/modules/calendar/calendar.types';
import { BusinessException } from '@/modules/rules/rules.types';
import { getOrganizationDateKey, getOrganizationDayRange, isOrganizationMonth } from '@/modules/shared/organization-timezone';

export interface MonthlyCalendarDay {
  date: string;
  isCurrentMonth: boolean;
  appointments: Appointment[];
  exceptions: BusinessException[];
}

export interface MonthlyCalendarViewModel {
  month: string;
  days: MonthlyCalendarDay[];
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getAdjacentMonths(month: string): { previous: string; next: string } {
  return { previous: shiftMonth(month, -1), next: shiftMonth(month, 1) };
}

/**
 * Builds a presentation-only month grid. All appointment and exception
 * inclusion is calculated in the organization timezone, never the browser's.
 */
export function buildMonthlyCalendar(
  month: string,
  timezone: string,
  appointments: Appointment[],
  exceptions: BusinessException[],
): MonthlyCalendarViewModel {
  if (!isOrganizationMonth(month)) throw new Error('Mese calendario non valido.');
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const padBefore = (firstDay.getUTCDay() + 6) % 7;
  const gridStart = new Date(Date.UTC(year, monthNumber - 1, 1 - padBefore));

  const appointmentsByDate = new Map<string, Appointment[]>();
  for (const appointment of appointments) {
    const key = getOrganizationDateKey(appointment.startAt, timezone);
    appointmentsByDate.set(key, [...(appointmentsByDate.get(key) || []), appointment]);
  }

  const days: MonthlyCalendarDay[] = Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart);
    current.setUTCDate(gridStart.getUTCDate() + index);
    const date = dateKey(current.getUTCFullYear(), current.getUTCMonth() + 1, current.getUTCDate());
    const range = getOrganizationDayRange(date, timezone);
    const dayStart = new Date(range.startAt).getTime();
    const dayEnd = new Date(range.endAt).getTime();

    return {
      date,
      isCurrentMonth: current.getUTCMonth() + 1 === monthNumber,
      appointments: appointmentsByDate.get(date) || [],
      exceptions: exceptions.filter((exception) => {
        const exceptionStart = new Date(exception.startDate).getTime();
        const exceptionEnd = new Date(exception.endDate).getTime();
        return exceptionStart < dayEnd && exceptionEnd > dayStart;
      }),
    };
  });

  return { month, days };
}
