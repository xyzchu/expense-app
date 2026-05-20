from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import re
import time
from urllib.parse import parse_qs, urlparse

BRIDGE_ROOT = Path(__file__).resolve().parent
LOCAL_APPDATA = BRIDGE_ROOT / ".local_appdata"
LOCAL_APPDATA.mkdir(parents=True, exist_ok=True)
os.environ["appdata"] = str(LOCAL_APPDATA)

from futu import (
    CashFlowDirection,
    Currency,
    OpenQuoteContext,
    OpenSecTradeContext,
    KLType,
    RET_OK,
    SecurityFirm,
    SubType,
    TrdEnv,
    TrdMarket,
)


HOST = "127.0.0.1"
PORT = 8765
DIVIDEND_REQUEST_SLEEP_SECONDS = 1.6
DIVIDEND_RETRY_SLEEP_SECONDS = 31.0


def build_trade_context(host: str, port: int, market: str) -> OpenSecTradeContext:
    market_enum = {
        "US": TrdMarket.US,
        "HK": TrdMarket.HK,
        "CN": TrdMarket.CN,
    }.get(market.upper(), TrdMarket.US)
    return OpenSecTradeContext(
        filter_trdmarket=market_enum,
        host=host,
        port=port,
        security_firm=SecurityFirm.FUTUSECURITIES,
    )


def normalize_bank_label(raw: str) -> str:
    value = (raw or "").strip()
    if "futu" in value.lower():
        return "Futu HK"
    if "hsbc" in value.lower():
        return "HSBC"
    return value or "Futu HK"


def infer_account_label(row) -> str:
    acc_type = str(row.get("acc_type", "") or "").strip().upper()
    trd_env = str(row.get("trd_env", "") or "").strip().upper()
    suffix = " Simulate" if trd_env == "SIMULATE" else ""
    if acc_type:
        return f"Futu {acc_type.title()}{suffix}".strip()
    return f"Futu{suffix}".strip() if suffix else "Futu HK"


def resolve_account(ctx: OpenSecTradeContext, trd_env: str, acc_id: int, account_label: str):
    ret, data = ctx.get_acc_list()
    if ret != RET_OK:
        raise RuntimeError(str(data))
    accounts = data[data["trd_env"] == trd_env]
    if accounts.empty:
        raise RuntimeError(f"No {trd_env} accounts returned by OpenD")
    if acc_id:
        matched = accounts[accounts["acc_id"] == acc_id]
        if matched.empty:
            raise RuntimeError(f"Account {acc_id} not found for {trd_env}")
        selected = matched.iloc[0]
    else:
        selected = accounts.iloc[0]
        acc_id = int(selected["acc_id"])
    if account_label == "Futu HK":
        account_label = normalize_bank_label(infer_account_label(selected))
    return acc_id, account_label, selected


def iter_dates(start: str, end: str):
    current = datetime.fromisoformat(start).date()
    end_date = datetime.fromisoformat(end).date()
    while current <= end_date:
        yield current.isoformat()
        current += timedelta(days=1)


def parse_ticker_from_cashflow_remark(remark: str) -> str:
    match = re.match(r"\s*([A-Z][A-Z0-9.\-]{0,14})\b", str(remark or ""))
    return match.group(1).upper() if match else ""


def fetch_history_rows(
    start: str,
    end: str,
    market: str = "US",
    trd_env: str = "REAL",
    acc_id: int = 0,
    account_label: str = "Futu HK",
    host: str = "127.0.0.1",
    port: int = 11111,
):
    ctx = build_trade_context(host, port, market)
    try:
        acc_id, account_label, _ = resolve_account(ctx, trd_env, acc_id, account_label)

        ret, data = ctx.history_deal_list_query(
            start=start,
            end=end,
            trd_env=TrdEnv.REAL if trd_env.upper() == "REAL" else TrdEnv.SIMULATE,
            acc_id=acc_id,
        )
        if ret != RET_OK:
            raise RuntimeError(str(data))

        rows = []
        for index, (_, row) in enumerate(data.sort_values("create_time").iterrows(), start=1):
            code = str(row.get("code", "") or "")
            ticker = code.split(".")[-1]
            qty = float(row.get("qty", 0) or 0)
            price = float(row.get("price", 0) or 0)
            trd_side = str(row.get("trd_side", "") or "").upper()
            trade_type = "SELL" if trd_side == "SELL" else "BUY"
            amount = qty * price
            create_time = str(row.get("create_time", "") or "")
            rows.append(
                {
                    "transaction_date": create_time.split(" ")[0],
                    "sort_order": index,
                    "type": trade_type,
                    "ticker": ticker,
                    "name": str(row.get("stock_name", ticker) or ticker),
                    "quantity": qty,
                    "original_quantity": qty,
                    "stock_split": 1,
                    "price": price,
                    "currency": "USD",
                    "amount": amount,
                    "tax_withheld": None,
                    "account": account_label,
                    "order_ref": str(row.get("order_id", "") or ""),
                    "notes": f"Futu deal {row.get('deal_id', '')}".strip(),
                    "source": "futu-opend",
                }
            )

        return {
            "acc_id": acc_id,
            "account_label": account_label,
            "count": len(rows),
            "rows": rows,
            "range": {
                "start": data["create_time"].min() if len(data) else start,
                "end": data["create_time"].max() if len(data) else end,
            },
        }
    finally:
        ctx.close()


def fetch_dividend_rows(
    start: str,
    end: str,
    market: str = "US",
    trd_env: str = "REAL",
    acc_id: int = 0,
    account_label: str = "Futu HK",
    host: str = "127.0.0.1",
    port: int = 11111,
):
    ctx = build_trade_context(host, port, market)
    try:
        acc_id, account_label, _ = resolve_account(ctx, trd_env, acc_id, account_label)
        grouped = {}
        date_list = list(iter_dates(start, end))
        for index, clearing_date in enumerate(date_list):
            while True:
                ret, data = ctx.get_acc_cash_flow(
                    clearing_date=clearing_date,
                    trd_env=TrdEnv.REAL if trd_env.upper() == "REAL" else TrdEnv.SIMULATE,
                    acc_id=acc_id,
                    cashflow_direction=CashFlowDirection.NONE,
                )
                if ret == RET_OK:
                    break
                if "too frequent" in str(data).lower():
                    time.sleep(DIVIDEND_RETRY_SLEEP_SECONDS)
                    continue
                raise RuntimeError(str(data))
            if data.empty:
                if index < len(date_list) - 1:
                    time.sleep(DIVIDEND_REQUEST_SLEEP_SECONDS)
                continue
            for _, row in data.iterrows():
                cashflow_type = str(row.get("cashflow_type", "") or "").strip()
                if cashflow_type not in {"Cash Dividend", "Dividend Tax"}:
                    continue
                remark = str(row.get("cashflow_remark", "") or "").strip()
                ticker = parse_ticker_from_cashflow_remark(remark)
                if not ticker:
                    continue
                currency = str(row.get("currency", "") or "USD")
                key = (clearing_date, ticker, currency)
                entry = grouped.setdefault(
                    key,
                    {
                        "transaction_date": clearing_date,
                        "type": "DIVIDEND",
                        "ticker": ticker,
                        "name": ticker,
                        "quantity": None,
                        "original_quantity": None,
                        "stock_split": 1,
                        "price": None,
                        "currency": currency,
                        "amount": 0.0,
                        "tax_withheld": 0.0,
                        "account": account_label,
                        "order_ref_parts": [],
                        "notes_parts": [],
                        "source": "futu-opend",
                    },
                )
                amount = float(row.get("cashflow_amount", 0) or 0)
                if cashflow_type == "Cash Dividend":
                    entry["amount"] += amount
                elif cashflow_type == "Dividend Tax":
                    entry["tax_withheld"] += amount
                cashflow_id = str(row.get("cashflow_id", "") or "").strip()
                if cashflow_id:
                    entry["order_ref_parts"].append(cashflow_id)
                if remark:
                    entry["notes_parts"].append(f"{cashflow_type}: {remark}")
            if index < len(date_list) - 1:
                time.sleep(DIVIDEND_REQUEST_SLEEP_SECONDS)

        rows = []
        for index, entry in enumerate(sorted(grouped.values(), key=lambda item: (item["transaction_date"], item["ticker"])), start=1):
            if abs(entry["amount"]) <= 1e-9 and abs(entry["tax_withheld"]) <= 1e-9:
                continue
            rows.append(
                {
                    "transaction_date": entry["transaction_date"],
                    "sort_order": index,
                    "type": "DIVIDEND",
                    "ticker": entry["ticker"],
                    "name": entry["name"],
                    "quantity": None,
                    "original_quantity": None,
                    "stock_split": 1,
                    "price": None,
                    "currency": entry["currency"],
                    "amount": round(entry["amount"], 6),
                    "tax_withheld": round(entry["tax_withheld"], 6) if abs(entry["tax_withheld"]) > 1e-9 else None,
                    "account": entry["account"],
                    "order_ref": ",".join(entry["order_ref_parts"]),
                    "notes": " | ".join(dict.fromkeys(entry["notes_parts"])),
                    "source": "futu-opend",
                }
            )

        return {
            "acc_id": acc_id,
            "account_label": account_label,
            "count": len(rows),
            "rows": rows,
            "range": {"start": start, "end": end},
        }
    finally:
        ctx.close()


def fetch_quotes(
    tickers: list[str],
    market: str = "US",
    mode: str = "live",
    host: str = "127.0.0.1",
    port: int = 11111,
):
    prefix = {
        "US": "US.",
        "HK": "HK.",
        "CN": "SH.",
    }.get(market.upper(), "US.")
    codes = [ticker if "." in ticker else f"{prefix}{ticker.upper()}" for ticker in tickers]
    ctx = OpenQuoteContext(host=host, port=port)
    try:
        quotes = {}
        normalized_mode = (mode or "live").strip().lower()
        if normalized_mode == "market_close":
            ret, sub = ctx.subscribe(codes, [SubType.K_DAY], subscribe_push=False)
            if ret != RET_OK:
                raise RuntimeError(str(sub))
            for code in codes:
                ret, data = ctx.get_cur_kline(code, 1, ktype="K_DAY", autype="qfq")
                if ret != RET_OK:
                    raise RuntimeError(str(data))
                if data.empty:
                    continue
                row = data.iloc[-1]
                ticker = code.split(".")[-1]
                quotes[ticker] = {
                    "ticker": ticker,
                    "code": code,
                    "price": float(row.get("close", 0) or 0),
                    "data_time": str(row.get("time_key", "") or ""),
                    "source": "Futu market close",
                    "mode": "market_close",
                }
        else:
            ret, sub = ctx.subscribe(codes, [SubType.QUOTE], subscribe_push=False)
            if ret != RET_OK:
                raise RuntimeError(str(sub))
            ret, data = ctx.get_stock_quote(codes)
            if ret != RET_OK:
                raise RuntimeError(str(data))
            for _, row in data.iterrows():
                code = str(row.get("code", "") or "")
                ticker = code.split(".")[-1]
                field_name = {
                    "live": "last_price",
                    "pre_price": "pre_price",
                    "after_price": "after_price",
                    "overnight_price": "overnight_price",
                }.get(normalized_mode, "last_price")
                source_name = {
                    "live": "Futu last price",
                    "pre_price": "Futu pre-market price",
                    "after_price": "Futu after-hours price",
                    "overnight_price": "Futu overnight price",
                }.get(normalized_mode, "Futu last price")
                high52w_raw = row.get("highest52weeks_price", None)
                quotes[ticker] = {
                    "ticker": ticker,
                    "code": code,
                    "price": float(row.get(field_name, 0) or 0),
                    "data_time": str(row.get("data_time", "") or ""),
                    "source": source_name,
                    "mode": normalized_mode,
                    "high52w": float(high52w_raw) if high52w_raw not in (None, "", "N/A") else None,
                }
        # Supplement with 52-week high from market snapshot (more reliable than get_stock_quote)
        try:
            ret_snap, snap_data = ctx.get_market_snapshot(codes)
            if ret_snap == RET_OK and not snap_data.empty:
                for _, row in snap_data.iterrows():
                    code = str(row.get("code", "") or "")
                    ticker = code.split(".")[-1]
                    if ticker in quotes:
                        h52 = row.get("highest52weeks_price", None)
                        if h52 not in (None, "", "N/A"):
                            try:
                                val = float(h52)
                                if val > 0:
                                    quotes[ticker]["high52w"] = val
                            except (ValueError, TypeError):
                                pass
        except Exception:
            pass

        return {
            "count": len(quotes),
            "mode": normalized_mode,
            "quotes": quotes,
        }
    finally:
        ctx.close()


def iter_month_keys(start_month: str, end_month: str):
    current = datetime.fromisoformat(f"{start_month}-01").date()
    end_date = datetime.fromisoformat(f"{end_month}-01").date()
    while current <= end_date:
        yield current.strftime("%Y-%m")
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)


def fetch_month_end_quotes(
    tickers: list[str],
    start_month: str,
    end_month: str,
    market: str = "US",
    host: str = "127.0.0.1",
    port: int = 11111,
):
    prefix = {
        "US": "US.",
        "HK": "HK.",
        "CN": "SH.",
    }.get(market.upper(), "US.")
    codes = [ticker if "." in ticker else f"{prefix}{ticker.upper()}" for ticker in tickers]
    month_keys = list(iter_month_keys(start_month, end_month))
    ctx = OpenQuoteContext(host=host, port=port)
    try:
        ret, sub = ctx.subscribe(codes, [SubType.K_DAY], subscribe_push=False)
        if ret != RET_OK:
            raise RuntimeError(str(sub))

        quotes = []
        for code in codes:
            ret, data = ctx.get_cur_kline(code, 1200, ktype="K_DAY", autype="qfq")
            if ret != RET_OK:
                raise RuntimeError(str(data))
            if data.empty:
                continue
            ticker = code.split(".")[-1]
            for month_key in month_keys:
                month_rows = data[data["time_key"].astype(str).str.startswith(month_key)]
                if month_rows.empty:
                    continue
                row = month_rows.iloc[-1]
                quotes.append(
                    {
                        "ticker": ticker,
                        "code": code,
                        "month_key": month_key,
                        "quote_date": str(row.get("time_key", "") or "").split(" ")[0],
                        "price": float(row.get("close", 0) or 0),
                        "data_time": str(row.get("time_key", "") or ""),
                        "source": "Futu month-end close",
                        "mode": "month_end_close",
                    }
                )
        return {
            "count": len(quotes),
            "start_month": start_month,
            "end_month": end_month,
            "quotes": quotes,
        }
    finally:
        ctx.close()


def fetch_historical_daily_quotes(
    tickers: list[str],
    start: str,
    end: str,
    market: str = "US",
    host: str = "127.0.0.1",
    port: int = 11111,
):
    prefix = {
        "US": "US.",
        "HK": "HK.",
        "CN": "SH.",
    }.get(market.upper(), "US.")
    codes = [ticker if "." in ticker else f"{prefix}{ticker.upper()}" for ticker in tickers]
    ctx = OpenQuoteContext(host=host, port=port)
    try:
        quotes = []
        for code in codes:
            page_req_key = None
            while True:
                ret, data, page_req_key = ctx.request_history_kline(
                    code,
                    start=start,
                    end=end,
                    ktype=KLType.K_DAY,
                    autype="qfq",
                    page_req_key=page_req_key,
                )
                if ret != RET_OK:
                    raise RuntimeError(str(data))
                if not data.empty:
                    ticker = code.split(".")[-1]
                    for _, row in data.iterrows():
                        price = float(row.get("close", 0) or 0)
                        if price <= 0:
                            continue
                        quotes.append(
                            {
                                "ticker": ticker,
                                "code": code,
                                "quote_date": str(row.get("time_key", "") or "").split(" ")[0],
                                "price": price,
                                "data_time": str(row.get("time_key", "") or ""),
                                "source": "Futu daily close",
                                "mode": "daily_close",
                            }
                        )
                if not page_req_key:
                    break
                time.sleep(0.25)
        return {
            "count": len(quotes),
            "start": start,
            "end": end,
            "quotes": quotes,
        }
    finally:
        ctx.close()


def fetch_account_summary(
    market: str = "US",
    trd_env: str = "REAL",
    acc_id: int = 0,
    host: str = "127.0.0.1",
    port: int = 11111,
):
    ctx = build_trade_context(host, port, market)
    try:
        acc_id, account_label, selected = resolve_account(ctx, trd_env, acc_id, "Futu HK")

        ret, accinfo = ctx.accinfo_query(
            trd_env=TrdEnv.REAL if trd_env.upper() == "REAL" else TrdEnv.SIMULATE,
            acc_id=acc_id,
            currency=Currency.USD,
        )
        if ret != RET_OK:
            raise RuntimeError(str(accinfo))

        ret, positions = ctx.position_list_query(
            trd_env=TrdEnv.REAL if trd_env.upper() == "REAL" else TrdEnv.SIMULATE,
            acc_id=acc_id,
        )
        if ret != RET_OK:
            raise RuntimeError(str(positions))

        accinfo_row = accinfo.iloc[0].to_dict() if len(accinfo) else {}
        market_value = float(positions["market_val"].fillna(0).sum()) if len(positions) else 0.0
        total_position_pnl = float(positions["pl_val"].fillna(0).sum()) if len(positions) else 0.0
        unrealized_pnl = float(positions["unrealized_pl"].fillna(0).sum()) if len(positions) else 0.0
        realized_pnl = float(positions["realized_pl"].fillna(0).sum()) if len(positions) else 0.0

        return {
            "acc_id": acc_id,
            "account_label": account_label,
            "market": market.upper(),
            "trd_env": trd_env.upper(),
            "currency": str(accinfo_row.get("currency", "") or "HKD"),
            "total_assets": float(accinfo_row.get("total_assets", 0) or 0),
            "securities_assets": float(accinfo_row.get("securities_assets", 0) or 0),
            "cash": float(accinfo_row.get("cash", 0) or 0),
            "market_value": market_value,
            "total_position_pnl": total_position_pnl,
            "unrealized_pnl": unrealized_pnl,
            "realized_pnl": realized_pnl,
            "open_positions": int(len(positions.index)),
            "updated_at": datetime.now().isoformat(),
        }
    finally:
        ctx.close()


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send_json(200, {"ok": True})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._send_json(200, {"ok": True, "service": "futu-bridge", "timestamp": datetime.now().isoformat()})
            return
        if parsed.path == "/debug-snapshot":
            params = parse_qs(parsed.query)
            raw_tickers = params.get("tickers", ["AMD"])[0]
            tickers = [item.strip().upper() for item in raw_tickers.split(",") if item.strip()]
            from futu import OpenQuoteContext, RET_OK
            prefix = "US."
            codes = [f"{prefix}{t}" for t in tickers]
            ctx = OpenQuoteContext(host="127.0.0.1", port=11111)
            try:
                ret, data = ctx.get_market_snapshot(codes)
                if ret != RET_OK:
                    self._send_json(500, {"error": str(data)})
                    return
                result = {}
                for _, row in data.iterrows():
                    code = str(row.get("code", ""))
                    ticker = code.split(".")[-1]
                    result[ticker] = {k: (None if (hasattr(v, '__float__') and str(v) == 'nan') else v) for k, v in row.items()}
                self._send_json(200, {"columns": list(data.columns), "rows": result})
            except Exception as exc:
                self._send_json(500, {"error": str(exc)})
            finally:
                ctx.close()
            return
        if parsed.path == "/quotes":
            params = parse_qs(parsed.query)
            raw_tickers = params.get("tickers", [""])[0]
            tickers = [item.strip().upper() for item in raw_tickers.split(",") if item.strip()]
            if not tickers:
                self._send_json(400, {"error": "tickers_required"})
                return
            try:
                payload = fetch_quotes(
                    tickers=tickers,
                    market=params.get("market", ["US"])[0],
                    mode=params.get("mode", ["live"])[0],
                    host=params.get("host", ["127.0.0.1"])[0],
                    port=int(params.get("port", ["11111"])[0] or 11111),
                )
                self._send_json(200, payload)
            except Exception as exc:
                self._send_json(500, {"error": str(exc)})
            return
        if parsed.path == "/account-summary":
            params = parse_qs(parsed.query)
            try:
                payload = fetch_account_summary(
                    market=params.get("market", ["US"])[0],
                    trd_env=params.get("trd_env", ["REAL"])[0],
                    acc_id=int(params.get("acc_id", ["0"])[0] or 0),
                    host=params.get("host", ["127.0.0.1"])[0],
                    port=int(params.get("port", ["11111"])[0] or 11111),
                )
                self._send_json(200, payload)
            except Exception as exc:
                self._send_json(500, {"error": str(exc)})
            return
        if parsed.path == "/month-end-quotes":
            params = parse_qs(parsed.query)
            raw_tickers = params.get("tickers", [""])[0]
            tickers = [item.strip().upper() for item in raw_tickers.split(",") if item.strip()]
            if not tickers:
                self._send_json(400, {"error": "tickers_required"})
                return
            try:
                payload = fetch_month_end_quotes(
                    tickers=tickers,
                    start_month=params.get("start_month", [datetime.now().strftime("%Y-01")])[0],
                    end_month=params.get("end_month", [datetime.now().strftime("%Y-%m")])[0],
                    market=params.get("market", ["US"])[0],
                    host=params.get("host", ["127.0.0.1"])[0],
                    port=int(params.get("port", ["11111"])[0] or 11111),
                )
                self._send_json(200, payload)
            except Exception as exc:
                self._send_json(500, {"error": str(exc)})
            return
        if parsed.path == "/historical-daily-quotes":
            params = parse_qs(parsed.query)
            raw_tickers = params.get("tickers", [""])[0]
            tickers = [item.strip().upper() for item in raw_tickers.split(",") if item.strip()]
            if not tickers:
                self._send_json(400, {"error": "tickers_required"})
                return
            try:
                payload = fetch_historical_daily_quotes(
                    tickers=tickers,
                    start=params.get("start", [(datetime.now() - timedelta(days=10)).strftime("%Y-%m-%d")])[0],
                    end=params.get("end", [datetime.now().strftime("%Y-%m-%d")])[0],
                    market=params.get("market", ["US"])[0],
                    host=params.get("host", ["127.0.0.1"])[0],
                    port=int(params.get("port", ["11111"])[0] or 11111),
                )
                self._send_json(200, payload)
            except Exception as exc:
                self._send_json(500, {"error": str(exc)})
            return
        if parsed.path == "/dividends":
            params = parse_qs(parsed.query)
            try:
                payload = fetch_dividend_rows(
                    start=params.get("start", ["2022-01-01"])[0],
                    end=params.get("end", [datetime.now().strftime("%Y-%m-%d")])[0],
                    market=params.get("market", ["US"])[0],
                    trd_env=params.get("trd_env", ["REAL"])[0],
                    acc_id=int(params.get("acc_id", ["0"])[0] or 0),
                    account_label=params.get("account_label", ["Futu HK"])[0],
                    host=params.get("host", ["127.0.0.1"])[0],
                    port=int(params.get("port", ["11111"])[0] or 11111),
                )
                self._send_json(200, payload)
            except Exception as exc:
                self._send_json(500, {"error": str(exc)})
            return
        if parsed.path != "/history":
            self._send_json(404, {"error": "not_found"})
            return
        params = parse_qs(parsed.query)
        try:
            payload = fetch_history_rows(
                start=params.get("start", ["2022-01-01"])[0],
                end=params.get("end", [datetime.now().strftime("%Y-%m-%d")])[0],
                market=params.get("market", ["US"])[0],
                trd_env=params.get("trd_env", ["REAL"])[0],
                acc_id=int(params.get("acc_id", ["0"])[0] or 0),
                account_label=params.get("account_label", ["Futu HK"])[0],
                host=params.get("host", ["127.0.0.1"])[0],
                port=int(params.get("port", ["11111"])[0] or 11111),
            )
            self._send_json(200, payload)
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})


def main():
    server = HTTPServer((HOST, PORT), Handler)
    print(f"Futu bridge listening on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
