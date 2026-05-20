import React from 'react';
import { Copy, LogOut, Trash2, Check, X, Plus, Pencil, RefreshCw, Download, Upload } from 'lucide-react';
import { MONO, FS, CLAY } from './theme';
import { s, PERSON_COLORS, BASE_CATS, NO_DEC, ALL_CUR, CURR_FLAG } from './appConstants';
import sb from './supabaseClient';
import { PageShell } from './ui';
import { useSettingsBackup } from './settingsBackup';

const FinancesTab = React.lazy(() => import('./FinancesTab'));
const WEBHOOK_URL = 'https://datppieeeobzzmaighwt.supabase.co/functions/v1/expense-webhook';
const codeStyle = { background: CLAY.surf2, padding: '2px 6px', borderRadius: 4, color: CLAY.text, opacity: 1 };
const copyButtonStyle = { width: 32, height: 32, borderRadius: 12, border: 'none', background: CLAY.surf2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };

export default function SettingsTab({
  user, currentList, setCurrentList, members, confirmDeleteList, setConfirmDeleteList, deleteList,
  logout, showToast, defCur, ratesDate, rates, fetchRates, customCats, addCustomCat, deleteCustomCat,
  newCatName, setNewCatName, catSuggestions, setCatSuggestions, overrideDrafts, setOverrideDrafts,
  suggestionExamples, renameCategorySuggestion, updateCategorySuggestion, allCatNames,
  acceptCategorySuggestion, dismissCategorySuggestion, catOverrides, setCatOverrides,
  overrideExamples, renameCatOverride, updateCatOverride, deleteCatOverride,
  saveSetting, setCustomCats, setExpenses, onImported,
  pushSupported, pushPermission, pushSubscribed, pushLoading, pushSubscribe, pushUnsubscribe, sendNotification,
  notificationPrefs = {}, updateNotificationPrefs,
  webhookToken, webhookLoading, generateWebhookToken, revokeWebhookToken,
  editName, setEditName, nameEditing, setNameEditing, updateMyName, can, setTab,
  txns = [], expenses = [],
}) {
  const [showLearnedCategories, setShowLearnedCategories] = React.useState(false);
  const {
    exportGroupOptions,
    selectedExportGroups,
    setSelectedExportGroups,
    exportJSON,
    exportCSV,
    importJSON,
    importCSV,
    fileRef,
    csvRef,
  } = useSettingsBackup({
    user,
    currentList,
    members,
    showToast,
    saveSetting,
    setExpenses,
    setCatOverrides,
    setCatSuggestions,
    setCustomCats,
    onImported,
  });
  const visibleCategorySuggestions = Object.entries(catSuggestions)
    .filter(([w]) => (suggestionExamples[w]?.total || 0) > 3)
    .sort(([a], [b]) => a.localeCompare(b));
  const notificationOptions = [
    { id: 'expense', label: 'Expenses', help: 'New and edited expenses' },
    { id: 'settlement', label: 'Settlements', help: 'Recorded settle-up payments' },
    { id: 'news', label: 'Market news', help: 'News fetch results' },
    { id: 'pnl', label: 'P&L refresh', help: 'Securities refresh completion' },
    { id: 'ai', label: 'AI responses', help: 'Finance chat replies' },
  ];
  const macroDroidPostBody = webhookToken
    ? `{"secret":"${webhookToken}","text":"{v=ExpenseMerchant} {v=ExpenseCurrency} {v=ExpenseAmount} {v=ExpenseSplit}"}`
    : '';
  const toggleNotificationPref = (id) => {
    updateNotificationPrefs?.({ ...notificationPrefs, [id]: notificationPrefs[id] === false });
  };

  return (
    <PageShell title="SETTINGS">
      <div style={{ ...s.card, marginBottom: 12 }}>
        <div style={{ ...s.label, marginBottom: 12 }}>Session</div>
        <div style={{ fontSize: FS.lg, ...s.upper, opacity: 0.5, marginBottom: 4 }}>Logged in as <strong style={{ opacity: 1 }}>{user.email}</strong></div>
        <div style={{ fontSize: FS.lg, ...s.upper, opacity: 0.5, marginBottom: 12 }}>List: <strong style={{ opacity: 1 }}>{currentList.name}</strong></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={s.sm(false)} onClick={() => {
            setCurrentList(null);
            localStorage.removeItem('splitease_list');
            localStorage.removeItem('splitease_list_meta');
            setTab('home');
          }}>Switch List</button>
          <button style={{ ...s.sm(false), color: CLAY.red, display: 'flex', alignItems: 'center', gap: 4 }} onClick={logout}><LogOut size={12} /> Log Out</button>
        </div>
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${CLAY.surf2}` }}>
          {!confirmDeleteList ? (
            <button style={{ ...s.ghost, fontSize: FS.lg, color: CLAY.red, opacity: 0.5 }} onClick={() => setConfirmDeleteList(true)}>Delete this list…</button>
          ) : (
            <div style={{ background: 'rgba(220, 38, 38, 0.08)', borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: FS.lg, fontWeight: 700, color: CLAY.red, ...s.upper, marginBottom: 4 }}>Delete "{currentList.name}"?</div>
              <div style={{ fontSize: FS.lg, color: CLAY.red, opacity: 0.6, marginBottom: 8 }}>This will permanently delete everything. Cannot be undone.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...s.sm(true), background: CLAY.red, display: 'flex', alignItems: 'center', gap: 4 }} onClick={deleteList}><Trash2 size={12} /> Yes, delete</button>
                <button style={s.sm(false)} onClick={() => setConfirmDeleteList(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ ...s.card, marginBottom: 12 }}>
        <div style={{ ...s.label, marginBottom: 8 }}>Invite Code</div>
        <div style={{ background: CLAY.surf2, padding: '12px 14px', borderRadius: 12, fontSize: FS.lg, fontWeight: 700, letterSpacing: '0.1em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{currentList.invite_code}</span>
          <button onClick={() => { navigator.clipboard?.writeText(currentList.invite_code); showToast('Copied!'); }}
            style={copyButtonStyle}>
            <Copy size={14} />
          </button>
        </div>
        <div style={{ fontSize: FS.lg, ...s.upper, opacity: 0.25, marginTop: 8 }}>Share this code so others can join</div>
      </div>

      <div style={{ ...s.card, marginBottom: 12 }}>
        <div style={{ ...s.label, marginBottom: 12 }}>Members ({members.length})</div>
        {members.map((m, i) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: CLAY.surf2, borderRadius: 12, marginBottom: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: CLAY.surface, fontSize: FS.lg, fontWeight: 700, flexShrink: 0, background: PERSON_COLORS[i % PERSON_COLORS.length] }}>
              {m.display_name?.[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {m.user_id === user.id && nameEditing ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...s.input, flex: 1, padding: '6px 10px', fontSize: 16 }} />
                  <button onClick={() => { updateMyName(editName); setNameEditing(false); showToast('Name updated'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: CLAY.green }}><Check size={16} /></button>
                  <button onClick={() => setNameEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4 }}><X size={16} /></button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: FS.lg, fontWeight: 700, ...s.upper }}>{m.display_name}</span>
                  {m.user_id === user.id && <>
                    <span style={{ fontSize: FS.lg, ...s.upper, fontWeight: 700, background: CLAY.surf2, padding: '2px 6px', borderRadius: 9999 }}>you</span>
                    <button onClick={() => { setEditName(m.display_name); setNameEditing(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.3, marginLeft: 4 }}><Pencil size={12} /></button>
                  </>}
                </div>
              )}
              <div style={{ fontSize: FS.lg, opacity: 0.35, letterSpacing: '0.04em', marginTop: 1 }}>{m.email}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...s.card, marginBottom: 12 }}>
        <div style={{ ...s.label, marginBottom: 8 }}>Currency & Exchange Rates</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ background: CLAY.text, color: CLAY.surface, padding: '8px 14px', borderRadius: 12, fontSize: FS.lg, fontWeight: 700, letterSpacing: '0.1em' }}>{defCur}</span>
          <span style={{ fontSize: FS.lg, ...s.upper, opacity: 0.35 }}>Set at list creation</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: FS.lg, opacity: 0.4 }}>Rates: {ratesDate || 'N/A'}</span>
          <button onClick={() => { fetchRates(defCur); showToast('Rates refreshed'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: CLAY.text, opacity: 0.4 }}><RefreshCw size={12} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {ALL_CUR.filter(c => c !== defCur).map(c => (
            <div key={c} style={{ background: CLAY.surf2, borderRadius: 12, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: FS.lg }}>
              <span style={{ fontWeight: 700, ...s.upper }}>{CURR_FLAG[c] || ''} {c}</span>
              <span style={{ opacity: 0.4, ...s.tabnum }}>{rates[c] ? rates[c].toFixed(NO_DEC.has(c) ? 0 : 2) : '–'}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: FS.lg, ...s.upper, opacity: 0.25, marginTop: 8 }}>1 {defCur} = listed amount in each currency</div>
      </div>

      <div style={{ ...s.card, marginBottom: 12 }}>
        <div style={{ ...s.label, marginBottom: 8 }}>Categories</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
          {Object.entries(BASE_CATS).map(([n, c]) => (
            <span key={n} style={s.tag(c.bg, c.tx)}>{c.emoji} {n}</span>
          ))}
          {Object.entries(customCats).map(([n, c]) => (
            <span key={n} style={{ ...s.tag(c.bg || CLAY.surf2, c.tx || CLAY.text), display: 'flex', alignItems: 'center', gap: 4 }}>
              {c.emoji} {n}
              <button onClick={() => deleteCustomCat(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, padding: 0, lineHeight: 1 }}><X size={10} /></button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="New category…" value={newCatName} onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCustomCat(); }} style={{ ...s.input, flex: 1 }} />
          <button style={s.sm(true)} onClick={addCustomCat}><Plus size={14} /></button>
        </div>
      </div>

      {visibleCategorySuggestions.length > 0 && (
        <div style={{ ...s.card, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={s.label}>Category Suggestions</div>
            <button style={{ ...s.ghost, fontSize: FS.lg, color: CLAY.red, opacity: 0.6, padding: 0 }} onClick={() => { setCatSuggestions({}); saveSetting('categorySuggestions', {}); showToast('Cleared all suggestions'); }}>Clear all</button>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {visibleCategorySuggestions.map(([w, suggestion]) => (
              <div key={w} style={{ display: 'grid', gap: 6, background: CLAY.surf2, padding: '8px 10px', borderRadius: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 8, alignItems: 'center' }}>
                  <input
                    value={Object.prototype.hasOwnProperty.call(overrideDrafts, w) ? overrideDrafts[w] : w}
                    onChange={e => setOverrideDrafts(prev => ({ ...prev, [w]: e.target.value }))}
                    onBlur={() => renameCategorySuggestion(w)}
                    onKeyDown={e => { if (e.key === 'Enter') renameCategorySuggestion(w); }}
                    style={{ ...s.input, padding: '8px 10px', fontSize: 16, background: CLAY.surface, wordBreak: 'break-word' }}
                  />
                  <select
                    value={suggestion.category}
                    onChange={e => updateCategorySuggestion(w, { category: e.target.value })}
                    style={{ fontSize: FS.lg, fontFamily: MONO, fontWeight: 600, letterSpacing: '0.06em', background: CLAY.surface, border: `1px solid ${CLAY.surf2}`, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', outline: 'none' }}
                  >
                    {allCatNames.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <button onClick={() => renameCategorySuggestion(w)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, padding: 0, lineHeight: 1 }}><Check size={12} /></button>
                  <button onClick={() => acceptCategorySuggestion(w)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, padding: 0, lineHeight: 1, color: CLAY.green }}><Check size={14} /></button>
                  <button onClick={() => dismissCategorySuggestion(w)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, padding: 0, lineHeight: 1 }}><X size={12} /></button>
                </div>
                <div style={{ fontSize: FS.lg, opacity: 0.5, lineHeight: 1.5 }}>
                  Suggested from "{suggestion.source || w}"{suggestion.autoCategory ? ` instead of ${suggestion.autoCategory}` : ''}.
                  {suggestionExamples[w]?.total > 0 ? ` Seen ${suggestionExamples[w].total} time${suggestionExamples[w].total === 1 ? '' : 's'}: ${suggestionExamples[w].examples.map((example) => `"${example}"`).join(', ')}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(catOverrides).length > 0 && (
        <div style={{ ...s.card, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setShowLearnedCategories(v => !v)}
              style={{ ...s.ghost, fontSize: FS.lg, opacity: 0.65, padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span style={s.label}>Learned Categories</span>
              <span>{showLearnedCategories ? 'Hide' : 'Show'}</span>
            </button>
            {showLearnedCategories && (
              <button style={{ ...s.ghost, fontSize: FS.lg, color: CLAY.red, opacity: 0.6, padding: 0 }} onClick={() => { setCatOverrides({}); saveSetting('categoryOverrides', {}); showToast('Cleared all overrides'); }}>Clear all</button>
            )}
          </div>
          {showLearnedCategories ? (
            <div style={{ display: 'grid', gap: 6 }}>
              {Object.entries(catOverrides).sort(([a], [b]) => a.localeCompare(b)).map(([w, c]) => (
              <div key={w} style={{ display: 'grid', gap: 6, background: CLAY.surf2, padding: '8px 10px', borderRadius: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, alignItems: 'center' }}>
                  <input
                    value={Object.prototype.hasOwnProperty.call(overrideDrafts, w) ? overrideDrafts[w] : w}
                    onChange={e => setOverrideDrafts(prev => ({ ...prev, [w]: e.target.value }))}
                    onBlur={() => renameCatOverride(w)}
                    onKeyDown={e => { if (e.key === 'Enter') renameCatOverride(w); }}
                    style={{ ...s.input, padding: '8px 10px', fontSize: 16, background: CLAY.surface, wordBreak: 'break-word' }}
                  />
                  <select
                    value={c}
                    onChange={e => updateCatOverride(w, e.target.value)}
                    style={{ fontSize: FS.lg, fontFamily: MONO, fontWeight: 600, letterSpacing: '0.06em', background: CLAY.surface, border: `1px solid ${CLAY.surf2}`, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', outline: 'none' }}
                  >
                    {allCatNames.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <button onClick={() => renameCatOverride(w)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, padding: 0, lineHeight: 1 }}><Check size={12} /></button>
                  <button onClick={() => deleteCatOverride(w)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, padding: 0, lineHeight: 1 }}><X size={12} /></button>
                </div>
                {overrideExamples[w]?.total > 0 && (
                  <div style={{ fontSize: FS.lg, opacity: 0.5, lineHeight: 1.5 }}>
                    Seen {overrideExamples[w].total} time{overrideExamples[w].total === 1 ? '' : 's'}:
                    {' '}
                    {overrideExamples[w].examples.map((example, index) => (
                      <span key={example}>"{example}"{index < overrideExamples[w].examples.length - 1 ? ', ' : ''}</span>
                    ))}
                  </div>
                )}
              </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: FS.lg, ...s.upper, opacity: 0.35 }}>
              {Object.keys(catOverrides).length} learned categor{Object.keys(catOverrides).length === 1 ? 'y' : 'ies'} hidden
            </div>
          )}
        </div>
      )}

      <div style={{ ...s.card, marginBottom: 12 }}>
        <div style={{ ...s.label, marginBottom: 8 }}>Full App Backup</div>
        {exportGroupOptions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: FS.lg, ...s.upper, opacity: 0.45 }}>Export Options</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  style={{ ...s.ghost, fontSize: FS.lg, padding: 0, opacity: 0.5 }}
                  onClick={() => setSelectedExportGroups?.(exportGroupOptions.map(group => group.id))}
                >
                  All
                </button>
                <button
                  type="button"
                  style={{ ...s.ghost, fontSize: FS.lg, padding: 0, opacity: 0.5 }}
                  onClick={() => setSelectedExportGroups?.([])}
                >
                  None
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {exportGroupOptions.map(group => {
                const checked = selectedExportGroups.includes(group.id);
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedExportGroups?.(prev => (
                      prev.includes(group.id)
                        ? prev.filter(id => id !== group.id)
                        : [...prev, group.id]
                    ))}
                    style={{
                      ...s.sm(checked),
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      gap: 6,
                      minHeight: 34,
                    }}
                  >
                    <span style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      border: checked ? `1px solid ${CLAY.text}` : `1px solid ${CLAY.textLt}`,
                      background: checked ? CLAY.text : CLAY.surface,
                      color: CLAY.surface,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {checked ? <Check size={10} /> : null}
                    </span>
                    {group.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button style={{ ...s.sm(false), textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} onClick={exportJSON}><Download size={12} /> Export JSON</button>
          <button style={{ ...s.sm(false), textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} onClick={exportCSV}><Download size={12} /> Export CSV</button>
          <button style={{ ...s.sm(false), textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} onClick={() => fileRef.current?.click()}><Upload size={12} /> Import JSON</button>
          <button style={{ ...s.sm(false), textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} onClick={() => csvRef.current?.click()}><Upload size={12} /> Import CSV</button>
        </div>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importJSON} />
        <input ref={csvRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={importCSV} />
        <div style={{ fontSize: FS.lg, ...s.upper, opacity: 0.35, marginTop: 8 }}>
          JSON is importable backup data. CSV opens as readable separated tables for the selected data types.
        </div>
      </div>

      {can?.('investing') && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ ...s.card, marginBottom: 8 }}>
            <div style={{ ...s.label, marginBottom: 6 }}>Investing Tools</div>
            <div style={{ fontSize: FS.lg, ...s.upper, opacity: 0.35 }}>
              xAI model settings and financial data tools now live here with the rest of Settings.
            </div>
          </div>
          <React.Suspense fallback={<div style={{ ...s.card, marginBottom: 12, opacity: 0.5 }}>Loading investing tools...</div>}>
            <FinancesTab
              user={user}
              sb={sb}
              showToast={showToast}
              rates={rates}
              balanceTxns={txns}
              balanceCurrency={defCur}
              expenseEntries={expenses}
              expenseListName={currentList?.name || ''}
              expenseListCurrency={defCur}
              embedded
              forcedView="settings"
              showViewToggle={false}
              title="Investing"
            />
          </React.Suspense>
        </div>
      )}

      <div style={{ ...s.card, marginBottom: 12 }}>
          <div style={{ ...s.label, marginBottom: 8 }}>Push Notifications</div>
          {!pushSupported ? (
            <div style={{ fontSize: FS.lg, opacity: 0.5, lineHeight: 1.6 }}>
              Push notifications are not supported in this browser.
            </div>
          ) : (
            <div>
              <div style={{ fontSize: FS.lg, opacity: 0.5, marginBottom: 10 }}>
                {pushPermission === 'denied'
                  ? 'Notifications are blocked in your browser settings. Change the site permission, then tap enable again.'
                  : pushSubscribed
                  ? "You'll receive notifications for the enabled types below."
                  : 'Get notified when enabled events happen in this list.'}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  style={{ ...s.sm(!pushSubscribed), display: 'flex', alignItems: 'center', gap: 4, opacity: pushPermission === 'denied' ? 0.6 : 1 }}
                  onClick={pushSubscribe}
                  disabled={pushLoading || pushSubscribed}
                >
                  {pushLoading && !pushSubscribed ? 'Enabling…' : 'Enable notifications'}
                </button>
                <button
                  style={{ ...s.sm(false), display: 'flex', alignItems: 'center', gap: 4, opacity: pushSubscribed ? 1 : 0.45 }}
                  onClick={() => { showToast('Sending test…'); sendNotification('🔔 Test', 'Push notifications are working!', 'test'); }}
                  disabled={!pushSubscribed}
                >
                  Send test notification
                </button>
                <button
                  style={{ ...s.sm(false), display: 'flex', alignItems: 'center', gap: 4, color: CLAY.red, opacity: pushSubscribed ? 1 : 0.45 }}
                  onClick={pushUnsubscribe}
                  disabled={pushLoading || !pushSubscribed}
                >
                  {pushLoading && pushSubscribed ? 'Turning off…' : 'Turn off'}
                </button>
              </div>
              {/iphone|ipad|ipod/i.test(navigator.userAgent) && pushPermission !== 'granted' && (
                <div style={{ fontSize: FS.lg, opacity: 0.4, marginTop: 6 }}>
                  On iOS, install SplitEase to your Home Screen first (Share → Add to Home Screen).
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${CLAY.surf2}` }}>
            <div style={{ ...s.label, marginBottom: 8 }}>Notification Types</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {notificationOptions.map((option) => {
                const active = notificationPrefs[option.id] !== false;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleNotificationPref(option.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      width: '100%',
                      border: 'none',
                      borderRadius: 12,
                      background: CLAY.surf2,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      fontFamily: MONO,
                      textAlign: 'left',
                    }}
                  >
                    <span>
                      <span style={{ display: 'block', fontSize: FS.lg, fontWeight: 700 }}>{option.label}</span>
                      <span style={{ display: 'block', fontSize: FS.lg, opacity: 0.45, marginTop: 2 }}>{option.help}</span>
                    </span>
                    <span style={{
                      fontSize: FS.lg,
                      fontWeight: 700,
                      color: active ? CLAY.green : CLAY.textLt,
                      background: active ? 'rgba(22, 163, 74, 0.12)' : CLAY.surf2,
                      borderRadius: 9999,
                      padding: '4px 9px',
                      flexShrink: 0,
                    }}>
                      {active ? 'On' : 'Off'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

      {can('webhook') && (
        <div style={{ ...s.card, marginBottom: 12 }}>
          <div style={{ ...s.label, marginBottom: 8 }}>Auto-Add from Bank Notifications</div>
          <div style={{ fontSize: FS.lg, opacity: 0.5, lineHeight: 1.6, marginBottom: 10 }}>
            Use MacroDroid on Android to automatically add expenses when you receive a bank or Google Wallet notification.
          </div>
          {!webhookToken ? (
            <button style={{ ...s.sm(true), display: 'flex', alignItems: 'center', gap: 4 }} onClick={generateWebhookToken} disabled={webhookLoading}>
              {webhookLoading ? 'Generating…' : 'Generate webhook token'}
            </button>
          ) : (
            <div>
              <div style={{ fontSize: FS.lg, ...s.upper, opacity: 0.4, marginBottom: 4 }}>Webhook URL</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <code style={{ fontSize: FS.lg, background: CLAY.surf2, padding: '6px 8px', borderRadius: 8, flex: 1, wordBreak: 'break-all', lineHeight: 1.6 }}>
                  {WEBHOOK_URL}
                </code>
                <button onClick={() => { navigator.clipboard?.writeText(WEBHOOK_URL); showToast('URL copied'); }}
                  style={copyButtonStyle}>
                  <Copy size={12} />
                </button>
              </div>
              <div style={{ fontSize: FS.lg, ...s.upper, opacity: 0.4, marginBottom: 4 }}>Secret token (keep private)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <code style={{ fontSize: FS.lg, background: CLAY.surf2, padding: '6px 8px', borderRadius: 8, flex: 1, wordBreak: 'break-all', letterSpacing: '0.05em' }}>
                  {webhookToken}
                </code>
                <button onClick={() => { navigator.clipboard?.writeText(webhookToken); showToast('Token copied'); }}
                  style={copyButtonStyle}>
                  <Copy size={12} />
                </button>
              </div>
              <div style={{ fontSize: FS.lg, ...s.upper, opacity: 0.4, marginBottom: 4 }}>MacroDroid POST body (Content Body tab)</div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                <code style={{ fontSize: FS.lg, background: CLAY.surf2, padding: '6px 8px', borderRadius: 8, flex: 1, wordBreak: 'break-all', lineHeight: 1.8 }}>
                  {macroDroidPostBody}
                </code>
                <button onClick={() => { navigator.clipboard?.writeText(macroDroidPostBody); showToast('Body copied'); }}
                  style={{ ...copyButtonStyle, marginTop: 2 }}>
                  <Copy size={12} />
                </button>
              </div>
              <div style={{ fontSize: FS.lg, opacity: 0.35, lineHeight: 1.6, marginBottom: 10 }}>
                <code style={codeStyle}>{'{v=ExpenseSplit}'}</code> is a number 0–100 = other person's share. <code style={codeStyle}>0</code> = personal · <code style={codeStyle}>50</code> = equal · <code style={codeStyle}>100</code> = fully theirs · <code style={codeStyle}>30</code> = you 70%, them 30%
              </div>
              <button style={{ ...s.ghost, fontSize: FS.lg, color: CLAY.red, opacity: 0.5, padding: 0 }} onClick={revokeWebhookToken}>Revoke token</button>
            </div>
          )}
        </div>
      )}

      <div style={{ ...s.card, marginBottom: 12 }}>
        <div style={{ ...s.label, marginBottom: 8 }}>Quick Add Tips</div>
        <div style={{ fontSize: FS.lg, letterSpacing: '0.04em', opacity: 0.4, lineHeight: 1.8 }}>
          <div><code style={codeStyle}>dinner 50</code> — equal split in {defCur}</div>
          <div><code style={codeStyle}>coffee ¥500</code> — auto-converts from CNY</div>
          <div><code style={codeStyle}>taxi 30 Alice paid</code> — Alice paid</div>
          <div><code style={codeStyle}>groceries 80 personal</code> — no split</div>
          <div><code style={codeStyle}>dinner 120 for Bob</code> — 100% Bob's</div>
          <div><code style={codeStyle}>rent 900 60/40</code> — custom ratio</div>
          <div><code style={codeStyle}>gift 50 70% Alice</code> — 70% Alice, rest split</div>
          <div><code style={codeStyle}>restaurant $10 Roland 3</code> — Roland $3, rest split by others</div>
          <div><code style={codeStyle}>diesel 80 #transport</code> — quick category tag</div>
          <div><code style={codeStyle}>bonus 500 category income</code> — explicit category</div>
          <div><code style={codeStyle}>movie 20 as entertainment</code> — natural category wording</div>
        </div>
      </div>

      {can('webhook') && (
        <div style={{ ...s.card, marginBottom: 12, borderLeft: `3px solid ${CLAY.surf2}` }}>
          <div style={{ ...s.label, marginBottom: 8 }}>Feature Permissions</div>
          <div style={{ fontSize: FS.lg, opacity: 0.5, lineHeight: 1.8, marginBottom: 10 }}>
            Manage which users can access restricted features via the Supabase Table Editor.
          </div>
          <div style={{ fontSize: FS.lg, lineHeight: 2, opacity: 0.6 }}>
            <div>1. Go to <strong style={{ opacity: 1 }}>supabase.com</strong> → your project</div>
            <div>2. Table Editor → <code style={codeStyle}>user_permissions</code></div>
            <div>3. Insert a row with the user's <strong style={{ opacity: 1 }}>email</strong> and one of:</div>
            <div style={{ paddingLeft: 12, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {['investing', 'webhook', 'shopper'].map(f => (
                <code key={f} style={{ ...codeStyle, padding: '2px 8px', display: 'inline-block', width: 'fit-content' }}>{f}</code>
              ))}
            </div>
            <div style={{ marginTop: 6 }}>4. Delete the row to revoke access.</div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
