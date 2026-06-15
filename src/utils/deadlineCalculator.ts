// Play-safe Thai deadline calculator
// Excludes the first day, counts next day as day 1. If weekend, rolls back to preceding Friday.
export const calculateThaiDeadline = (
  startStr: string,
  duration: number,
  unit: 'days' | 'months' | 'years' = 'days'
): string => {
  if (!startStr) return '';
  const start = new Date(startStr);
  const end = new Date(start);

  if (unit === 'days') {
    end.setDate(start.getDate() + duration);
  } else if (unit === 'months') {
    end.setMonth(start.getMonth() + duration);
  } else if (unit === 'years') {
    end.setFullYear(start.getFullYear() + duration);
  }

  // Rollback weekend to Friday (Play-Safe Strategy)
  const dayOfWeek = end.getDay();
  if (dayOfWeek === 0) { // Sunday
    end.setDate(end.getDate() - 2);
  } else if (dayOfWeek === 6) { // Saturday
    end.setDate(end.getDate() - 1);
  }
  return end.toISOString().split('T')[0];
};

// Countdown badge renderer
export const getCountdownBadge = (deadlineStr: string | null): { text: string; class: string; isUrgent: boolean } => {
  if (!deadlineStr) return { text: 'ไม่มีวันเดดไลน์', class: 'badge-info', isUrgent: false };
  const deadline = new Date(deadlineStr);
  const now = new Date();
  deadline.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const diffTime = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `เลยกำหนดมาแล้ว ${Math.abs(diffDays)} วัน`, class: 'badge-danger', isUrgent: true };
  } else if (diffDays === 0) {
    return { text: 'ครบกำหนดวันนี้ (ด่วนที่สุด!)', class: 'badge-danger', isUrgent: true };
  }

  // Calculate Y, M, D
  let years = deadline.getFullYear() - now.getFullYear();
  let months = deadline.getMonth() - now.getMonth();
  let days = deadline.getDate() - now.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(deadline.getFullYear(), deadline.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const textParts = [];
  if (years > 0) textParts.push(`${years} ปี`);
  if (months > 0) textParts.push(`${months} เดือน`);
  if (days > 0) textParts.push(`${days} วัน`);

  const countdownText = textParts.join(' ') || '0 วัน';
  return {
    text: `เหลือเวลาอีก ${countdownText}`,
    class: diffDays <= 7 ? 'badge-danger' : 'badge-warning',
    isUrgent: diffDays <= 7
  };
};
