import React from 'react';
import sb from './supabaseClient';
import { SHELL_HEADING_STYLE } from './appConstants';
import { Table2, TrendingUp } from 'lucide-react';
import { SegmentedTabs } from './ui';

const FinancesTab = React.lazy(() => import('./FinancesTab'));
const SecuritiesTablePage = React.lazy(() => import('./SecuritiesTablePage'));
const TransactionsTab = React.lazy(() => import('./TransactionsTab'));
const NewsTab = React.lazy(() => import('./NewsTab'));

const SECURITY_TABLE_TYPES = ['pnl', 'watchlist', 'statistics', 'transactions'];

export default function InvestingTab({
  user, showToast, sendNotification, rates, txns, defCur, expenses, currentList,
  investingView,
  investingPortfolioView,
  investingSecuritiesView,
  setInvestingSecuritiesView,
  pushSupported,
  pushSubscribed,
  pushLoading,
  pushSubscribe,
  pushUnsubscribe,
}) {
  const [securitiesTableType, setSecuritiesTableType] = React.useState('pnl');
  React.useEffect(() => {
    if (SECURITY_TABLE_TYPES.includes(investingSecuritiesView) && investingSecuritiesView !== 'pnl') {
      setSecuritiesTableType(investingSecuritiesView);
    }
  }, [investingSecuritiesView]);

  const portfolioViewOptions = [
    { id: 'summary_analytics', icon: TrendingUp, label: 'Overview' },
    { id: 'table', icon: Table2, label: 'Holdings' },
  ];
  const initialPortfolioView = ['summary', 'statistics'].includes(investingPortfolioView)
    ? 'summary_analytics'
    : (investingPortfolioView === 'portfolio' ? 'table' : investingPortfolioView);
  const financeProps = {
    user, sb, showToast, rates,
    balanceTxns: txns,
    balanceCurrency: defCur,
    expenseEntries: expenses,
    expenseListName: currentList?.name || '',
    expenseListCurrency: defCur,
    embedded: true,
    title: 'Investing',
  };
  const securitiesSection = investingSecuritiesView === 'pnl' ? 'pnl' : 'table';
  const securitiesSectionTabs = [
    { id: 'pnl', icon: TrendingUp, label: 'P&L' },
    { id: 'table', icon: Table2, label: 'Table' },
  ];
  const handleSecuritiesSectionChange = (value) => {
    setInvestingSecuritiesView(value === 'pnl' ? 'pnl' : 'table');
  };
  const showSecuritiesTable = investingView === 'securities'
    && (investingSecuritiesView === 'table' || SECURITY_TABLE_TYPES.includes(investingSecuritiesView));

  return (
    <div>
      <div style={{ padding: '32px 16px 0' }}>
        <div style={SHELL_HEADING_STYLE}>INVESTING</div>
      </div>

      {investingView === 'portfolio' && (
        <FinancesTab
          {...financeProps}
          sendNotification={sendNotification}
          showViewToggle
          viewOptions={portfolioViewOptions}
          initialView={initialPortfolioView}
        />
      )}
      {investingView === 'chat' && (
        <FinancesTab {...financeProps} sendNotification={sendNotification} forcedView="chat" showViewToggle={false} />
      )}
      {showSecuritiesTable && (
        <div style={{ paddingBottom: 24 }}>
          <SegmentedTabs
            tabs={securitiesSectionTabs}
            value={securitiesSection}
            onChange={handleSecuritiesSectionChange}
          />
          {securitiesSection === 'pnl' ? (
            <TransactionsTab
              user={user}
              sb={sb}
              showToast={showToast}
              sendNotification={sendNotification}
              forcedView="pnl"
              showViewToggle={false}
              embedded
              hidePnlTable
            />
          ) : (
            <SecuritiesTablePage
              user={user}
              sb={sb}
              showToast={showToast}
              sendNotification={sendNotification}
              tableType={securitiesTableType}
              onTableTypeChange={setSecuritiesTableType}
            />
          )}
        </div>
      )}
      {investingView === 'securities' && investingSecuritiesView === 'news' && (
        <NewsTab
          user={user}
          sb={sb}
          showToast={showToast}
          pushSupported={pushSupported}
          pushSubscribed={pushSubscribed}
          pushLoading={pushLoading}
          pushSubscribe={pushSubscribe}
          pushUnsubscribe={pushUnsubscribe}
        />
      )}
    </div>
  );
}
