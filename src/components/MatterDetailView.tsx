import React, { useState, useMemo } from 'react';
import type { Matter, Appointment, FileMetadata, Transaction } from '../types';
import { getCountdownBadge } from '../utils/deadlineCalculator';
import { 
  Lock, Unlock, Upload, Trash2, 
  ChevronDown, ChevronUp, Eye
} from 'lucide-react';

interface MatterDetailViewProps {
  currentMatter: Matter;
  transactions: Transaction[];
  hasFinanceAccess: boolean;
  isAdmin: boolean;
  onUpdateStatus: (matterId: string, status: Matter['officeStatus']) => Promise<any>;
  onDeleteMatter: (matterId: string) => Promise<any>;
  onStartEdit: () => void;
  
  // File operations
  isFolderLocked: boolean;
  onToggleFolderLock: () => void;
  onSaveSortedFiles: (matterId: string, sortedFiles: FileMetadata[]) => Promise<any>;
  onGenerateTemplate: (templateName: string) => void;
  onAddFile: (matterId: string, name: string, size: number, category: FileMetadata['category'], evidenceStatus?: FileMetadata['evidenceStatus']) => Promise<any>;
  onDeleteFile: (matterId: string, fileName: string) => Promise<any>;
  onUpdateEvidenceStatus: (matterId: string, fileName: string, status: 'ready' | 'raw') => Promise<any>;

  // Appointments / Deadlines
  onAddAppointment: (matterId: string, data: { type: Appointment['type']; title: string; dateTime: string; notes: string }) => Promise<any>;
  onDeleteAppointment: (matterId: string, appId: string) => Promise<any>;

  // Tasks
  onAddTask: (matterId: string, task: { title: string; dueDate: string; assignedTo: string }) => Promise<any>;
  onToggleTask: (matterId: string, taskId: string) => Promise<any>;
  onDeleteTask: (matterId: string, taskId: string) => Promise<any>;

  // Lawyers assignment
  onAssignLawyers: (matterId: string, emails: string[]) => Promise<any>;

  // Finance modals triggers
  onAddInvoiceTrigger: () => void;
  onMarkInvoicePaid: (txId: string) => Promise<any>;
  onDeleteInvoice: (txId: string) => Promise<any>;
  
  // PDF Preview trigger
  onPreviewPdf: (file: FileMetadata) => void;
}

export const MatterDetailView: React.FC<MatterDetailViewProps> = ({
  currentMatter,
  transactions,
  hasFinanceAccess,
  isAdmin,
  onUpdateStatus,
  onDeleteMatter,
  onStartEdit,
  isFolderLocked,
  onToggleFolderLock,
  onSaveSortedFiles,
  onGenerateTemplate,
  onAddFile,
  onDeleteFile,
  onUpdateEvidenceStatus,
  onAddAppointment,
  onDeleteAppointment,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onAssignLawyers,
  onAddInvoiceTrigger,
  onMarkInvoicePaid,
  onDeleteInvoice,
  onPreviewPdf
}) => {
  // UI Sub-states
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [evidenceTab, setEvidenceTab] = useState<'ready' | 'raw'>('ready');
  const [quickAppForm, setQuickAppForm] = useState({
    title: '',
    type: 'CourtHearing' as Appointment['type'],
    dateTime: '',
    notes: ''
  });
  const [isQuickAppOpen, setIsQuickAppOpen] = useState(false);

  // Task states
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('lg1@firm.com');
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);

  const getAssigneeName = (email: string) => {
    if (email === 'alex.alexander@nanchai-law.com') return 'พี่ (Admin)';
    if (email === 'lg1@firm.com') return 'ทนาย lg1';
    if (email === 'lg2@firm.com') return 'ทนาย lg2';
    return email.split('@')[0];
  };

  const handleAddTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskDueDate) {
      alert('กรุณากรอกข้อมูลงานหลังบ้านให้ครบถ้วน');
      return;
    }
    try {
      await onAddTask(currentMatter.matterId, {
        title: taskTitle.trim(),
        dueDate: taskDueDate,
        assignedTo: taskAssignee
      });
      setTaskTitle('');
      setTaskDueDate('');
      setIsAddTaskOpen(false);
    } catch (err: any) {
      alert(err.message || 'เพิ่มงานล้มเหลว');
    }
  };

  // Drag-and-drop state for sorting cards
  const [draggedCardIndex, setDraggedCardIndex] = useState<number | null>(null);

  // Template Modal
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  // Group files in Folder 02: 1-คำฟ้อง.docx and 1-คำฟ้อง.pdf grouped under card "1-คำฟ้อง"
  const groupedDocs = useMemo(() => {
    const drafts = currentMatter.files.filter(f => f.category === 'CourtDrafts');
    const map = new Map<string, { baseName: string; docx?: FileMetadata; pdf?: FileMetadata }>();
    
    drafts.forEach(file => {
      // Extract numbering prefix and rest of name
      // e.g. "1-ร่างฟ้อง_สมชาย.docx" -> baseName is "1-ร่างฟ้อง_สมชาย"
      const baseName = file.name.replace(/\.(docx|doc|pdf)$/i, '');
      if (!map.has(baseName)) {
        map.set(baseName, { baseName });
      }
      const item = map.get(baseName)!;
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'docx' || ext === 'doc') item.docx = file;
      if (ext === 'pdf') item.pdf = file;
    });

    // Return sorted array based on numeric prefix if possible
    return Array.from(map.values()).sort((a, b) => {
      const getNum = (name: string) => {
        const match = name.match(/^(\d+)-/);
        return match ? parseInt(match[1]) : 999;
      };
      return getNum(a.baseName) - getNum(b.baseName);
    });
  }, [currentMatter.files]);

  // Timeline appointments: ordered newest first
  const sortedAppointments = useMemo(() => {
    return [...currentMatter.appointments].sort((a, b) => {
      return new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime();
    });
  }, [currentMatter.appointments]);

  // Shown appointments
  const visibleAppointments = useMemo(() => {
    if (timelineExpanded) return sortedAppointments;
    return sortedAppointments.slice(0, 3);
  }, [sortedAppointments, timelineExpanded]);

  // Folder 03 Files: filtered by category and current logical tab status tag
  const evidenceFiles = useMemo(() => {
    return currentMatter.files.filter(f => {
      if (f.category !== 'RawEvidence') return false;
      const status = f.evidenceStatus || 'raw';
      return status === evidenceTab;
    });
  }, [currentMatter.files, evidenceTab]);



  // Word templates list
  const templates = [
    { id: 't1', name: 'คำฟ้องคดีแพ่งผิดสัญญา', description: 'คำฟ้องคดีแพ่งผิดสัญญาจ้างทำของ/กู้ยืมเงิน มีหัวข้อคำขอบังคับครบถ้วน' },
    { id: 't2', name: 'ใบแต่งทนายความ (ศาลยุติธรรม)', description: 'หนังสือแต่งตั้งทนายความตามระเบียบ e-Filing ศาลยุติธรรม' },
    { id: 't3', name: 'คำร้องขอขยายระยะเวลาส่งคำให้การ', description: 'คำร้องขอยื่นขยายเวลาส่งคำให้การจำเลย 30 วัน' },
    { id: 't4', name: 'คำร้องขอส่งหมายข้ามเขต', description: 'คำคู่ความขอส่งหมายเรียกและคำฟ้องให้จำเลยข้ามศาล' }
  ];

  // Drag and drop handlers for Card sorting
  const handleDragStart = (idx: number) => {
    if (isFolderLocked) return;
    setDraggedCardIndex(idx);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (idx: number) => {
    if (isFolderLocked || draggedCardIndex === null || draggedCardIndex === idx) return;

    const reordered = [...groupedDocs];
    const draggedItem = reordered[draggedCardIndex];
    reordered.splice(draggedCardIndex, 1);
    reordered.splice(idx, 0, draggedItem);

    // Reassemble flat file list
    const remainingFiles = currentMatter.files.filter(f => f.category !== 'CourtDrafts');
    
    // Construct flat list in the new order (without renaming yet, we will rename on SaveLock)
    const newDraftsFlat: FileMetadata[] = [];
    reordered.forEach(doc => {
      if (doc.docx) newDraftsFlat.push(doc.docx);
      if (doc.pdf) newDraftsFlat.push(doc.pdf);
    });

    try {
      await onSaveSortedFiles(currentMatter.matterId, [...newDraftsFlat, ...remainingFiles]);
    } catch (e) {
      console.error(e);
    }
    setDraggedCardIndex(null);
  };

  const handleToggleLock = async () => {
    if (isFolderLocked) {
      onToggleFolderLock(); // Unlocks
    } else {
      // Transitioning to Lock: Trigger Batch Rename
      const remainingFiles = currentMatter.files.filter(f => f.category !== 'CourtDrafts');
      
      const renamedDraftsFlat: FileMetadata[] = [];
      groupedDocs.forEach((doc, idx) => {
        const prefix = `${idx + 1}-`;
        
        // Remove old numbering prefix (e.g., "1-", "12-")
        const cleanBase = doc.baseName.replace(/^\d+-/, '');
        const newBaseName = `${prefix}${cleanBase}`;

        if (doc.docx) {
          const originalExt = doc.docx.name.split('.').pop()?.toLowerCase() || 'docx';
          renamedDraftsFlat.push({
            ...doc.docx,
            name: `${newBaseName}.${originalExt}`,
            path: `02_สำนวนคดี_ศาล/${newBaseName}.${originalExt}`,
            lastModified: new Date().toISOString()
          });
        }
        if (doc.pdf) {
          renamedDraftsFlat.push({
            ...doc.pdf,
            name: `${newBaseName}.pdf`,
            path: `02_สำนวนคดี_ศาล/${newBaseName}.pdf`,
            lastModified: new Date().toISOString()
          });
        }
      });

      try {
        await onSaveSortedFiles(currentMatter.matterId, [...renamedDraftsFlat, ...remainingFiles]);
        onToggleFolderLock(); // Locks
      } catch (e) {
        alert('บันทึกการจัดเรียงโฟลเดอร์ล้มเหลว');
      }
    }
  };

  // Drag and drop upload for evidence
  const handleEvidenceDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files.length) return;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      await onAddFile(currentMatter.matterId, file.name, file.size, 'RawEvidence', evidenceTab);
    }
  };

  const handleEvidenceSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      await onAddFile(currentMatter.matterId, file.name, file.size, 'RawEvidence', evidenceTab);
    }
  };

  // Quick App Add
  const handleQuickAppSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAppForm.title || !quickAppForm.dateTime) {
      alert('กรุณากรอกข้อมูลนัดหมายให้ครบถ้วน');
      return;
    }
    try {
      await onAddAppointment(currentMatter.matterId, quickAppForm);
      setQuickAppForm({ title: '', type: 'CourtHearing', dateTime: '', notes: '' });
      setIsQuickAppOpen(false);
    } catch (err: any) {
      alert(err.message || 'บันทึกนัดหมายล้มเหลว');
    }
  };



  return (
    <div className="fade-in">
      {/* Matter Header Info Card */}
      <div className="dashboard-hero" style={{ padding: '24px', marginBottom: '24px' }}>
        <div className="dashboard-hero-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', padding: '4px 8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', color: 'var(--text-muted)', fontWeight: 600 }}>
              เลขแฟ้มคดี: {currentMatter.officeCaseNumber}/{currentMatter.officeCaseYear}
            </span>
            <button 
              className="btn btn-secondary" 
              onClick={onStartEdit}
              style={{ padding: '4px 8px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              ✏️ แก้ไขข้อมูลคดี
            </button>
          </div>
          <h2 style={{ fontSize: '24px', margin: '8px 0 4px 0', fontWeight: '700', color: 'var(--text-main)' }}>
            ลูกความ: {currentMatter.clientName} ({currentMatter.clientType})
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            🏛️ {currentMatter.court} • เลขคดีดำ: {currentMatter.courtBlackRef || '-'} • เลขคดีแดง: {currentMatter.courtRedRef || '-'} • ประเภท: {currentMatter.caseType}
          </p>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            {currentMatter.courtStatusTags.map(tag => (
              <span key={tag} className="badge badge-info" style={{ fontSize: '11px', padding: '2px 8px' }}>
                🏷️ {tag}
              </span>
            ))}
          </div>

          {/* Assigned Lawyers Badging */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>ทนายผู้ดูแล:</span>
            {(currentMatter.assignedTo || []).map(email => (
              <span key={email} className="badge badge-secondary" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                👤 {getAssigneeName(email)}
              </span>
            ))}
            {isAdmin && (
              <div style={{ display: 'inline-flex', gap: '4px', marginLeft: '8px' }}>
                {['alex.alexander@nanchai-law.com', 'lg1@firm.com', 'lg2@firm.com'].map(email => {
                  const isAssigned = (currentMatter.assignedTo || []).includes(email);
                  return (
                    <button
                      key={email}
                      onClick={() => {
                        const newAssignees = isAssigned
                          ? (currentMatter.assignedTo || []).filter(e => e !== email)
                          : [...(currentMatter.assignedTo || []), email];
                        onAssignLawyers(currentMatter.matterId, newAssignees);
                      }}
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: '1px dashed var(--border-color)',
                        background: isAssigned ? 'var(--accent-light)' : 'transparent',
                        color: isAssigned ? 'var(--accent)' : 'var(--text-muted)',
                        cursor: 'pointer'
                      }}
                    >
                      {isAssigned ? '✓' : '+'} {getAssigneeName(email)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
          <span className={`badge ${getCountdownBadge(currentMatter.currentDeadline).class}`} style={{ padding: '8px 16px', fontSize: '13px' }}>
            {getCountdownBadge(currentMatter.currentDeadline).text}
          </span>
          
          <div className="status-switches">
            {(['Active', 'Waiting', 'Snoozed', 'Closed', 'Reject'] as const).map(st => (
              <button 
                key={st}
                className={`btn btn-secondary ${currentMatter.officeStatus === st ? 'active' : ''}`}
                onClick={() => onUpdateStatus(currentMatter.matterId, st)}
                style={{ padding: '4px 10px', fontSize: '11px' }}
              >
                {st}
              </button>
            ))}
            <button 
              className="btn" 
              onClick={() => onDeleteMatter(currentMatter.matterId)}
              style={{ padding: '4px 10px', fontSize: '11px', backgroundColor: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', color: '#ef4444' }}
            >
              <Trash2 size={12} /> ลบ
            </button>
          </div>
        </div>
      </div>

      {/* Grid: 02_สำนวนคดี_ศาล & 03_หลักฐาน */}
      <div className="workspace-grid">
        
        {/* Left pane: 02_สำนวนคดี_ศาล */}
        <div className="workspace-pane">
          <div className="workspace-pane-header">
            <span className="workspace-pane-title">
              📂 02_สำนวนคดี_ศาล
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="btn btn-primary"
                onClick={() => setIsTemplateModalOpen(true)}
                style={{ padding: '4px 10px', fontSize: '11px' }}
              >
                📝 ร่างคู่ความ (Template)
              </button>
              <button 
                className={`btn ${isFolderLocked ? 'btn-secondary' : 'btn-primary'}`}
                onClick={handleToggleLock}
                style={{ padding: '4px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                {isFolderLocked ? <Lock size={12} /> : <Unlock size={12} />} 
                {isFolderLocked ? 'ปลดล็อกจัดเรียง' : 'ล็อกจัดคิว OneDrive'}
              </button>
            </div>
          </div>

          <div className="workspace-pane-body">
            <div className="file-list">
              {groupedDocs.map((doc, idx) => (
                <div 
                  key={doc.baseName} 
                  className={`file-card ${!isFolderLocked ? 'draggable' : ''}`}
                  draggable={!isFolderLocked}
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e)}
                  onDrop={() => handleDrop(idx)}
                  style={{ opacity: draggedCardIndex === idx ? 0.4 : 1 }}
                >
                  <div className="file-card-info">
                    <span className="file-icon">📄</span>
                    <div>
                      <div className="file-name">{doc.baseName}</div>
                      <div className="file-size" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {doc.docx && `Word: ${(doc.docx.size / 1024).toFixed(1)} KB`}
                        {doc.docx && doc.pdf && ' | '}
                        {doc.pdf && `PDF: ${(doc.pdf.size / 1024).toFixed(1)} KB`}
                      </div>
                    </div>
                  </div>

                  <div className="file-actions" style={{ gap: '6px' }}>
                    {/* Word action icon (📝) */}
                    {doc.docx ? (
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => alert(`[Word App Local] กำลังดาวน์โหลดและเปิดไฟล์แก้ไขผ่าน MS Word...\nPath: ${doc.docx!.path}`)}
                        style={{ padding: '4px 8px', fontSize: '11px' }}
                        title="แก้ไข Word (.docx)"
                      >
                        📝 แก้ไข Word
                      </button>
                    ) : (
                      <button className="btn btn-secondary" disabled style={{ padding: '4px 8px', fontSize: '11px', opacity: 0.3 }}>
                        📝 ไม่มี Word
                      </button>
                    )}

                    {/* PDF action icon (👁️) */}
                    {doc.pdf ? (
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => onPreviewPdf(doc.pdf!)}
                        style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        title="เปิดดู PDF (.pdf)"
                      >
                        <Eye size={12} /> เปิดดู PDF
                      </button>
                    ) : (
                      <button className="btn btn-secondary" disabled style={{ padding: '4px 8px', fontSize: '11px', opacity: 0.3 }}>
                        👁️ ไม่มี PDF
                      </button>
                    )}

                    {/* Delete action button */}
                    <button 
                      className="btn-icon-only text-danger" 
                      onClick={async () => {
                        if (confirm(`ยืนยันลบไฟล์คู่คู่ความกลุ่มนี้?`)) {
                          if (doc.docx) await onDeleteFile(currentMatter.matterId, doc.docx.name);
                          if (doc.pdf) await onDeleteFile(currentMatter.matterId, doc.pdf.name);
                        }
                      }}
                      title="ลบเอกสาร"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}

              {groupedDocs.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
                  ยังไม่มีสำนวนคู่ความหลักสำหรับยื่นศาล
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right pane: 03_หลักฐาน (Single Folder with Logical Tabs) */}
        <div className="workspace-pane" onDragOver={(e) => e.preventDefault()} onDrop={handleEvidenceDrop}>
          <div className="workspace-pane-header" style={{ paddingBottom: '0px' }}>
            <span className="workspace-pane-title">
              📁 03_หลักฐาน
            </span>
            {/* Logical Tabs */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button 
                className={`btn ${evidenceTab === 'ready' ? 'btn-primary' : 'btn-secondary'}`} 
                onClick={() => setEvidenceTab('ready')}
                style={{ padding: '4px 8px', fontSize: '11px', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
              >
                หลักฐานพร้อมใช้
              </button>
              <button 
                className={`btn ${evidenceTab === 'raw' ? 'btn-primary' : 'btn-secondary'}`} 
                onClick={() => setEvidenceTab('raw')}
                style={{ padding: '4px 8px', fontSize: '11px', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
              >
                คลังข้อมูลดิบ
              </button>
            </div>
          </div>

          <div className="workspace-pane-body">
            {/* Upload Zone */}
            <div className="dropzone">
              <Upload size={20} style={{ color: 'var(--accent)' }} />
              <div style={{ fontSize: '12px', fontWeight: 600 }}>ลากและวางหลักฐานดิบมาปล่อยที่นี่ (อัปโหลดเข้าคลาวด์ตรง)</div>
              <input 
                type="file" 
                multiple 
                style={{ display: 'none' }} 
                id="evidence-file-select"
                onChange={handleEvidenceSelect}
              />
              <button 
                className="btn btn-secondary"
                onClick={() => document.getElementById('evidence-file-select')?.click()}
                style={{ padding: '3px 8px', fontSize: '11px', marginTop: '2px' }}
              >
                เลือกไฟล์หลักฐาน
              </button>
            </div>

            {/* Logical Tabs File List */}
            <div className="file-list" style={{ marginTop: '12px' }}>
              {evidenceFiles.map((file, idx) => (
                <div key={idx} className="file-card">
                  <div className="file-card-info">
                    <span className="file-icon">📕</span>
                    <div>
                      <div className="file-name">{file.name}</div>
                      <div className="file-size">{(file.size / 1024).toFixed(1)} KB</div>
                    </div>
                  </div>

                  <div className="file-actions" style={{ gap: '6px' }}>
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => onPreviewPdf(file)}
                      style={{ padding: '3px 8px', fontSize: '10px' }}
                    >
                      👁️ เปิดดู
                    </button>

                    {/* Move to another logical tab */}
                    <button 
                      className="btn btn-primary"
                      onClick={() => onUpdateEvidenceStatus(
                        currentMatter.matterId, 
                        file.name, 
                        evidenceTab === 'ready' ? 'raw' : 'ready'
                      )}
                      style={{ padding: '3px 8px', fontSize: '10px' }}
                    >
                      {evidenceTab === 'ready' ? '📦 ย้ายเข้าคลังดิบ' : '✅ คัดกรองพร้อมใช้'}
                    </button>

                    <button 
                      className="btn-icon-only text-danger" 
                      onClick={() => onDeleteFile(currentMatter.matterId, file.name)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}

              {evidenceFiles.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>
                  ไม่มีรายการไฟล์ในแท็บนี้
                </p>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Grid: vertical timeline & Obsidian Diary Canvas */}
      <div className="workspace-grid" style={{ marginTop: '24px' }}>
        
        {/* LEFT: Vertical timeline (Top 3 newest collapsible) */}
        <div className="workspace-pane">
          <div className="workspace-pane-header">
            <span className="workspace-pane-title">
              ● ประวัติและกำหนดการคดีความ (Timeline)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="btn btn-primary" 
                onClick={() => setIsQuickAppOpen(!isQuickAppOpen)}
                style={{ padding: '4px 10px', fontSize: '11px' }}
              >
                + เพิ่มนัดหมาย
              </button>
              {sortedAppointments.length > 3 && (
                <button 
                  className="btn btn-secondary"
                  onClick={() => setTimelineExpanded(!timelineExpanded)}
                  style={{ padding: '4px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {timelineExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {timelineExpanded ? 'ย่อลง' : 'แสดงทั้งหมด'}
                </button>
              )}
            </div>
          </div>

          <div className="workspace-pane-body">
            {/* Quick add app form */}
            {isQuickAppOpen && (
              <form onSubmit={handleQuickAppSubmit} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>เพิ่มเหตุการณ์นัดหมายด่วน</div>
                <div className="form-group" style={{ marginBottom: '8px' }}>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="ชื่องาน/นัดหมาย เช่น นัดสืบพยานโจทก์"
                    value={quickAppForm.title}
                    onChange={e => setQuickAppForm(prev => ({ ...prev, title: e.target.value }))}
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                    required
                  />
                </div>
                <div className="form-row" style={{ gap: '8px', marginBottom: '8px' }}>
                  <select 
                    className="form-input"
                    value={quickAppForm.type}
                    onChange={e => setQuickAppForm(prev => ({ ...prev, type: e.target.value as Appointment['type'] }))}
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                  >
                    <option value="CourtHearing">นัดศาล (CourtHearing)</option>
                    <option value="Deadline">เดดไลน์ (Deadline)</option>
                    <option value="Meeting">นัดพบลูกความ (Meeting)</option>
                  </select>
                  <input 
                    type="datetime-local" 
                    className="form-input"
                    value={quickAppForm.dateTime}
                    onChange={e => setQuickAppForm(prev => ({ ...prev, dateTime: e.target.value }))}
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '8px' }}>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="รายละเอียดเพิ่มเติม (สถานที่/หมายเหตุ)"
                    value={quickAppForm.notes}
                    onChange={e => setQuickAppForm(prev => ({ ...prev, notes: e.target.value }))}
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsQuickAppOpen(false)} style={{ padding: '4px 10px', fontSize: '11px' }}>ยกเลิก</button>
                  <button type="submit" className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '11px' }}>บันทึก</button>
                </div>
              </form>
            )}

            {/* Vertical timeline nodes */}
            <div className="timeline-vertical" style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', paddingLeft: '16px', borderLeft: '2px solid var(--border-color)', marginLeft: '8px' }}>
              {visibleAppointments.map((app) => {
                let badgeClass = 'badge-info';
                if (app.type === 'Deadline') badgeClass = 'badge-danger';
                if (app.type === 'CourtHearing') badgeClass = 'badge-warning';

                return (
                  <div key={app.id} style={{ position: 'relative' }}>
                    {/* Node Dot */}
                    <div style={{ 
                      position: 'absolute', 
                      left: '-23px', 
                      top: '4px', 
                      width: '12px', 
                      height: '12px', 
                      borderRadius: '50%', 
                      backgroundColor: app.type === 'Deadline' ? 'var(--color-danger)' : app.type === 'CourtHearing' ? 'var(--color-warning)' : 'var(--color-info)',
                      border: '2px solid var(--bg-card)'
                    }} />

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-main)' }}>
                          {app.title}
                        </span>
                        <button 
                          className="btn-icon-only text-danger"
                          onClick={() => onDeleteAppointment(currentMatter.matterId, app.id)}
                          style={{ padding: '0px', border: 'none', background: 'transparent' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        <span className={`badge ${badgeClass}`} style={{ fontSize: '9px', padding: '1px 5px', marginRight: '6px' }}>
                          {app.type}
                        </span>
                        {formatDate(app.dateTime)}
                        {app.googleEventId && (
                          <span style={{ marginLeft: '8px', color: '#10b981', fontWeight: 600 }}>
                            ✓ ซิงค์ Google Calendar แล้ว
                          </span>
                        )}
                      </div>

                      {app.notes && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', padding: '6px 8px', borderRadius: '4px' }}>
                          {app.notes}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {sortedAppointments.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                  ยังไม่มีประวัติกำหนดการบันทึกไว้
                </p>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Back-office Tasks Checklist */}
        <div className="workspace-pane">
          <div className="workspace-pane-header">
            <span className="workspace-pane-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              📝 รายการงานหลังบ้านประจำคดี (Tasks)
            </span>
            <button 
              className="btn btn-primary" 
              onClick={() => setIsAddTaskOpen(!isAddTaskOpen)}
              style={{ padding: '4px 10px', fontSize: '11px' }}
            >
              + เพิ่มงานใหม่
            </button>
          </div>
          
          <div className="workspace-pane-body">
            {/* Quick add task form */}
            {isAddTaskOpen && (
              <form onSubmit={handleAddTaskSubmit} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>เพิ่มงานหลังบ้าน</div>
                <div className="form-group" style={{ marginBottom: '8px' }}>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="ชื่องานหลังบ้าน เช่น ร่างคำให้การจำเลย"
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '12px', width: '100%' }}
                    required
                  />
                </div>
                <div className="form-row" style={{ gap: '8px', marginBottom: '8px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>กำหนดส่ง</label>
                    <input 
                      type="date" 
                      className="form-control"
                      value={taskDueDate}
                      onChange={e => setTaskDueDate(e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '12px', width: '100%' }}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>ผู้รับผิดชอบ</label>
                    <select 
                      className="form-control"
                      value={taskAssignee}
                      onChange={e => setTaskAssignee(e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '12px', width: '100%' }}
                    >
                      <option value="alex.alexander@nanchai-law.com">พี่ (Admin)</option>
                      <option value="lg1@firm.com">ทนาย lg1</option>
                      <option value="lg2@firm.com">ทนาย lg2</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsAddTaskOpen(false)} style={{ padding: '4px 10px', fontSize: '11px' }}>ยกเลิก</button>
                  <button type="submit" className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '11px' }}>บันทึก</button>
                </div>
              </form>
            )}

            {/* List of Tasks */}
            <div className="task-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
              {(currentMatter.tasks || []).map((task) => {
                const due = new Date(task.dueDate);
                due.setHours(0,0,0,0);
                const todayVal = new Date();
                todayVal.setHours(0,0,0,0);
                const diffTime = due.getTime() - todayVal.getTime();
                const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                let badgeClass = 'badge-secondary';
                let countdown = `อีก ${daysLeft} วัน`;
                if (daysLeft < 0) {
                  badgeClass = 'badge-danger';
                  countdown = `เลยกำหนด ${Math.abs(daysLeft)} วัน`;
                } else if (daysLeft === 0) {
                  badgeClass = 'badge-warning';
                  countdown = 'วันนี้!';
                }

                return (
                  <div 
                    key={task.id} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '10px 12px', 
                      background: task.completed ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '6px',
                      opacity: task.completed ? 0.6 : 1
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                      <input 
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => onToggleTask(currentMatter.matterId, task.id)}
                        style={{ cursor: 'pointer', accentColor: 'var(--accent)', width: '15px', height: '15px' }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ 
                          fontSize: '13px', 
                          fontWeight: 600, 
                          color: task.completed ? 'var(--text-muted)' : 'var(--text-main)',
                          textDecoration: task.completed ? 'line-through' : 'none'
                        }}>
                          {task.title}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          ผู้รับผิดชอบ: <strong>{getAssigneeName(task.assignedTo)}</strong>
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {!task.completed && (
                        <span className={`badge ${badgeClass}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                          {countdown}
                        </span>
                      )}
                      <button 
                        className="btn-icon-only text-danger" 
                        onClick={() => onDeleteTask(currentMatter.matterId, task.id)}
                        style={{ border: 'none', background: 'transparent', padding: '2px' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {(currentMatter.tasks || []).length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                  ยังไม่มีงานหลังบ้านประจำคดีนี้
                </p>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Matter Invoices checklist (full width now) */}
      <div className="workspace-pane" style={{ marginTop: '24px' }}>
        <div className="workspace-pane-header">
          <span className="workspace-pane-title">
            💳 บัญชีงวดเงินประจำคดีความนี้
          </span>
          {hasFinanceAccess && (
            <button 
              className="btn btn-primary" 
              onClick={onAddInvoiceTrigger}
              style={{ padding: '4px 10px', fontSize: '11px' }}
            >
              + เพิ่มงวดเงิน
            </button>
          )}
        </div>

        <div className="workspace-pane-body">
          {!hasFinanceAccess ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
              🔒 บัญชีของคุณไม่มีสิทธิ์อ่านข้อมูลการเงินคดีความ
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {transactions.map((tx) => (
                <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{tx.description}</div>
                    <div style={{ fontSize: '12px', color: 'var(--accent)', fontFamily: 'monospace' }}>
                      {tx.amount.toLocaleString('th-TH')} บาท
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`badge ${
                      tx.status === 'Paid' ? 'badge-success' :
                      tx.status === 'Overdue' ? 'badge-danger' : 'badge-warning'
                    }`} style={{ fontSize: '10px' }}>
                      {tx.status}
                    </span>
                    
                    {tx.status !== 'Paid' && (
                      <button 
                        className="btn btn-primary" 
                        onClick={() => onMarkInvoicePaid(tx.id)}
                        style={{ padding: '2px 6px', fontSize: '10px' }}
                      >
                        รับชำระ
                      </button>
                    )}

                    <button 
                      className="btn-icon-only text-danger" 
                      onClick={() => onDeleteInvoice(tx.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}

              {transactions.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                  ยังไม่มีรายการเรียกเก็บเงินสำหรับคดีนี้ในบัญชีกลาง
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Word Template Selection Modal */}
      {isTemplateModalOpen && (
        <div className="modal-overlay" style={{ display: 'flex' }}>
          <div className="modal-content">
            <h3 className="modal-title">เลือกแม่แบบคำคู่ความ (Word Templates)</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
              ระบบจะดึงข้อมูลชื่อโจทก์ จำเลย ศาล และรายละเอียดคดีนี้ ไปเขียนแทนตัวแปรในฟอร์มศาลโดยอัตโนมัติ
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {templates.map(t => (
                <div 
                  key={t.id} 
                  style={{ padding: '12px', background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer' }}
                  onClick={() => {
                    onGenerateTemplate(t.name);
                    setIsTemplateModalOpen(false);
                  }}
                  className="dropdown-item-hover"
                >
                  <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--text-main)' }}>{t.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{t.description}</div>
                </div>
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setIsTemplateModalOpen(false)}>ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Date Formatter helper
function formatDate(isoString: string | null): string {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: isoString.includes('T') ? '2-digit' : undefined,
      minute: isoString.includes('T') ? '2-digit' : undefined
    });
  } catch {
    return isoString;
  }
}
