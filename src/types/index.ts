export interface Transaction {
  id: string;
  caseRef: string | null; // e.g. "005/2569", null for central/office expense
  description: string;
  amount: number; // positive = revenue, negative = expense
  status: 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Pending';
  date: string; // YYYY-MM-DD
  paidAt: string | null; // ISO timestamp when status is Paid
  slipFileName?: string;
  slipPath?: string;
}

export interface Appointment {
  id: string;
  type: 'CourtHearing' | 'Deadline' | 'Meeting';
  title: string;
  dateTime: string; // ISO datetime
  notes: string;
  googleEventId?: string;
}

export interface DiaryNote {
  id: string;
  date: string; // YYYY-MM-DD
  content: string;
}

export interface FileMetadata {
  name: string;
  path: string;
  category: 'CourtDrafts' | 'RawEvidence'; // 02, 03 respectively
  size: number;
  lastModified: string;
  evidenceStatus?: 'ready' | 'raw'; // Logical tab classification
}

export interface TaskItem {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  assignedTo: string; // Email of responsible person/lawyer
  completed: boolean;
}

export interface ClientProfile {
  id: string;
  clientName: string; // Name of client (individuals or company)
  phone?: string;
  email?: string;
  address?: string;
  facebook?: string;
  lineId?: string;
  taxId?: string; // ID Card or Tax ID (optional)
  leadSource?: string; // referred by / lead source
  note?: string;
}

export interface Matter {
  matterId: string; // Unique ID (e.g. M001)
  officeCaseNumber: string; // e.g. "001"
  officeCaseYear: string; // e.g. "2569"
  clientName: string;
  clientType: string; // e.g. โจทก์, จำเลย, ผู้ร้อง, เคสหรือคำปรึกษา
  court: string;
  caseNumber: string; // keep for backward compatibility or display
  courtBlackRef?: string; // เลขคดีดำ (เช่น อ.123/2569)
  courtRedRef?: string; // เลขคดีแดง (เช่น อ.999/2569)
  caseType: 'Civil' | 'Criminal' | string;
  officeStatus: 'Active' | 'Waiting' | 'Snoozed' | 'Closed' | 'Reject';
  courtStatus: string; // e.g. เตรียมฟ้อง, ร่างคำให้การ
  courtStatusTags: string[]; // แท็กสถานะปัจจุบันศาล
  snoozeUntil: string | null; // YYYY-MM-DD
  originalDeadline: string | null; // For tracking deadline compliance
  currentDeadline: string | null;
  deadlineCalculatedFrom: string | null;
  deadlineDurationDays: number | null;
  appointments: Appointment[];
  diaryNotes: DiaryNote[];
  files: FileMetadata[]; // Files inside 02_สำนวนคดี_ศาล, 03_หลักฐาน
  assignedTo?: string[]; // Array of emails of responsible lawyers
  tasks?: TaskItem[]; // Back-office task items
}

export interface GlobalDashboardIndex {
  lastUpdated: string;
  matters: {
    matterId: string;
    officeCaseNumber: string;
    officeCaseYear: string;
    clientName: string;
    court: string;
    officeStatus: 'Active' | 'Waiting' | 'Snoozed' | 'Closed' | 'Reject';
    courtStatus: string;
    currentDeadline: string | null;
    snoozeUntil: string | null;
    totalPaidRevenue: number;
    totalPendingRevenue: number;
    caseType: string;
  }[];
}

