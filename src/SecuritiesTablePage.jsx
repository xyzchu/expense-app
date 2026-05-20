import React from 'react';
import { BarChart3, Repeat2, Star, TrendingUp } from 'lucide-react';
import { SegmentedTabs } from './ui';

const TransactionsTab = React.lazy(() => import('./TransactionsTab'));
const SecuritiesStatisticsTab = React.lazy(() => import('./SecuritiesStatisticsTab'));
const WatchlistTab = React.lazy(() => import('./WatchlistTab'));

export const SECURITY_TABLE_TYPES = ['pnl', 'watchlist', 'statistics', 'transactions'];

const tableTypeTabs = [
  { id: 'pnl', icon: TrendingUp, label: 'P&L' },
  { id: 'watchlist', icon: Star, label: 'Watchlist' },
  { id: 'statistics', icon: BarChart3, label: 'Statistics' },
  { id: 'transactions', icon: Repeat2, label: 'Transactions' },
];

export default function SecuritiesTablePage({
  user,
  sb,
  showToast,
  sendNotification,
  tableType,
  onTableTypeChange,
}) {
  const activeTableType = SECURITY_TABLE_TYPES.includes(tableType) ? tableType : 'pnl';

  return (
    <div style={{ paddingBottom: 24 }}>
      <SegmentedTabs
        tabs={tableTypeTabs}
        value={activeTableType}
        onChange={onTableTypeChange}
      />

      <React.Suspense fallback={<div style={{ padding: '20px 16px' }}>Loading table...</div>}>
        {activeTableType === 'pnl' && (
          <TransactionsTab
            user={user}
            sb={sb}
            showToast={showToast}
            sendNotification={sendNotification}
            forcedView="pnl"
            showViewToggle={false}
            embedded
            pnlTableOnly
          />
        )}
        {activeTableType === 'watchlist' && (
          <WatchlistTab user={user} sb={sb} showToast={showToast} />
        )}
        {activeTableType === 'statistics' && (
          <SecuritiesStatisticsTab user={user} sb={sb} showToast={showToast} />
        )}
        {activeTableType === 'transactions' && (
          <TransactionsTab
            user={user}
            sb={sb}
            showToast={showToast}
            sendNotification={sendNotification}
            forcedView="ledger"
            showViewToggle={false}
            embedded
          />
        )}
      </React.Suspense>
    </div>
  );
}
