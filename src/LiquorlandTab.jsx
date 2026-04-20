import React from 'react';
import ChecklistPage from './ChecklistPage';

const ITEMS = [
  { id: 'a', label: '影相' },
  { id: 'b', label: '打卡' },
  { id: 'c', label: '記錄入門' },
  { id: 'd', label: '記錄收銀枱顧客' },
  { id: 'e', label: '記錄收銀枱員工' },
  { id: 'f', label: '有冇打招呼？幾耐？' },
  { id: 'g', label: '在店舖等5分鐘' },
  { id: 'h', label: '「Looking for Rosé about $10-20, dinner with fds, something smooth」' },
  { id: 'i', label: '佢講乜？' },
  { id: 'j', label: '咩名？' },
  { id: 'k', label: '咩頭髮顏色？' },
  { id: 'sec', label: '收銀處', section: true },
  { id: 'l', label: '咩名？' },
  { id: 'm', label: '咩髮色？' },
  { id: 'n', label: '有冇up sell特價？' },
  { id: 'o', label: '拎收據' },
];

export default function LiquorlandTab() {
  return (
    <ChecklistPage
      storageKey="liquorland"
      title="Liquorland"
      subtitle="Mystery Shopper Checklist"
      filename="liquorland"
      items={ITEMS}
    />
  );
}
