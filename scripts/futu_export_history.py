from __future__ import annotations

import argparse
import csv
from datetime import datetime
from pathlib import Path

from futu import (
    OpenSecTradeContext,
    RET_OK,
    SecurityFirm,
    TrdEnv,
    TrdMarket,
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


def list_accounts(ctx: OpenSecTradeContext) -> int:
    ret, data = ctx.get_acc_list()
    if ret != RET_OK:
        print(data)
        return 1
    print(data.to_string(index=False))
    return 0


def export_history(
    ctx: OpenSecTradeContext,
    acc_id: int,
    start: str,
    end: str,
    output_path: Path,
    account_label: str,
    trd_env: str,
) -> int:
    ret, data = ctx.history_deal_list_query(
        start=start,
        end=end,
        trd_env=TrdEnv.REAL if trd_env.upper() == "REAL" else TrdEnv.SIMULATE,
        acc_id=acc_id,
    )
    if ret != RET_OK:
        print(data)
        return 1

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

        for _, row in data.sort_values("create_time").iterrows():
            code = str(row.get("code", "") or "")
            ticker = code.split(".")[-1]
            qty = float(row.get("qty", 0) or 0)
            price = float(row.get("price", 0) or 0)
            trd_side = str(row.get("trd_side", "") or "").upper()
            signed_qty = -qty if trd_side == "SELL" else qty
            total = signed_qty * price
            create_time = str(row.get("create_time", "") or "")
            trade_date = create_time.split(" ")[0]
            remark = f"Futu deal {row.get('deal_id', '')}".strip()
            writer.writerow(
                [
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    trade_date,
                    account_label,
                    ticker,
                    f"{price:.6f}",
                    f"{signed_qty:.6f}".rstrip("0").rstrip("."),
                    "1",
                    f"{signed_qty:.6f}".rstrip("0").rstrip("."),
                    f"{total:.6f}".rstrip("0").rstrip("."),
                    remark,
                ]
            )

    print(f"Exported {len(data)} deal rows to {output_path}")
    if len(data):
        print(f"Date range returned by Futu: {data['create_time'].min()} -> {data['create_time'].max()}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export Futu OpenD historical deals into the app's CSV import format.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=11111)
    parser.add_argument("--market", default="US", choices=["US", "HK", "CN"])
    parser.add_argument("--trd-env", default="REAL", choices=["REAL", "SIMULATE"])
    parser.add_argument("--list-accounts", action="store_true")
    parser.add_argument("--acc-id", type=int, default=0)
    parser.add_argument("--account-label", default="Futu HK")
    parser.add_argument("--start", default="2022-01-01")
    parser.add_argument("--end", default=datetime.now().strftime("%Y-%m-%d"))
    parser.add_argument("--output", default=str(Path("backup") / "futu-history-export.csv"))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    ctx = build_trade_context(args.host, args.port, args.market)
    try:
        if args.list_accounts:
            return list_accounts(ctx)
        if not args.acc_id:
            ret, data = ctx.get_acc_list()
            if ret != RET_OK:
                print(data)
                return 1
            real_accounts = data[data["trd_env"] == args.trd_env]
            if real_accounts.empty:
                print(f"No {args.trd_env} accounts returned by OpenD.")
                return 1
            first = real_accounts.iloc[0]
            args.acc_id = int(first["acc_id"])
            if args.account_label == "Futu HK":
                args.account_label = normalize_bank_label(infer_account_label(first))
        return export_history(
            ctx=ctx,
            acc_id=args.acc_id,
            start=args.start,
            end=args.end,
            output_path=Path(args.output),
            account_label=args.account_label,
            trd_env=args.trd_env,
        )
    finally:
        ctx.close()


if __name__ == "__main__":
    raise SystemExit(main())
