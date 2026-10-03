import { NativeModules } from 'react-native';

const native = NativeModules.HushCalendar;

export type Meeting = {
  id: string; // per occurrence
  title: string;
  start: string; // ISO
  end: string; // ISO
  hasVideoLink: boolean;
  attendeeCount: number;
};
export type CalendarAuth = 'granted' | 'writeOnly' | 'denied' | 'restricted' | 'notDetermined' | 'unknown';

export const authorizationStatus = (): Promise<CalendarAuth> => native.authorizationStatus();
export const requestAccess = (): Promise<boolean> => native.requestAccess();
/** Non-all-day, non-declined, busy events starting within the window (or already underway). */
export const upcomingMeetings = (withinMinutes: number): Promise<Meeting[]> => native.upcomingMeetings(withinMinutes);
