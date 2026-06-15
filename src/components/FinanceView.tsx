import React, { useState, useMemo, useRef } from 'react';
import type { Transaction, Matter } from '../types';
import { Plus, Trash2, Upload, AlertCircle, Search, Check, X, Eye } from 'lucide-react';

interface FinanceViewProps {
  matters: Matter[];
  transactions: Transaction[];
  hasFinanceAccess: boolean;
  onAddTransaction: (tx: {
    caseRef: string | null;
    description: string;
    amount: number;
    status: Transaction['status'];
    date: string;
  }) => Promise<any>;
  onUpdateStatus: (txId: string, status: Transaction['status']) => Promise<any>;
  onAttachSlip: (txId: string, fileName: string, fileBlob: Blob) => Promise<any>;
  onDeleteTransaction: (txId: string) => Promise<any>;
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  matters,
  transactions,
  hasFinanceAccess,
  onAddTransaction,
  onUpdateStatus,
  onAttachSlip,
  onDeleteTransaction
}) => {
  const [isOpenAddModal, setIsOpenAddModal] = useState(false);
  const [txType, setTxType] = useState<'revenue' | 'expense'>('revenue');
  const [form, setForm] = useState({
    caseRef: '',
    description: '',
    amount: '',
    status: 'Pending' as Transaction['status'],
    date: new Date().toISOString().split('T')[0]
  });

  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonthYear, setFilterMonthYear] = useState('all');
  const [filterStatus, setFilterStatus] = useState<string[]>(['Paid', 'Pending', 'Overdue', 'Sent', 'Draft']);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  // Autocomplete matter search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Get matter details map for fast lookup
  const matterMap = useMemo(() => {
    const map = new Map<string, Matter>();
    matters.forEach(m => {
      const refKey = `${m.officeCaseNumber}/${m.officeCaseYear}`;
      map.set(refKey, m);
    });
    return map;
  }, [matters]);

  // Autocomplete suggestions for new transaction
  const suggestions = useMemo(() => {
    if (!searchQuery) return [];
    return matters.filter(m => {
      const refKey = `${m.officeCaseNumber}/${m.officeCaseYear}`;
      const searchStr = `${refKey} ${m.clientName} ${m.court}`.toLowerCase();
      return searchStr.includes(searchQuery.toLowerCase());
    });
  }, [matters, searchQuery]);

  // Helper to determine overdue days
  const getOverdueDays = (dateStr: string) => {
    const due = new Date(dateStr);
    due.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    const diff = today.getTime() - due.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // If no finance access (403 Forbidden on OneDrive)
  if (!hasFinanceAccess) {
    return (
      <div className="workspace-pane fade-in" style={{ padding: '40px', textAlign: 'center', margin: '32px auto', maxWidth: '700px' }}>
        <AlertCircle size={48} style={{ color: 'var(--color-danger)', marginBottom: '16px' }} />
        <h2 style={{ fontSize: '20px', marginBottom: '8px', color: 'var(--text-main)' }}>
          403 Access Denied: จำกัดสิทธิ์เข้าถึงบัญชีการเงิน
        </h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: '500px', margin: '0 auto' }}>
          บัญชีผู้ใช้ปัจจุบันของคุณไม่มีสิทธิ์ในการเข้าถึงโฟลเดอร์ <code>01_Office_Management</code> บน OneDrive 
          กรุณาติดต่อพันธมิตรผู้จัดการ (Managing Partner) หรือฝ่ายบุคคลไอทีเพื่อขอสิทธิ์
        </p>
      </div>
    );
  }

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) {
      alert('กรุณาระบุจำนวนเงินมากกว่า 0');
      return;
    }

    // Revenue represents positive amount, expense is negative
    const finalAmount = txType === 'revenue' ? amt : -amt;
    const finalCaseRef = txType === 'expense' && form.caseRef === 'central' ? null : (form.caseRef || null);

    try {
      await onAddTransaction({
        caseRef: finalCaseRef,
        description: form.description,
        amount: finalAmount,
        status: form.status,
        date: form.date
      });
      setIsOpenAddModal(false);
      setForm({
        caseRef: '',
        description: '',
        amount: '',
        status: 'Pending',
        date: new Date().toISOString().split('T')[0]
      });
      setSearchQuery('');
    } catch (e: any) {
      alert(e.message || 'บันทึกธุรกรรมการเงินล้มเหลว');
    }
  };

  const handleSlipChange = async (txId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      try {
        await onAttachSlip(txId, file.name, file);
      } catch (err: any) {
        alert(err.message || 'อัปโหลดสลิปล้มเหลว');
      }
    }
  };



  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // 1. Calculate Monthly Cashflow stats for last 12 months (Graph data)
  const chartData = useMemo(() => {
    const monthsArr = [];
    const now = new Date();
    
    // Generate last 12 months in BE format
    const thaiMonthsShort = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const label = `${thaiMonthsShort[month]} ${String(year + 543).slice(-2)}`;
      
      // Calculate Paid Income and Paid Expense for this month
      let income = 0;
      let expense = 0;
      
      transactions.forEach(t => {
        if (t.status !== 'Paid') return;
        const txDate = new Date(t.date);
        if (txDate.getFullYear() === year && txDate.getMonth() === month) {
          if (t.amount > 0) {
            income += t.amount;
          } else {
            expense += Math.abs(t.amount);
          }
        }
      });
      
      monthsArr.push({ label, income, expense, monthKey: `${year}-${month}` });
    }
    return monthsArr;
  }, [transactions]);

  // Find max value in chart data for visual scaling
  const maxChartValue = useMemo(() => {
    let max = 10000; // default min divisor
    chartData.forEach(d => {
      if (d.income > max) max = d.income;
      if (d.expense > max) max = d.expense;
    });
    return max;
  }, [chartData]);

  // 2. Calculate Current Month Summary stats
  const currentMonthSummary = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    let income = 0;
    let expense = 0;
    
    transactions.forEach(t => {
      // Look at transaction date
      const d = new Date(t.date);
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        if (t.amount > 0) {
          if (t.status === 'Paid') income += t.amount;
        } else {
          expense += Math.abs(t.amount); // Expenses count regardless or if paid
        }
      }
    });
    
    return {
      income,
      expense,
      net: income - expense
    };
  }, [transactions]);

  // 3. Find pending debts and overdue invoices for slider
  const debtCollectionList = useMemo(() => {
    const list: { tx: Transaction; clientName: string; overdueDays: number; severity: 'red' | 'orange' | 'yellow' }[] = [];
    
    transactions.forEach(t => {
      // Must be pending/overdue revenue
      if (t.amount > 0 && t.status !== 'Paid') {
        const overdueDays = getOverdueDays(t.date);
        
        let severity: 'red' | 'orange' | 'yellow' = 'yellow';
        if (overdueDays > 14) {
          severity = 'red';
        } else if (overdueDays > 0) {
          severity = 'orange';
        }
        
        const matter = t.caseRef ? matterMap.get(t.caseRef) : null;
        const clientName = matter ? matter.clientName : 'ไม่ระบุลูกความ';
        
        list.push({ tx: t, clientName, overdueDays, severity });
      }
    });

    // Sort by overdueDays descending (most overdue first)
    return list.sort((a, b) => b.overdueDays - a.overdueDays);
  }, [transactions, matterMap]);

  // Handle mock debt notification alert
  const handleSendDebtNotice = (clientName: string, ref: string | null, amount: number) => {
    alert(`📨 ระบบทำการจำลองสร้าง "ใบแจ้งยอดค้างชำระ (Dunning Bill)"\nส่งข้อมูลแจ้งเตือนไปยังแชท Line และอีเมลของลูกความ [${clientName}] เรียบร้อย!\nยอดค้างชำระ: ${amount.toLocaleString()} บาท\nคดีอ้างอิง: ${ref || 'ส่วนกลาง'}`);
  };

  // 4. Filtered Transactions list
  const filteredTransactions = useMemo(() => {
    let list = [...transactions];
    
    // Text search (caseRef, clientName, description)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(t => {
        const matter = t.caseRef ? matterMap.get(t.caseRef) : null;
        const client = matter ? matter.clientName.toLowerCase() : '';
        return (
          (t.caseRef || '').toLowerCase().includes(q) ||
          client.includes(q) ||
          t.description.toLowerCase().includes(q)
        );
      });
    }

    // Month/Year filter
    if (filterMonthYear !== 'all') {
      const [year, month] = filterMonthYear.split('-');
      list = list.filter(t => {
        const d = new Date(t.date);
        return d.getFullYear() === parseInt(year) && d.getMonth() === parseInt(month);
      });
    }

    // Status filter
    list = list.filter(t => filterStatus.includes(t.status));

    // Sort by date descending (newest first)
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, searchTerm, filterMonthYear, filterStatus, matterMap]);

  // Paginated data
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredTransactions.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredTransactions, currentPage]);

  const totalPages = Math.ceil(filteredTransactions.length / rowsPerPage) || 1;

  // Toggle filter status
  const toggleStatusFilter = (status: string) => {
    setFilterStatus(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
    setCurrentPage(1);
  };

  // Available months/years list for dropdown
  const monthFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    const thaiMonthsShort = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    
    transactions.forEach(t => {
      const d = new Date(t.date);
      const year = d.getFullYear();
      const month = d.getMonth();
      const key = `${year}-${month}`;
      const val = `${thaiMonthsShort[month]} ${year + 543}`;
      map.set(key, val);
    });

    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [transactions]);

  // CSV Import simulation
  const handleImportCSVClick = () => {
    alert('📥 นำเข้าไฟล์ CSV ธุรกรรมย้อนหลังธนาคารเรียบร้อย (จำลองการรับและทำความสะอาดสเตทเมนต์จำนวน 12 แถว)');
  };

  // office expense shortcut
  const handleQuickOfficeExpenseClick = () => {
    setTxType('expense');
    setForm({
      caseRef: 'central',
      description: 'จ่ายค่าไฟสำนักงาน/หมึกเครื่องพิมพ์กลางประจำเดือน',
      amount: '',
      status: 'Paid',
      date: new Date().toISOString().split('T')[0]
    });
    setSearchQuery('');
    setIsOpenAddModal(true);
  };

  return (
    <div className="page-container fade-in">
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'Outfit' }}>
            💰 ศูนย์บัญชาการการเงินรวมศูนย์ (Financial Command Center)
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
            สรุปดุลบัญชีรายรับ-รายจ่าย คลังงวดเงินคดี และระบบติดตามหนี้ค้างชำระของสำนักงานกฎหมาย
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={handleImportCSVClick}>
            📥 Import CSV
          </button>
          <button className="btn btn-secondary" onClick={handleQuickOfficeExpenseClick} style={{ color: 'var(--color-danger)' }}>
            ➖ บันทึกรายจ่ายออฟฟิศ
          </button>
          <button className="btn btn-primary" onClick={() => { setTxType('revenue'); setIsOpenAddModal(true); }}>
            <Plus size={16} /> บันทึกงวดเงินคดี
          </button>
        </div>
      </div>

      {/* Main Grid: Graph (Channel 1) & current month summary (Channel 2) */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '24px' }} className="responsive-ledger-grid">
        
        {/* Channel 1: Yearly comparative vertical chart */}
        <div className="workspace-pane">
          <div className="workspace-pane-header">
            <span className="workspace-pane-title">
              📊 ช่องที่ 1: กราฟกระแสเงินสดรายปี (Yearly Cashflow Vertical Chart)
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              🟩 = รายรับ Income | 🟥 = รายจ่าย Expense (นับเฉพาะสถานะ Paid ย้อนหลัง 12 เดือน)
            </span>
          </div>
          <div className="workspace-pane-body" style={{ minHeight: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {/* Chart Bars container */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '160px', padding: '0 8px 8px 8px', borderBottom: '1px solid var(--border-color)', gap: '12px' }}>
              {chartData.map(data => {
                const incHeight = (data.income / maxChartValue) * 120; // max height 120px
                const expHeight = (data.expense / maxChartValue) * 120;
                
                return (
                  <div key={data.monthKey} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '120px', width: '100%', justifyContent: 'center' }}>
                      {/* Income Bar (Green) */}
                      <div 
                        style={{ 
                          width: '10px', 
                          height: `${Math.max(2, incHeight)}px`, 
                          backgroundColor: 'var(--color-success)', 
                          borderRadius: '2px 2px 0 0'
                        }} 
                        title={`รายรับ: ${data.income} บาท`}
                      />
                      {/* Expense Bar (Red) */}
                      <div 
                        style={{ 
                          width: '10px', 
                          height: `${Math.max(2, expHeight)}px`, 
                          backgroundColor: 'var(--color-danger)', 
                          borderRadius: '2px 2px 0 0'
                        }} 
                        title={`รายจ่าย: ${data.expense} บาท`}
                      />
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {data.label}
                    </span>
                  </div>
                );
              })}
            </div>
            
            {/* Legend info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', padding: '0 8px' }}>
              <span>ยอดอิงรายรับสูงสุดรอบ 12 เดือน: <strong>{maxChartValue.toLocaleString()} ฿</strong></span>
              <span>สถานะการซิงค์: OneDrive Verified</span>
            </div>
          </div>
        </div>

        {/* Channel 2: Current month balance dashboard summary */}
        <div className="workspace-pane">
          <div className="workspace-pane-header">
            <span className="workspace-pane-title">
              📈 ช่องที่ 2: แผงสรุปงบดุลเดือนปัจจุบัน (Current Month Summary)
            </span>
          </div>
          <div className="workspace-pane-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px 16px', borderRadius: '8px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-success)', fontWeight: 600 }}>💰 รายรับเดือนนี้</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-success)', fontFamily: 'monospace', marginTop: '4px' }}>
                  +{currentMonthSummary.income.toLocaleString()} ฿
                </div>
              </div>
              <span style={{ fontSize: '24px' }}>📈</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px 16px', borderRadius: '8px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-danger)', fontWeight: 600 }}>💸 รายจ่ายเดือนนี้</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-danger)', fontFamily: 'monospace', marginTop: '4px' }}>
                  -{currentMonthSummary.expense.toLocaleString()} ฿
                </div>
              </div>
              <span style={{ fontSize: '24px' }}>📉</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '12px 16px', borderRadius: '8px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>🏆 กำไรสุทธิเดือนนี้</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace', marginTop: '4px' }}>
                  {currentMonthSummary.net >= 0 ? '+' : ''}{currentMonthSummary.net.toLocaleString()} ฿
                </div>
              </div>
              <span style={{ fontSize: '24px' }}>⚖️</span>
            </div>
          </div>
        </div>
      </div>

      {/* Channel 3: Critical Debt Collection horizontal list */}
      <div className="workspace-pane" style={{ marginBottom: '24px' }}>
        <div className="workspace-pane-header">
          <span className="workspace-pane-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} className="text-danger" /> 🚨 ช่องที่ 3: ระบบติดตามหนี้วิกฤตและยอดค้างชำระ (Pending & Debt Collection - สไลด์แนวนอน)
          </span>
        </div>
        <div className="workspace-pane-body" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', overflowX: 'auto', gap: '16px', paddingBottom: '8px' }} className="scrollbar-thin">
            {debtCollectionList.map(({ tx, clientName, overdueDays, severity }) => {
              let tagColor = 'var(--color-warning)';
              let tagBg = 'var(--color-warning-bg)';
              let icon = '🟡';
              let statusLabel = 'รอครบกำหนด';

              if (severity === 'red') {
                tagColor = 'var(--color-danger)';
                tagBg = 'var(--color-danger-bg)';
                icon = '🔴';
                statusLabel = `ค้างชำระ: ${overdueDays} วัน`;
              } else if (severity === 'orange') {
                tagColor = 'var(--accent)';
                tagBg = 'var(--accent-light)';
                icon = '🟠';
                statusLabel = `ค้างชำระ: ${overdueDays} วัน`;
              }

              return (
                <div 
                  key={tx.id}
                  style={{
                    flex: '0 0 280px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: tagColor, background: tagBg, padding: '2px 8px', borderRadius: '99px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {icon} {statusLabel}
                    </span>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                      {tx.date}
                    </span>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 700 }}>
                      แฟ้ม: {tx.caseRef || 'ส่วนกลางออฟฟิศ'}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {clientName}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      รายการ: "{tx.description}"
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', marginTop: '6px', fontFamily: 'monospace' }}>
                      ยอด: {tx.amount.toLocaleString()} บาท
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                    {overdueDays > 0 ? (
                      <button 
                        className="btn btn-primary" 
                        onClick={() => handleSendDebtNotice(clientName, tx.caseRef, tx.amount)}
                        style={{ width: '100%', padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        ส่งบิลทวงหนี้ซ้ำ 📨
                      </button>
                    ) : (
                      <button 
                        className="btn btn-secondary" 
                        disabled 
                        style={{ width: '100%', padding: '6px 12px', fontSize: '11px', cursor: 'not-allowed', opacity: 0.5 }}
                      >
                        รอครบกำหนดชำระ
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {debtCollectionList.length === 0 && (
              <div style={{ width: '100%', textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                ไม่มีสถิติหนี้ค้างชำระที่น่ากังวลใจในระบบขณะนี้
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search and filter block (Channel 4) */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-control"
            style={{ width: '100%', paddingLeft: '36px' }}
            placeholder="ค้นหา: เลขแฟ้มคดี, ชื่อลูกความ, รายละเอียดงวดงาน..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
        </div>

        {/* Month Dropdown filter */}
        <div>
          <select 
            className="form-control"
            value={filterMonthYear}
            onChange={(e) => { setFilterMonthYear(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">📅 แสดงผลทุกเดือน/ปี</option>
            {monthFilterOptions.map(([key, val]) => (
              <option key={key} value={key}>{val}</option>
            ))}
          </select>
        </div>

        {/* Status Checkbox filters */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {['Paid', 'Pending', 'Overdue', 'Sent'].map(st => {
            const isChecked = filterStatus.includes(st);
            return (
              <label 
                key={st} 
                style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  fontSize: '13px', 
                  background: isChecked ? 'var(--bg-active)' : 'var(--bg-card)', 
                  border: isChecked ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                  padding: '6px 12px', 
                  borderRadius: '6px', 
                  cursor: 'pointer',
                  color: isChecked ? 'var(--text-main)' : 'var(--text-muted)',
                  transition: 'all 0.2s'
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleStatusFilter(st)}
                  style={{ display: 'none' }}
                />
                <span style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%', 
                  backgroundColor: 
                    st === 'Paid' ? 'var(--color-success)' : 
                    st === 'Overdue' ? 'var(--color-danger)' : 'var(--color-warning)' 
                }} />
                {st}
              </label>
            );
          })}
        </div>
      </div>

      {/* Transaction Ledger Table (Channel 5) */}
      <div className="workspace-pane">
        <div className="workspace-pane-header">
          <span className="workspace-pane-title">
            📊 ช่องที่ 4: รายการเดินบัญชีทั้งหมด (Transaction Ledger)
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            พบทั้งหมด {filteredTransactions.length} รายการ | แสดงหน้า {currentPage} / {totalPages}
          </span>
        </div>
        <div className="workspace-pane-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '950px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '13px' }}>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>วันที่</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>อ้างอิงแฟ้ม</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>ชื่อลูกความ</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>รายการ/คำอธิบาย</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>จำนวนเงิน (บาท)</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>สถานะ</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>หลักฐาน</th>
                <th style={{ padding: '14px 16px', fontWeight: 600, width: '100px', textAlign: 'right' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.map(tx => {
                const isRevenue = tx.amount > 0;
                const matter = tx.caseRef ? matterMap.get(tx.caseRef) : null;
                const clientName = matter ? matter.clientName : (tx.caseRef ? '-' : 'ส่วนกลาง/ออฟฟิศ');
                
                return (
                  <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '13px' }} className="hover:bg-slate-800">
                    <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>{formatDate(tx.date)}</td>
                    <td style={{ padding: '14px 16px' }}>
                      {tx.caseRef ? (
                        <span className="badge badge-info" style={{ fontFamily: 'monospace', fontSize: '11px', padding: '2px 8px' }}>
                          {tx.caseRef}
                        </span>
                      ) : (
                        <span className="badge" style={{ backgroundColor: 'rgba(148, 163, 184, 0.1)', color: 'var(--text-muted)', fontSize: '11px', padding: '2px 8px' }}>
                          OFFICE
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 600 }}>{clientName}</td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-main)' }}>{tx.description}</td>
                    <td style={{ 
                      padding: '14px 16px', 
                      fontWeight: '700', 
                      color: isRevenue ? 'var(--color-success)' : 'var(--color-danger)',
                      fontFamily: 'monospace'
                    }}>
                      {isRevenue ? `+ ${tx.amount.toLocaleString('th-TH')}` : `- ${Math.abs(tx.amount).toLocaleString('th-TH')}`}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className={`badge ${
                        tx.status === 'Paid' ? 'badge-success' :
                        tx.status === 'Overdue' ? 'badge-danger' : 'badge-warning'
                      }`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                        {tx.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {tx.slipFileName ? (
                        <a 
                          href="#"
                          onClick={(e) => { e.preventDefault(); alert(`[OneDrive Slip Preview]\nชื่อไฟล์: ${tx.slipFileName}\nพาธไฟล์: ${tx.slipPath}`); }}
                          style={{ color: 'var(--accent)', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Eye size={12} /> [👁️]
                        </a>
                      ) : tx.status === 'Paid' ? (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '2px 6px', fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                          onClick={() => fileInputRefs.current[tx.id]?.click()}
                        >
                          <Upload size={10} /> แนบหลักฐาน
                          <input
                            type="file"
                            ref={el => { fileInputRefs.current[tx.id] = el; }}
                            style={{ display: 'none' }}
                            onChange={(e) => handleSlipChange(tx.id, e)}
                            accept="image/*,application/pdf"
                          />
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>--</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        {tx.status !== 'Paid' && (
                          <button
                            className="btn btn-primary"
                            style={{ padding: '2px 6px', fontSize: '11px' }}
                            onClick={() => onUpdateStatus(tx.id, 'Paid')}
                          >
                            รับเงิน
                          </button>
                        )}
                        <button 
                          className="btn-icon-only text-danger" 
                          onClick={() => onDeleteTransaction(tx.id)}
                          title="ลบธุรกรรม"
                          style={{ padding: '4px' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    ไม่พบรายการธุรกรรมตามฟิลเตอร์ค้นหาของคุณ
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px', borderTop: '1px solid var(--border-color)', gap: '12px', alignItems: 'center' }}>
              <button
                className="btn btn-secondary"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                ◄
              </button>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                หน้า <strong>{currentPage}</strong> จากทั้งหมด <strong>{totalPages}</strong>
              </span>
              <button
                className="btn btn-secondary"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                ►
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add Transaction Modal */}
      {isOpenAddModal && (
        <div className="modal-overlay" style={{ display: 'flex' }}>
          <form className="modal-content" onSubmit={handleAddSubmit}>
            <div className="modal-header">
              <span className="modal-title">
                {txType === 'revenue' ? '💰 เพิ่มรายรับ / งวดเงินคดีความ' : '💸 บันทึกค่าใช้จ่าย / รายจ่ายสำนักงาน'}
              </span>
              <button type="button" className="btn-icon-only" onClick={() => setIsOpenAddModal(false)}>
                <X size={16} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">ประเภทรายการ</label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input 
                      type="radio" 
                      name="txType" 
                      checked={txType === 'revenue'} 
                      onChange={() => { setTxType('revenue'); setForm(prev => ({ ...prev, caseRef: '' })); }} 
                    />
                    <span>รายรับ (เช่น ค่าวิชาชีพ, ค่าธรรมเนียมศาลรับโอน)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input 
                      type="radio" 
                      name="txType" 
                      checked={txType === 'expense'} 
                      onChange={() => { setTxType('expense'); setForm(prev => ({ ...prev, caseRef: 'central' })); }} 
                    />
                    <span>รายจ่าย (เช่น ค่าจ้างเดินทาง, ค่าน้ำมัน, หมึกพิมพ์)</span>
                  </label>
                </div>
              </div>

              {/* Contextual Case Matching Input */}
              <div className="form-group" style={{ position: 'relative', marginTop: '12px' }}>
                <label className="form-label">เชื่อมต่อแฟ้มคดีความ</label>
                {txType === 'expense' && (
                  <select 
                    className="form-control" 
                    value={form.caseRef === 'central' ? 'central' : 'matter'}
                    onChange={(e) => {
                      if (e.target.value === 'central') {
                        setForm(prev => ({ ...prev, caseRef: 'central' }));
                        setSearchQuery('');
                      } else {
                        setForm(prev => ({ ...prev, caseRef: '' }));
                      }
                    }}
                    style={{ marginBottom: '8px', width: '100%' }}
                  >
                    <option value="central">ค่าใช้จ่ายส่วนกลางสำนักงาน (ไม่ผูกคดี)</option>
                    <option value="matter">เชื่อมโยงค่าใช้จ่ายเข้าสู่แฟ้มคดีเฉพาะ</option>
                  </select>
                )}

                {((txType === 'expense' && form.caseRef !== 'central') || txType === 'revenue') && (
                  <>
                    <input 
                      type="text" 
                      className="form-control"
                      placeholder="พิมพ์ค้นหาคดี: เลขแฟ้ม, ชื่อลูกความ, ศาล..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setShowDropdown(true);
                      }}
                      onFocus={() => setShowDropdown(true)}
                      style={{ width: '100%' }}
                    />
                    {showDropdown && suggestions.length > 0 && (
                      <div className="autocomplete-dropdown" style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        zIndex: 100,
                        maxHeight: '180px',
                        overflowY: 'auto',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                      }}>
                        {suggestions.map(m => {
                          const refKey = `${m.officeCaseNumber}/${m.officeCaseYear}`;
                          return (
                            <div 
                              key={m.matterId}
                              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontSize: '13px' }}
                              onClick={() => {
                                setForm(prev => ({ ...prev, caseRef: refKey }));
                                setSearchQuery(`${refKey} | ลูกความ: ${m.clientName}`);
                                setShowDropdown(false);
                              }}
                              className="dropdown-item-hover"
                            >
                              <strong>{refKey}</strong> - {m.clientName} ({m.court})
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {form.caseRef && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--accent)' }}>
                        คดีที่เลือกเชื่อม: <strong>{form.caseRef}</strong>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="form-group" style={{ marginTop: '12px' }}>
                <label className="form-label">รายละเอียดการเดินบัญชี</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="เช่น ค่าเดินทางไปศาลจังหวัดชลบุรี, งวดวิชาชีพที่ 2 ยื่นฟ้อง"
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-row" style={{ marginTop: '12px' }}>
                <div className="form-group">
                  <label className="form-label">จำนวนเงิน (บาท)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="เช่น 15000"
                    value={form.amount}
                    onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">สถานะการชำระเงิน</label>
                  <select 
                    className="form-control" 
                    value={form.status}
                    onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value as Transaction['status'] }))}
                  >
                    <option value="Pending">Pending (รอชำระ)</option>
                    <option value="Paid">Paid (ชำระแล้ว)</option>
                    <option value="Sent">Sent (ส่งใบเรียกเก็บเงินแล้ว)</option>
                    <option value="Overdue">Overdue (เลยกำหนดชำระ)</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '12px' }}>
                <label className="form-label">วันที่ธุรกรรม</label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={form.date}
                  onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))}
                  required
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setIsOpenAddModal(false);
                  setSearchQuery('');
                }}
              >
                <X size={14} /> ยกเลิก
              </button>
              <button type="submit" className="btn btn-primary">
                <Check size={14} /> บันทึกรายการ
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
