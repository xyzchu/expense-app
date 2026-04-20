import React from 'react';
import ChecklistPage from './ChecklistPage';

const ITEMS = [
  { id: 'a', label: '影相' },
  { id: 'b', label: '打卡' },
  { id: 'c', label: '記錄入門' },
  { id: 'd', label: '餐牌區等30秒，無人就拎牌去排隊' },
  { id: 'e', label: '記錄排隊時間' },
  { id: 'f', label: '「Not Sure, prefer order at the counter」' },
  { id: 'g', label: 'No Relish Program' },
  { id: 'h', label: 'No Local Matters' },
  { id: 'i', label: '記錄排隊時間' },
  { id: 'j', label: '"Simply Grill\'d, and a small chips"' },
  { id: 'k', label: '不要問收據！' },
  { id: 'l', label: '記錄到餐時間' },
  { id: 'm', label: '打直側面照片各一' },
  { id: 'n', label: '有冇問好唔好味？' },
  { id: 'o', label: '有無三分鐘執枱' },
];

export default function GrilldTab() {
  return (
    <ChecklistPage
      storageKey="grilld"
      title="Grill'd"
      subtitle="Mystery Diner Checklist"
      filename="grilld"
      items={ITEMS}
    />
  );
}
