import React, { useState, useMemo } from 'react';
import type { ClientProfile } from '../types';
import { Search, Plus, Edit2, Trash2, Mail, Phone, User, Tag, Check, X } from 'lucide-react';

interface ClientsViewProps {
  clients: ClientProfile[];
  loading: boolean;
  error: string | null;
  onAddClient: (client: Omit<ClientProfile, 'id'>) => Promise<any>;
  onUpdateClient: (client: ClientProfile) => Promise<any>;
  onDeleteClient: (id: string) => Promise<any>;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  clients,
  loading,
  error,
  onAddClient,
  onUpdateClient,
  onDeleteClient
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');

  // Form states
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formFacebook, setFormFacebook] = useState('');
  const [formLineId, setFormLineId] = useState('');
  const [formTaxId, setFormTaxId] = useState('');
  const [formLeadSource, setFormLeadSource] = useState('');
  const [formNote, setFormNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Filter clients
  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const q = searchTerm.toLowerCase();
      return (
        c.clientName.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.leadSource || '').toLowerCase().includes(q)
      );
    });
  }, [clients, searchTerm]);

  // Open modal for creating a new client
  const handleOpenCreateModal = () => {
    setModalMode('create');
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormFacebook('');
    setFormLineId('');
    setFormTaxId('');
    setFormLeadSource('');
    setFormNote('');
    setActionError(null);
    setIsModalOpen(true);
  };

  // Open modal for editing an existing client
  const handleOpenEditModal = (client: ClientProfile) => {
    setModalMode('edit');
    setSelectedClient(client);
    setFormName(client.clientName);
    setFormPhone(client.phone || '');
    setFormEmail(client.email || '');
    setFormAddress(client.address || '');
    setFormFacebook(client.facebook || '');
    setFormLineId(client.lineId || '');
    setFormTaxId(client.taxId || '');
    setFormLeadSource(client.leadSource || '');
    setFormNote(client.note || '');
    setActionError(null);
    setIsModalOpen(true);
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    if (!formName.trim()) {
      setActionError('กรุณากรอกชื่อลูกความ');
      return;
    }

    try {
      const payload = {
        clientName: formName.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
        address: formAddress.trim(),
        facebook: formFacebook.trim(),
        lineId: formLineId.trim(),
        taxId: formTaxId.trim(),
        leadSource: formLeadSource.trim(),
        note: formNote.trim()
      };

      if (modalMode === 'create') {
        await onAddClient(payload);
      } else if (modalMode === 'edit' && selectedClient) {
        await onUpdateClient({
          ...payload,
          id: selectedClient.id
        });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setActionError(err?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    }
  };

  // Delete client profile
  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`คุณต้องการลบข้อมูลลูกความ "${name}" ใช่หรือไม่?`)) {
      try {
        await onDeleteClient(id);
      } catch (err: any) {
        alert(err?.message || 'เกิดข้อผิดพลาดในการลบข้อมูล');
      }
    }
  };

  return (
    <div className="page-container fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'Outfit', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <User size={24} className="text-accent" /> 👤 ทะเบียนลูกความกลาง (Central Client Registry)
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
            ฐานข้อมูลประวัติและข้อมูลติดต่อลูกความทั้งหมดของสำนักงาน (สิทธิ์ผู้ดูแลระบบ Admin)
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenCreateModal}>
          <Plus size={16} /> เพิ่มข้อมูลลูกความ
        </button>
      </div>

      {error && (
        <div className="badge badge-danger" style={{ width: '100%', padding: '12px', marginBottom: '16px', borderRadius: '8px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Control Actions Bar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '280px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-control"
            style={{ width: '100%', paddingLeft: '36px' }}
            placeholder="ค้นหา: พิมพ์ชื่อลูกความ, เบอร์โทรศัพท์, อีเมล, หรือผู้แนะนำ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Database list table */}
      <div className="workspace-pane">
        <div className="workspace-pane-body" style={{ padding: 0, overflowX: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>กำลังดึงข้อมูลฐานข้อมูลลูกความกลาง...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '13px' }}>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>ชื่อลูกความ</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>เบอร์โทรศัพท์</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>แหล่งที่มา (leadSource)</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>อีเมล</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600, width: '120px', textAlign: 'right' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr key={client.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '14px' }} className="hover:bg-slate-800">
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-main)' }}>
                      {client.clientName}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                      {client.phone ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Phone size={12} /> {client.phone}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                      {client.leadSource ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Tag size={12} /> {client.leadSource}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                      {client.email ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Mail size={12} /> {client.email}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button
                          className="btn-icon-only"
                          title="แก้ไขประวัติ"
                          onClick={() => handleOpenEditModal(client)}
                        >
                          <Edit2 size={13} style={{ color: 'var(--accent)' }} />
                        </button>
                        <button
                          className="btn-icon-only"
                          title="ลบประวัติ"
                          onClick={() => handleDelete(client.id, client.clientName)}
                        >
                          <Trash2 size={13} style={{ color: 'var(--color-danger)' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredClients.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      ไม่พบประวัติลูกความในสารบบทะเบียนรายชื่อ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create / Edit Modal Dialog */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <span className="modal-title">
                {modalMode === 'create' ? '➕ เพิ่มประวัติลูกความใหม่' : '📝 แก้ไขประวัติลูกความ'}
              </span>
              <button className="btn-icon-only" onClick={() => setIsModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {actionError && (
                  <div className="badge badge-danger" style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '13px' }}>
                    {actionError}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">ชื่อลูกความ (นิติบุคคล หรือ บุคคลธรรมดา) *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="เช่น บจก. มั่งคั่ง ร่ำรวย หรือ นายสมชาย ใจดี"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">เบอร์โทรศัพท์ติดต่อ</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="เช่น 081-234-5678"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">อีเมล</label>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="เช่น contact@mangkang.co.th"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Facebook</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="ชื่อเพจ หรือ บัญชีเฟซบุ๊ก"
                      value={formFacebook}
                      onChange={(e) => setFormFacebook(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Line ID</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="เช่น @mangkang"
                      value={formLineId}
                      onChange={(e) => setFormLineId(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">เลขบัตรประชาชน / เลขประจำตัวผู้เสียภาษี</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="ระบุเพื่อทำใบเสนอราคา/ออกงวดเงิน (Optional)"
                      value={formTaxId}
                      onChange={(e) => setFormTaxId(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">รู้จักผ่าน... / แหล่งที่มา (leadSource)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="เช่น ทนายนำชัยแนะนำมา, เพจเฟซบุ๊กออฟฟิศ"
                      value={formLeadSource}
                      onChange={(e) => setFormLeadSource(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">ที่อยู่จัดส่งเอกสาร / ที่อยู่จดทะเบียน</label>
                  <textarea
                    className="form-control"
                    style={{ minHeight: '80px', fontFamily: 'inherit' }}
                    placeholder="กรอกที่อยู่เต็มของลูกความ"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">โน้ตย่อย / ข้อความบันทึกเพิ่มเติม</label>
                  <textarea
                    className="form-control"
                    style={{ minHeight: '60px', fontFamily: 'inherit' }}
                    placeholder="เช่น ข้อมูลคดีเก่า ประวัติการติดต่อ ข้อควรระวังในการพูดคุย..."
                    value={formNote}
                    onChange={(e) => setFormNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  <X size={14} /> ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={14} /> บันทึกประวัติ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
