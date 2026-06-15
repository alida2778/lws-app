import type { Matter, Appointment } from '../types';

export class GoogleCalendarService {
  /**
   * Format the Google Calendar Event Title according to requirements:
   * [เลขแฟ้มคดี] / [ปี พ.ศ. คดี] | [เลขคดีดำ] | [แท็กสถานะปัจจุบันศาล] | [เวลา] | [สถานที่]
   */
  static formatGoogleCalendarTitle(matter: Matter, appointment: Appointment): string {
    const caseRef = `${matter.officeCaseNumber || '?'}/${matter.officeCaseYear || '?'}`;
    const blackRef = matter.courtBlackRef || 'ไม่มีเลขคดีดำ';
    const courtStatus = appointment.title || 'นัดหมาย';
    
    // Extract time from dateTime
    let timeStr = 'ไม่ระบุเวลา';
    try {
      if (appointment.dateTime) {
        const dateObj = new Date(appointment.dateTime);
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        timeStr = `${hours}:${minutes} น.`;
      }
    } catch (e) {
      console.warn('Failed to parse time for calendar format', e);
    }

    // Determine location
    const locationStr = appointment.notes?.substring(0, 30) || matter.court || 'ไม่ระบุสถานที่';

    return `${caseRef} | ${blackRef} | ${courtStatus} | ${timeStr} | ${locationStr}`;
  }

  /**
   * Sync a single event to Google Calendar (mocked API call)
   */
  static async syncEvent(_apiKey: string, matter: Matter, appointment: Appointment): Promise<string> {
    const eventTitle = this.formatGoogleCalendarTitle(matter, appointment);
    console.log(`[Google Calendar Sync API] Sending to Google Calendar: "${eventTitle}"`);
    
    // Simulate API request delay
    await new Promise(resolve => setTimeout(resolve, 200));

    // Return a mock googleEventId if not already present
    return appointment.googleEventId || `gcal_event_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Batch sync all events for all matters (mocked)
   */
  static async batchSyncAll(apiKey: string, matters: Matter[]): Promise<boolean> {
    console.log(`[Google Calendar Sync API] Starting batch sync for ${matters.length} matters...`);
    
    for (const m of matters) {
      for (const app of m.appointments) {
        await this.syncEvent(apiKey, m, app);
      }
    }

    return true;
  }
}
