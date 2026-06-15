import React from 'react';
import { Folder, Scale, Calendar, Users, DollarSign, ClipboardList } from 'lucide-react';

interface SidebarProps {
  activeView: string;
  selectedMatterId: string | null;
  onNavigate: (view: 'dashboard' | 'matters' | 'snoozed' | 'finance' | 'calendar' | 'backlog' | 'clients') => void;
  isSidebarOpen: boolean;
  isAdmin: boolean;
}

const BOOKMARKS = [
  { name: 'e-Filing ศาลยุติธรรม', url: 'https://efiling3.coj.go.th/', icon: '🏛️' },
  { name: 'CIOS บริการข้อมูลคดี', url: 'https://cios.coj.go.th/', icon: '💻' },
  { name: 'DBD ค้นหาข้อมูลบริษัท', url: 'https://datawarehouse.dbd.go.th/', icon: '🏢' },
  { name: 'ระบบสืบค้นคำพิพากษาฎีกา', url: 'https://deka.coj.go.th/', icon: '📖' },
  { name: 'ราชกิจจานุเบกษา', url: 'http://www.ratchakitcha.soc.go.th/', icon: '📜' },
  { name: 'ระบบลงลายมือชื่อดิจิทัล', url: 'https://www.thaidigitalsign.com/', icon: '✍️' }
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  selectedMatterId,
  onNavigate,
  isSidebarOpen,
  isAdmin
}) => {
  return (
    <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          LAWGUILD <span className="sidebar-logo-accent">(LWS)</span>
        </div>
      </div>
      
      <nav className="sidebar-menu">
        <button 
          className={`menu-item ${activeView === 'dashboard' && !selectedMatterId ? 'active' : ''}`}
          onClick={() => onNavigate('dashboard')}
        >
          <Folder size={16} /> หน้าหลัก (Main Dashboard)
        </button>
        <button 
          className={`menu-item ${activeView === 'matters' && !selectedMatterId ? 'active' : ''}`}
          onClick={() => onNavigate('matters')}
        >
          <Scale size={16} /> ภาพรวมคดี (Matters)
        </button>
        <button 
          className={`menu-item ${activeView === 'calendar' && !selectedMatterId ? 'active' : ''}`}
          onClick={() => onNavigate('calendar')}
        >
          <Calendar size={16} /> ปฏิทิน (Calendar)
        </button>

        {isAdmin && (
          <>
            <button 
              className={`menu-item ${activeView === 'clients' && !selectedMatterId ? 'active' : ''}`}
              onClick={() => onNavigate('clients')}
            >
              <Users size={16} /> ลูกความ (Clients)
            </button>
            <button 
              className={`menu-item ${activeView === 'finance' && !selectedMatterId ? 'active' : ''}`}
              onClick={() => onNavigate('finance')}
            >
              <DollarSign size={16} /> การเงิน (Finance)
            </button>
          </>
        )}

        <hr style={{ border: '0', borderTop: '1px solid var(--border-color)', margin: '16px 8px' }} />

        <div className="menu-section-title">ปุ่มเพิ่มเติมด้านล่าง</div>
        <button 
          className={`menu-item ${activeView === 'backlog' && !selectedMatterId ? 'active' : ''}`}
          onClick={() => onNavigate('backlog')}
        >
          <ClipboardList size={16} /> งานค้างระบบ (Backlog)
        </button>

        {/* Sidebar shortcuts portals */}
        <div className="shortcuts-section" style={{ borderTop: 'none', padding: '8px 12px', marginTop: 'auto' }}>
          <div className="menu-section-title" style={{ margin: '0 0 8px 0' }}>ลิงก์ด่วนภายนอก (Shortcuts)</div>
          {BOOKMARKS.slice(0, 3).map((bm, index) => (
            <a key={index} href={bm.url} target="_blank" rel="noreferrer" className="menu-item" style={{ fontSize: '13px', opacity: 0.85, padding: '8px 12px' }}>
              <span style={{ fontSize: '15px' }}>{bm.icon}</span> {bm.name}
            </a>
          ))}
        </div>
      </nav>
    </aside>
  );
};
