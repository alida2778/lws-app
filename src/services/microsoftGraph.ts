import type { Transaction, ClientProfile } from '../types';

export class MicrosoftGraphService {
  /**
   * Check if the user has access to Folder 01_Office_Finance
   * If it returns 403 Forbidden, hasFinanceAccess will be set to false.
   */
  static async checkFinanceAccess(clientId: string, token: string, workspacePath: string): Promise<boolean> {
    const isMock = !clientId || clientId.startsWith('AIza') || clientId.toLowerCase().includes('mock');
    if (isMock) {
      return true; // Mock mode defaults to full access
    }
    try {
      // Trim workspacePath leading/trailing slashes
      const cleanWS = workspacePath.replace(/^\/|\/$/g, '');
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${cleanWS}/01_Office_Management`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (response.status === 403) {
        return false;
      }
      return response.ok;
    } catch (error) {
      console.error('[Graph API] checkFinanceAccess error:', error);
      return false;
    }
  }

  /**
   * Get the centralized financial ledger (01_Office_Management/central_ledger.json)
   */
  static async getCentralLedger(clientId: string, token: string, workspacePath: string): Promise<Transaction[]> {
    const isMock = !clientId || clientId.startsWith('AIza') || clientId.toLowerCase().includes('mock');
    if (isMock) {
      const raw = localStorage.getItem('lws_central_ledger');
      if (!raw) {
        // Seed some initial mock transactions
        const initialTransactions: Transaction[] = [
          {
            id: 't_mock_1',
            caseRef: '001/2569',
            description: 'ค่าเดินทางไปศาลจังหวัดนัดพิจารณาวันพรุ่งนี้',
            amount: 5000,
            status: 'Pending',
            date: '2026-06-12',
            paidAt: null
          },
          {
            id: 't_mock_2',
            caseRef: '005/2569',
            description: 'ค่าขึ้นศาลแพ่ง (โอนเรียบร้อย)',
            amount: 20000,
            status: 'Paid',
            date: '2026-06-11',
            paidAt: '2026-06-11T07:30:00Z',
            slipFileName: '005_ค่าขึ้นศาล_slip_4a11.png',
            slipPath: '01_Office_Management/หลักฐานใบเสร็จ/005_ค่าขึ้นศาล_slip_4a11.png'
          },
          {
            id: 't_mock_3',
            caseRef: '002/2569',
            description: 'ค่าคัดถ่ายสำเนาคำพิพากษาคดี',
            amount: 1500,
            status: 'Overdue',
            date: '2026-06-09',
            paidAt: null
          },
          {
            id: 't_mock_4',
            caseRef: null, // ส่วนกลาง
            description: 'ค่าน้ำมันรถกระบะไปรับเอกสาร',
            amount: -800,
            status: 'Paid',
            date: '2026-06-08',
            paidAt: '2026-06-08T04:20:00Z'
          }
        ];
        localStorage.setItem('lws_central_ledger', JSON.stringify(initialTransactions));
        return initialTransactions;
      }
      return JSON.parse(raw);
    }

    try {
      const cleanWS = workspacePath.replace(/^\/|\/$/g, '');
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${cleanWS}/01_Office_Management/central_ledger.json:/content`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (response.status === 404) {
        return [];
      }
      if (!response.ok) throw new Error('Failed to download central ledger');
      return await response.json();
    } catch (error) {
      console.error('[Graph API] getCentralLedger error:', error);
      return [];
    }
  }

  /**
   * Save the centralized financial ledger (01_Office_Management/central_ledger.json)
   */
  static async saveCentralLedger(clientId: string, token: string, workspacePath: string, ledger: Transaction[]): Promise<boolean> {
    const isMock = !clientId || clientId.startsWith('AIza') || clientId.toLowerCase().includes('mock');
    if (isMock) {
      localStorage.setItem('lws_central_ledger', JSON.stringify(ledger));
      return true;
    }

    try {
      const cleanWS = workspacePath.replace(/^\/|\/$/g, '');
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${cleanWS}/01_Office_Management/central_ledger.json:/content`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ledger)
      });
      return response.ok;
    } catch (error) {
      console.error('[Graph API] saveCentralLedger error:', error);
      return false;
    }
  }

  /**
   * Upload billing/payment slip to 01_Office_Management/หลักฐานใบเสร็จ
   */
  static async uploadSlip(
    clientId: string,
    token: string,
    workspacePath: string,
    fileName: string,
    fileBlob: Blob
  ): Promise<{ success: boolean; slipPath: string }> {
    const isMock = !clientId || clientId.startsWith('AIza') || clientId.toLowerCase().includes('mock');
    const path = `01_Office_Management/หลักฐานใบเสร็จ/${fileName}`;
    if (isMock) {
      return { success: true, slipPath: path };
    }

    try {
      const cleanWS = workspacePath.replace(/^\/|\/$/g, '');
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${cleanWS}/${path}:/content`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': fileBlob.type
        },
        body: fileBlob
      });
      if (!response.ok) throw new Error('Upload slip failed');
      return { success: true, slipPath: path };
    } catch (error) {
      console.error('[Graph API] uploadSlip error:', error);
      return { success: false, slipPath: '' };
    }
  }

  /**
   * Batch rename files in OneDrive folder (02_สำนวนคดี_ศาล) for ordering
   */
  static async renameFile(
    clientId: string,
    token: string,
    workspacePath: string,
    matterFolderName: string,
    oldPath: string,
    newPath: string
  ): Promise<boolean> {
    const isMock = !clientId || clientId.startsWith('AIza') || clientId.toLowerCase().includes('mock');
    if (isMock) {
      return true;
    }

    try {
      const cleanWS = workspacePath.replace(/^\/|\/$/g, '');
      const fullOldPath = `${cleanWS}/${matterFolderName}/${oldPath}`;
      const newName = newPath.split('/').pop() || '';

      // Get item ID first
      const getResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${fullOldPath}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!getResponse.ok) throw new Error(`Could not find old file at ${fullOldPath}`);
      const fileData = await getResponse.json();
      const itemId = fileData.id;

      // Rename item
      const patchResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newName
        })
      });
      return patchResponse.ok;
    } catch (error) {
      console.error('[Graph API] renameFile error:', error);
      return false;
    }
  }

  /**
   * Upload document to case folder
   */
  static async uploadDocument(
    clientId: string,
    token: string,
    workspacePath: string,
    matterFolderName: string,
    subFolder: '02_สำนวนคดี_ศาล' | '03_หลักฐาน',
    fileName: string,
    fileBlob: Blob
  ): Promise<boolean> {
    const isMock = !clientId || clientId.startsWith('AIza') || clientId.toLowerCase().includes('mock');
    if (isMock) {
      return true;
    }

    try {
      const cleanWS = workspacePath.replace(/^\/|\/$/g, '');
      const path = `${cleanWS}/${matterFolderName}/${subFolder}/${fileName}`;
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': fileBlob.type
        },
        body: fileBlob
      });
      return response.ok;
    } catch (error) {
      console.error('[Graph API] uploadDocument error:', error);
      return false;
    }
  }

  /**
   * Get the centralized client registry (01_Office_Management/central_clients.json)
   */
  static async getCentralClients(clientId: string, token: string, workspacePath: string): Promise<ClientProfile[]> {
    const isMock = !clientId || clientId.startsWith('AIza') || clientId.toLowerCase().includes('mock');
    if (isMock) {
      const raw = localStorage.getItem('lws_central_clients');
      if (!raw) {
        // Seed some initial mock clients
        const initialClients: ClientProfile[] = [
          {
            id: 'c_mock_1',
            clientName: 'นายสมชาย ใจดี',
            phone: '081-234-5678',
            email: 'somchai@gmail.com',
            address: '123/45 ถนนพัฒนาการ แขวงสวนหลวง เขตสวนหลวง กรุงเทพฯ 10250',
            facebook: 'Somchai Jaidee',
            lineId: 'somchai_line',
            taxId: '1100200345678',
            leadSource: 'ทนายนำชัยแนะนำมา',
            note: 'ลูกความเก่า เคยทำคดีแพ่งปี 68'
          },
          {
            id: 'c_mock_2',
            clientName: 'บจก. มั่งคั่ง ร่ำรวย',
            phone: '02-999-8888',
            email: 'contact@mangkang.co.th',
            address: '888 อาคารมั่งคั่ง ชั้น 20 ถนนสีลม แขวงสุริยวงศ์ เขตบางรัก กรุงเทพฯ 10500',
            facebook: 'Mangkang Business',
            lineId: '@mangkang',
            taxId: '0105560012345',
            leadSource: 'เพจเฟซบุ๊กสำนักงาน',
            note: 'เคสที่ปรึกษารายปี ต่อสัญญาเดือน ม.ค. ทุกปี'
          }
        ];
        localStorage.setItem('lws_central_clients', JSON.stringify(initialClients));
        return initialClients;
      }
      return JSON.parse(raw);
    }

    try {
      const cleanWS = workspacePath.replace(/^\/|\/$/g, '');
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${cleanWS}/01_Office_Management/central_clients.json:/content`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (response.status === 404) {
        return [];
      }
      if (!response.ok) throw new Error('Failed to download central clients');
      return await response.json();
    } catch (error) {
      console.error('[Graph API] getCentralClients error:', error);
      return [];
    }
  }

  /**
   * Save the centralized client registry (01_Office_Management/central_clients.json)
   */
  static async saveCentralClients(clientId: string, token: string, workspacePath: string, clients: ClientProfile[]): Promise<boolean> {
    const isMock = !clientId || clientId.startsWith('AIza') || clientId.toLowerCase().includes('mock');
    if (isMock) {
      localStorage.setItem('lws_central_clients', JSON.stringify(clients));
      return true;
    }

    try {
      const cleanWS = workspacePath.replace(/^\/|\/$/g, '');
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${cleanWS}/01_Office_Management/central_clients.json:/content`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(clients)
      });
      return response.ok;
    } catch (error) {
      console.error('[Graph API] saveCentralClients error:', error);
      return false;
    }
  }
}
