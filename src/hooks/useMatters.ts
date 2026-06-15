import { useState, useCallback } from 'react';
import type { Matter, Appointment, DiaryNote, FileMetadata } from '../types';
import { StorageService } from '../services/storage';
import { getInitialMatterFiles } from '../services/folderTemplate';
import { calculateThaiDeadline } from '../utils/deadlineCalculator';
import { GoogleCalendarService } from '../services/googleCalendar';
import confetti from 'canvas-confetti';

export function useMatters() {
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load matters and handle auto-wake for snoozed cases (30 days limit)
  const loadMatters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await StorageService.getGlobalIndex();
      
      // Get all raw matters
      const rawMatters = StorageService.getMatters();
      
      let updated = false;
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const processedMatters = rawMatters.map(m => {
        // Auto wake-up of Snoozed matters if deadline <= 30 days
        if (m.officeStatus === 'Snoozed' && m.currentDeadline) {
          const deadlineDate = new Date(m.currentDeadline);
          deadlineDate.setHours(0, 0, 0, 0);
          const diffTime = deadlineDate.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays <= 30) {
            updated = true;
            return {
              ...m,
              officeStatus: 'Active' as const,
              snoozeUntil: null,
              diaryNotes: [
                ...m.diaryNotes,
                {
                  id: `note_wake_${Date.now()}`,
                  date: new Date().toISOString().split('T')[0],
                  content: `[Auto-Wake] ระบบปลุกคดีจำศีลโดยอัตโนมัติล่วงหน้า 30 วันก่อนถึงวันเดดไลน์ (${m.currentDeadline})`
                }
              ]
            };
          }
        }
        return m;
      });

      if (updated) {
        localStorage.setItem('lws_matters_data', JSON.stringify(processedMatters));
        setMatters(processedMatters);
      } else {
        setMatters(processedMatters);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load matters');
    } finally {
      setLoading(false);
    }
  }, []);

  // Create a new matter
  const createMatter = useCallback(async (form: {
    matterId: string;
    officeCaseNumber: string;
    officeCaseYear: string;
    clientName: string;
    clientType: string;
    court: string;
    caseNumber: string;
    caseType: string;
    courtStatus: string;
    courtBlackRef?: string;
    courtRedRef?: string;
    courtStatusTags: string[];
    deadlineCalculatedFrom: string | null;
    deadlineDurationDays: number | null;
    deadlineUnit: 'days' | 'months' | 'years';
  }) => {
    setError(null);
    try {
      const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
      if (rawMatters.some(m => m.matterId === form.matterId)) {
        throw new Error(`รหัสคดี ${form.matterId} ซ้ำในระบบ`);
      }

      const calculatedDeadline = form.deadlineCalculatedFrom
        ? calculateThaiDeadline(form.deadlineCalculatedFrom, form.deadlineDurationDays || 0, form.deadlineUnit)
        : null;

      const newMatter: Matter = {
        matterId: form.matterId,
        officeCaseNumber: form.officeCaseNumber,
        officeCaseYear: form.officeCaseYear,
        clientName: form.clientName,
        clientType: form.clientType,
        court: form.court,
        caseNumber: form.caseNumber,
        courtBlackRef: form.courtBlackRef,
        courtRedRef: form.courtRedRef,
        caseType: form.caseType,
        officeStatus: 'Active',
        courtStatus: form.courtStatus || 'เตรียมฟ้อง',
        courtStatusTags: form.courtStatusTags || [],
        snoozeUntil: null,
        originalDeadline: calculatedDeadline,
        currentDeadline: calculatedDeadline,
        deadlineCalculatedFrom: form.deadlineCalculatedFrom,
        deadlineDurationDays: form.deadlineDurationDays,
        appointments: calculatedDeadline ? [
          {
            id: `app_dl_${Date.now()}`,
            type: 'Deadline',
            title: `เดดไลน์คดี - ครบกำหนดยื่นเอกสาร`,
            dateTime: `${calculatedDeadline}T16:30:00Z`,
            notes: 'คำนวณอัตโนมัติแบบ Play-Safe'
          }
        ] : [],
        diaryNotes: [
          {
            id: `note_init_${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            content: `สร้างคดีความเลขแฟ้ม ${form.officeCaseNumber}/${form.officeCaseYear} เข้าระบบสำเร็จ`
          }
        ],
        files: getInitialMatterFiles(form.matterId, form.clientName)
      };

      const updated = [...rawMatters, newMatter];
      localStorage.setItem('lws_matters_data', JSON.stringify(updated));
      
      // Save metadata JSON backup
      await StorageService.saveMatter(newMatter);
      
      setMatters(updated);
      confetti();
      return newMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to create matter');
      throw err;
    }
  }, []);

  // Update matter details
  const updateMatterInfo = useCallback(async (matterId: string, form: {
    clientName: string;
    clientType: string;
    court: string;
    caseNumber: string;
    courtBlackRef?: string;
    courtRedRef?: string;
    caseType: string;
    courtStatus: string;
    courtStatusTags: string[];
  }) => {
    setError(null);
    try {
      const rawMatters = StorageService.getMatters();
      const idx = rawMatters.findIndex(m => m.matterId === matterId);
      if (idx === -1) throw new Error('ไม่พบข้อมูลคดีความ');

      let officeCaseNumber = rawMatters[idx].officeCaseNumber;
      let officeCaseYear = rawMatters[idx].officeCaseYear;
      const match = (form.caseNumber || '').match(/^(\d+)\/(\d{2,4})$/);
      if (match) {
        officeCaseNumber = match[1];
        const yr = parseInt(match[2]);
        officeCaseYear = yr <= 100 ? String(2500 + yr) : String(yr);
      }

      const updatedMatter: Matter = {
        ...rawMatters[idx],
        officeCaseNumber,
        officeCaseYear,
        clientName: form.clientName,
        clientType: form.clientType,
        court: form.court,
        caseNumber: form.caseNumber,
        courtBlackRef: form.courtBlackRef,
        courtRedRef: form.courtRedRef,
        caseType: form.caseType,
        courtStatus: form.courtStatus,
        courtStatusTags: form.courtStatusTags
      };

      rawMatters[idx] = updatedMatter;
      localStorage.setItem('lws_matters_data', JSON.stringify(rawMatters));
      
      await StorageService.saveMatter(updatedMatter);
      
      setMatters(rawMatters);
      return updatedMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to update matter');
      throw err;
    }
  }, []);

  // Update matter officeStatus
  const updateMatterStatus = useCallback(async (
    matterId: string,
    status: Matter['officeStatus'],
    snoozeUntilDays: number = 30
  ) => {
    setError(null);
    try {
      const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
      const idx = rawMatters.findIndex(m => m.matterId === matterId);
      if (idx === -1) throw new Error('ไม่พบข้อมูลคดีความ');

      const snoozeUntilDate = status === 'Snoozed'
        ? new Date(Date.now() + snoozeUntilDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : null;

      const updatedMatter: Matter = {
        ...rawMatters[idx],
        officeStatus: status,
        snoozeUntil: snoozeUntilDate,
        diaryNotes: [
          ...rawMatters[idx].diaryNotes,
          {
            id: `note_status_${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            content: `เปลี่ยนสถานะคดีเป็น [${status}]${status === 'Snoozed' ? ` ถึงวันที่ ${snoozeUntilDate}` : ''}`
          }
        ]
      };

      rawMatters[idx] = updatedMatter;
      localStorage.setItem('lws_matters_data', JSON.stringify(rawMatters));
      
      await StorageService.saveMatter(updatedMatter);
      
      setMatters(rawMatters);
      return updatedMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to update status');
      throw err;
    }
  }, []);

  // Delete matter
  const deleteMatter = useCallback(async (matterId: string) => {
    setError(null);
    try {
      const success = await StorageService.deleteMatter(matterId);
      if (success) {
        const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
        const filtered = rawMatters.filter(m => m.matterId !== matterId);
        setMatters(filtered);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to delete matter');
      throw err;
    }
  }, []);

  // Add Appointment
  const addAppointment = useCallback(async (
    matterId: string,
    appointmentData: {
      type: Appointment['type'];
      title: string;
      dateTime: string;
      notes: string;
    },
    googleCalendarConnected: boolean,
    googleApiKey: string
  ) => {
    setError(null);
    try {
      const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
      const idx = rawMatters.findIndex(m => m.matterId === matterId);
      if (idx === -1) throw new Error('ไม่พบข้อมูลคดีความ');

      const matter = rawMatters[idx];
      const newApp: Appointment = {
        id: `app_${Date.now()}`,
        type: appointmentData.type,
        title: appointmentData.title,
        dateTime: appointmentData.dateTime,
        notes: appointmentData.notes
      };

      // Play-Safe check for Deadlines
      let updatedDeadlineFields = {};
      if (appointmentData.type === 'Deadline') {
        const justDate = appointmentData.dateTime.split('T')[0];
        updatedDeadlineFields = {
          currentDeadline: justDate,
          deadlineCalculatedFrom: justDate,
          deadlineDurationDays: null
        };
      }

      // Sync to Google Calendar
      if (googleCalendarConnected) {
        try {
          const gId = await GoogleCalendarService.syncEvent(googleApiKey, matter, newApp);
          newApp.googleEventId = gId;
        } catch (e) {
          console.warn('[Calendar Sync Failed] Saving appointment locally anyway', e);
        }
      }

      const updatedMatter: Matter = {
        ...matter,
        ...updatedDeadlineFields,
        appointments: [...matter.appointments, newApp],
        diaryNotes: [
          ...matter.diaryNotes,
          {
            id: `note_app_${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            content: `เพิ่มนัดหมายใหม่: ${appointmentData.title} (${appointmentData.type}) ในวันที่ ${appointmentData.dateTime.replace('T', ' ')}`
          }
        ]
      };

      rawMatters[idx] = updatedMatter;
      localStorage.setItem('lws_matters_data', JSON.stringify(rawMatters));
      
      await StorageService.saveMatter(updatedMatter);
      
      setMatters(rawMatters);
      return updatedMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to add appointment');
      throw err;
    }
  }, []);

  // Delete Appointment
  const deleteAppointment = useCallback(async (matterId: string, appId: string) => {
    setError(null);
    try {
      const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
      const idx = rawMatters.findIndex(m => m.matterId === matterId);
      if (idx === -1) throw new Error('ไม่พบข้อมูลคดีความ');

      const matter = rawMatters[idx];
      const targetApp = matter.appointments.find(a => a.id === appId);
      const appTitle = targetApp ? targetApp.title : 'นัดหมาย';

      const updatedMatter: Matter = {
        ...matter,
        appointments: matter.appointments.filter(app => app.id !== appId),
        diaryNotes: [
          ...matter.diaryNotes,
          {
            id: `note_delapp_${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            content: `ยกเลิกนัดหมาย: ${appTitle}`
          }
        ]
      };

      rawMatters[idx] = updatedMatter;
      localStorage.setItem('lws_matters_data', JSON.stringify(rawMatters));
      
      await StorageService.saveMatter(updatedMatter);
      
      setMatters(rawMatters);
      return updatedMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to delete appointment');
      throw err;
    }
  }, []);

  // Extend Deadline
  const extendDeadline = useCallback(async (matterId: string, addedDays: number) => {
    setError(null);
    try {
      const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
      const idx = rawMatters.findIndex(m => m.matterId === matterId);
      if (idx === -1) throw new Error('ไม่พบข้อมูลคดีความ');

      const matter = rawMatters[idx];
      const prevDeadline = new Date(matter.currentDeadline || new Date());
      const newDeadline = new Date(prevDeadline);
      newDeadline.setDate(prevDeadline.getDate() + addedDays);

      // Rollback weekend (Play-safe)
      const dayOfWeek = newDeadline.getDay();
      if (dayOfWeek === 0) newDeadline.setDate(newDeadline.getDate() - 2);
      else if (dayOfWeek === 6) newDeadline.setDate(newDeadline.getDate() - 1);

      const updatedDeadlineStr = newDeadline.toISOString().split('T')[0];

      const newApp: Appointment = {
        id: `app_dl_ext_${Date.now()}`,
        type: 'Deadline',
        title: `ขยายระยะเวลาเดดไลน์ (+${addedDays} วัน)`,
        dateTime: `${updatedDeadlineStr}T16:30:00Z`,
        notes: `ขยายระยะเวลาความปลอดภัยของศาล จากเดิมคือ: ${matter.currentDeadline}`
      };

      const updatedMatter: Matter = {
        ...matter,
        currentDeadline: updatedDeadlineStr,
        appointments: [...matter.appointments, newApp],
        diaryNotes: [
          ...matter.diaryNotes,
          {
            id: `note_ext_${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            content: `ยื่นคำร้องขยายระยะเวลา ได้รับการขยายอีก ${addedDays} วัน เดดไลน์ใหม่คือ ${updatedDeadlineStr}`
          }
        ]
      };

      rawMatters[idx] = updatedMatter;
      localStorage.setItem('lws_matters_data', JSON.stringify(rawMatters));
      
      await StorageService.saveMatter(updatedMatter);
      
      setMatters(rawMatters);
      return updatedMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to extend deadline');
      throw err;
    }
  }, []);

  // Add Diary Note
  const addDiaryNote = useCallback(async (matterId: string, content: string) => {
    setError(null);
    try {
      const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
      const idx = rawMatters.findIndex(m => m.matterId === matterId);
      if (idx === -1) throw new Error('ไม่พบข้อมูลคดีความ');

      const matter = rawMatters[idx];
      const newNote: DiaryNote = {
        id: `note_${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        content
      };

      const updatedMatter: Matter = {
        ...matter,
        diaryNotes: [...matter.diaryNotes, newNote]
      };

      rawMatters[idx] = updatedMatter;
      localStorage.setItem('lws_matters_data', JSON.stringify(rawMatters));
      
      await StorageService.saveMatter(updatedMatter);
      
      setMatters(rawMatters);
      return updatedMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to add diary note');
      throw err;
    }
  }, []);

  // File management: Drop / Add File
  const addFile = useCallback(async (matterId: string, name: string, size: number, category: FileMetadata['category'], evidenceStatus?: FileMetadata['evidenceStatus']) => {
    setError(null);
    try {
      const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
      const idx = rawMatters.findIndex(m => m.matterId === matterId);
      if (idx === -1) throw new Error('ไม่พบข้อมูลคดีความ');

      const matter = rawMatters[idx];
      if (matter.files.some(f => f.name === name)) {
        throw new Error('มีไฟล์ชื่อนี้อยู่แล้วในแฟ้มคดีนี้');
      }

      const folderName = category === 'CourtDrafts' ? '02_สำนวนคดี_ศาล' : '03_หลักฐาน';
      const newFile: FileMetadata = {
        name,
        path: `${folderName}/${name}`,
        category,
        size,
        lastModified: new Date().toISOString(),
        evidenceStatus: category === 'RawEvidence' ? (evidenceStatus || 'raw') : undefined
      };

      const updatedMatter: Matter = {
        ...matter,
        files: [...matter.files, newFile],
        diaryNotes: [
          ...matter.diaryNotes,
          {
            id: `note_file_${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            content: `อัปโหลดไฟล์ [${name}] เข้าโฟลเดอร์ ${folderName} สำเร็จ`
          }
        ]
      };

      rawMatters[idx] = updatedMatter;
      localStorage.setItem('lws_matters_data', JSON.stringify(rawMatters));
      
      await StorageService.saveMatter(updatedMatter);
      
      setMatters(rawMatters);
      return updatedMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to add file');
      throw err;
    }
  }, []);

  // Update File Evidence Status Tag (Logical Tabs)
  const updateEvidenceStatus = useCallback(async (matterId: string, fileName: string, status: 'ready' | 'raw') => {
    setError(null);
    try {
      const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
      const idx = rawMatters.findIndex(m => m.matterId === matterId);
      if (idx === -1) throw new Error('ไม่พบข้อมูลคดีความ');

      const matter = rawMatters[idx];
      const updatedFiles = matter.files.map(f => {
        if (f.name === fileName && f.category === 'RawEvidence') {
          return { ...f, evidenceStatus: status };
        }
        return f;
      });

      const updatedMatter: Matter = {
        ...matter,
        files: updatedFiles,
        diaryNotes: [
          ...matter.diaryNotes,
          {
            id: `note_evidence_status_${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            content: `ย้ายประเภทหลักฐาน [${fileName}] ไปที่แท็บ: ${status === 'ready' ? 'หลักฐานพร้อมใช้' : 'คลังข้อมูลดิบ'}`
          }
        ]
      };

      rawMatters[idx] = updatedMatter;
      localStorage.setItem('lws_matters_data', JSON.stringify(rawMatters));
      
      await StorageService.saveMatter(updatedMatter);
      
      setMatters(rawMatters);
      return updatedMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to update evidence status');
      throw err;
    }
  }, []);

  // Delete file
  const deleteFile = useCallback(async (matterId: string, fileName: string) => {
    setError(null);
    try {
      const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
      const idx = rawMatters.findIndex(m => m.matterId === matterId);
      if (idx === -1) throw new Error('ไม่พบข้อมูลคดีความ');

      const matter = rawMatters[idx];
      const updatedFiles = matter.files.filter(f => f.name !== fileName);

      const updatedMatter: Matter = {
        ...matter,
        files: updatedFiles,
        diaryNotes: [
          ...matter.diaryNotes,
          {
            id: `note_file_del_${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            content: `ลบไฟล์ [${fileName}] สำเร็จ`
          }
        ]
      };

      rawMatters[idx] = updatedMatter;
      localStorage.setItem('lws_matters_data', JSON.stringify(rawMatters));
      
      await StorageService.saveMatter(updatedMatter);
      
      setMatters(rawMatters);
      return updatedMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to delete file');
      throw err;
    }
  }, []);

  // File sorting and renaming
  const saveSortedFiles = useCallback(async (matterId: string, sortedFiles: FileMetadata[]) => {
    setError(null);
    try {
      const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
      const idx = rawMatters.findIndex(m => m.matterId === matterId);
      if (idx === -1) throw new Error('ไม่พบข้อมูลคดีความ');

      const matter = rawMatters[idx];
      
      // Perform batch rename simulation for CourtDrafts
      const drafts = sortedFiles.filter(f => f.category === 'CourtDrafts');
      const nonDrafts = sortedFiles.filter(f => f.category !== 'CourtDrafts');

      const renamedDrafts = drafts.map((file, index) => {
        const cleanName = file.name.replace(/^\d+-/, '');
        const newName = `${index + 1}-${cleanName}`;
        return {
          ...file,
          name: newName,
          path: `02_สำนวนคดี_ศาล/${newName}`,
          lastModified: new Date().toISOString()
        };
      });

      const updatedMatter: Matter = {
        ...matter,
        files: [...renamedDrafts, ...nonDrafts]
      };

      rawMatters[idx] = updatedMatter;
      localStorage.setItem('lws_matters_data', JSON.stringify(rawMatters));
      
      await StorageService.saveMatter(updatedMatter);
      
      setMatters(rawMatters);
      confetti();
      return updatedMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to sort and rename files');
      throw err;
    }
  }, []);

  // Generate word template
  const generateTemplateFile = useCallback(async (matterId: string, templateName: string) => {
    setError(null);
    try {
      const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
      const idx = rawMatters.findIndex(m => m.matterId === matterId);
      if (idx === -1) throw new Error('ไม่พบข้อมูลคดีความ');

      const matter = rawMatters[idx];
      const docName = `${templateName}_${matter.clientName}.docx`;
      const docPath = `02_สำนวนคดี_ศาล/${docName}`;

      if (matter.files.some(f => f.name === docName)) {
        throw new Error('มีไฟล์ชื่อนี้อยู่แล้วในโฟลเดอร์สำนวนคดี');
      }

      const newFile: FileMetadata = {
        name: docName,
        path: docPath,
        category: 'CourtDrafts',
        size: 85000,
        lastModified: new Date().toISOString()
      };

      const updatedMatter: Matter = {
        ...matter,
        files: [...matter.files, newFile],
        diaryNotes: [
          ...matter.diaryNotes,
          {
            id: `note_template_${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            content: `สร้างเอกสารคู่ความร่างอัตโนมัติจากแม่แบบ: [${docName}]`
          }
        ]
      };

      rawMatters[idx] = updatedMatter;
      localStorage.setItem('lws_matters_data', JSON.stringify(rawMatters));
      
      await StorageService.saveMatter(updatedMatter);
      
      setMatters(rawMatters);
      return updatedMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to generate template file');
      throw err;
    }
  }, []);

  // Add a task to back-office checklist
  const addTask = useCallback(async (
    matterId: string,
    taskData: {
      title: string;
      dueDate: string;
      assignedTo: string;
    }
  ) => {
    setError(null);
    try {
      const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
      const idx = rawMatters.findIndex(m => m.matterId === matterId);
      if (idx === -1) throw new Error('ไม่พบข้อมูลคดีความ');

      const matter = rawMatters[idx];
      const newTask = {
        id: `t_${Date.now()}`,
        title: taskData.title,
        dueDate: taskData.dueDate,
        assignedTo: taskData.assignedTo,
        completed: false
      };

      const updatedMatter: Matter = {
        ...matter,
        tasks: [...(matter.tasks || []), newTask],
        diaryNotes: [
          ...(matter.diaryNotes || []),
          {
            id: `note_task_add_${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            content: `เพิ่มงานหลังบ้าน: "${taskData.title}" (มอบหมาย: ${taskData.assignedTo}, กำหนดส่ง: ${taskData.dueDate})`
          }
        ]
      };

      rawMatters[idx] = updatedMatter;
      localStorage.setItem('lws_matters_data', JSON.stringify(rawMatters));
      
      await StorageService.saveMatter(updatedMatter);
      setMatters(rawMatters);
      return updatedMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to add task');
      throw err;
    }
  }, []);

  // Toggle task completed state
  const toggleTask = useCallback(async (matterId: string, taskId: string) => {
    setError(null);
    try {
      const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
      const idx = rawMatters.findIndex(m => m.matterId === matterId);
      if (idx === -1) throw new Error('ไม่พบข้อมูลคดีความ');

      const matter = rawMatters[idx];
      let taskTitle = '';
      let isCompleted = false;
      const updatedTasks = (matter.tasks || []).map(t => {
        if (t.id === taskId) {
          taskTitle = t.title;
          isCompleted = !t.completed;
          return { ...t, completed: isCompleted };
        }
        return t;
      });

      const updatedMatter: Matter = {
        ...matter,
        tasks: updatedTasks,
        diaryNotes: [
          ...(matter.diaryNotes || []),
          {
            id: `note_task_toggle_${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            content: `ทำเครื่องหมายงาน "${taskTitle}" เป็น [${isCompleted ? 'เสร็จสิ้น' : 'ยังไม่เสร็จ'}]`
          }
        ]
      };

      rawMatters[idx] = updatedMatter;
      localStorage.setItem('lws_matters_data', JSON.stringify(rawMatters));
      
      await StorageService.saveMatter(updatedMatter);
      setMatters(rawMatters);
      return updatedMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to toggle task');
      throw err;
    }
  }, []);

  // Delete a task
  const deleteTask = useCallback(async (matterId: string, taskId: string) => {
    setError(null);
    try {
      const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
      const idx = rawMatters.findIndex(m => m.matterId === matterId);
      if (idx === -1) throw new Error('ไม่พบข้อมูลคดีความ');

      const matter = rawMatters[idx];
      const taskToDelete = (matter.tasks || []).find(t => t.id === taskId);
      const updatedTasks = (matter.tasks || []).filter(t => t.id !== taskId);

      const updatedMatter: Matter = {
        ...matter,
        tasks: updatedTasks,
        diaryNotes: [
          ...(matter.diaryNotes || []),
          {
            id: `note_task_delete_${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            content: `ลบงานหลังบ้าน: "${taskToDelete?.title || taskId}"`
          }
        ]
      };

      rawMatters[idx] = updatedMatter;
      localStorage.setItem('lws_matters_data', JSON.stringify(rawMatters));
      
      await StorageService.saveMatter(updatedMatter);
      setMatters(rawMatters);
      return updatedMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to delete task');
      throw err;
    }
  }, []);

  // Assign/re-assign lawyers
  const assignLawyers = useCallback(async (matterId: string, emails: string[]) => {
    setError(null);
    try {
      const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
      const idx = rawMatters.findIndex(m => m.matterId === matterId);
      if (idx === -1) throw new Error('ไม่พบข้อมูลคดีความ');

      const matter = rawMatters[idx];
      const updatedMatter: Matter = {
        ...matter,
        assignedTo: emails,
        diaryNotes: [
          ...(matter.diaryNotes || []),
          {
            id: `note_assign_${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            content: `ปรับปรุงรายชื่อผู้ดูแลคดีเป็น: [${emails.join(', ')}]`
          }
        ]
      };

      rawMatters[idx] = updatedMatter;
      localStorage.setItem('lws_matters_data', JSON.stringify(rawMatters));
      
      await StorageService.saveMatter(updatedMatter);
      setMatters(rawMatters);
      return updatedMatter;
    } catch (err: any) {
      setError(err?.message || 'Failed to assign lawyers');
      throw err;
    }
  }, []);

  return {
    matters,
    loading,
    error,
    loadMatters,
    createMatter,
    updateMatterInfo,
    updateMatterStatus,
    deleteMatter,
    addAppointment,
    deleteAppointment,
    extendDeadline,
    addDiaryNote,
    addFile,
    updateEvidenceStatus,
    deleteFile,
    saveSortedFiles,
    generateTemplateFile,
    addTask,
    toggleTask,
    deleteTask,
    assignLawyers
  };
}
