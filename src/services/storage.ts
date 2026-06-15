import type { Matter, GlobalDashboardIndex, Transaction } from '../types';
import { INITIAL_MATTERS } from './initialMatters';

// Storage Keys
const LWS_MATTERS_KEY = 'lws_matters_data';
const LWS_SETTINGS_KEY = 'lws_settings';

export interface LWSSettings {
  theme: 'dark' | 'light';
  primaryColor: string;
  isMockMode: boolean;
  microsoftAccount: string | null;
  googleCalendarConnected: boolean;
  onedriveRootFolder: string;
  googleApiKey: string;
  microsoftClientId: string;
}

const DEFAULT_SETTINGS: LWSSettings = {
  theme: 'dark',
  primaryColor: '#F59E0B', // Amber/gold accent matching the mockup
  isMockMode: false,
  microsoftAccount: null,
  googleCalendarConnected: false,
  onedriveRootFolder: '',
  googleApiKey: '',
  microsoftClientId: ''
};

// Initial matters imported from initialMatters.ts (migrated from SQLite DB and folder scanner)

export class StorageService {
  // Get all matters, sanitize them, and heal localStorage
  static getMatters(): Matter[] {
    const matters = this.getMattersRaw();
    localStorage.setItem(LWS_MATTERS_KEY, JSON.stringify(matters));
    return matters;
  }

  // Load Settings
  static getSettings(): LWSSettings {
    const raw = localStorage.getItem(LWS_SETTINGS_KEY);
    const isLocalhost = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' || 
                        window.location.hostname === '[::1]';
    if (!raw) {
      const settings = { ...DEFAULT_SETTINGS };
      if (!isLocalhost) settings.isMockMode = false;
      localStorage.setItem(LWS_SETTINGS_KEY, JSON.stringify(settings));
      return settings;
    }
    try {
      const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      if (!isLocalhost) settings.isMockMode = false;
      return settings;
    } catch {
      const settings = { ...DEFAULT_SETTINGS };
      if (!isLocalhost) settings.isMockMode = false;
      return settings;
    }
  }

  // Save Settings
  static saveSettings(settings: LWSSettings): void {
    localStorage.setItem(LWS_SETTINGS_KEY, JSON.stringify(settings));
    // Dispatch custom event for real-time reactive theme switches
    window.dispatchEvent(new Event('lws-settings-changed'));
  }

  // Sanitize matters structure to prevent runtime and type compile errors
  private static sanitizeMatters(rawList: any[]): Matter[] {
    return rawList.map(m => {
      // 1. Split caseNumber into officeCaseNumber / officeCaseYear if missing
      let officeCaseNumber = m.officeCaseNumber || '';
      let officeCaseYear = m.officeCaseYear || '';
      if (!officeCaseNumber || !officeCaseYear) {
        const match = (m.caseNumber || '').match(/^(\d+)\/(\d{2,4})$/);
        if (match) {
          officeCaseNumber = match[1];
          const yr = parseInt(match[2]);
          officeCaseYear = yr <= 100 ? String(2500 + yr) : String(yr);
        } else {
          officeCaseNumber = m.matterId || '000';
          officeCaseYear = '2569';
        }
      }

      // 2. Map files to valid category
      const sanitizedFiles = (m.files || []).map((f: any) => {
        let cat: 'CourtDrafts' | 'RawEvidence' = 'RawEvidence';
        if (f.category === 'CourtDrafts') cat = 'CourtDrafts';
        else if (f.category === 'RawEvidence') cat = 'RawEvidence';
        else if (f.category === 'AdminFinance') {
          cat = f.name.endsWith('.docx') || f.name.endsWith('.doc') ? 'CourtDrafts' : 'RawEvidence';
        }
        
        return {
          name: f.name || '',
          path: f.path || '',
          category: cat,
          size: f.size || 0,
          lastModified: f.lastModified || new Date().toISOString(),
          evidenceStatus: cat === 'RawEvidence' ? (f.evidenceStatus || 'raw') : undefined
        };
      });

      return {
        matterId: m.matterId || '',
        officeCaseNumber,
        officeCaseYear,
        clientName: m.clientName || '',
        clientType: m.clientType || 'โจทก์',
        court: m.court || '',
        caseNumber: m.caseNumber || `${officeCaseNumber}/${officeCaseYear}`,
        courtBlackRef: m.courtBlackRef || '',
        courtRedRef: m.courtRedRef || '',
        caseType: m.caseType || 'Civil',
        officeStatus: m.officeStatus || 'Active',
        courtStatus: m.courtStatus || 'เตรียมฟ้อง',
        courtStatusTags: m.courtStatusTags || [],
        snoozeUntil: m.snoozeUntil || null,
        originalDeadline: m.originalDeadline || null,
        currentDeadline: m.currentDeadline || null,
        deadlineCalculatedFrom: m.deadlineCalculatedFrom || null,
        deadlineDurationDays: m.deadlineDurationDays || null,
        appointments: m.appointments || [],
        diaryNotes: m.diaryNotes || [],
        files: sanitizedFiles,
        assignedTo: m.assignedTo || (m.matterId === 'M005' || m.matterId === '005' ? ['alex.alexander@nanchai-law.com'] : m.matterId === 'M001' || m.matterId === '001' ? ['lg1@firm.com'] : ['lg1@firm.com']),
        tasks: m.tasks || (m.matterId === 'M005' || m.matterId === '005' ? [
          { id: 't_m005_1', title: 'ร่างคำให้การจำเลย+ฟ้องแย้ง', dueDate: '2026-06-18', assignedTo: 'lg1@firm.com', completed: false }
        ] : m.matterId === 'M001' || m.matterId === '001' ? [
          { id: 't_m001_1', title: 'ยื่นอุทธรณ์คดีอาญาชลบุรี', dueDate: '2026-06-25', assignedTo: 'alex.alexander@nanchai-law.com', completed: false }
        ] : m.matterId === 'M002' || m.matterId === '002' ? [
          { id: 't_m002_1', title: 'คัดสำเนาคำพิพากษาคดีศาลชลบุรี', dueDate: '2026-07-01', assignedTo: 'lg2@firm.com', completed: false }
        ] : [])
      };
    });
  }

  // Initialize data store — seeds INITIAL_MATTERS only when localStorage is empty
  private static getMattersRaw(): Matter[] {
    const raw = localStorage.getItem(LWS_MATTERS_KEY);

    // Only seed from INITIAL_MATTERS when no data exists at all
    if (!raw) {
      const DATA_VERSION = `v${INITIAL_MATTERS.length}`;
      
      // Seed central ledger from initial matters if empty
      const rawLedger = localStorage.getItem('lws_central_ledger');
      if (!rawLedger) {
        const initialTxs: Transaction[] = [];
        INITIAL_MATTERS.forEach((m: any) => {
          const match = (m.caseNumber || '').match(/^(\d+)\/(\d{2,4})$/);
          let refKey = '';
          if (match) {
            const yr = parseInt(match[2]);
            refKey = `${match[1]}/${yr <= 100 ? String(2500 + yr) : String(yr)}`;
          }
          if (m.invoices && m.invoices.length > 0) {
            m.invoices.forEach((inv: any) => {
              initialTxs.push({
                id: inv.id || `tx_${Math.random().toString(36).substr(2, 9)}`,
                caseRef: refKey || null,
                description: inv.description,
                amount: inv.amount,
                status: inv.status === 'Draft' ? 'Draft' : inv.status === 'Sent' ? 'Sent' : 'Paid',
                date: inv.paidAt ? inv.paidAt.split('T')[0] : new Date().toISOString().split('T')[0],
                paidAt: inv.paidAt || null
              });
            });
          }
        });
        localStorage.setItem('lws_central_ledger', JSON.stringify(initialTxs));
      }

      const sanitized = this.sanitizeMatters(INITIAL_MATTERS);
      localStorage.setItem(LWS_MATTERS_KEY, JSON.stringify(sanitized));
      localStorage.setItem('lws_data_version', DATA_VERSION);
      this.rebuildGlobalDashboardIndex(sanitized);
      return sanitized;
    }

    try {
      const parsed = JSON.parse(raw) as any[];
      return this.sanitizeMatters(parsed);
    } catch {
      const sanitized = this.sanitizeMatters(INITIAL_MATTERS);
      localStorage.setItem(LWS_MATTERS_KEY, JSON.stringify(sanitized));
      return sanitized;
    }
  }

  private static saveMattersRaw(matters: Matter[]): void {
    localStorage.setItem(LWS_MATTERS_KEY, JSON.stringify(matters));
    this.rebuildGlobalDashboardIndex(matters);
  }

  // Rebuild 00_Global_Dashboard_Index.json equivalent
  private static rebuildGlobalDashboardIndex(matters: Matter[]): void {
    const rawLedger = localStorage.getItem('lws_central_ledger');
    const ledger: Transaction[] = rawLedger ? JSON.parse(rawLedger) : [];

    const index: GlobalDashboardIndex = {
      lastUpdated: new Date().toISOString(),
      matters: matters.map(m => {
        const refKey = `${m.officeCaseNumber}/${m.officeCaseYear}`;
        
        const totalPaid = ledger
          .filter(t => t.caseRef === refKey && t.status === 'Paid' && t.amount > 0)
          .reduce((sum, t) => sum + t.amount, 0);
        
        const totalPending = ledger
          .filter(t => t.caseRef === refKey && t.status !== 'Paid' && t.amount > 0)
          .reduce((sum, t) => sum + t.amount, 0);

        return {
          matterId: m.matterId,
          officeCaseNumber: m.officeCaseNumber,
          officeCaseYear: m.officeCaseYear,
          clientName: m.clientName,
          court: m.court,
          officeStatus: m.officeStatus,
          courtStatus: m.courtStatus,
          currentDeadline: m.currentDeadline,
          snoozeUntil: m.snoozeUntil,
          totalPaidRevenue: totalPaid,
          totalPendingRevenue: totalPending,
          caseType: m.caseType
        };
      })
    };
    localStorage.setItem('lws_global_index', JSON.stringify(index));
  }

  // Get Global Index (Simulates reading 00_Global_Dashboard_Index.json)
  static async getGlobalIndex(): Promise<GlobalDashboardIndex> {
    await this.simulateNetworkDelay();
    // Auto-wake snoozed matters if deadline <= 30 days
    const matters = this.getMattersRaw();
    let updated = false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    matters.forEach(m => {
      if (m.officeStatus === 'Snoozed' && m.currentDeadline) {
        const deadlineDate = new Date(m.currentDeadline);
        deadlineDate.setHours(0, 0, 0, 0);
        const diffTime = deadlineDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= 30) {
          m.officeStatus = 'Active';
          m.snoozeUntil = null;
          updated = true;
        }
      }
    });

    if (updated) {
      this.saveMattersRaw(matters);
    }

    const rawIndex = localStorage.getItem('lws_global_index');
    if (!rawIndex) {
      this.rebuildGlobalDashboardIndex(matters);
      return JSON.parse(localStorage.getItem('lws_global_index')!);
    }
    return JSON.parse(rawIndex);
  }

  // Read Matter by ID
  static async getMatter(matterId: string): Promise<Matter | null> {
    await this.simulateNetworkDelay();
    const matters = this.getMattersRaw();
    const found = matters.find(m => m.matterId === matterId) || null;
    
    // Safety check for data healing (Ensure 3 subfolders simulated exist in files)
    if (found) {
      // Re-indexing check: Simulating folder scanner
      // If folder items path conflict or name issues, we adjust paths (Self-Healing)
      let modified = false;
      found.files.forEach(f => {
        if (f.category === 'CourtDrafts' && !f.path.startsWith('02_สำนวนคดี_ศาล/')) {
          f.path = `02_สำนวนคดี_ศาล/${f.name}`;
          modified = true;
        }
      });
      if (modified) {
        this.saveMatter(found);
      }
    }
    
    return found;
  }

  // Save Matter (Create or Update) with concurrency protection
  static async saveMatter(matter: Matter, expectedLastModified?: string): Promise<{ success: boolean; data?: Matter; error?: string }> {
    await this.simulateNetworkDelay();
    const matters = this.getMattersRaw();
    const idx = matters.findIndex(m => m.matterId === matter.matterId);
    
    // Simple Concurrency Simulation (Data Concurrency Protection)
    if (expectedLastModified && idx !== -1) {
      // simulate check: If somebody modified metadata on OneDrive, we flag conflict
      const storedLastModified = localStorage.getItem(`lws_last_mod_${matter.matterId}`);
      if (storedLastModified && storedLastModified !== expectedLastModified) {
        return {
          success: false,
          error: 'DATA_CONCURRENCY_CONFLICT: ไฟล์ metadata.json บน OneDrive มีการอัปเดตโดยผู้ใช้รายอื่น กรุณาทำระบบ Merge ข้อมูลก่อนดำเนินการบันทึกทับ'
        };
      }
    }

    const nowISO = new Date().toISOString();
    localStorage.setItem(`lws_last_mod_${matter.matterId}`, nowISO);

    if (idx === -1) {
      matters.push(matter);
    } else {
      matters[idx] = matter;
    }

    this.saveMattersRaw(matters);

    // Writeback to local folder if running in local dev environment
    try {
      await fetch('/api/save-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(matter)
      });
    } catch (e) {
      console.warn('[Local Sync] Failed to save metadata to local disk. This is normal if not running Vite dev server.', e);
    }

    return { success: true, data: matter };
  }

  // Delete Matter
  static async deleteMatter(matterId: string): Promise<boolean> {
    await this.simulateNetworkDelay();
    let matters = this.getMattersRaw();
    matters = matters.filter(m => m.matterId !== matterId);
    this.saveMattersRaw(matters);
    return true;
  }

  // Send content to Blackhole simulation
  static async sendToBlackhole(matterId: string, text: string): Promise<{ success: boolean; payload: any }> {
    await this.simulateNetworkDelay(1000);
    const payload = {
      matterId,
      timestamp: new Date().toISOString(),
      source: 'LWS_Diary_Canvas',
      content: text,
      format: 'JSON_TetraRAG_Input'
    };
    console.log('[Blackhole Engine Endpoint Outbound API API] Successfully transmitted content payload:', payload);
    return { success: true, payload };
  }

  // Utility network delay simulator
  private static simulateNetworkDelay(ms: number = 300): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
