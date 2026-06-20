import { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  Settings as SettingsIcon,
  Sun,
  Moon,
  Plus,
  ArrowLeft,
  Trash2,
  ExternalLink,
  LogOut
} from 'lucide-react';
import { StorageService } from './services/storage';
import type { LWSSettings } from './services/storage';
import type { Transaction, Appointment, FileMetadata } from './types';
import { AuthService } from './services/auth';
import type { OneDriveWorkspace } from './services/auth';
import { useMatters } from './hooks/useMatters';
import { useTransactions } from './hooks/useTransactions';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { FinanceView } from './components/FinanceView';
import { MatterDetailView } from './components/MatterDetailView';
import { GoogleCalendarService } from './services/googleCalendar';
import { useClients } from './hooks/useClients';
import { ClientsView } from './components/ClientsView';
import { WHITELIST } from './constants/whitelist';
import './App.css';

// Pre-defined bookmarks for government portals
const BOOKMARKS = [
  { name: 'e-Filing ศาลยุติธรรม', url: 'https://efiling3.coj.go.th/', icon: '🏛️' },
  { name: 'CIOS บริการข้อมูลคดี', url: 'https://cios.coj.go.th/', icon: '💻' },
  { name: 'DBD ค้นหาข้อมูลบริษัท', url: 'https://datawarehouse.dbd.go.th/', icon: '🏢' },
  { name: 'ระบบสืบค้นคำพิพากษาฎีกา', url: 'https://deka.coj.go.th/', icon: '📖' },
  { name: 'ราชกิจจานุเบกษา', url: 'http://www.ratchakitcha.soc.go.th/', icon: '📜' },
  { name: 'ระบบลงลายมือชื่อดิจิทัล', url: 'https://www.thaidigitalsign.com/', icon: '✍️' }
];

export interface BacklogTask {
  id: string;
  category: 'High' | 'Medium' | 'Low';
  title: string;
  description: string;
  completed: boolean;
}

const DEFAULT_BACKLOG_TASKS: BacklogTask[] = [
  { id: 'AD-REG', category: 'High', title: 'Production Azure AD App Registration (Microsoft Entra ID)', description: 'Register LWS on Azure Portal as a Single-Page Application (SPA), configure redirect URIs, and update auth flow.', completed: false },
  { id: 'OD-SCAN', category: 'High', title: 'Live OneDrive File Watcher & Scanner', description: 'Implement debounced polling on OneDrive children endpoint to auto-sync file lists.', completed: false },
  { id: 'GC-HANDSHAKE', category: 'High', title: 'Google Calendar API Handshake', description: 'Register Google Cloud Project, implement calendar OAuth, and sync event actions.', completed: false },
  { id: 'PDF-COMBINE', category: 'Medium', title: 'PDF Combiner & Toolset (Phase 4 of spec)', description: 'Integrate browser-based PDF utility (pdf-lib) to merge multiple case documents.', completed: false },
  { id: 'AUDIT-LOG', category: 'Medium', title: 'Office Status Timeline & Audit Log', description: 'Visual timeline tracking case phase durations, stored in matter metadata.', completed: false },
  { id: 'DOCX-FILL', category: 'Medium', title: 'Word Template Auto-population', description: 'Upload .docx templates and compile them with client and matter details.', completed: false },
  { id: 'SUPABASE-SaaS', category: 'Low', title: 'Supabase BaaS Integration', description: 'Set up Supabase database for subscriptions, Stripe billing, and team tenancy boundaries.', completed: false },
  { id: 'RBAC-SHARE', category: 'Low', title: 'Teams RBAC Sharing', description: 'Show shared folder indicators based on OneDrive permission settings.', completed: false }
];

function App() {
  // Authentication & Access Management States
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const savedAccount = localStorage.getItem('lws_microsoft_account');
    if (!savedAccount) return false;
    if (savedAccount === 'Local Storage Offline') {
      const isLocal = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' || 
                      window.location.hostname === '[::1]';
      if (!isLocal) {
        localStorage.removeItem('lws_microsoft_account');
        localStorage.removeItem('lws_active_workspace');
        return false;
      }
      return true;
    }
    const isAllowed = WHITELIST.map(e => e.toLowerCase()).includes(savedAccount.toLowerCase());
    if (!isAllowed) {
      localStorage.removeItem('lws_microsoft_account');
      localStorage.removeItem('lws_microsoft_token');
      localStorage.removeItem('lws_active_workspace');
      return false;
    }
    return true;
  });
  const [microsoftToken, setMicrosoftToken] = useState<string | null>(() => {
    return localStorage.getItem('lws_microsoft_token');
  });
  const [workspaces, setWorkspaces] = useState<OneDriveWorkspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(() => {
    return AuthService.getActiveWorkspace();
  });
  const [isWorkspaceSelectorOpen, setIsWorkspaceSelectorOpen] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Navigation & Views
  const [activeView, setActiveView] = useState<'dashboard' | 'matters' | 'snoozed' | 'finance' | 'calendar' | 'backlog' | 'clients'>('dashboard');
  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(null);
  
  // Settings
  const [settings, setSettings] = useState<LWSSettings>(StorageService.getSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // UI Control states
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNewMatterOpen, setIsNewMatterOpen] = useState(false);
  const [isEditMatterOpen, setIsEditMatterOpen] = useState(false);
  const [isNewInvoiceOpen, setIsNewInvoiceOpen] = useState(false);
  const [pdfPreviewFile, setPdfPreviewFile] = useState<FileMetadata | null>(null);
  const [isFolderLocked, setIsFolderLocked] = useState(true);

  // Backlog
  const [backlogTasks, setBacklogTasks] = useState<BacklogTask[]>(() => {
    const raw = localStorage.getItem('lws_backlog_tasks');
    return raw ? JSON.parse(raw) : DEFAULT_BACKLOG_TASKS;
  });

  // Filters for the All Matters View
  const [filterYears, setFilterYears] = useState<string[]>([]);
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');

  // ── HOOKS INTEGRATION ──
  const {
    matters,
    loadMatters,
    createMatter,
    updateMatterInfo,
    updateMatterStatus,
    deleteMatter,
    addAppointment,
    deleteAppointment,
    addFile,
    updateEvidenceStatus,
    deleteFile,
    saveSortedFiles,
    generateTemplateFile,
    addTask,
    toggleTask,
    deleteTask,
    assignLawyers
  } = useMatters();

  const {
    clients,
    loading: clientsLoading,
    error: clientsError,
    loadClients,
    addClient,
    updateClient,
    deleteClient,
    syncFromMatter
  } = useClients();

  const {
    transactions,
    hasFinanceAccess,
    loadTransactions,
    addTransaction,
    updateTransactionStatus,
    attachSlipToTransaction,
    deleteTransaction,
    getTransactionsForMatter
  } = useTransactions({
    clientId: settings.microsoftClientId,
    token: microsoftToken,
    workspacePath: activeWorkspace
  });

  // Current selected matter lookup
  const currentMatter = useMemo(() => {
    return matters.find(m => m.matterId === selectedMatterId) || null;
  }, [matters, selectedMatterId]);

  const isAdmin = useMemo(() => {
    return hasFinanceAccess;
  }, [hasFinanceAccess]);

  // Helper for forced sign out
  const handleForceSignOut = async (msg?: string) => {
    try {
      await AuthService.logout();
    } catch (e) {
      console.warn('MSAL logout failed during forced signout:', e);
    }
    localStorage.removeItem('lws_microsoft_account');
    localStorage.removeItem('lws_microsoft_token');
    setIsAuthenticated(false);
    setMicrosoftToken(null);
    setActiveWorkspace(null);
    setSelectedMatterId(null);
    if (msg) setLoginError(msg);
  };

  // Pre-initialize MSAL client to prevent browser popup blocking
  useEffect(() => {
    if (settings.microsoftClientId) {
      AuthService.init(settings.microsoftClientId).catch(err => {
        console.warn('MSAL Pre-initialization failed:', err);
      });
    }
  }, [settings.microsoftClientId]);

  // Silent Token Refresh & Whitelist Enforcement
  useEffect(() => {
    const checkAuthAndRefresh = async () => {
      const savedAccount = localStorage.getItem('lws_microsoft_account');
      if (savedAccount && savedAccount !== 'Local Storage Offline') {
        // 1. Whitelist Check
        const isAllowed = WHITELIST.map(e => e.toLowerCase()).includes(savedAccount.toLowerCase());
        if (!isAllowed) {
          handleForceSignOut('❌ อีเมลนี้ไม่มีสิทธิ์เข้าใช้งานระบบ LWS');
          return;
        }

        // 2. Silent Token Refresh
        try {
          const freshToken = await AuthService.getAccessToken(settings.microsoftClientId);
          if (freshToken) {
            localStorage.setItem('lws_microsoft_token', freshToken);
            setMicrosoftToken(freshToken);
            setLoginError(null);
          } else {
            console.warn('Silent token retrieval returned null, forcing re-authentication.');
            handleForceSignOut('สิทธิ์การเข้าถึง Microsoft หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
          }
        } catch (error) {
          console.error('Silent token refresh failed:', error);
          handleForceSignOut('เซสชันของท่านหมดอายุหรือเชื่อมต่อล้มเหลว กรุณาเข้าสู่ระบบใหม่');
        }
      } else if (savedAccount === 'Local Storage Offline') {
        const isLocal = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' || 
                        window.location.hostname === '[::1]';
        if (!isLocal) {
          handleForceSignOut();
        }
      }
    };

    if (isAuthenticated) {
      checkAuthAndRefresh();
    }
  }, [isAuthenticated, settings.microsoftClientId]);

  // Load initial data
  useEffect(() => {
    if (isAuthenticated) {
      loadMatters();
      loadTransactions();
      loadClients(settings.microsoftClientId, microsoftToken || '', activeWorkspace || '');
    }
  }, [isAuthenticated, loadMatters, loadTransactions, loadClients, settings.microsoftClientId, microsoftToken, activeWorkspace]);

  // Save backlog tasks when updated
  useEffect(() => {
    localStorage.setItem('lws_backlog_tasks', JSON.stringify(backlogTasks));
  }, [backlogTasks]);

  // Apply theme configurations and save settings
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.documentElement.style.setProperty('--accent', settings.primaryColor);
    document.documentElement.style.setProperty('--accent-glow', `${settings.primaryColor}22`);
    StorageService.saveSettings(settings);
  }, [settings]);

  // Forms states
  const [newMatterForm, setNewMatterForm] = useState({
    matterId: '',
    officeCaseNumber: '',
    officeCaseYear: '',
    clientName: '',
    clientType: 'โจทก์',
    court: '',
    caseNumber: '',
    caseType: 'Civil',
    courtStatus: 'เตรียมฟ้อง',
    courtBlackRef: '',
    courtRedRef: '',
    courtStatusTags: [] as string[],
    deadlineCalculatedFrom: '',
    deadlineDurationDays: 15,
    deadlineUnit: 'days' as 'days' | 'months' | 'years'
  });

  const [editMatterForm, setEditMatterForm] = useState({
    clientName: '',
    clientType: 'โจทก์',
    court: '',
    caseNumStr: '',
    caseYearStr: '',
    caseType: 'Civil',
    courtStatus: '',
    courtBlackRef: '',
    courtRedRef: '',
    courtStatusTags: [] as string[]
  });

  const [newInvoiceForm, setNewInvoiceForm] = useState({
    description: '',
    amount: '',
    status: 'Pending' as Transaction['status'],
    date: new Date().toISOString().split('T')[0]
  });

  // Autocomplete states for Client Names in modals
  const [newClientQuery, setNewClientQuery] = useState('');
  const [showNewClientDropdown, setShowNewClientDropdown] = useState(false);
  const [editClientQuery, setEditClientQuery] = useState('');
  const [showEditClientDropdown, setShowEditClientDropdown] = useState(false);

  const clientSuggestions = useMemo(() => {
    const q = newClientQuery.toLowerCase().trim();
    if (!q) return [];
    return clients.filter(c => c.clientName.toLowerCase().includes(q));
  }, [clients, newClientQuery]);

  const editClientSuggestions = useMemo(() => {
    const q = editClientQuery.toLowerCase().trim();
    if (!q) return [];
    return clients.filter(c => c.clientName.toLowerCase().includes(q));
  }, [clients, editClientQuery]);


  // Microsoft authentication handlers
  const handleMicrosoftLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      if (!settings.microsoftClientId) {
        alert('กรุณากรอก Microsoft Client ID ในแผงตั้งค่า (⚙️) ก่อนเข้าสู่ระบบ');
        setIsConnSetupOpen(true);
        setIsLoggingIn(false);
        return;
      }
      
      const result = await AuthService.login(settings.microsoftClientId);
      if (result) {
        // Whitelist Match Guard (Case-Insensitive)
        const isAllowed = WHITELIST.map(e => e.toLowerCase()).includes(result.username.toLowerCase());
        if (!isAllowed) {
          alert('❌ คุณไม่มีสิทธิ์เข้าใช้งานระบบ LWS!');
          setLoginError(`อีเมล ${result.username} ไม่มีสิทธิ์เข้าใช้งานระบบ LWS (ไม่อยู่ใน Whitelist)`);
          try {
            await AuthService.logout();
          } catch (err) {
            console.warn('Logout after failed whitelist check failed:', err);
          }
          setIsLoggingIn(false);
          return;
        }

        localStorage.setItem('lws_microsoft_account', result.username);
        localStorage.setItem('lws_microsoft_token', result.token);
        setMicrosoftToken(result.token);
        setLoginError(null);

        // Load drives/workspaces
        const fetched = await AuthService.fetchOneDriveWorkspaces(settings.microsoftClientId, result.token);
        setWorkspaces(fetched);
        setIsWorkspaceSelectorOpen(true);
      }
    } catch (e: any) {
      alert('เข้าสู่ระบบล้มเหลว: ' + (e?.message || e));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSelectWorkspace = (wsPath: string) => {
    AuthService.setActiveWorkspace(wsPath);
    setActiveWorkspace(wsPath);
    setIsWorkspaceSelectorOpen(false);
    setIsAuthenticated(true);
    confetti();
    loadMatters();
    loadTransactions();
  };

  const handleCreateNewWorkspace = async () => {
    const defaultName = 'LWS-Workspace';
    const wsName = prompt('กรุณาระบุชื่อโฟลเดอร์พื้นที่ทำงานใหม่บน OneDrive:', defaultName);
    if (!wsName || !wsName.trim()) return;

    const token = microsoftToken || localStorage.getItem('lws_microsoft_token');
    if (!token) {
      alert('ไม่พบ Microsoft Access Token กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
      return;
    }

    try {
      const newWorkspace = await AuthService.createOneDriveWorkspace(settings.microsoftClientId, token, wsName.trim());
      if (newWorkspace) {
        // Add to workspaces list
        setWorkspaces(prev => {
          const exists = prev.some(ws => ws.name === newWorkspace.name);
          return exists ? prev : [...prev, newWorkspace];
        });
        // Automatically select the newly created workspace
        handleSelectWorkspace(newWorkspace.name);
        alert(`สร้างพื้นที่ทำงาน "${newWorkspace.name}" เรียบร้อยแล้ว!`);
      }
    } catch (err: any) {
      alert('สร้างพื้นที่ทำงานล้มเหลว: ' + (err?.message || err));
    }
  };

  const handleSignOut = async () => {
    if (confirm('ต้องการลงชื่อออกจากระบบ?')) {
      await AuthService.logout();
      localStorage.removeItem('lws_microsoft_account');
      localStorage.removeItem('lws_microsoft_token');
      setIsAuthenticated(false);
      setMicrosoftToken(null);
      setActiveWorkspace(null);
      setSelectedMatterId(null);
    }
  };

  const handleCreateMatterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatterForm.officeCaseNumber || !newMatterForm.officeCaseYear || !newMatterForm.clientName) {
      alert('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
      return;
    }

    const yr = parseInt(newMatterForm.officeCaseYear);
    const shortYr = yr > 2400 ? String(yr - 2500) : newMatterForm.officeCaseYear;
    const reconstructedCN = `${newMatterForm.officeCaseNumber}/${shortYr}`;
    const autoId = `CN_${newMatterForm.officeCaseNumber}_${shortYr}`;

    try {
      await createMatter({
        ...newMatterForm,
        matterId: autoId,
        caseNumber: reconstructedCN
      });

      // Sync new client to central clients database
      await syncFromMatter(settings.googleApiKey || 'MOCK_KEY', microsoftToken || '', activeWorkspace || '', {
        clientName: newMatterForm.clientName,
        phone: '',
        leadSource: ''
      });

      setIsNewMatterOpen(false);
      setNewMatterForm({
        matterId: '',
        officeCaseNumber: '',
        officeCaseYear: '',
        clientName: '',
        clientType: 'โจทก์',
        court: '',
        caseNumber: '',
        caseType: 'Civil',
        courtStatus: 'เตรียมฟ้อง',
        courtBlackRef: '',
        courtRedRef: '',
        courtStatusTags: [],
        deadlineCalculatedFrom: '',
        deadlineDurationDays: 15,
        deadlineUnit: 'days'
      });
    } catch (err: any) {
      alert(err.message || 'สร้างคดีใหม่ล้มเหลว');
    }
  };

  const handleStartEditMatter = () => {
    if (!currentMatter) return;
    setEditMatterForm({
      clientName: currentMatter.clientName || '',
      clientType: currentMatter.clientType || 'โจทก์',
      court: currentMatter.court || '',
      caseNumStr: currentMatter.officeCaseNumber || '',
      caseYearStr: currentMatter.officeCaseYear || '',
      caseType: currentMatter.caseType || 'Civil',
      courtStatus: currentMatter.courtStatus || '',
      courtBlackRef: currentMatter.courtBlackRef || '',
      courtRedRef: currentMatter.courtRedRef || '',
      courtStatusTags: currentMatter.courtStatusTags || []
    });
    setIsEditMatterOpen(true);
  };

  const handleUpdateMatterInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMatter) return;

    const yr4 = parseInt(editMatterForm.caseYearStr);
    const yr2 = !isNaN(yr4) && yr4 > 2400 ? String(yr4 - 2500) : editMatterForm.caseYearStr;
    const caseNum = editMatterForm.caseNumStr.trim();
    const reconstructed = caseNum && yr2 ? `${caseNum}/${yr2}` : (caseNum || currentMatter.caseNumber);

    try {
      await updateMatterInfo(currentMatter.matterId, {
        clientName: editMatterForm.clientName,
        clientType: editMatterForm.clientType,
        court: editMatterForm.court,
        caseNumber: reconstructed,
        caseType: editMatterForm.caseType,
        courtStatus: editMatterForm.courtStatus,
        courtStatusTags: editMatterForm.courtStatusTags,
        courtBlackRef: editMatterForm.courtBlackRef,
        courtRedRef: editMatterForm.courtRedRef
      });

      // Sync edited client name to central clients registry
      await syncFromMatter(settings.googleApiKey || 'MOCK_KEY', microsoftToken || '', activeWorkspace || '', {
        clientName: editMatterForm.clientName,
        phone: '',
        leadSource: ''
      });

      setIsEditMatterOpen(false);
    } catch (e: any) {
      alert(e.message || 'บันทึกการแก้ไขล้มเหลว');
    }
  };

  // Sync Google Calendar (All matters)
  const handleSyncGoogleCalendar = () => {
    if (!settings.googleCalendarConnected) {
      alert('กรุณาเชื่อมต่อ Google Calendar API ในหน้าเมนูการตั้งค่า Settings');
      return;
    }
    GoogleCalendarService.batchSyncAll(settings.googleApiKey || 'MOCK_KEY', matters)
      .then(() => {
        alert('ซิงค์ตารางนัดหมายและเดดไลน์ทั้งหมดกับ Google Calendar สำเร็จ!');
        confetti();
      })
      .catch(() => alert('การซิงค์ข้อมูลล้มเหลว'));
  };

  // Contextual Invoice Form Handler
  const handleAddInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMatter || !newInvoiceForm.amount || !newInvoiceForm.description) return;

    const refKey = `${currentMatter.officeCaseNumber}/${currentMatter.officeCaseYear}`;

    try {
      await addTransaction({
        caseRef: refKey,
        description: newInvoiceForm.description,
        amount: parseFloat(newInvoiceForm.amount),
        status: newInvoiceForm.status,
        date: newInvoiceForm.date
      });
      setIsNewInvoiceOpen(false);
      setNewInvoiceForm({
        description: '',
        amount: '',
        status: 'Pending',
        date: new Date().toISOString().split('T')[0]
      });
    } catch (err: any) {
      alert(err.message || 'บันทึกข้อมูลเงินงวดงานล้มเหลว');
    }
  };

  // Filtering calculations for All Matters List View
  const filteredMatters = useMemo(() => {
    return matters.filter(m => {
      const year = m.officeCaseYear;
      if (filterYears.length > 0 && !filterYears.includes(year)) return false;
      if (filterTypes.length > 0 && !filterTypes.includes(m.caseType)) return false;
      if (filterStatuses.length > 0 && !filterStatuses.includes(m.officeStatus)) return false;
      
      if (searchText) {
        const query = searchText.toLowerCase();
        const refKey = `${m.officeCaseNumber}/${m.officeCaseYear}`;
        const searchTarget = `${refKey} ${m.clientName} ${m.court} ${m.courtBlackRef} ${m.courtRedRef}`.toLowerCase();
        return searchTarget.includes(query);
      }
      return true;
    });
  }, [matters, filterYears, filterTypes, filterStatuses, searchText]);

  const allYears = useMemo(() => {
    return [...new Set(matters.map(m => m.officeCaseYear).filter(y => !!y))].sort();
  }, [matters]);

  const toggleFilter = (_arr: string[], val: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);
  };

  // Setup collapse drawer state for OneDrive configuration
  const [isConnSetupOpen, setIsConnSetupOpen] = useState(false);

  // If not authenticated, render splash screen
  if (!isAuthenticated) {
    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.hostname === '[::1]';
    return (
      <div className="login-bg">
        <div className="login-card fade-in">
          {/* Settings gear toggle button */}
          <button 
            type="button" 
            className="btn-setup-toggle" 
            onClick={() => setIsConnSetupOpen(!isConnSetupOpen)}
            title="ตั้งค่าการเชื่อมต่อ OneDrive"
          >
            <SettingsIcon size={18} />
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="login-brand-badge">L</div>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0', fontFamily: 'Outfit', letterSpacing: '0.02em' }}>
                LAWGUILD <span>LWS</span>
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                ระบบจัดการสำนวนคดีและเดดไลน์ความปลอดภัยสำหรับทนายความ
              </p>
            </div>
          </div>

          {loginError && (
            <div className="error-msg fade-in">
              <span>⚠️</span>
              <div>{loginError}</div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button 
              type="button" 
              className="btn-microsoft" 
              onClick={handleMicrosoftLogin} 
              disabled={isLoggingIn}
            >
              <svg width="20" height="20" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 0H11V11H0V0Z" fill="#F25022"/>
                <path d="M12 0H23V11H12V0Z" fill="#7FBA00"/>
                <path d="M0 12H11V23H0V12Z" fill="#00A1F1"/>
                <path d="M12 12H23V23H12V12Z" fill="#FFB900"/>
              </svg>
              {isLoggingIn ? 'Connecting to Microsoft...' : 'Sign in with Microsoft OneDrive'}
            </button>
            {isLocal && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => { 
                  setIsAuthenticated(true); 
                  setActiveWorkspace('Local Storage Offline'); 
                  confetti(); 
                }} 
                style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: '13.5px' }}
              >
                Run in Offline / Local Mode
              </button>
            )}
          </div>

          {/* Connection configuration collapsible drawer */}
          <div className={`login-setup-panel ${isConnSetupOpen ? 'open' : ''}`}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              ⚙️ ตั้งค่าการเชื่อมต่อ OneDrive
            </div>
            
            <div className="setup-form-group">
              <label>Microsoft App Client ID (SPA)</label>
              <input 
                type="text" 
                placeholder="กรอก Client ID จาก Azure Portal" 
                value={settings.microsoftClientId}
                onChange={(e) => setSettings({ ...settings, microsoftClientId: e.target.value })}
              />
            </div>

            {isLocal && (
              <div className="setup-form-group">
                <label>สถานะโหมดการใช้งานจำลอง</label>
                <label className="setup-checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={settings.isMockMode}
                    onChange={(e) => setSettings({ ...settings, isMockMode: e.target.checked })}
                  />
                  รันในโหมดจำลอง (Mock Mode) - Default = ปิด
                </label>
              </div>
            )}
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            🔒 Bring Your Own Storage (BYOS): ข้อมูลคดีทั้งหมดจะซิงค์เก็บอยู่ใน OneDrive ของสำนักงาน/ส่วนบุคคลของท่านโดยตรง
          </div>
        </div>
        
        {/* Workspace Selection Modal inside login screen */}
        {isWorkspaceSelectorOpen && (
          <div className="modal-overlay" style={{ display: 'flex', zIndex: 10000 }}>
            <div className="modal-content" style={{ maxWidth: '500px', width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="modal-header">
                <h3 className="modal-title" style={{ fontSize: '16px', fontWeight: 700 }}>📂 เลือกพื้นที่ทำงานคดีความ (LWS Workspace)</h3>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {workspaces.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                    <span style={{ fontSize: '32px' }}>📁</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>ไม่พบโฟลเดอร์สำหรับทำพื้นที่ทำงาน</span>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                      ไม่พบโฟลเดอร์พื้นที่ทำงานของ LWS ใน OneDrive ของคุณ กรุณากดปุ่มด้านล่างเพื่อสร้างโฟลเดอร์ระบบเริ่มต้นขึ้นมาใหม่อัตโนมัติ
                    </p>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      พบบัญชี OneDrive ของคุณเชื่อมต่ออยู่กับโฟลเดอร์/สิทธิ์เข้าใช้งาน กรุณาเลือกพื้นที่ทำงานที่ต้องการ:
                    </p>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
                      {workspaces.map((ws) => (
                        <button 
                          key={ws.id}
                          type="button"
                          className="menu-item"
                          style={{ 
                            textAlign: 'left', 
                            width: '100%', 
                            padding: '12px 16px', 
                            background: activeWorkspace === ws.name ? 'var(--bg-active)' : 'rgba(255,255,255,0.02)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            cursor: 'pointer'
                          }}
                          onClick={() => handleSelectWorkspace(ws.name)}
                        >
                          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>📁 {ws.name}</span>
                          {ws.sharedBy && (
                            <span style={{ fontSize: '11px', color: 'var(--accent)' }}>
                              👥 แชร์โดย: {ws.sharedBy}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={handleCreateNewWorkspace}
                >
                  ➕ สร้างพื้นที่ทำงานใหม่
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setIsWorkspaceSelectorOpen(false)}>ยกเลิก</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* 1. Left Sidebar Navigation */}
      <Sidebar 
        activeView={activeView}
        selectedMatterId={selectedMatterId}
        onNavigate={(view) => {
          setSelectedMatterId(null);
          setActiveView(view);
        }}
        isSidebarOpen={isSidebarOpen}
        isAdmin={isAdmin}
      />

      {/* 2. Main Content Frame */}
      <main className="main-content">
        
        {/* Top Header Bar */}
        <header className="top-bar">
          <div className="top-bar-left" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <button className="hamburger" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>☰</button>
            <div className="greeting-text">
              Counselor: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{settings.microsoftAccount || 'เกสต์ทนาย'}</span>
            </div>
            <div className="time-badge" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              📁 Workspace: <strong style={{ color: 'var(--text-main)' }}>{activeWorkspace || 'ยังไม่ได้เลือก'}</strong>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '2px 8px', fontSize: '10px' }}
                onClick={() => {
                  AuthService.fetchOneDriveWorkspaces(settings.microsoftClientId, microsoftToken || '').then(wses => {
                    setWorkspaces(wses);
                    setIsWorkspaceSelectorOpen(true);
                  });
                }}
              >
                สลับที่เก็บ
              </button>
            </div>
          </div>

          <div className="top-bar-right">
            <button 
              className="btn btn-icon-only" 
              onClick={() => setSettings(prev => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }))}
              title="สลับธีม"
            >
              {settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button 
              className="btn btn-icon-only" 
              onClick={() => setIsSettingsOpen(true)}
              title="ตั้งค่า LWS"
            >
              <SettingsIcon size={18} />
            </button>
            <button 
              className="btn btn-icon-only text-danger" 
              onClick={handleSignOut}
              title="ลงชื่อออก"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Content Pane */}
        <div className="content-body">
          {selectedMatterId && currentMatter ? (
            // ==========================================
            // CASE DETAILS VIEW WORKSPACE
            // ==========================================
            <div>
              <div style={{ marginBottom: '16px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setSelectedMatterId(null)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  <ArrowLeft size={14} /> กลับหน้าก่อนหน้า
                </button>
              </div>

              <MatterDetailView 
                currentMatter={currentMatter}
                transactions={getTransactionsForMatter(currentMatter.officeCaseNumber, currentMatter.officeCaseYear)}
                hasFinanceAccess={hasFinanceAccess}
                isAdmin={isAdmin}
                onUpdateStatus={updateMatterStatus}
                onDeleteMatter={async (id) => {
                  if (confirm('ยืนยันลบคดีความคดีนี้พร้อมหลักฐานและนัดหมายทั้งหมดในระบบ?')) {
                    await deleteMatter(id);
                    setSelectedMatterId(null);
                  }
                }}
                onStartEdit={handleStartEditMatter}
                isFolderLocked={isFolderLocked}
                onToggleFolderLock={() => setIsFolderLocked(!isFolderLocked)}
                onSaveSortedFiles={saveSortedFiles}
                onGenerateTemplate={(name) => generateTemplateFile(currentMatter.matterId, name)}
                onAddFile={addFile}
                onDeleteFile={deleteFile}
                onUpdateEvidenceStatus={updateEvidenceStatus}
                onAddAppointment={(id, data) => addAppointment(id, data, settings.googleCalendarConnected, settings.googleApiKey)}
                onDeleteAppointment={deleteAppointment}
                onAddTask={addTask}
                onToggleTask={toggleTask}
                onDeleteTask={deleteTask}
                onAssignLawyers={assignLawyers}
                onAddInvoiceTrigger={() => setIsNewInvoiceOpen(true)}
                onMarkInvoicePaid={(txId) => updateTransactionStatus(txId, 'Paid')}
                onDeleteInvoice={deleteTransaction}
                onPreviewPdf={setPdfPreviewFile}
              />
            </div>
          ) : activeView === 'dashboard' ? (
            // ==========================================
            // DAILY DESK DASHBOARD VIEW
            // ==========================================
            <DashboardView 
              matters={matters}
              transactions={transactions}
              hasFinanceAccess={hasFinanceAccess}
              currentUserEmail={settings.microsoftAccount}
              isAdmin={isAdmin}
              onSelectMatter={setSelectedMatterId}
              onCreateMatterTrigger={() => setIsNewMatterOpen(true)}
            />
          ) : activeView === 'matters' ? (
            // ==========================================
            // ALL MATTERS LIST VIEW
            // ==========================================
            <div className="all-matters-view">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h1 style={{ fontSize: '24px', margin: 0 }}>💼 คดีความทั้งหมดในระบบ OneDrive</h1>
                <button className="btn btn-primary" onClick={() => setIsNewMatterOpen(true)}>
                  <Plus size={16} /> สร้างคดีใหม่
                </button>
              </div>

              {/* ── Filter Bar ── */}
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '16px', padding: '14px 18px', background: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border-color)', fontSize: '13px' }}>
                {/* Search input */}
                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '6px', color: 'var(--accent)' }}>🔍 ค้นหาคดี</div>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="ค้นด้วย เลขคดี, ลูกความ, ศาล..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{ width: '100%', padding: '6px 12px' }}
                  />
                </div>
                
                {/* Year filter */}
                <div>
                  <div style={{ fontWeight: 700, marginBottom: '6px', color: 'var(--accent)' }}>📅 ปี พ.ศ.</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {allYears.map(y => (
                      <label key={y} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={filterYears.includes(y)} onChange={() => toggleFilter(filterYears, y, setFilterYears)} />
                        {y}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Case Type filter */}
                <div>
                  <div style={{ fontWeight: 700, marginBottom: '6px', color: 'var(--accent)' }}>⚖️ ประเภทคดี</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['Civil', 'Criminal'].map(t => (
                      <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={filterTypes.includes(t)} onChange={() => toggleFilter(filterTypes, t, setFilterTypes)} />
                        {t === 'Civil' ? 'คดีแพ่ง' : 'คดีอาญา'}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Office Status filter */}
                <div>
                  <div style={{ fontWeight: 700, marginBottom: '6px', color: 'var(--accent)' }}>🏢 สถานะออฟฟิศ</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {['Active', 'Waiting', 'Snoozed', 'Closed', 'Reject'].map(s => (
                      <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={filterStatuses.includes(s)} onChange={() => toggleFilter(filterStatuses, s, setFilterStatuses)} />
                        {s}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Reset button */}
                {(filterYears.length > 0 || filterTypes.length > 0 || filterStatuses.length > 0 || searchText) && (
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '4px 12px', fontSize: '12px' }}
                      onClick={() => { setFilterYears([]); setFilterTypes([]); setFilterStatuses([]); setSearchText(''); }}
                    >
                      ล้างทั้งหมด
                    </button>
                  </div>
                )}
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                แสดง {filteredMatters.length} จาก {matters.length} คดี
              </div>

              <div className="finance-table-container">
                <table className="finance-table">
                  <thead>
                    <tr>
                      <th>เลขแฟ้ม</th>
                      <th>ปี พ.ศ.</th>
                      <th>ลูกความ (ฐานะ)</th>
                      <th>ประเภทคดี</th>
                      <th>ศาลที่ฟ้อง</th>
                      <th>คดีดำ/แดง</th>
                      <th>ทนายผู้ดูแล</th>
                      <th>สถานะ</th>
                      <th style={{ textAlign: 'center' }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMatters.map(m => {
                      const lawyersText = m.assignedTo && m.assignedTo.length > 0 
                        ? m.assignedTo.map(email => {
                            if (email === 'alex.alexander@nanchai-law.com') return 'พี่ (Admin)';
                            if (email === 'lg1@firm.com') return 'lg1';
                            if (email === 'lg2@firm.com') return 'lg2';
                            return email.split('@')[0];
                          }).join(', ')
                        : '—';
                      
                      const caseTypeTh = m.caseType === 'Civil' ? 'แพ่ง' : m.caseType === 'Criminal' ? 'อาญา' : m.caseType;

                      return (
                        <tr key={m.matterId} onClick={() => setSelectedMatterId(m.matterId)} style={{ cursor: 'pointer' }}>
                          <td><strong>{m.officeCaseNumber}</strong></td>
                          <td>{m.officeCaseYear}</td>
                          <td>{m.clientName} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({m.clientType})</span></td>
                          <td>{caseTypeTh}</td>
                          <td style={{ fontSize: '12px' }}>{m.court}</td>
                          <td>
                            {m.courtBlackRef ? <span>ดำ {m.courtBlackRef}</span> : '—'}
                            {m.courtRedRef ? <span style={{ color: 'var(--color-danger)', marginLeft: '6px' }}>แดง {m.courtRedRef}</span> : ''}
                          </td>
                          <td style={{ fontSize: '12px' }}>{lawyersText}</td>
                          <td>
                            <span className={`badge ${
                              m.officeStatus === 'Active' ? 'badge-success' :
                              m.officeStatus === 'Waiting' ? 'badge-info' :
                              m.officeStatus === 'Snoozed' ? 'badge-warning' :
                              m.officeStatus === 'Reject' ? 'badge-danger' : 'badge-secondary'
                            }`}>
                              {m.officeStatus}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              className="btn-icon-only text-danger"
                              onClick={() => { if(confirm('ยืนยันลบคดีนี้?')) deleteMatter(m.matterId); }}
                              title="ลบคดี"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredMatters.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                          ไม่พบข้อมูลคดีความตามเงื่อนไขที่เลือก
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeView === 'snoozed' ? (
            // ==========================================
            // SNOOZED MATTERS VIEW
            // ==========================================
            <div className="snoozed-view">
              <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>💤 คดีความที่ถูกพักไว้ชั่วคราว (Snoozed)</h1>
              <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '13.5px' }}>
                * ระบบ LWS จะปลุกคดีเหล่านี้กลับขึ้นมาแสดงที่หน้าแรก (Active) อัตโนมัติล่วงหน้า **30 วัน** ก่อนถึงวันเดดไลน์กฎหมายสูงสุดของคดี
              </p>

              <div className="cards-grid">
                {matters.filter(m => m.officeStatus === 'Snoozed').map(m => {
                  const refKey = `${m.officeCaseNumber}/${m.officeCaseYear}`;
                  return (
                    <div key={m.matterId} className="matter-card fade-in" onClick={() => setSelectedMatterId(m.matterId)}>
                      <div className="matter-card-header">
                        <div>
                          <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 700 }}>
                            แฟ้ม {refKey} • {m.caseType}
                          </div>
                          <h3 className="matter-card-title">{m.clientName}</h3>
                        </div>
                        <span className="badge badge-warning">Snoozed</span>
                      </div>

                      <div className="matter-card-details">
                        <div>🏢 ศาล: {m.court}</div>
                        <div>💤 ปิดสลีปคดีถึงวันที่: {m.snoozeUntil || 'ไม่มีกำหนด'}</div>
                        <div>🎯 เดดไลน์เป้าหมาย: <strong>{m.currentDeadline || '—'}</strong></div>
                      </div>

                      <button 
                        className="btn btn-primary" 
                        onClick={(e) => { e.stopPropagation(); updateMatterStatus(m.matterId, 'Active'); }}
                        style={{ marginTop: '10px', width: '100%', padding: '6px' }}
                      >
                        ปลุกคืนงาน (Active)
                      </button>
                    </div>
                  );
                })}

                {matters.filter(m => m.officeStatus === 'Snoozed').length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>ไม่มีคดีความใดปิดสลีปอยู่ในระบบ</p>
                )}
              </div>
            </div>
          ) : activeView === 'finance' ? (
            // ==========================================
            // CENTRAL REVENUE LEDGER VIEW
            // ==========================================
            <FinanceView 
              matters={matters}
              transactions={transactions}
              hasFinanceAccess={hasFinanceAccess}
              onAddTransaction={addTransaction}
              onUpdateStatus={updateTransactionStatus}
              onAttachSlip={attachSlipToTransaction}
              onDeleteTransaction={deleteTransaction}
            />
          ) : activeView === 'calendar' ? (
            // ==========================================
            // CALENDAR MASTER VIEW
            // ==========================================
            <div className="calendar-view">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <h1 style={{ fontSize: '24px', margin: 0 }}>📅 ปฏิทินวันนัดหมายศาลและอายุความ</h1>
                <button className="btn btn-primary" onClick={handleSyncGoogleCalendar}>
                  ซิงค์ข้อมูลกับ Google Calendar
                </button>
              </div>

              <div className="calendar-container">
                <div className="calendar-header">
                  <h3 style={{ fontFamily: 'Outfit', fontSize: '18px', fontWeight: 700 }}>กำหนดการประจำปี พ.ศ. 2569 (June 2026)</h3>
                </div>

                <div className="calendar-grid">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="calendar-day-label">{day}</div>
                  ))}
                  
                  {/* Padding cell for June 2026 (Starts on Monday, so 1 cell padding for Sunday) */}
                  <div className="calendar-cell" style={{ opacity: 0.3 }}>
                    <div className="calendar-cell-date">31 May</div>
                  </div>
                  
                  {Array.from({ length: 30 }).map((_, idx) => {
                    const dayNum = idx + 1;
                    const dateStr = `2026-06-${dayNum.toString().padStart(2, '0')}`;
                    
                    const appsForDay: { matterId: string; app: Appointment }[] = [];
                    matters.forEach(m => {
                      m.appointments.forEach(a => {
                        if (a.dateTime.split('T')[0] === dateStr) {
                          appsForDay.push({ matterId: m.matterId, app: a });
                        }
                      });
                    });

                    return (
                      <div key={dayNum} className="calendar-cell">
                        <div className={`calendar-cell-date ${dayNum === 12 ? 'today' : ''}`}>{dayNum}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, overflowY: 'auto' }}>
                          {appsForDay.map(({ matterId, app }) => {
                            const mat = matters.find(mx => mx.matterId === matterId);
                            const displayRef = mat ? `${mat.officeCaseNumber}/${mat.officeCaseYear}` : matterId;
                            
                            return (
                              <div 
                                key={app.id} 
                                className={`calendar-event ${app.type.toLowerCase()}`}
                                title={`${app.title} - ${app.notes}`}
                                onClick={() => {
                                  if (confirm(`นัดหมาย: ${app.title}\nรายละเอียด: ${app.notes}\nต้องการยกเลิกนัดหมายนี้หรือไม่?`)) {
                                    deleteAppointment(matterId, app.id);
                                  }
                                }}
                              >
                                {displayRef} {app.title}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : activeView === 'backlog' ? (
            // ==========================================
            // PROJECT BACKLOG VIEW
            // ==========================================
            <div className="backlog-view fade-in">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h1 style={{ fontSize: '24px', margin: 0 }}>📋 งานค้างวิจัยและพัฒนาระบบ LWS (Project Backlog)</h1>
                <button 
                  className="btn btn-primary"
                  onClick={() => {
                    if (confirm('ต้องการรีเซ็ตสถานะงานค้างทั้งหมด?')) {
                      setBacklogTasks(DEFAULT_BACKLOG_TASKS);
                    }
                  }}
                >
                  รีเซ็ตงานค้าง
                </button>
              </div>

              <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '14px' }}>
                * ลิสต์รายการงานเหล่านี้สำหรับการอ้างอิงความคืบหน้าในการพัฒนาสถาปัตยกรรมแอป LWS
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {['High', 'Medium', 'Low'].map((cat) => {
                  const tasks = backlogTasks.filter(t => t.category === cat);
                  const color = cat === 'High' ? 'var(--color-danger)' : cat === 'Medium' ? 'var(--accent)' : '#10B981';
                  const label = cat === 'High' ? '🔴 High Priority (งานสถาปัตยกรรมหลัก)' : cat === 'Medium' ? '🟡 Medium Priority (เครื่องมือ)' : '🟢 Low Priority (แผนพัฒนาต่อยอด)';

                  return (
                    <div key={cat} className="workspace-pane" style={{ borderLeft: `4px solid ${color}`, minHeight: 'auto' }}>
                      <div className="workspace-pane-header">
                        <span className="workspace-pane-title" style={{ color }}>{label}</span>
                      </div>
                      <div className="workspace-pane-body" style={{ gap: '12px' }}>
                        {tasks.map(task => (
                          <div 
                            key={task.id} 
                            style={{ 
                              display: 'flex', 
                              alignItems: 'flex-start', 
                              gap: '12px', 
                              padding: '12px', 
                              background: 'var(--bg-sidebar)', 
                              border: '1px solid var(--border-color)', 
                              borderRadius: '8px',
                              opacity: task.completed ? 0.6 : 1,
                              transition: 'opacity 0.2s'
                            }}
                          >
                            <input 
                              type="checkbox" 
                              checked={task.completed}
                              onChange={(e) => {
                                const updated = backlogTasks.map(t => t.id === task.id ? { ...t, completed: e.target.checked } : t);
                                setBacklogTasks(updated);
                              }}
                              style={{ marginTop: '4px', cursor: 'pointer', width: '18px', height: '18px' }}
                            />
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: 600, textDecoration: task.completed ? 'line-through' : 'none' }}>
                                {task.title}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {task.description}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : activeView === 'clients' ? (
            <ClientsView
              clients={clients}
              loading={clientsLoading}
              error={clientsError}
              onAddClient={(c) => addClient(settings.microsoftClientId, microsoftToken || '', activeWorkspace || '', c)}
              onUpdateClient={(c) => updateClient(settings.microsoftClientId, microsoftToken || '', activeWorkspace || '', c)}
              onDeleteClient={(id) => deleteClient(settings.microsoftClientId, microsoftToken || '', activeWorkspace || '', id)}
            />
          ) : null}

        </div>

        {/* Global links shortcut footer portals */}
        <footer style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', padding: '24px 32px', background: 'var(--bg-sidebar)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
            🔗 ลิงก์รวดเร็วสำหรับทนายความ LWS
          </div>
          <div className="portal-grid">
            {BOOKMARKS.map((bm, index) => (
              <a key={index} href={bm.url} target="_blank" rel="noreferrer" className="portal-card">
                <span className="portal-icon">{bm.icon}</span>
                <span className="portal-name">{bm.name}</span>
                <ExternalLink size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
              </a>
            ))}
          </div>
        </footer>

      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="modal-overlay" style={{ display: 'flex' }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">⚙️ ตั้งค่าแผงควบคุมระบบ LWS</h3>
              <button className="btn-icon-only" onClick={() => setIsSettingsOpen(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">สีหลักของระบบ LWS (Primary Accent)</label>
                <input 
                  type="color" 
                  className="form-control" 
                  value={settings.primaryColor} 
                  onChange={(e) => setSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                  style={{ height: '40px', padding: '2px', cursor: 'pointer' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Microsoft OneDrive Account (M365)</label>
                <input 
                  type="email" 
                  className="form-control" 
                  value={settings.microsoftAccount || ''} 
                  onChange={(e) => setSettings(prev => ({ ...prev, microsoftAccount: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Microsoft App Client ID (SPA)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. 12345678-1234-1234-1234-1234567890ab"
                  value={settings.microsoftClientId} 
                  onChange={(e) => setSettings(prev => ({ ...prev, microsoftClientId: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">OneDrive Root Path (Workspace Folder)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={settings.onedriveRootFolder} 
                  onChange={(e) => setSettings(prev => ({ ...prev, onedriveRootFolder: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={settings.googleCalendarConnected} 
                    onChange={(e) => setSettings(prev => ({ ...prev, googleCalendarConnected: e.target.checked }))}
                  />
                  เชื่อมต่อ Google Calendar API
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={settings.isMockMode} 
                    onChange={(e) => setSettings(prev => ({ ...prev, isMockMode: e.target.checked }))}
                  />
                  รันโปรแกรมในโหมดจำลอง (Mock Mode)
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setIsSettingsOpen(false)}>บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* New Matter Modal */}
      {isNewMatterOpen && (
        <div className="modal-overlay" style={{ display: 'flex' }}>
          <form className="modal-content" onSubmit={handleCreateMatterSubmit}>
            <div className="modal-header">
              <h3 className="modal-title">💼 สร้างคดีความใหม่ (Create New Matter)</h3>
              <button type="button" className="btn-icon-only" onClick={() => setIsNewMatterOpen(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">เลขที่แฟ้มคดี (เช่น 001, 005)*</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="001"
                    value={newMatterForm.officeCaseNumber}
                    onChange={(e) => setNewMatterForm(prev => ({ ...prev, officeCaseNumber: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">ปี พ.ศ. ของแฟ้มคดี (4 หลัก)*</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="2569"
                    value={newMatterForm.officeCaseYear}
                    onChange={(e) => setNewMatterForm(prev => ({ ...prev, officeCaseYear: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">ชื่อลูกความ (Client Name)*</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="เช่น นายสมชาย ทนายทอง"
                    value={newMatterForm.clientName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewMatterForm(prev => ({ ...prev, clientName: val }));
                      setNewClientQuery(val);
                      setShowNewClientDropdown(true);
                    }}
                    onFocus={() => setShowNewClientDropdown(true)}
                    required
                  />
                  {showNewClientDropdown && newClientQuery && clientSuggestions.length > 0 && (
                    <div className="autocomplete-dropdown" style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      zIndex: 100,
                      maxHeight: '150px',
                      overflowY: 'auto',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                    }}>
                      {clientSuggestions.map(c => (
                        <div 
                          key={c.id}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontSize: '13px' }}
                          onClick={() => {
                            setNewMatterForm(prev => ({ ...prev, clientName: c.clientName }));
                            setShowNewClientDropdown(false);
                          }}
                          className="dropdown-item-hover"
                        >
                          {c.clientName} {c.phone && `(${c.phone})`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">สถานะศาลเริ่มต้น</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="เตรียมฟ้อง, ร่างคำให้การ"
                    value={newMatterForm.courtStatus}
                    onChange={(e) => setNewMatterForm(prev => ({ ...prev, courtStatus: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">ประเภทคดีความ</label>
                  <select 
                    className="form-input"
                    value={newMatterForm.caseType}
                    onChange={(e) => setNewMatterForm(prev => ({ ...prev, caseType: e.target.value }))}
                  >
                    <option value="Civil">Civil (คดีแพ่ง)</option>
                    <option value="Criminal">Criminal (คดีอาญา)</option>
                    <option value="แรงงาน">คดีแรงงาน</option>
                    <option value="ปกครอง">คดีปกครอง</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">ศาลที่รับผิดชอบคดี</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="เช่น ศาลแพ่งธนบุรี"
                    value={newMatterForm.court}
                    onChange={(e) => setNewMatterForm(prev => ({ ...prev, court: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">เลขคดีดำ (ถ้ามี)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="เช่น พ.123/2569"
                    value={newMatterForm.courtBlackRef}
                    onChange={(e) => setNewMatterForm(prev => ({ ...prev, courtBlackRef: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">เลขคดีแดง (ถ้ามี)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="เช่น พ.999/2569"
                    value={newMatterForm.courtRedRef}
                    onChange={(e) => setNewMatterForm(prev => ({ ...prev, courtRedRef: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '12px' }}>
                <h4 style={{ fontSize: '13px', marginBottom: '8px' }}>คำนวณวันสิ้นสุดเดดไลน์ความปลอดภัยแรก (Play-Safe)</h4>
                
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">นับจากวันที่</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={newMatterForm.deadlineCalculatedFrom}
                      onChange={(e) => setNewMatterForm(prev => ({ ...prev, deadlineCalculatedFrom: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">ระยะเวลากำหนดกฎหมาย</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="number" 
                        className="form-input" 
                        value={newMatterForm.deadlineDurationDays}
                        onChange={(e) => setNewMatterForm(prev => ({ ...prev, deadlineDurationDays: parseInt(e.target.value) || 0 }))}
                      />
                      <select 
                        className="form-input" 
                        value={newMatterForm.deadlineUnit}
                        onChange={(e) => setNewMatterForm(prev => ({ ...prev, deadlineUnit: e.target.value as any }))}
                        style={{ width: '90px' }}
                      >
                        <option value="days">วัน</option>
                        <option value="months">เดือน</option>
                        <option value="years">ปี</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsNewMatterOpen(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary">บันทึกและจำลองแฟ้มคดี</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Matter Modal */}
      {isEditMatterOpen && (
        <div className="modal-overlay" style={{ display: 'flex' }}>
          <form className="modal-content" onSubmit={handleUpdateMatterInfoSubmit}>
            <div className="modal-header">
              <h3 className="modal-title">✏️ แก้ไขรายละเอียดคดีความ</h3>
              <button type="button" className="btn-icon-only" onClick={() => setIsEditMatterOpen(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">เลขแฟ้มคดี*</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editMatterForm.caseNumStr}
                    onChange={(e) => setEditMatterForm(prev => ({ ...prev, caseNumStr: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">ปี พ.ศ. แฟ้มคดี*</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editMatterForm.caseYearStr}
                    onChange={(e) => setEditMatterForm(prev => ({ ...prev, caseYearStr: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">ชื่อลูกความ*</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editMatterForm.clientName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditMatterForm(prev => ({ ...prev, clientName: val }));
                      setEditClientQuery(val);
                      setShowEditClientDropdown(true);
                    }}
                    onFocus={() => setShowEditClientDropdown(true)}
                    required
                  />
                  {showEditClientDropdown && editClientQuery && editClientSuggestions.length > 0 && (
                    <div className="autocomplete-dropdown" style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      zIndex: 100,
                      maxHeight: '150px',
                      overflowY: 'auto',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                    }}>
                      {editClientSuggestions.map(c => (
                        <div 
                          key={c.id}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontSize: '13px' }}
                          onClick={() => {
                            setEditMatterForm(prev => ({ ...prev, clientName: c.clientName }));
                            setShowEditClientDropdown(false);
                          }}
                          className="dropdown-item-hover"
                        >
                          {c.clientName}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">ศาลที่ยื่นฟ้อง</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editMatterForm.court}
                    onChange={(e) => setEditMatterForm(prev => ({ ...prev, court: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">เลขคดีดำศาล</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editMatterForm.courtBlackRef}
                    onChange={(e) => setEditMatterForm(prev => ({ ...prev, courtBlackRef: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">เลขคดีแดงศาล</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editMatterForm.courtRedRef}
                    onChange={(e) => setEditMatterForm(prev => ({ ...prev, courtRedRef: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">ประเภทคดี</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editMatterForm.caseType}
                    onChange={(e) => setEditMatterForm(prev => ({ ...prev, caseType: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">สถานะปัจจุบัน</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editMatterForm.courtStatus}
                    onChange={(e) => setEditMatterForm(prev => ({ ...prev, courtStatus: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsEditMatterOpen(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary">บันทึกการแก้ไข</button>
            </div>
          </form>
        </div>
      )}

      {/* New Invoice Modal (Contextual inside Matter Details) */}
      {isNewInvoiceOpen && (
        <div className="modal-overlay" style={{ display: 'flex' }}>
          <form className="modal-content" onSubmit={handleAddInvoiceSubmit}>
            <div className="modal-header">
              <h3 className="modal-title">🧾 เพิ่มงวดชำระเงินสำหรับคดีความนี้</h3>
              <button type="button" className="btn-icon-only" onClick={() => setIsNewInvoiceOpen(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">รายละเอียดคำอธิบายงวดงานเงิน</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="เช่น ค่าวิชาชีพงวดฟ้องศาล, ค่าธรรมเนียมส่งหมาย"
                  value={newInvoiceForm.description}
                  onChange={(e) => setNewInvoiceForm(prev => ({ ...prev, description: e.target.value }))}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">จำนวนเงินเรียกเก็บ (บาท)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="30000"
                    value={newInvoiceForm.amount}
                    onChange={(e) => setNewInvoiceForm(prev => ({ ...prev, amount: e.target.value }))}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">สถานะเริ่มแรก</label>
                  <select 
                    className="form-input" 
                    value={newInvoiceForm.status}
                    onChange={(e) => setNewInvoiceForm(prev => ({ ...prev, status: e.target.value as any }))}
                  >
                    <option value="Pending">Pending (รอชำระ)</option>
                    <option value="Paid">Paid (ชำระแล้ว)</option>
                    <option value="Sent">Sent (ส่งแจ้งหนี้แล้ว)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">วันที่ลงบัญชี</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={newInvoiceForm.date}
                  onChange={(e) => setNewInvoiceForm(prev => ({ ...prev, date: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsNewInvoiceOpen(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary">บันทึกงวดงานเงิน</button>
            </div>
          </form>
        </div>
      )}

      {/* PDF View Modal Overlay */}
      {pdfPreviewFile && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={() => setPdfPreviewFile(null)}>
          <div className="modal-content" style={{ maxWidth: '1000px', width: '90%', height: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">📕 พรีวิวหลักฐาน - {pdfPreviewFile.name}</h3>
              <button className="btn-icon-only" onClick={() => setPdfPreviewFile(null)}>×</button>
            </div>
            <div className="modal-body" style={{ flex: 1, padding: 0, overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column' }}>
              <iframe 
                src={`/api/view-file?workspace=${encodeURIComponent(activeWorkspace || '')}&path=${encodeURIComponent(pdfPreviewFile.path)}`}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title={pdfPreviewFile.name}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPdfPreviewFile(null)}>ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}

      {/* Workspace Selection Modal */}
      {isWorkspaceSelectorOpen && (
        <div className="modal-overlay" style={{ display: 'flex' }}>
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 className="modal-title">📂 เลือกห้องเก็บข้อมูลคดีความ (Select LWS Workspace)</h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                พบบัญชี OneDrive ของคุณเชื่อมต่ออยู่กับโฟลเดอร์/สิทธิ์เข้าใช้งาน กรุณาเลือกพื้นที่ทำงานที่ต้องการ:
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
                {workspaces.map((ws) => (
                  <button 
                    key={ws.id}
                    type="button"
                    className="menu-item"
                    style={{ 
                      textAlign: 'left', 
                      width: '100%', 
                      padding: '12px 16px', 
                      background: activeWorkspace === ws.name ? 'var(--bg-active)' : 'var(--bg-sidebar)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      cursor: 'pointer'
                    }}
                    onClick={() => handleSelectWorkspace(ws.name)}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>📁 {ws.name}</span>
                    {ws.sharedBy && (
                      <span style={{ fontSize: '11px', color: 'var(--accent)' }}>
                        👥 แชร์โดย: {ws.sharedBy}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsWorkspaceSelectorOpen(false)}>ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
