import React, { useState, useMemo } from 'react';
import type { Matter, Transaction, Appointment, TaskItem } from '../types';
import { getCountdownBadge } from '../utils/deadlineCalculator';
import { Clock, Plus, FolderOpen, Calendar, User, ChevronRight, CheckSquare, AlertTriangle, Briefcase } from 'lucide-react';

interface DashboardViewProps {
  matters: Matter[];
  transactions: Transaction[];
  hasFinanceAccess: boolean;
  currentUserEmail: string | null;
  isAdmin: boolean;
  onSelectMatter: (matterId: string) => void;
  onCreateMatterTrigger: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  matters,
  transactions,
  hasFinanceAccess,
  currentUserEmail,
  isAdmin,
  onSelectMatter,
  onCreateMatterTrigger
}) => {
  const [selectedDateStr, setSelectedDateStr] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [showAllMatters, setShowAllMatters] = useState<boolean>(isAdmin);

  const todayStr = new Date().toISOString().split('T')[0];

  // Helper to map email to display name
  const getAssigneeDisplayName = (email: string) => {
    if (email === 'alex.alexander@nanchai-law.com') return 'พี่ (Admin)';
    if (email === 'lg1@firm.com') return 'ทนาย lg1';
    if (email === 'lg2@firm.com') return 'ทนาย lg2';
    return email.split('@')[0];
  };

  // Generate 7 days (Yesterday 1 day, Today active, and Future 5 days)
  const days = useMemo(() => {
    const arr = [];
    const thaiDays = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    const thaiMonths = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + (i - 1)); // i=0 is Yesterday (-1), i=1 is Today (0)
      const dateStr = d.toISOString().split('T')[0];
      
      let label = '';
      if (i === 0) label = 'เมื่อวาน';
      else if (i === 1) label = 'วันนี้';
      else if (i === 2) label = 'พรุ่งนี้';
      else label = thaiDays[d.getDay()];

      const displayDate = `${d.getDate()} ${thaiMonths[d.getMonth()]}`;

      arr.push({
        dateStr,
        label,
        displayDate,
      });
    }
    return arr;
  }, []);

  // Filter court hearings / appointments for the selected day across active matters
  const selectedDayHearings = useMemo(() => {
    const hearings: { matter: Matter; appointment: Appointment }[] = [];
    matters
      .filter(m => m.officeStatus === 'Active')
      .forEach(m => {
        m.appointments.forEach(app => {
          if (app.dateTime.split('T')[0] === selectedDateStr) {
            hearings.push({ matter: m, appointment: app });
          }
        });
      });
    return hearings;
  }, [matters, selectedDateStr]);

  // Find all pending back-office tasks with deadlines within 30 days
  const backofficeTasks = useMemo(() => {
    const list: { matter: Matter; task: TaskItem; daysLeft: number }[] = [];
    const t = new Date();
    t.setHours(0, 0, 0, 0);

    matters.forEach(m => {
      if (m.tasks) {
        m.tasks.forEach(task => {
          if (!task.completed) {
            const due = new Date(task.dueDate);
            due.setHours(0, 0, 0, 0);
            const diffTime = due.getTime() - t.getTime();
            const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            // Only show if due in <= 30 days (even if overdue)
            if (daysLeft <= 30) {
              list.push({ matter: m, task, daysLeft });
            }
          }
        });
      }
    });

    // Sort by daysLeft ascending (most urgent first)
    return list.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [matters]);

  // Filter My Active Matters (Grid View 3x3)
  const activeMatters = useMemo(() => {
    let list = matters.filter(m => m.officeStatus === 'Active');
    
    // If not showing all office matters, filter to only current user's matters
    if (!showAllMatters && currentUserEmail) {
      list = list.filter(m => m.assignedTo && m.assignedTo.includes(currentUserEmail));
    }
    
    return list;
  }, [matters, showAllMatters, currentUserEmail]);

  // Calculate dynamic stats
  const stats = useMemo(() => {
    const todayHearings = matters.reduce((sum, m) => {
      if (m.officeStatus !== 'Active') return sum;
      const hearingsToday = m.appointments.filter(a => a.dateTime.split('T')[0] === todayStr);
      return sum + hearingsToday.length;
    }, 0);

    const activeCount = matters.filter(m => m.officeStatus === 'Active').length;

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const monthlyPaid = transactions
      .filter(t => {
        if (t.amount <= 0 || t.status !== 'Paid' || !t.paidAt) return false;
        const d = new Date(t.paidAt);
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const totalPending = transactions
      .filter(t => t.amount > 0 && t.status !== 'Paid')
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      todayHearings,
      activeCount,
      monthlyPaid,
      totalPending
    };
  }, [matters, transactions, todayStr]);

  return (
    <div className="dashboard-view fade-in">
      {/* Dashboard Hero Header */}
      <div className="dashboard-hero" style={{ padding: '24px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(24, 34, 53, 0.6) 100%)', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'Outfit', color: 'var(--text-main)' }}>
              ยินดีต้อนรับสู่ระบบงาน LAWGUILD (LWS)
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
              วันนี้มีนัดหมายศาลทั้งหมด {stats.todayHearings} นัด | ทะเบียนคดีออนไลน์เรียบร้อย
            </p>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ background: 'var(--bg-input)', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>คดีกำลังทำ</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>{stats.activeCount} คดี</div>
            </div>
            {hasFinanceAccess && (
              <>
                <div style={{ background: 'var(--bg-input)', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>รายรับเดือนนี้</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-success)' }}>{stats.monthlyPaid.toLocaleString('th-TH')} ฿</div>
                </div>
                <div style={{ background: 'var(--bg-input)', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>ค้างชำระ</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-warning)' }}>{stats.totalPending.toLocaleString('th-TH')} ฿</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Channel 1: Mini Court Schedule (7-day Slider) */}
      <div className="workspace-pane" style={{ marginBottom: '24px' }}>
        <div className="workspace-pane-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="workspace-pane-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} className="text-accent" /> 📅 ช่องที่ 1: ตารางนัดหมาย 7 วันสไลด์ (Mini Court Schedule)
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>เลือกวันด้านล่างเพื่อแสดงรายการนัดหมายศาลในวันนั้น</span>
        </div>
        <div className="workspace-pane-body" style={{ padding: '16px 0 0 0' }}>
          {/* Horizontal days slider */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', padding: '0 16px 16px 16px', borderBottom: '1px solid var(--border-color)' }}>
            {days.map((day) => {
              const isActive = selectedDateStr === day.dateStr;
              return (
                <button
                  key={day.dateStr}
                  onClick={() => setSelectedDateStr(day.dateStr)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '12px 6px',
                    borderRadius: '8px',
                    border: isActive ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                    background: isActive ? 'var(--bg-active)' : 'var(--bg-card)',
                    color: 'var(--text-main)',
                    boxShadow: isActive ? 'var(--shadow-glow)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 600, opacity: isActive ? 1 : 0.7, color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {day.label}
                  </span>
                  <span style={{ fontSize: '15px', fontWeight: 700, marginTop: '4px' }}>
                    {day.displayDate}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Appointments for selected date */}
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {selectedDayHearings.map(({ matter, appointment }) => {
              const refKey = `${matter.officeCaseNumber}/${matter.officeCaseYear}`;
              const timeStr = appointment.dateTime.includes('T') ? appointment.dateTime.split('T')[1].substring(0, 5) + ' น.' : 'ทั้งวัน';
              return (
                <div
                  key={appointment.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    transition: 'background-color 0.2s',
                  }}
                  className="hover:bg-slate-800"
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="badge badge-warning" style={{ fontSize: '11px' }}>
                        {timeStr}
                      </span>
                      <strong style={{ fontSize: '14px', color: 'var(--text-main)' }}>
                        แฟ้ม {refKey} | {appointment.title}
                      </strong>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '16px', marginLeft: '68px' }}>
                      <span>ลูกความ: <strong>{matter.clientName} ({matter.clientType})</strong></span>
                      <span>ศาล: <strong>{matter.court}</strong></span>
                      {matter.courtBlackRef && <span>เลขคดีดำ: <strong>{matter.courtBlackRef}</strong></span>}
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                    onClick={() => onSelectMatter(matter.matterId)}
                  >
                    รายละเอียดคดี 🔗
                  </button>
                </div>
              );
            })}

            {selectedDayHearings.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                ไม่มีหมายกำหนดนัดหมายศาลในวันที่เลือก
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Channel 2: Back-office Tasks (เตือนงานหลังบ้านที่ต้องทำวิกฤต) */}
      <div className="workspace-pane" style={{ marginBottom: '24px' }}>
        <div className="workspace-pane-header">
          <span className="workspace-pane-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckSquare size={18} className="text-danger" /> 📝 ช่องที่ 2: เตือนงานหลังบ้านที่ต้องทำวิกฤต (Tasks Deadline - ภายใน 30 วัน / สไลด์แนวนอน)
          </span>
        </div>
        <div className="workspace-pane-body" style={{ padding: '16px' }}>
          {/* Horizontal scroll container */}
          <div
            style={{
              display: 'flex',
              overflowX: 'auto',
              gap: '16px',
              paddingBottom: '8px',
              scrollSnapType: 'x mandatory',
            }}
            className="scrollbar-thin"
          >
            {backofficeTasks.map(({ matter, task, daysLeft }) => {
              const refKey = `${matter.officeCaseNumber}/${matter.officeCaseYear}`;
              const isOverdue = daysLeft < 0;
              const isToday = daysLeft === 0;

              let badgeColor = 'var(--color-danger)';
              let badgeBg = 'var(--color-danger-bg)';
              let countdownText = `อีก ${daysLeft} วัน!`;

              if (isOverdue) {
                countdownText = `เลยกำหนด ${Math.abs(daysLeft)} วัน!`;
              } else if (isToday) {
                badgeColor = 'var(--color-warning)';
                badgeBg = 'var(--color-warning-bg)';
                countdownText = 'วันนี้!';
              } else if (daysLeft > 14) {
                badgeColor = 'var(--color-info)';
                badgeBg = 'var(--color-info-bg)';
              }

              return (
                <div
                  key={task.id}
                  style={{
                    flex: '0 0 280px',
                    scrollSnapAlign: 'start',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'transform 0.2s, border-color 0.2s',
                  }}
                  className="hover:scale-105 hover:border-amber-500"
                  onClick={() => onSelectMatter(matter.matterId)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>
                      📂 แฟ้ม: {refKey}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: badgeColor,
                        background: badgeBg,
                        padding: '2px 8px',
                        borderRadius: '99px',
                      }}
                    >
                      {countdownText}
                    </span>
                  </div>
                  
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', minHeight: '40px', lineHeight: '1.4' }}>
                      📝 งาน: "{task.title}"
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <User size={12} /> ผู้ดูแล: <strong>{getAssigneeDisplayName(task.assignedTo)}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
                    <span style={{ fontSize: '11px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      คลิกวาร์ปไปคดี <ChevronRight size={12} />
                    </span>
                  </div>
                </div>
              );
            })}

            {backofficeTasks.length === 0 && (
              <div style={{ width: '100%', textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                ไม่มีงานหลังบ้านด่วนที่ค้างคาในช่วงนี้
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Channel 3: Active matters list (Grid 3x3) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h2 style={{ fontSize: '18px', fontFamily: 'Outfit', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Briefcase size={18} className="text-accent" /> 💼 ช่องที่ 3: แฟ้มคดี Active และอยู่ในความดูแล ({activeMatters.length} คดี)
            </h2>
            {isAdmin && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showAllMatters}
                  onChange={(e) => setShowAllMatters(e.target.checked)}
                  style={{
                    accentColor: 'var(--accent)',
                    width: '14px',
                    height: '14px',
                  }}
                />
                แสดงแฟ้มคดีทั้งหมดของสำนักงาน (Admin view)
              </label>
            )}
          </div>
          
          <button className="btn btn-primary" onClick={onCreateMatterTrigger} style={{ padding: '8px 16px' }}>
            <Plus size={16} /> สร้างคดีใหม่
          </button>
        </div>

        {/* 3x3 Grid View */}
        <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {activeMatters.map(m => {
            const refKey = `${m.officeCaseNumber}/${m.officeCaseYear}`;
            // Count court drafts
            const docsCount = m.files.filter(f => f.category === 'CourtDrafts').length;
            
            // Find earliest upcoming appointment (date >= todayStr)
            const upcomingApp = m.appointments
              .filter(app => app.dateTime.split('T')[0] >= todayStr)
              .sort((a, b) => a.dateTime.localeCompare(b.dateTime))[0];

            // Map assignees list
            const assigneesText = m.assignedTo && m.assignedTo.length > 0
              ? m.assignedTo.map(getAssigneeDisplayName).join(', ')
              : 'ยังไม่ได้ระบุ';

            return (
              <div
                key={m.matterId}
                className="matter-card fade-in"
                onClick={() => onSelectMatter(m.matterId)}
                style={{ cursor: 'pointer' }}
              >
                <div className="matter-card-header">
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>
                      แฟ้ม {refKey} • {m.caseType === 'Civil' ? 'คดีแพ่ง' : m.caseType === 'Criminal' ? 'คดีอาญา' : m.caseType}
                    </div>
                    <h3 className="matter-card-title" style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px' }}>
                      {m.clientName} ({m.clientType})
                    </h3>
                  </div>
                  <span className="badge badge-success">Active</span>
                </div>

                <div className="matter-card-details" style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div>🏢 ศาล: <strong>{m.court}</strong></div>
                  {(m.courtBlackRef || m.courtRedRef) && (
                    <div>
                      ⚖️ เลขคดี: {m.courtBlackRef && <span style={{ color: 'var(--text-main)' }}>ดำ <strong>{m.courtBlackRef}</strong></span>} {m.courtRedRef && <span style={{ color: 'var(--color-danger)', marginLeft: '6px' }}>แดง <strong>{m.courtRedRef}</strong></span>}
                    </div>
                  )}
                  {upcomingApp ? (
                    <div style={{ color: 'var(--color-warning)' }}>
                      📅 นัด: <strong>{upcomingApp.dateTime.split('T')[0]} ({upcomingApp.title})</strong>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)' }}>📅 นัด: <strong>- (ไม่มีนัดหมายใหม่)</strong></div>
                  )}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px', marginTop: '4px' }}>
                    👤 ผู้รับผิดชอบ: <strong>{assigneesText}</strong>
                  </div>
                </div>

                <div className="matter-card-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', paddingTop: '8px', fontSize: '11px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} /> {getCountdownBadge(m.currentDeadline).text}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
                    <FolderOpen size={11} /> คู่ความ {docsCount} ชุด
                  </span>
                </div>
              </div>
            );
          })}

          {activeMatters.length === 0 && (
            <div style={{ gridColumn: 'span 3', textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
              <AlertTriangle size={32} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
              ไม่มีแฟ้มคดีสถานะ Active ในความรับผิดชอบของคุณในขณะนี้
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
