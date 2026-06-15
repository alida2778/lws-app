import { useState, useCallback, useMemo } from 'react';
import type { Transaction, Matter, GlobalDashboardIndex } from '../types';
import { MicrosoftGraphService } from '../services/microsoftGraph';
import confetti from 'canvas-confetti';

interface UseTransactionsProps {
  clientId: string;
  token: string | null;
  workspacePath: string | null;
}

export function useTransactions({ clientId, token, workspacePath }: UseTransactionsProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFinanceAccess, setHasFinanceAccess] = useState<boolean>(true);

  // Fetch central transactions
  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const activeToken = token || '';
      const activePath = workspacePath || '';

      // First check finance access permissions
      const hasAccess = await MicrosoftGraphService.checkFinanceAccess(clientId, activeToken, activePath);
      setHasFinanceAccess(hasAccess);

      if (!hasAccess) {
        setTransactions([]);
        return;
      }

      // Load ledger
      const data = await MicrosoftGraphService.getCentralLedger(clientId, activeToken, activePath);
      setTransactions(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load central ledger transactions');
    } finally {
      setLoading(false);
    }
  }, [clientId, token, workspacePath]);

  // Synchronize matter totals inside mock local index so dashboard keeps showing paid/pending values
  const rebuildLocalGlobalIndexRevenue = (ledger: Transaction[]) => {
    const rawMatters = JSON.parse(localStorage.getItem('lws_matters_data') || '[]') as Matter[];
    const rawIndex = localStorage.getItem('lws_global_index');
    if (rawIndex) {
      try {
        const indexObj = JSON.parse(rawIndex) as GlobalDashboardIndex;
        if (indexObj && indexObj.matters) {
          const updatedMatters = indexObj.matters.map((m: any) => {
            const targetMatter = rawMatters.find(rm => rm.matterId === m.matterId);
            if (!targetMatter) return m;

            const refKey = `${targetMatter.officeCaseNumber}/${targetMatter.officeCaseYear}`;
            
            const paid = ledger
              .filter(t => t.caseRef === refKey && t.status.toLowerCase() === 'paid')
              .reduce((sum, t) => sum + t.amount, 0);

            const pending = ledger
              .filter(t => t.caseRef === refKey && t.status.toLowerCase() !== 'paid')
              .reduce((sum, t) => sum + t.amount, 0);

            return {
              ...m,
              totalPaidRevenue: paid,
              totalPendingRevenue: pending
            };
          });

          localStorage.setItem('lws_global_index', JSON.stringify({ ...indexObj, matters: updatedMatters }));
        }
      } catch (e) {
        console.error('Error rebuilding index revenue', e);
      }
    }
  };

  // Save central transactions helper
  const saveTransactionsHelper = useCallback(async (newLedger: Transaction[]) => {
    const activeToken = token || '';
    const activePath = workspacePath || '';
    const success = await MicrosoftGraphService.saveCentralLedger(clientId, activeToken, activePath, newLedger);
    if (success) {
      setTransactions(newLedger);
      // Synchronize with simulated Global Index for matters revenue cards
      rebuildLocalGlobalIndexRevenue(newLedger);
      return true;
    }
    throw new Error('บันทึกข้อมูลธุรกรรมการเงินไปยังระบบคลาวด์ล้มเหลว');
  }, [clientId, token, workspacePath]);

  // Add Transaction
  const addTransaction = useCallback(async (txData: {
    caseRef: string | null;
    description: string;
    amount: number;
    status: Transaction['status'];
    date: string;
    paidAt?: string | null;
  }) => {
    setError(null);
    try {
      const newTx: Transaction = {
        id: `tx_${Date.now()}`,
        caseRef: txData.caseRef,
        description: txData.description,
        amount: txData.amount,
        status: txData.status,
        date: txData.date,
        paidAt: txData.paidAt || (txData.status === 'Paid' ? new Date().toISOString() : null)
      };

      const newLedger = [newTx, ...transactions];
      await saveTransactionsHelper(newLedger);

      if (newTx.status === 'Paid') {
        confetti();
      }
      return newTx;
    } catch (err: any) {
      setError(err?.message || 'Failed to add transaction');
      throw err;
    }
  }, [transactions, saveTransactionsHelper]);

  // Update Transaction Status
  const updateTransactionStatus = useCallback(async (
    txId: string,
    status: Transaction['status'],
    paidAt: string | null = null
  ) => {
    setError(null);
    try {
      const updatedLedger = transactions.map(t => {
        if (t.id === txId) {
          const finalPaidAt = status === 'Paid' ? (paidAt || new Date().toISOString()) : null;
          return { ...t, status, paidAt: finalPaidAt };
        }
        return t;
      });

      await saveTransactionsHelper(updatedLedger);
      
      const updatedTx = updatedLedger.find(t => t.id === txId);
      if (status === 'Paid') {
        confetti();
      }
      return updatedTx;
    } catch (err: any) {
      setError(err?.message || 'Failed to update transaction status');
      throw err;
    }
  }, [transactions, saveTransactionsHelper]);

  // Upload slip for a specific transaction
  const attachSlipToTransaction = useCallback(async (
    txId: string,
    fileName: string,
    fileBlob: Blob
  ) => {
    setError(null);
    try {
      const activeToken = token || '';
      const activePath = workspacePath || '';

      // Format slip filename to matching spec: [caseRef]_[งวดงาน]_slip_[random].png
      const tx = transactions.find(t => t.id === txId);
      if (!tx) throw new Error('ไม่พบข้อมูลรายการธุรกรรมการเงิน');

      const caseClean = (tx.caseRef || 'central').replace(/\//g, '-');
      const descClean = tx.description.replace(/\s+/g, '_').substring(0, 15);
      const randHex = Math.random().toString(16).substring(2, 6);
      const fileExt = fileName.split('.').pop() || 'png';
      const formattedName = `${caseClean}_${descClean}_slip_${randHex}.${fileExt}`;

      // Upload binary to OneDrive
      const uploadRes = await MicrosoftGraphService.uploadSlip(clientId, activeToken, activePath, formattedName, fileBlob);
      if (!uploadRes.success) {
        throw new Error('อัปโหลดไฟล์หลักฐานการชำระเงินไปยัง OneDrive ล้มเหลว');
      }

      // Update ledger metadata details
      const updatedLedger = transactions.map(t => {
        if (t.id === txId) {
          return {
            ...t,
            status: 'Paid' as const,
            paidAt: t.paidAt || new Date().toISOString(),
            slipFileName: formattedName,
            slipPath: uploadRes.slipPath
          };
        }
        return t;
      });

      await saveTransactionsHelper(updatedLedger);
      confetti();
      return updatedLedger.find(t => t.id === txId);
    } catch (err: any) {
      setError(err?.message || 'Failed to attach slip');
      throw err;
    }
  }, [transactions, token, workspacePath, clientId, saveTransactionsHelper]);

  // Delete Transaction
  const deleteTransaction = useCallback(async (txId: string) => {
    if (!confirm('ยืนยันลบรายการธุรกรรมการเงินนี้ออกจากบัญชี?')) return;
    setError(null);
    try {
      const filtered = transactions.filter(t => t.id !== txId);
      await saveTransactionsHelper(filtered);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete transaction');
      throw err;
    }
  }, [transactions, saveTransactionsHelper]);

  // Central financial stats calculations
  const stats = useMemo(() => {
    const paidRevenue = transactions
      .filter(t => t.amount > 0 && t.status === 'Paid')
      .reduce((sum, t) => sum + t.amount, 0);

    const pendingRevenue = transactions
      .filter(t => t.amount > 0 && t.status !== 'Paid')
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = transactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const netRevenue = paidRevenue - expenses;

    return {
      paidRevenue,
      pendingRevenue,
      expenses,
      netRevenue
    };
  }, [transactions]);

  // Filter transactions by caseRef
  const getTransactionsForMatter = useCallback((officeCaseNumber: string, officeCaseYear: string) => {
    const refKey = `${officeCaseNumber}/${officeCaseYear}`;
    return transactions.filter(t => t.caseRef === refKey);
  }, [transactions]);

  return {
    transactions,
    loading,
    error,
    hasFinanceAccess,
    loadTransactions,
    addTransaction,
    updateTransactionStatus,
    attachSlipToTransaction,
    deleteTransaction,
    getTransactionsForMatter,
    stats
  };
}
