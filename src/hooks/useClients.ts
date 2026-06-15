import { useState, useCallback } from 'react';
import type { ClientProfile } from '../types';
import { MicrosoftGraphService } from '../services/microsoftGraph';

export function useClients() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load clients list
  const loadClients = useCallback(async (
    clientId: string,
    token: string,
    workspacePath: string
  ) => {
    setLoading(true);
    setError(null);
    try {
      const data = await MicrosoftGraphService.getCentralClients(clientId, token, workspacePath);
      setClients(data);
      return data;
    } catch (err: any) {
      setError(err?.message || 'Failed to load central clients');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Add a new client profile
  const addClient = useCallback(async (
    clientId: string,
    token: string,
    workspacePath: string,
    newClientData: Omit<ClientProfile, 'id'>
  ) => {
    setLoading(true);
    setError(null);
    try {
      const currentList = await MicrosoftGraphService.getCentralClients(clientId, token, workspacePath);
      
      // Check if client name already exists
      if (currentList.some(c => c.clientName.trim() === newClientData.clientName.trim())) {
        throw new Error(`ชื่อลูกความ "${newClientData.clientName}" มีอยู่ในระบบแล้ว`);
      }

      const newClient: ClientProfile = {
        ...newClientData,
        id: `c_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      const updatedList = [...currentList, newClient];
      const success = await MicrosoftGraphService.saveCentralClients(clientId, token, workspacePath, updatedList);
      if (!success) throw new Error('ไม่สามารถบันทึกประวัติลูกความลงระบบได้');
      
      setClients(updatedList);
      return newClient;
    } catch (err: any) {
      setError(err?.message || 'Failed to add client');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update an existing client profile
  const updateClient = useCallback(async (
    clientId: string,
    token: string,
    workspacePath: string,
    updatedClient: ClientProfile
  ) => {
    setLoading(true);
    setError(null);
    try {
      const currentList = await MicrosoftGraphService.getCentralClients(clientId, token, workspacePath);
      
      // Check if updating to a name that already exists in other profiles
      if (currentList.some(c => c.id !== updatedClient.id && c.clientName.trim() === updatedClient.clientName.trim())) {
        throw new Error(`ชื่อลูกความ "${updatedClient.clientName}" ซ้ำกับลูกความรายอื่น`);
      }

      const updatedList = currentList.map(c => c.id === updatedClient.id ? updatedClient : c);
      const success = await MicrosoftGraphService.saveCentralClients(clientId, token, workspacePath, updatedList);
      if (!success) throw new Error('ไม่สามารถบันทึกประวัติลูกความลงระบบได้');
      
      setClients(updatedList);
      return updatedClient;
    } catch (err: any) {
      setError(err?.message || 'Failed to update client');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete a client profile
  const deleteClient = useCallback(async (
    clientId: string,
    token: string,
    workspacePath: string,
    id: string
  ) => {
    setLoading(true);
    setError(null);
    try {
      const currentList = await MicrosoftGraphService.getCentralClients(clientId, token, workspacePath);
      const updatedList = currentList.filter(c => c.id !== id);
      const success = await MicrosoftGraphService.saveCentralClients(clientId, token, workspacePath, updatedList);
      if (!success) throw new Error('ไม่สามารถบันทึกประวัติลูกความลงระบบได้');
      
      setClients(updatedList);
      return true;
    } catch (err: any) {
      setError(err?.message || 'Failed to delete client');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync client profile from matter creation or modification
  const syncFromMatter = useCallback(async (
    clientId: string,
    token: string,
    workspacePath: string,
    caseClient: { clientName: string; phone?: string; leadSource?: string }
  ) => {
    if (!caseClient.clientName || !caseClient.clientName.trim()) return;

    try {
      const currentList = await MicrosoftGraphService.getCentralClients(clientId, token, workspacePath);
      const normalizedName = caseClient.clientName.trim();
      const existing = currentList.find(c => c.clientName.trim() === normalizedName);

      if (!existing) {
        // Create new client profile
        const newClient: ClientProfile = {
          id: `c_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          clientName: normalizedName,
          phone: caseClient.phone || '',
          leadSource: caseClient.leadSource || '',
          address: '',
          email: '',
          facebook: '',
          lineId: '',
          taxId: '',
          note: '[บันทึกอัตโนมัติจากการสร้างคดีความ]'
        };
        const updatedList = [...currentList, newClient];
        await MicrosoftGraphService.saveCentralClients(clientId, token, workspacePath, updatedList);
        setClients(updatedList);
      } else if (caseClient.phone || caseClient.leadSource) {
        // Update phone or leadSource if empty in registry
        let modified = false;
        const updatedClient = { ...existing };
        
        if (caseClient.phone && !existing.phone) {
          updatedClient.phone = caseClient.phone;
          modified = true;
        }
        if (caseClient.leadSource && !existing.leadSource) {
          updatedClient.leadSource = caseClient.leadSource;
          modified = true;
        }

        if (modified) {
          const updatedList = currentList.map(c => c.id === existing.id ? updatedClient : c);
          await MicrosoftGraphService.saveCentralClients(clientId, token, workspacePath, updatedList);
          setClients(updatedList);
        }
      }
    } catch (err) {
      console.error('[Clients Registry Sync] Failed to auto-sync client profile:', err);
    }
  }, []);

  return {
    clients,
    loading,
    error,
    loadClients,
    addClient,
    updateClient,
    deleteClient,
    syncFromMatter
  };
}
