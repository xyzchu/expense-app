from __future__ import annotations

import argparse
import csv
from datetime import date, datetime, timedelta
from pathlib import Path
import time

from futu import (
    CashFlowDirection,
    OpenSecTradeContext,
    RET_OK,
    SecurityFirm,
    TrdEnv,
    TrdMarket,
)


INFLOW_KEYWORDS = (
    "deposit",
    "inward",
    "incoming",
    "bank transfer in",
    "fund deposit",
    "fps in",
    "wire in",
)

OUTFLOW_KEYWORDS = (
    "withdraw",
    "outward",
    "outgoing",
    "bank transfer out",
    "fund withdrawal",
    "fps out",
    "wire out",
)


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


def iter_dates(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def classify_cash_row(cashflow_type: str, remark: str, amount: float) -> str | None:
    haystack = f"{cashflow_type} {remark}".lower()
    if any(keyword in haystack for keyword in INFLOW_KEYWORDS):
        return "DEPOSIT"
    if any(keyword in haystack for keyword in OUTFLOW_KEYWORDS):
        return "WITHDRAWAL"
    if amount > 0 and "deposit" in haystack:
        return "DEPOSIT"
    if amount < 0 and "withdraw" in haystack:
        return "WITHDRAWAL"
    return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export Futu OpenD cash flow into the app's CSV cash import format.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=11111)
    parser.add_argument("--market", default="US", choices=["US", "HK", "CN"])
    parser.add_argument("--trd-env", default="REAL", choices=["REAL", "SIMULATE"])
    parser.add_argument("--acc-id", type=int, required=True)
    parser.add_argument("--account-label", default="Futu HK")
    parser.add_argument("--start", default="2022-01-01")
    parser.add_argument("--end", default=datetime.now().strftime("%Y-%m-%d"))
    parser.add_argument("--output", default=str(Path("backup") / "futu-cashflow-export.csv"))
    parser.add_argument("--include-unclassified", action="store_true")
    parser.add_argument("--sleep-seconds", type=float, default=1.7)
    parser.add_argument("--retry-sleep-seconds", type=float, default=31.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    start_date = date.fromisoformat(args.start)
    end_date = date.fromisoformat(args.end)
    ctx = build_trade_context(args.host, args.port, args.market)
    exported_rows: list[list[str]] = []
    skipped = 0

    try:
      for current_day in iter_dates(start_date, end_date):
        while True:
            ret, data = ctx.get_acc_cash_flow(
                clearing_date=current_day.isoformat(),
                trd_env=TrdEnv.REAL if args.trd_env.upper() == "REAL" else TrdEnv.SIMULATE,
                acc_id=args.acc_id,
                cashflow_direction=CashFlowDirection.NONE,
            )
            if ret == RET_OK:
                break
            if "too frequent" in str(data).lower():
                print(f"{current_day.isoformat()}: rate limited, sleeping {args.retry_sleep_seconds:.1f}s")
                time.sleep(args.retry_sleep_seconds)
                continue
            print(f"{current_day.isoformat()}: {data}")
            return 1
        if data.empty:
            continue

        for _, row in data.iterrows():
            amount = float(row.get("cashflow_amount", 0) or 0)
            cashflow_type = str(row.get("cashflow_type", "") or "").strip()
            remark = str(row.get("cashflow_remark", "") or "").strip()
            flow_kind = classify_cash_row(cashflow_type, remark, amount)
            if flow_kind is None and not args.include_unclassified:
                skipped += 1
                continue
            signed_amount = amount
            if flow_kind == "DEPOSIT":
                signed_amount = abs(amount)
            elif flow_kind == "WITHDRAWAL":
                signed_amount = -abs(amount)
            exported_rows.append([
                row.get("clearing_date", ""),
                args.account_label,
                row.get("currency", "USD"),
                f"{signed_amount:.6f}".rstrip("0").rstrip("."),
                remark or cashflow_type or f"Futu cash flow {row.get('cashflow_id', '')}",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
            ])
        if args.sleep_seconds > 0 and current_day < end_date:
            time.sleep(args.sleep_seconds)
    finally:
        ctx.close()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            [
                "Cash Deposit / Withdrawal",
                "",
                "",
                "",
                "",
                "",
                "Securities Buy / Sell",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
            ]
        )
        writer.writerow(
            [
                "Date",
                "Account",
                "Currency",
                "Amount",
                "Remark",
                "",
                "Date",
                "Account",
                "Stock",
                "Price",
                "Stock Unit",
                "Stock Split",
                "Total Stock Unit",
                "Total",
                "Remark",
            ]
        )
        writer.writerows(exported_rows)

    print(f"Exported {len(exported_rows)} cash rows to {output_path}")
    print(f"Skipped {skipped} non-deposit/withdrawal cash-flow rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
