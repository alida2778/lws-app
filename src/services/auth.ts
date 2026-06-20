import { PublicClientApplication } from '@azure/msal-browser';
import type { Configuration } from '@azure/msal-browser';

const LWS_ACTIVE_WS_KEY = 'lws_active_workspace';

export interface OneDriveWorkspace {
  id: string;
  name: string;
  path: string;
  sharedBy?: string;
}

export class AuthService {
  private static pca: PublicClientApplication | null = null;
  private static initPromise: Promise<PublicClientApplication> | null = null;
  private static currentToken: string | null = null;

  private static isMockEnabled(clientId: string): boolean {
    const isLocalhost = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' || 
                        window.location.hostname === '[::1]';
    if (!isLocalhost) return false;
    return !clientId || clientId.startsWith('AIza') || clientId.toLowerCase().includes('mock');
  }

  // Initialize MSAL client application using Singleton Pattern
  static init(clientId: string): Promise<PublicClientApplication> {
    if (this.initPromise) return this.initPromise;

    const isMock = this.isMockEnabled(clientId);
    const msalConfig: Configuration = {
      auth: {
        clientId: isMock ? 'MOCK-CLIENT-ID-12345' : clientId,
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin + window.location.pathname,
      },
      cache: {
        cacheLocation: 'localStorage'
      }
    };

    this.initPromise = (async () => {
      const pca = new PublicClientApplication(msalConfig);
      await pca.initialize();
      this.pca = pca;
      return pca;
    })();

    return this.initPromise;
  }

  // Helper to clear stuck MSAL interaction status in cache
  private static clearInteractionStatus(): void {
    const storages = [localStorage, sessionStorage];
    for (const storage of storages) {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key && key.includes('interaction.status')) {
            keysToRemove.push(key);
          }
        }
        for (const key of keysToRemove) {
          storage.removeItem(key);
        }
      } catch (e) {
        console.warn('Failed to clear storage key:', e);
      }
    }
  }

  // Sign In using MSAL (Popup redirects/authenticates)
  static async login(clientId: string): Promise<{ username: string; token: string } | null> {
    const isMock = this.isMockEnabled(clientId);

    if (isMock) {
      // Mock Sign In simulation
      this.currentToken = 'mock-microsoft-access-token-99999';
      return {
        username: 'alex.alexander@nanchai-law.com',
        token: this.currentToken
      };
    }

    // Await complete initialization of MSAL (Singleton promise guarantees only one PCA is initialized once)
    const pca = await this.init(clientId);

    // Proactively clear any stuck interaction status from previous failed/blocked attempts
    this.clearInteractionStatus();

    try {
      const loginRequest = {
        scopes: ['user.read', 'files.readwrite']
      };
      const response = await pca.loginPopup(loginRequest);
      this.currentToken = response.accessToken;
      return {
        username: response.account.username,
        token: response.accessToken
      };
    } catch (error: any) {
      console.error('MSAL Login Failed:', error);
      // Clean up the status on error so MSAL isn't stuck on future attempts,
      // but do NOT retry immediately in the same stack as it would spawn overlapping popups.
      this.clearInteractionStatus();
      throw error;
    }
  }

  // Sign Out
  static async logout(): Promise<void> {
    this.currentToken = null;
    localStorage.removeItem(LWS_ACTIVE_WS_KEY);
    
    if (this.pca) {
      const accounts = this.pca.getAllAccounts();
      if (accounts.length > 0) {
        await this.pca.logoutPopup({
          account: accounts[0],
          postLogoutRedirectUri: window.location.origin
        });
      }
    }
  }

  // Acquire active Microsoft token
  static async getAccessToken(clientId: string): Promise<string | null> {
    if (this.currentToken) return this.currentToken;
    const isMock = this.isMockEnabled(clientId);
    if (isMock) return 'mock-microsoft-access-token-99999';

    const pca = await this.init(clientId);
    const accounts = pca.getAllAccounts();
    if (accounts.length === 0) return null;

    try {
      const response = await pca.acquireTokenSilent({
        scopes: ['user.read', 'files.readwrite'],
        account: accounts[0]
      });
      this.currentToken = response.accessToken;
      return response.accessToken;
    } catch (error) {
      console.warn('Silent token retrieval failed:', error);
      return null;
    }
  }

  // Scan root folders in OneDrive (Graph API children scan)
  static async fetchOneDriveWorkspaces(clientId: string, token: string): Promise<OneDriveWorkspace[]> {
    const isMock = this.isMockEnabled(clientId);
    
    if (isMock) {
      // Return simulated workspaces for testing selection modal
      return [
        {
          id: 'folder_nanchai_lws',
          name: 'OneDrive/Nanchai-Law-Firm/LWS',
          path: '/drives/mock-drive-1/items/folder_nanchai_lws',
          sharedBy: 'Vichai Nanchai (Senior Partner)'
        }
      ];
    }

    try {
      const response = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch OneDrive directories');
      const data = await response.json();
      
      // Filter for directory items only
      const folders = data.value.filter((item: any) => item.folder !== undefined);
      return folders.map((f: any) => ({
        id: f.id,
        name: `OneDrive/${f.name}`,
        path: `/drives/${f.parentReference.driveId}/items/${f.id}`
      }));
    } catch (error) {
      console.error('Graph API folder fetch failed, fallback to mock list:', error);
      // Fallback
      return [
        {
          id: 'folder_nanchai_lws',
          name: 'OneDrive/Nanchai-Law-Firm/LWS',
          path: '/drives/mock-drive-1/items/folder_nanchai_lws',
          sharedBy: 'Vichai Nanchai (Senior Partner)'
        }
      ];
    }
  }

  // Create a new workspace folder and populate with initial empty ledger and client registry
  static async createOneDriveWorkspace(clientId: string, token: string, folderName: string): Promise<OneDriveWorkspace> {
    const isMock = this.isMockEnabled(clientId);
    if (isMock) {
      return {
        id: `folder_${folderName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        name: `OneDrive/${folderName}`,
        path: `/drives/mock-drive-1/items/folder_${folderName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
      };
    }

    try {
      // 1. Create root folder
      const createFolderResponse = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: folderName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename'
        })
      });
      if (!createFolderResponse.ok) throw new Error('Failed to create workspace folder on OneDrive');
      const folderData = await createFolderResponse.json();
      const actualName = folderData.name;

      // 2. Upload empty central_ledger.json and central_clients.json
      const emptyArrayBody = JSON.stringify([]);
      
      const ledgerResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${actualName}/01_Office_Management/central_ledger.json:/content`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: emptyArrayBody
      });
      if (!ledgerResponse.ok) console.warn('Failed to upload central_ledger.json to new workspace');

      const clientsResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${actualName}/01_Office_Management/central_clients.json:/content`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: emptyArrayBody
      });
      if (!clientsResponse.ok) console.warn('Failed to upload central_clients.json to new workspace');

      return {
        id: folderData.id,
        name: `OneDrive/${actualName}`,
        path: `/drives/${folderData.parentReference.driveId}/items/${folderData.id}`
      };
    } catch (error) {
      console.error('Failed to create OneDrive workspace:', error);
      throw error;
    }
  }

  // Get selected workspace
  static getActiveWorkspace(): string | null {
    return localStorage.getItem(LWS_ACTIVE_WS_KEY);
  }

  // Save selected workspace
  static setActiveWorkspace(workspacePath: string): void {
    localStorage.setItem(LWS_ACTIVE_WS_KEY, workspacePath);
  }
}
