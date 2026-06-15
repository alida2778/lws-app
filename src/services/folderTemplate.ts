import type { FileMetadata } from '../types';

export function getInitialMatterFiles(_matterId: string, clientName: string): FileMetadata[] {
  const now = new Date().toISOString();
  return [
    {
      name: `1-ร่างคำฟ้อง_${clientName}.docx`,
      path: `02_สำนวนคดี_ศาล/1-ร่างคำฟ้อง_${clientName}.docx`,
      category: 'CourtDrafts',
      size: 124000,
      lastModified: now
    },
    {
      name: 'ภาพหลักฐานแชทไลน์ข้อตกลง.jpg',
      path: '03_หลักฐาน/ภาพหลักฐานแชทไลน์ข้อตกลง.jpg',
      category: 'RawEvidence',
      size: 380000,
      lastModified: now,
      evidenceStatus: 'raw'
    }
  ];
}
