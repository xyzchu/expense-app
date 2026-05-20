import React from 'react';
import { Settings2, X } from 'lucide-react';
import { CLAY, FS, FW, MONO } from './theme';
import { SHELL_HEADING_STYLE } from './appConstants';

export const UI = {
  // Expense page is the visual source of truth: soft white cards, CLAY.surf2 controls,
  // 16px readable text, and roomy rounded surfaces.
  pageX: 16,
  pageTop: 32,
  bottomNavSpace: 80,
  sectionGap: 12,
  cardRadius: 20,
  controlRadius: 12,
  activeShadow: '0 1px 3px rgba(0,0,0,0.1)',
  modalBackdrop: 'rgba(44,36,32,0.46)',
};

export function PageShell({ title, actions = null, children, bottomSpace = UI.bottomNavSpace, style = {} }) {
  return (
    <div style={{ padding: `${UI.pageTop}px ${UI.pageX}px ${bottomSpace}px`, color: CLAY.text, fontFamily: MONO, ...style }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div style={SHELL_HEADING_STYLE}>{title}</div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function Card({ children, compact = false, style = {} }) {
  return (
    <div
      style={{
        background: CLAY.surface,
        borderRadius: UI.cardRadius,
        boxShadow: CLAY.shadow,
        padding: compact ? 16 : 20,
        marginBottom: UI.sectionGap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = 'secondary',
  active = false,
  danger = false,
  disabled = false,
  style = {},
  ...props
}) {
  const isPrimary = variant === 'primary' || active;
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        border: 'none',
        borderRadius: variant === 'pill' ? 9999 : UI.controlRadius,
        padding: variant === 'icon' ? 8 : (variant === 'primary' ? '10px 14px' : '8px 14px'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: MONO,
        fontSize: FS.lg,
        fontWeight: isPrimary ? FW.semibold : FW.normal,
        background: isPrimary ? CLAY.text : CLAY.surf2,
        color: danger ? CLAY.red : (isPrimary ? CLAY.surface : CLAY.textMid),
        boxShadow: isPrimary ? '4px 4px 12px rgba(44,36,32,0.28)' : CLAY.btn,
        opacity: disabled ? 0.45 : 1,
        transition: 'all 0.15s',
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({ children, size = 36, danger = false, style = {}, ...props }) {
  return (
    <button
      type="button"
      style={{
        width: size,
        height: size,
        borderRadius: UI.controlRadius,
        border: 'none',
        background: CLAY.surf2,
        color: danger ? CLAY.red : CLAY.textMid,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: CLAY.btn,
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ as: Comp = 'input', style = {}, ...props }) {
  return (
    <Comp
      style={{
        width: '100%',
        background: CLAY.surf2,
        border: 'none',
        borderRadius: UI.controlRadius,
        padding: '12px 14px',
        fontSize: FS.lg,
        color: CLAY.text,
        outline: 'none',
        letterSpacing: '0.04em',
        fontFamily: MONO,
        boxSizing: 'border-box',
        ...style,
      }}
      {...props}
    />
  );
}

export const modalBackdropStyle = ({ align = 'center', zIndex = 110, padding = 24 } = {}) => ({
  position: 'fixed',
  inset: 0,
  background: UI.modalBackdrop,
  zIndex,
  display: 'flex',
  alignItems: align === 'sheet' ? 'flex-end' : 'center',
  justifyContent: 'center',
  padding: align === 'sheet' ? 0 : padding,
});

export const modalSurfaceStyle = ({ sheet = false, maxWidth = 380, maxHeight = null } = {}) => ({
  background: CLAY.surface,
  borderRadius: sheet ? `${UI.cardRadius}px ${UI.cardRadius}px 0 0` : UI.cardRadius,
  boxShadow: CLAY.shadow,
  padding: 24,
  width: '100%',
  maxWidth,
  ...(maxHeight ? { maxHeight, overflowY: 'auto' } : {}),
});

export const tableStyle = {
  borderCollapse: 'collapse',
  width: 'max-content',
  minWidth: 'max-content',
  tableLayout: 'fixed',
};

export const tableColumnStyle = ({
  width,
  min = 64,
  maxVw = 25,
  action = false,
} = {}) => ({
  width: action ? 36 : `clamp(${min}px, ${width || min}px, ${maxVw}vw)`,
});

export const tableHeaderRowStyle = {
  background: CLAY.surf2,
};

export const tableRowStyle = {
  borderBottom: `1px solid ${CLAY.surf2}`,
};

export const tableHeaderCellStyle = ({ sticky = false, align = 'left', padding = '8px' } = {}) => ({
  fontFamily: MONO,
  fontSize: FS.lg,
  fontWeight: FW.semibold,
  letterSpacing: '0.08em',
  color: CLAY.text,
  textAlign: align,
  padding,
  borderBottom: `1px solid ${CLAY.surf2}`,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  boxSizing: 'border-box',
  opacity: 1,
  background: CLAY.surf2,
  ...(sticky ? { position: 'sticky', left: 0, zIndex: 3 } : {}),
});

export const tableCellStyle = ({
  sticky = false,
  align = 'left',
  padding = '8px',
  emphasis = false,
  ellipsis = false,
  nowrap = true,
} = {}) => ({
  padding,
  verticalAlign: 'middle',
  textAlign: align,
  fontFamily: MONO,
  fontSize: FS.lg,
  color: CLAY.text,
  fontWeight: emphasis ? FW.semibold : FW.normal,
  fontVariantNumeric: 'tabular-nums',
  boxSizing: 'border-box',
  whiteSpace: nowrap ? 'nowrap' : 'normal',
  ...(ellipsis ? { overflow: 'hidden', textOverflow: 'ellipsis' } : {}),
  ...(sticky ? {
    position: 'sticky',
    left: 0,
    background: CLAY.surface,
    zIndex: 2,
    boxShadow: '8px 0 14px -12px rgba(44,36,32,0.24)',
  } : {}),
});

export function ModalHeader({ title, onClose, children = null, style = {} }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, ...style }}>
      <div style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: FW.semibold, color: CLAY.text }}>{title}</div>
      {children}
      {onClose && (
        <IconButton size={32} onClick={onClose} style={{ boxShadow: 'none' }}>
          <X size={16} />
        </IconButton>
      )}
    </div>
  );
}

export function SegmentedTabs({ tabs, value, onChange, style = {}, compact = false }) {
  return (
    <div style={{ padding: '0 16px', ...style }}>
      <div style={{ display: 'flex', gap: 0, background: CLAY.surf2, borderRadius: UI.controlRadius, padding: 3, margin: compact ? '0 0 10px' : '8px 0 14px' }}>
        {tabs.map((tab) => {
          const active = value === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange?.(tab.id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                padding: '7px 4px',
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                fontFamily: MONO,
                fontSize: FS.lg,
                fontWeight: FW.semibold,
                background: active ? CLAY.surface : 'transparent',
                color: active ? CLAY.text : CLAY.textLt,
                boxShadow: active ? UI.activeShadow : 'none',
                transition: 'all 0.15s',
              }}
            >
              {Icon && <Icon size={13} />}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EmptyState({ children, style = {} }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: CLAY.textLt, fontFamily: MONO, fontSize: FS.lg, ...style }}>
      {children}
    </div>
  );
}

export function DataTableCard({
  title,
  subtitle = null,
  actions = null,
  onSettings = null,
  children,
  style = {},
  scrollStyle = {},
}) {
  return (
    <Card compact style={{ padding: 0, overflow: 'hidden', ...style }}>
      {(title || subtitle || actions || onSettings) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderBottom: `1px solid ${CLAY.surf2}` }}>
          <div style={{ minWidth: 0 }}>
            {title && <div style={{ fontFamily: MONO, fontSize: FS.lg, fontWeight: FW.semibold, color: CLAY.text, letterSpacing: '0.04em' }}>{title}</div>}
            {subtitle && <div style={{ marginTop: 3, fontFamily: MONO, fontSize: FS.lg, color: CLAY.textLt, lineHeight: 1.35 }}>{subtitle}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {actions}
            {onSettings && (
              <IconButton size={32} onClick={onSettings} title="Table settings">
                <Settings2 size={15} />
              </IconButton>
            )}
          </div>
        </div>
      )}
      <div style={{ overflowX: 'auto', ...scrollStyle }}>
        {children}
      </div>
    </Card>
  );
}

export function DataTableHeaderLabel({
  top,
  bottom = '',
  sortKey,
  sort,
  onSort,
}) {
  const active = sortKey && sort?.key === sortKey;
  const arrow = active ? (sort.direction === 'desc' ? '▼' : '▲') : '';
  const content = (
    <div style={{ display: 'grid', gap: 2, width: '100%', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0 }}>
        <span style={{ whiteSpace: 'normal', overflowWrap: 'normal', wordBreak: 'normal', lineHeight: 1.2 }}>{top}</span>
        {arrow && <span style={{ flexShrink: 0 }}>{arrow}</span>}
      </div>
      {bottom && (
        <>
          <div style={{ height: 1, background: CLAY.textLt, width: '100%', opacity: 0.8 }} />
          <div style={{ whiteSpace: 'normal', overflowWrap: 'normal', wordBreak: 'normal', lineHeight: 1.2, textAlign: 'center' }}>{bottom}</div>
        </>
      )}
    </div>
  );

  if (!onSort || !sortKey) return content;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
    >
      {content}
    </button>
  );
}

export function UnifiedDataTable({
  title,
  subtitle = null,
  actions = null,
  onSettings = null,
  settingsOpen = false,
  settingsPanel = null,
  columns = [],
  rows = [],
  sections = null,
  rowKey = (row, index) => row?.id ?? row?.key ?? index,
  sort = null,
  onSort = null,
  rowExtra = null,
  footer = null,
  loading = false,
  empty = 'No rows',
  cardStyle = {},
  tableStyleOverride = {},
}) {
  const tableSections = sections || [{ id: 'rows', rows }];
  const rowCount = tableSections.reduce((sum, section) => sum + (section.rows?.length || 0), 0);

  if (loading) {
    return (
      <DataTableCard title={title} subtitle={subtitle} actions={actions} onSettings={onSettings} style={cardStyle}>
        <EmptyState>Loading...</EmptyState>
      </DataTableCard>
    );
  }

  if (rowCount === 0) {
    return (
      <DataTableCard title={title} subtitle={subtitle} actions={actions} onSettings={onSettings} style={cardStyle}>
        <EmptyState>{empty}</EmptyState>
      </DataTableCard>
    );
  }

  return (
    <DataTableCard title={title} subtitle={subtitle} actions={actions} onSettings={onSettings} style={cardStyle}>
      {settingsOpen && settingsPanel && (
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${CLAY.surf2}` }}>
          {settingsPanel}
        </div>
      )}
      <table style={{ ...tableStyle, ...tableStyleOverride }}>
        <colgroup>
          {columns.map((column) => (
            <col
              key={column.key}
              style={column.colStyle || tableColumnStyle({
                width: column.width,
                min: column.min,
                maxVw: column.maxVw,
                action: column.action,
              })}
            />
          ))}
        </colgroup>
        <thead>
          <tr style={tableHeaderRowStyle}>
            {columns.map((column) => {
              const headerLabel = column.header ?? column.label ?? column.key;
              const top = column.top ?? headerLabel;
              const sortKey = column.sortKey ?? (column.sortable === false ? null : column.key);
              return (
                <th
                  key={column.key}
                  style={{
                    ...tableHeaderCellStyle({
                      sticky: column.sticky,
                      align: column.headerAlign || column.align || 'center',
                      padding: column.headerPadding || column.padding || '7px 6px',
                    }),
                    lineHeight: 1.2,
                    whiteSpace: 'normal',
                    ...(column.headerStyle || {}),
                  }}
                >
                  {column.headerRender ? (
                    column.headerRender({ column, sort, onSort })
                  ) : (
                    <DataTableHeaderLabel
                      top={top}
                      bottom={column.bottom || ''}
                      sortKey={sortKey}
                      sort={sort}
                      onSort={sortKey ? onSort : null}
                    />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {tableSections.map((section) => (
            <React.Fragment key={section.id || section.label}>
              {section.label && (
                <tr>
                  <td
                    colSpan={columns.length}
                    style={{
                      ...tableCellStyle({ padding: '8px 10px 4px', emphasis: true, nowrap: false }),
                      color: CLAY.textMid,
                      letterSpacing: '0.05em',
                      background: CLAY.surf2,
                    }}
                  >
                    {section.label}
                  </td>
                </tr>
              )}
              {(section.rows || []).map((row, rowIndex) => {
                const key = rowKey(row, rowIndex, section);
                const extra = rowExtra?.(row, { rowIndex, section, columns });
                return (
                  <React.Fragment key={key}>
                    <tr style={typeof row.rowStyle === 'function' ? row.rowStyle(row) : row.rowStyle || tableRowStyle}>
                      {columns.map((column) => {
                        const cellOptions = typeof column.cellOptions === 'function'
                          ? column.cellOptions(row, { rowIndex, section, column })
                          : (column.cellOptions || {});
                        const extraStyle = typeof column.cellStyle === 'function'
                          ? column.cellStyle(row, { rowIndex, section, column })
                          : (column.cellStyle || {});
                        return (
                          <td
                            key={column.key}
                            title={typeof column.title === 'function' ? column.title(row) : column.title}
                            style={{
                              ...tableCellStyle({
                                sticky: column.sticky,
                                align: column.align || 'center',
                                padding: column.cellPadding || column.padding || '7px 6px',
                                emphasis: column.emphasis,
                                ellipsis: column.ellipsis,
                                nowrap: column.nowrap ?? false,
                                ...cellOptions,
                              }),
                              ...extraStyle,
                            }}
                          >
                            {column.render ? column.render(row, { rowIndex, section, column }) : row[column.key]}
                          </td>
                        );
                      })}
                    </tr>
                    {extra}
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      {footer && (
        <div style={{ padding: '10px 12px 12px', borderTop: `1px solid ${CLAY.surf2}` }}>
          {footer}
        </div>
      )}
    </DataTableCard>
  );
}
