import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { isInCooldown, isInTimeWindow, parseScheduleTimes } from './scheduler.mjs';

const ENV_PATH = path.resolve(process.cwd(), '.env');
const DEFAULT_TOKEN_FILE = path.resolve(process.cwd(), '.local_state', 'gmail-token.json');
const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:3847/oauth2callback';
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const DEFAULT_PROMPT_BODY_CHARS = 1200;
const DEFAULT_SKIP_SUBJECT_KEYWORDS = [
  'general meeting',
  'annual general meeting',
  'extraordinary general meeting',
  'calendar invitation',
  'meeting reminder',
  'statement',
  'estatement',
  'webinar',
  'pending dealing',
  'pending transaction',
];
const DEFAULT_CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'HKD', 'THB', 'NZD', 'SGD', 'KRW', 'INR', 'VND', 'IDR'];

function timestamp() {
  return new Date().toLocaleString('en-CA', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(',', '');
}

function installTimestampedConsole() {
  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      const first = args[0];
      if (typeof first === 'string' && first.startsWith('[mail]')) {
        original(`[${timestamp()}] ${first}`, ...args.slice(1));
      } else {
        original(...args);
      }
    };
  }
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function requireConfig(value, name) {
  if (!value) throw new Error(`Missing ${name}. Add it to .env or pass it as an argument.`);
  return value;
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseKeywordSetting(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(item => String(item).trim()).filter(Boolean);
  } catch {}
  return parseCsv(value);
}

function buildGmailQuery(args) {
  if (args.query || process.env.MAIL_GMAIL_QUERY) return args.query || process.env.MAIL_GMAIL_QUERY;
  const newerThan = String(args.newerThan || process.env.MAIL_GMAIL_NEWER_THAN || '7d').trim();
  return `newer_than:${newerThan || '7d'}`;
}

function saveJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true }, () => {});
  } else if (process.platform === 'darwin') {
    execFile('open', [url], () => {});
  } else {
    execFile('xdg-open', [url], () => {});
  }
}

function decodeBase64Url(data) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function partHeaderValue(part, name) {
  return (part?.headers || []).find(h => String(h.name || '').toLowerCase() === name.toLowerCase())?.value || '';
}

function isAttachmentPart(part) {
  const disposition = partHeaderValue(part, 'Content-Disposition').toLowerCase();
  return Boolean(
    part?.filename ||
    part?.body?.attachmentId ||
    disposition.includes('attachment')
  );
}

function collectBodyParts(payload, out = [], stats = { skippedAttachments: 0 }) {
  if (!payload) return { parts: out, stats };
  if (isAttachmentPart(payload)) {
    stats.skippedAttachments += 1;
    return { parts: out, stats };
  }
  const mimeType = String(payload.mimeType || '').toLowerCase();
  if (payload.body?.data && ['text/plain', 'text/html'].includes(mimeType)) {
    const text = decodeBase64Url(payload.body.data);
    out.push(mimeType === 'text/html' ? stripHtml(text) : text);
  }
  for (const part of payload.parts || []) collectBodyParts(part, out, stats);
  return { parts: out, stats };
}

function headerValue(payload, name) {
  return (payload?.headers || []).find(h => String(h.name || '').toLowerCase() === name.toLowerCase())?.value || '';
}

function normalizeCurrencyList(values) {
  return [...new Set((values || [])
    .map(value => String(value || '').trim().toUpperCase())
    .filter(value => /^[A-Z]{3}$/.test(value)))];
}

function summarizeGmailMessage(message, config = {}) {
  const payload = message.payload || {};
  const { parts, stats } = collectBodyParts(payload);
  const body = parts.join('\n').replace(/\s+/g, ' ').trim();
  const bodyLimit = Math.max(500, Number(process.env.MAIL_PROMPT_BODY_CHARS || DEFAULT_PROMPT_BODY_CHARS));
  const subject = headerValue(payload, 'Subject') || '(No subject)';
  const snippet = message.snippet || '';
  const text = (body || snippet || '').slice(0, bodyLimit);
  const detectedCurrency = detectCurrency(`${subject} ${snippet} ${text}`, config.validCurrencies);
  return {
    id: message.id,
    threadId: message.threadId,
    subject,
    from: headerValue(payload, 'From'),
    date: headerValue(payload, 'Date'),
    snippet,
    text,
    detectedCurrency,
    validCurrencies: normalizeCurrencyList(config.validCurrencies).length ? normalizeCurrencyList(config.validCurrencies) : DEFAULT_CURRENCIES,
    skippedAttachments: stats.skippedAttachments,
  };
}

function cleanJson(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  return first >= 0 && last > first ? text.slice(first, last + 1) : text;
}

function parseNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(String(value)
    .replace(/\b[A-Z]{3}\b/g, '')
    .replace(/[,$€£¥]/g, '')
    .trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMessageDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? today() : parsed.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeCurrencyCode(value, fallback = 'AUD', validCurrencies = DEFAULT_CURRENCIES) {
  const allowed = new Set(normalizeCurrencyList(validCurrencies).length ? normalizeCurrencyList(validCurrencies) : DEFAULT_CURRENCIES);
  const cleaned = String(value || '').trim().toUpperCase();
  if (allowed.has(cleaned)) return cleaned;
  if (cleaned === 'HK$' && allowed.has('HKD')) return 'HKD';
  if (cleaned === 'US$' && allowed.has('USD')) return 'USD';
  if (cleaned === 'A$' && allowed.has('AUD')) return 'AUD';
  if (cleaned === 'S$' && allowed.has('SGD')) return 'SGD';
  if (cleaned === 'NZ$' && allowed.has('NZD')) return 'NZD';
  return fallback;
}

function cleanOptionalText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function extractHsbcTradeOverrides(text) {
  const source = cleanOptionalText(text);
  if (!/HSBC|Hongkong and Shanghai Banking Corporation/i.test(source)) return null;
  if (!/Trade Order/i.test(source)) return null;
  const overrides = {};
  const orderRef = source.match(/\bOrder Reference:\s*([A-Z0-9-]+)/i) || source.match(/\bOrder ref:\s*([A-Z0-9-]+)/i);
  const type = source.match(/\bOrder Type:\s*(BUY|SELL)\b/i) || source.match(/\b(BUY|SELL)\s+Trade Order\b/i);
  const stock = source.match(/\bStock:\s*([^()•]+?)\s*\(([A-Z0-9.-]+)\)/i);
  const totalQuantity = source.match(/\bTotal Executed Quantity\s*\(shares\/units\):\s*([0-9,]+(?:\.\d+)?)/i);
  const executedQuantity = source.match(/\bExecuted Order Quantity\s*\(shares\/units\):\s*([0-9,]+(?:\.\d+)?)/i);
  const price = source.match(/\bMarket Execution Price:\s*([A-Z]{3})?\s*\$?\s*([0-9,]+(?:\.\d+)?)/i);
  if (orderRef) overrides.order_ref = orderRef[1];
  if (type) overrides.type = type[1].toUpperCase();
  if (stock) {
    overrides.name = cleanOptionalText(stock[1]);
    overrides.ticker = stock[2].toUpperCase();
  }
  if (totalQuantity || executedQuantity) overrides.quantity = parseNumber((totalQuantity || executedQuantity)[1]);
  if (price) {
    if (price[1]) overrides.currency = price[1].toUpperCase();
    overrides.price = parseNumber(price[2]);
  }
  if (['BUY', 'SELL'].includes(overrides.type || '') && overrides.quantity && overrides.price) {
    overrides.amount = Number(Math.abs(overrides.quantity * overrides.price).toFixed(2));
  }
  return Object.keys(overrides).length ? overrides : null;
}

function detectCurrency(text, validCurrencies = DEFAULT_CURRENCIES) {
  const allowed = normalizeCurrencyList(validCurrencies).length ? normalizeCurrencyList(validCurrencies) : DEFAULT_CURRENCIES;
  const allowedSet = new Set(allowed);
  const source = String(text || '');
  const upper = source.toUpperCase();
  const symbolChecks = [
    { re: /\bHK\$/i, currency: 'HKD' },
    { re: /\bUS\$/i, currency: 'USD' },
    { re: /\bA\$/i, currency: 'AUD' },
    { re: /\bS\$/i, currency: 'SGD' },
    { re: /\bNZ\$/i, currency: 'NZD' },
    { re: /€/, currency: 'EUR' },
    { re: /£/, currency: 'GBP' },
    { re: /¥/, currency: 'JPY' },
  ];
  const symbolMatch = symbolChecks.find(item => item.re.test(source) && allowedSet.has(item.currency));
  if (symbolMatch) return symbolMatch.currency;
  const codePattern = allowed
    .map(code => code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const codeMatch = codePattern ? upper.match(new RegExp(`\\b(${codePattern})\\b`)) : null;
  return codeMatch ? codeMatch[1] : '';
}

function shouldSkipBeforeOllama(message, config) {
  const source = [
    message.subject,
    message.from,
    message.snippet,
  ].join(' ').toLowerCase();
  if (source.includes('hsbc') && /\bpending\s+(dealing|transaction|trade|order)\b/i.test(source)) {
    return 'HSBC pending transaction';
  }
  const matched = config.skipSubjectKeywords.find(keyword => source.includes(keyword.toLowerCase()));
  return matched ? `matched ignore keyword "${matched}"` : '';
}

function buildPrompt(message) {
  return `Classify this Gmail message for a personal finance app.
Return JSON only:
{"items":[{"kind":"expense|income|security|ignore","date":"YYYY-MM-DD","merchant":"","payer":"","payee":"","bank":"","account":"","summary":"","description":"","category":"Restaurant|Groceries|Transport|Utilities|Travel|Home|Investment|Entertainment|Income|Other","amount":0,"currency":"AUD","confidence":0.0,"reason":"","security":{"type":"BUY|SELL|DIVIDEND|DEPOSIT|WITHDRAWAL","ticker":"","name":"","quantity":0,"price":0,"amount":0,"currency":"USD","account":"","order_ref":"","tax_withheld":0,"notes":"","payer":"","payee":"","bank":"","summary":""}}]}
Rules:
- Use "ignore" if no income, expense, or securities transaction is present.
- Missing optional fields are OK. Return the candidate anyway and use empty strings for unknown merchant, payer, payee, bank, account, order_ref, ticker name, or notes.
- Amounts should be positive numbers.
- Securities transactions include brokerage buys, sells, dividends, deposits, withdrawals, contract notes, trade confirmations, dividend advices, and broker cash movements.
- If the email looks like a securities transaction but some fields are missing, still return kind "security" with the fields you can see and leave unknown fields blank.
- For BUY/SELL, extract ticker, stock name, units, price, gross/net amount, account, and order/contract reference when visible.
- For BUY/SELL, amount must be the trade total/proceeds/cost, normally units × price plus/minus fees. Never use an order number, contract reference, or account digits as amount.
- If a BUY/SELL total amount is not clearly visible but units and price are visible, set security.amount to units × price rounded to 2 decimals.
- For HSBC fully executed trade emails, use "Total Executed Quantity (shares/units)" as security.quantity. Do not use "Executed Order Quantity" when a total executed quantity is present.
- For DIVIDEND, extract ticker or stock name, dividend amount, tax withheld, currency, account, and reference when visible.
- Use Investment for brokerage/investment/securities-related fees, transfers, and charges that are expenses rather than securities transactions.
- Use Entertainment for movies, events, games, streaming, shows, and leisure spending.
- Do not invent missing transaction details.
- Extract payer, payee, bank, and account details when visible.
- For summary, summarize what the item is in 2-8 words.
- For expense/income description, use the same short text as summary.
- Description must not include the full email body or long payment instructions.
- Summary should include the most useful visible counterparty name when available: shop, merchant, payee, payer, or bank.
- Combine counterparty + purpose using only words found or clearly implied in this email.
- Never copy illustrative examples or invent a merchant/shop that is not in this email.
- Do not use generic email subjects like "Transaction notification" or "Payment instruction" as the description.
- Extract the actual currency code from the email. Prefer explicit codes/symbols, e.g. HKD/HK$, USD/US$, AUD/A$, GBP/£, EUR/€.
- Prefer these currencies already used in the user's expense records: ${(message.validCurrencies || DEFAULT_CURRENCIES).join(', ')}.
- Attachments are excluded; classify only from the visible email subject/snippet/body below.

Subject: ${message.subject}
From: ${message.from}
Date: ${message.date}
Snippet: ${message.snippet}
Detected currency hint: ${message.detectedCurrency || 'none'}
Attachments excluded: ${message.skippedAttachments || 0}
Body: ${message.text}`;
}

function buildItemDescription({ bank, payer, payee, merchant, description, fallback, kind }) {
  const counterparty = kind === 'income' ? payer : payee;
  if (description) return description;
  if (merchant) return merchant;
  const parts = [counterparty, bank].map(value => String(value || '').trim()).filter(Boolean);
  if (parts.length) return parts.join(' transfer');
  return fallback;
}

function shortSummary(value, fallback = '') {
  const words = String(value || fallback || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  return words.slice(0, 8).join(' ');
}

function currencyFromToken(value, fallback, validCurrencies) {
  const token = String(value || '').trim().toUpperCase();
  const symbolMap = {
    'HK$': 'HKD',
    'US$': 'USD',
    'A$': 'AUD',
    'S$': 'SGD',
    'NZ$': 'NZD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
    '$': fallback || 'AUD',
  };
  return normalizeCurrencyCode(symbolMap[token] || token, fallback, validCurrencies);
}

function extractMoney(text, validCurrencies = DEFAULT_CURRENCIES, fallbackCurrency = 'AUD') {
  const source = String(text || '').replace(/\s+/g, ' ');
  const codes = normalizeCurrencyList(validCurrencies).join('|');
  const amount = '([0-9][0-9,]*(?:\\.\\d{1,2})?)';
  const codeBefore = codes ? source.match(new RegExp(`\\b(${codes})\\b\\s*(?:[$€£¥])?\\s*${amount}`, 'i')) : null;
  if (codeBefore) {
    return {
      amount: parseNumber(codeBefore[2]),
      currency: normalizeCurrencyCode(codeBefore[1], fallbackCurrency, validCurrencies),
    };
  }
  const symbolBefore = source.match(new RegExp(`\\b(HK\\$|US\\$|A\\$|S\\$|NZ\\$|[$€£¥])\\s*${amount}`, 'i'));
  if (symbolBefore) {
    return {
      amount: parseNumber(symbolBefore[2]),
      currency: currencyFromToken(symbolBefore[1], fallbackCurrency, validCurrencies),
    };
  }
  const codeAfter = codes ? source.match(new RegExp(`${amount}\\s*\\b(${codes})\\b`, 'i')) : null;
  if (codeAfter) {
    return {
      amount: parseNumber(codeAfter[1]),
      currency: normalizeCurrencyCode(codeAfter[2], fallbackCurrency, validCurrencies),
    };
  }
  return null;
}

function extractLikelyMerchant(text) {
  const source = String(text || '').replace(/\s+/g, ' ');
  const match = source.match(/\b(?:merchant|payee|shop|at)\s*[:：]?\s*([A-Z0-9][A-Z0-9 '&().,/_-]{1,48})/i);
  if (!match) return '';
  return cleanOptionalText(match[1])
    .replace(/\b(?:on|for|amount|date|time|card)\b.*$/i, '')
    .replace(/[.;。].*$/, '')
    .trim();
}

function buildRuleBasedCandidates(message, userId) {
  const source = [
    message.subject,
    message.from,
    message.snippet,
    message.text,
  ].join(' ');
  const isCreditCardAlert = /(credit card|card transaction|transaction notifications?\s*&\s*alerts|card alert)/i.test(source);
  if (!isCreditCardAlert) return [];

  const money = extractMoney(source, message.validCurrencies, message.detectedCurrency || 'AUD');
  if (!money?.amount) return [];

  const merchant = extractLikelyMerchant(source);
  const bank = /dbs/i.test(source) ? 'DBS' : '';
  const summary = shortSummary(merchant || `${bank || 'Credit card'} transaction`);
  return [normalizeCandidate({
    kind: 'expense',
    date: parseMessageDate(message.date),
    merchant,
    bank,
    summary,
    description: summary,
    category: 'Other',
    amount: money.amount,
    currency: money.currency,
    confidence: 0.6,
    reason: 'Rule-based fallback for credit card transaction alert',
  }, message, 9000, userId)].filter(Boolean);
}

function normalizeCandidate(item, message, index, userId) {
  const kind = String(item?.kind || '').toLowerCase();
  if (kind === 'ignore') return null;

  const confidence = Math.max(0, Math.min(1, Number(item?.confidence ?? 0.75)));
  const basePayload = {
    date: item?.date || today(),
    reason: item?.reason || '',
    emailText: message.text || '',
  };

  let payload;
  let normalizedKind;
  if (kind === 'expense' || kind === 'income') {
    const amount = parseNumber(item.amount);
    if (!amount) return null;
    normalizedKind = kind;
    const rawDescription = buildItemDescription({
      bank: item.bank,
      payer: item.payer,
      payee: item.payee,
      merchant: item.merchant,
      description: item.description || item.summary,
      fallback: message.subject,
      kind,
    });
    const summary = shortSummary(item.summary || rawDescription, rawDescription);
    const description = summary || shortSummary(rawDescription, message.subject);
    payload = {
      ...basePayload,
      kind,
      item: description,
      summary,
      rawDescription: cleanOptionalText(rawDescription),
      merchant: cleanOptionalText(item.merchant),
      payer: cleanOptionalText(item.payer),
      payee: cleanOptionalText(item.payee),
      bank: cleanOptionalText(item.bank),
      account: cleanOptionalText(item.account),
      category: kind === 'income' ? 'Income' : (item.category || 'Other'),
      amount: Math.abs(amount),
      currency: normalizeCurrencyCode(item.currency, message.detectedCurrency || 'AUD', message.validCurrencies),
      notes: cleanOptionalText(item.notes) || message.subject,
    };
  } else if (kind === 'security') {
    const security = {
      ...(item.security || item),
      ...(extractHsbcTradeOverrides(message.text) || {}),
    };
    const type = String(security.type || '').toUpperCase();
    if (!['BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL'].includes(type)) return null;
    const ticker = String(security.ticker || '').trim().toUpperCase();
    const securityName = cleanOptionalText(security.name);
    const quantity = parseNumber(security.quantity);
    const price = parseNumber(security.price);
    const rawSecurityAmount = Math.abs(parseNumber(security.amount) || 0);
    const derivedTradeAmount = ['BUY', 'SELL'].includes(type) && quantity && price
      ? Math.abs(quantity * price)
      : 0;
    const securityAmount = derivedTradeAmount
      && (!rawSecurityAmount || rawSecurityAmount < derivedTradeAmount * 0.5 || rawSecurityAmount > derivedTradeAmount * 2)
      ? Number(derivedTradeAmount.toFixed(2))
      : rawSecurityAmount;
    if (!ticker && !securityName && !['DEPOSIT', 'WITHDRAWAL'].includes(type)) return null;
    normalizedKind = 'security';
    const summary = shortSummary(security.summary || security.notes || `${type} ${ticker || securityName || ''}`, `${type} ${ticker || securityName || ''}`);
    payload = {
      ...basePayload,
      kind: 'security',
      transactionType: type,
      summary,
      ticker,
      name: securityName || ticker || type.toLowerCase(),
      quantity,
      price,
      amount: securityAmount,
      taxWithheld: parseNumber(security.tax_withheld),
      currency: normalizeCurrencyCode(security.currency, message.detectedCurrency || 'USD', message.validCurrencies),
      account: cleanOptionalText(security.account),
      orderRef: cleanOptionalText(security.order_ref),
      payer: cleanOptionalText(security.payer || item.payer),
      payee: cleanOptionalText(security.payee || item.payee),
      bank: cleanOptionalText(security.bank || item.bank),
      notes: cleanOptionalText(security.notes) || message.subject,
    };
  } else {
    return null;
  }

  const keyMaterial = JSON.stringify({ id: message.id, index, kind: normalizedKind, payload });
  const candidateKey = crypto.createHash('sha256').update(keyMaterial).digest('hex');
  return {
    user_id: userId,
    gmail_message_id: message.id,
    gmail_thread_id: message.threadId,
    candidate_key: candidateKey,
    kind: normalizedKind,
    confidence,
    reason: item?.reason || '',
    email_subject: message.subject,
    email_from: message.from,
    email_date: message.date,
    email_snippet: message.snippet,
    payload,
  };
}

async function exchangeCodeForToken({ clientId, clientSecret, redirectUri, code }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || 'Token exchange failed');
  return {
    ...json,
    expires_at: Date.now() + Number(json.expires_in || 3600) * 1000,
  };
}

async function refreshAccessToken({ clientId, clientSecret, token }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || 'Token refresh failed');
  return {
    ...token,
    ...json,
    expires_at: Date.now() + Number(json.expires_in || 3600) * 1000,
  };
}

async function runAuthFlow({ clientId, clientSecret, redirectUri, tokenFile }) {
  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString();

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== '/oauth2callback') return;
      if (url.searchParams.get('state') !== state) {
        res.writeHead(400);
        res.end('Invalid state');
        reject(new Error('Invalid OAuth state'));
        server.close();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>Gmail connected.</h2><p>You can close this window.</p>');
      resolve(url.searchParams.get('code'));
      server.close();
    });
    server.listen(new URL(redirectUri).port || 3847, '127.0.0.1', () => {
      console.log(`Open this URL if your browser does not open automatically:\n${authUrl.toString()}\n`);
      openBrowser(authUrl.toString());
    });
  });

  const token = await exchangeCodeForToken({ clientId, clientSecret, redirectUri, code });
  saveJson(tokenFile, token);
  console.log(`Saved Gmail token to ${tokenFile}`);
}

async function getAccessToken({ clientId, clientSecret, tokenFile }) {
  let token = readJson(tokenFile);
  if (!token?.refresh_token) {
    throw new Error(`No Gmail token found at ${tokenFile}. Run: node scripts/mail_ollama_worker.mjs --auth`);
  }
  if (!token.access_token || Date.now() > Number(token.expires_at || 0) - 60000) {
    token = await refreshAccessToken({ clientId, clientSecret, token });
    saveJson(tokenFile, token);
  }
  return token.access_token;
}

async function gmailFetch(token, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `Gmail ${res.status}`);
  return json;
}

async function classifyWithOllama({ ollamaUrl, ollamaModel, message, userId }) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeoutMs = 5 * 60 * 1000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const heartbeat = setInterval(() => {
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[mail] Still waiting for Ollama... ${elapsed}s elapsed`);
  }, 15000);

  try {
    const res = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: buildPrompt(message),
        stream: false,
        format: 'json',
        options: { temperature: 0 },
      }),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Ollama ${res.status}`);
    const parsed = JSON.parse(cleanJson(json.response || '{}'));
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[mail] Ollama returned in ${elapsed}s`);
    return (Array.isArray(parsed.items) ? parsed.items : [])
      .map((item, index) => normalizeCandidate(item, message, index, userId))
      .filter(Boolean);
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Ollama timed out after 5 minutes');
    throw err;
  } finally {
    clearTimeout(timer);
    clearInterval(heartbeat);
  }
}

async function resolveUserId(supabase, configuredUserId, configuredEmail) {
  if (configuredUserId) return configuredUserId;
  if (!configuredEmail) throw new Error('Set MAIL_USER_ID or MAIL_USER_EMAIL in .env');
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Could not list Supabase users: ${error.message}`);
  const found = data?.users?.find(user => String(user.email || '').toLowerCase() === configuredEmail.toLowerCase());
  if (!found) throw new Error(`No Supabase user found for MAIL_USER_EMAIL=${configuredEmail}`);
  return found.id;
}

async function loadRuntimeMailSettings(config, userId) {
  const { data, error } = await config.supabase
    .from('user_settings')
    .select('key,value')
    .eq('user_id', userId)
    .in('key', ['mail_ignore_subject_keywords']);
  if (error) throw new Error(`Loading mail runtime settings failed: ${error.message}`);
  const settings = Object.fromEntries((data || []).map(row => [row.key, row.value]));
  if (Object.prototype.hasOwnProperty.call(settings, 'mail_ignore_subject_keywords')) {
    config.skipSubjectKeywords = parseKeywordSetting(settings.mail_ignore_subject_keywords);
  } else {
    config.skipSubjectKeywords = config.defaultSkipSubjectKeywords;
  }
  config.validCurrencies = await loadExpenseCurrencies(config, userId);
  console.log(`[mail] Currency hints from expense records: ${config.validCurrencies.join(', ')}`);
}

async function loadExpenseCurrencies(config, userId) {
  const currencies = new Set();
  const { data: memberships, error: membershipError } = await config.supabase
    .from('list_members')
    .select('list_id, expense_lists(default_currency)')
    .eq('user_id', userId);
  if (membershipError) {
    console.warn(`[mail] Could not load expense-list currencies: ${membershipError.message}`);
    return DEFAULT_CURRENCIES;
  }

  const listIds = [...new Set((memberships || []).map(row => row.list_id).filter(Boolean))];
  for (const row of memberships || []) {
    const cur = row.expense_lists?.default_currency;
    if (cur) currencies.add(String(cur).trim().toUpperCase());
  }
  if (!listIds.length) return currencies.size ? normalizeCurrencyList([...currencies]) : DEFAULT_CURRENCIES;

  const { data: expenses, error: expenseError } = await config.supabase
    .from('expenses')
    .select('original_currency')
    .in('list_id', listIds)
    .not('original_currency', 'is', null)
    .limit(1000);
  if (expenseError) {
    console.warn(`[mail] Could not load expense currencies: ${expenseError.message}`);
    return currencies.size ? normalizeCurrencyList([...currencies]) : DEFAULT_CURRENCIES;
  }
  for (const row of expenses || []) {
    if (row.original_currency) currencies.add(String(row.original_currency).trim().toUpperCase());
  }
  const found = normalizeCurrencyList([...currencies]);
  return found.length ? found : DEFAULT_CURRENCIES;
}

async function syncOnce(config) {
  const userId = config.resolvedUserId || await resolveUserId(config.supabase, config.userId, config.userEmail);
  config.resolvedUserId = userId;
  await loadRuntimeMailSettings(config, userId);
  const accessToken = await getAccessToken(config);
  const query = encodeURIComponent(config.gmailQuery);
  const list = await gmailFetch(
    accessToken,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=${config.maxResults}&fields=messages(id,threadId),resultSizeEstimate`
  );
  const messages = list.messages || [];
  if (messages.length === 0) {
    console.log(`[mail] No messages matched ${config.gmailQuery}`);
    return;
  }

  const { data: processedRows, error: processedError } = await config.supabase
    .from('mail_processed_messages')
    .select('gmail_message_id')
    .eq('user_id', userId)
    .in('gmail_message_id', messages.map(msg => msg.id));
  if (processedError) throw new Error(`Loading processed messages failed: ${processedError.message}`);

  const processed = new Set((processedRows || []).map(row => row.gmail_message_id));
  const todo = messages.filter(msg => !processed.has(msg.id));
  console.log(`[mail] ${todo.length}/${messages.length} messages need classification`);

  for (let i = 0; i < todo.length; i += 1) {
    const msg = todo[i];
    const full = await gmailFetch(accessToken, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`);
    const summary = summarizeGmailMessage(full, config);
    const meta = [
      summary.detectedCurrency ? `currency ${summary.detectedCurrency}` : '',
      summary.skippedAttachments ? `${summary.skippedAttachments} attachment part(s) excluded` : '',
    ].filter(Boolean).join(', ');
    console.log(`[mail] ${i + 1}/${todo.length}: ${summary.subject}${meta ? ` (${meta})` : ''}`);

    const skipReason = shouldSkipBeforeOllama(summary, config);
    if (skipReason) {
      console.log(`[mail] Skipped before Ollama: ${skipReason}`);
      const { error: processedSkipError } = await config.supabase
        .from('mail_processed_messages')
        .upsert({
          user_id: userId,
          gmail_message_id: summary.id,
          gmail_thread_id: summary.threadId,
          email_subject: summary.subject,
          item_count: 0,
          processed_at: new Date().toISOString(),
        }, { onConflict: 'user_id,gmail_message_id' });
      if (processedSkipError) throw new Error(`Saving skipped message failed: ${processedSkipError.message}`);
      continue;
    }

    let candidates = [];
    try {
      candidates = await classifyWithOllama({
        ollamaUrl: config.ollamaUrl,
        ollamaModel: config.ollamaModel,
        message: summary,
        userId,
      });
    } catch (err) {
      console.error(`[mail] Ollama failed for ${msg.id}: ${err.message}`);
      continue;
    }

    if (candidates.length === 0) {
      candidates = buildRuleBasedCandidates(summary, userId);
      if (candidates.length > 0) {
        console.log(`[mail] Rule fallback saved ${candidates.length} credit card candidate(s)`);
      }
    }

    if (candidates.length > 0) {
      const { error } = await config.supabase
        .from('mail_candidates')
        .upsert(candidates.map(candidate => ({
          ...candidate,
          status: 'ready',
          added_target: null,
          added_target_id: null,
          updated_at: new Date().toISOString(),
        })), { onConflict: 'user_id,candidate_key' });
      if (error) throw new Error(`Saving candidates failed: ${error.message}`);
    }

    const { error: processedInsertError } = await config.supabase
      .from('mail_processed_messages')
      .upsert({
        user_id: userId,
        gmail_message_id: summary.id,
        gmail_thread_id: summary.threadId,
        email_subject: summary.subject,
        item_count: candidates.length,
        processed_at: new Date().toISOString(),
      }, { onConflict: 'user_id,gmail_message_id' });
    if (processedInsertError) throw new Error(`Saving processed message failed: ${processedInsertError.message}`);

    console.log(`[mail] Saved ${candidates.length} candidate(s)`);
  }
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Private-Network': 'true',
  });
  res.end(JSON.stringify(payload));
}

function startWorkerServer(config) {
  const port = Number(process.env.MAIL_WORKER_PORT || 3857);
  const state = {
    running: false,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastError: null,
  };

  const run = () => {
    if (state.running) return false;
    state.running = true;
    state.lastStartedAt = new Date().toISOString();
    state.lastError = null;
    syncOnce(config)
      .catch((err) => {
        state.lastError = err.message;
        console.error(`[mail] Sync failed: ${err.message}`);
      })
      .finally(() => {
        state.running = false;
        state.lastFinishedAt = new Date().toISOString();
      });
    return true;
  };

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      writeJson(res, 204, {});
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method === 'GET' && url.pathname === '/status') {
      writeJson(res, 200, { ok: true, ...state });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/sync') {
      const started = run();
      writeJson(res, 202, {
        ok: true,
        running: true,
        message: started ? 'Local mail sync started' : 'Local mail sync already running',
        ...state,
      });
      return;
    }
    writeJson(res, 404, { ok: false, error: 'Not found' });
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[mail] Local worker API listening at http://127.0.0.1:${port}`);
  });

  return { run, state };
}

async function upsertUserSetting(supabase, userId, key, value) {
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, key, value }, { onConflict: 'user_id,key' });
  if (error) throw new Error(`Saving ${key} failed: ${error.message}`);
}

async function getMailSchedule(config) {
  const userId = config.resolvedUserId || await resolveUserId(config.supabase, config.userId, config.userEmail);
  config.resolvedUserId = userId;
  const { data, error } = await config.supabase
    .from('user_settings')
    .select('key,value')
    .eq('user_id', userId)
    .in('key', ['mail_sync_schedule_times', 'mail_sync_timezone', 'mail_sync_last_auto_run']);
  if (error) throw new Error(`Loading mail schedule failed: ${error.message}`);
  const settings = Object.fromEntries((data || []).map(row => [row.key, row.value]));
  let lastRun = null;
  try { lastRun = JSON.parse(settings.mail_sync_last_auto_run || 'null'); } catch {}
  return {
    userId,
    times: parseScheduleTimes(settings.mail_sync_schedule_times),
    timezone: settings.mail_sync_timezone || process.env.MAIL_SYNC_TIMEZONE || 'Asia/Hong_Kong',
    lastRun,
  };
}

async function main() {
  installTimestampedConsole();
  loadDotEnv(ENV_PATH);
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const config = {
    clientId: requireConfig(args.clientId || process.env.GMAIL_CLIENT_ID, 'GMAIL_CLIENT_ID'),
    clientSecret: requireConfig(args.clientSecret || process.env.GMAIL_CLIENT_SECRET, 'GMAIL_CLIENT_SECRET'),
    redirectUri: args.redirectUri || process.env.GMAIL_REDIRECT_URI || DEFAULT_REDIRECT_URI,
    tokenFile: path.resolve(args.tokenFile || process.env.GMAIL_TOKEN_FILE || DEFAULT_TOKEN_FILE),
    userId: args.userId || process.env.MAIL_USER_ID || '',
    userEmail: args.userEmail || process.env.MAIL_USER_EMAIL || '',
    gmailQuery: buildGmailQuery(args),
    maxResults: Math.max(1, Math.min(50, Number(args.max || process.env.MAIL_GMAIL_MAX_RESULTS || 50))),
    defaultSkipSubjectKeywords: parseCsv(process.env.MAIL_SKIP_SUBJECT_KEYWORDS).length
      ? parseCsv(process.env.MAIL_SKIP_SUBJECT_KEYWORDS)
      : DEFAULT_SKIP_SUBJECT_KEYWORDS,
    skipSubjectKeywords: parseCsv(process.env.MAIL_SKIP_SUBJECT_KEYWORDS).length
      ? parseCsv(process.env.MAIL_SKIP_SUBJECT_KEYWORDS)
      : DEFAULT_SKIP_SUBJECT_KEYWORDS,
    ollamaUrl: args.ollamaUrl || process.env.MAIL_OLLAMA_URL || 'http://127.0.0.1:11434',
    ollamaModel: args.ollamaModel || process.env.MAIL_OLLAMA_MODEL || 'llama3.2:3b',
    intervalMs: Math.max(1, Number(args.intervalMinutes || process.env.MAIL_SYNC_INTERVAL_MINUTES || 60)) * 60 * 1000,
    supabase: createClient(
      requireConfig(supabaseUrl, 'SUPABASE_URL or VITE_SUPABASE_URL'),
      requireConfig(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } }
    ),
  };

  if (args.auth) {
    await runAuthFlow(config);
    return;
  }

  if (args.daemon) {
    console.log(`[mail] Starting daemon. Scheduled sync uses Mail page settings. Query: ${config.gmailQuery}`);
    const workerServer = startWorkerServer(config);
    const checkSchedule = async () => {
      try {
        const schedule = await getMailSchedule(config);
        if (!schedule.times.length) return;
        if (!isInTimeWindow(schedule.times, schedule.timezone)) return;
        if (isInCooldown(schedule.lastRun)) return;

        await upsertUserSetting(
          config.supabase,
          schedule.userId,
          'mail_sync_last_auto_run',
          JSON.stringify({ status: 'success', time: new Date().toISOString() })
        );
        console.log(`[mail] Scheduled sync window matched (${schedule.times.join(', ')} ${schedule.timezone})`);
        workerServer.run();
      } catch (err) {
        console.error(`[mail] Schedule check failed: ${err.message}`);
      }
    };
    await checkSchedule();
    setInterval(checkSchedule, Math.max(30, Number(process.env.MAIL_SCHEDULE_CHECK_SECONDS || 60)) * 1000);
    return;
  }

  await syncOnce(config);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
