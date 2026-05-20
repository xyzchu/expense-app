# Futu `get_market_snapshot()` Column Reference

Returned by `OpenQuoteContext.get_market_snapshot(code_list)` in the Futu Python SDK.
Verified against US stocks (e.g. AMD) on 2026-04-22.

## Price & Volume
| Column | Example (AMD) | Notes |
|--------|--------------|-------|
| `last_price` | 284.49 | Current/last traded price |
| `open_price` | 277.33 | Day open |
| `high_price` | 286.20 | Day high |
| `low_price` | 276.62 | Day low |
| `prev_close_price` | 274.95 | Previous close |
| `avg_price` | 281.93 | VWAP |
| `close_price_5min` | 282.91 | 5-min close |
| `volume` | 38950875 | Day volume |
| `turnover` | 10981559680.0 | Day turnover (USD) |
| `turnover_rate` | 2.429 | % of float traded |
| `amplitude` | 3.484 | (high-low)/prev_close % |
| `volume_ratio` | 1.041 | Volume vs 10-day avg |
| `bid_ask_ratio` | -33.333 | |
| `ask_price` | 290.88 | |
| `bid_price` | 290.80 | |
| `ask_vol` | 100 | |
| `bid_vol` | 50 | |

## 52-Week & History
| Column | Example (AMD) | Notes |
|--------|--------------|-------|
| `highest52weeks_price` | 287.61 | ⚠️ No underscore before 52 |
| `lowest52weeks_price` | 91.87 | ⚠️ No underscore before 52 |
| `highest_history_price` | 287.61 | All-time high |
| `lowest_history_price` | 1.61 | All-time low |

## Pre/After/Overnight
| Column | Notes |
|--------|-------|
| `pre_price` | Pre-market last price |
| `pre_high_price` | Pre-market high |
| `pre_low_price` | Pre-market low |
| `pre_volume` | |
| `pre_turnover` | |
| `pre_change_val` | Pre-market price change |
| `pre_change_rate` | Pre-market % change |
| `pre_amplitude` | |
| `after_price` | After-hours last price |
| `after_high_price` | |
| `after_low_price` | |
| `after_volume` | |
| `after_turnover` | |
| `after_change_val` | |
| `after_change_rate` | |
| `after_amplitude` | |
| `overnight_price` | Overnight session last price |
| `overnight_high_price` | |
| `overnight_low_price` | |
| `overnight_volume` | |
| `overnight_turnover` | |
| `overnight_change_val` | |
| `overnight_change_rate` | |
| `overnight_amplitude` | |

## Fundamentals
| Column | Example (AMD) | Notes |
|--------|--------------|-------|
| `pe_ratio` | 107.354 | P/E |
| `pe_ttm_ratio` | 107.354 | P/E TTM |
| `pb_ratio` | 7.362 | P/B |
| `ey_ratio` | 0.068 | Earnings yield |
| `earning_per_share` | 2.65 | EPS |
| `net_asset_per_share` | 38.64 | Book value per share |
| `net_asset` | 62999074973.52 | Total book value |
| `net_profit` | 4320588733.95 | Net profit |
| `issued_shares` | 1630410843 | Total shares issued |
| `outstanding_shares` | 1603405287 | Float shares |
| `total_market_val` | 463835580725.07 | Market cap (total) |
| `circular_market_val` | 456152770098.63 | Market cap (float) |
| `dividend_ttm` | 0.0 | Dividend TTM (USD) |
| `dividend_ratio_ttm` | 0.0 | Dividend yield TTM |
| `dividend_lfy` | 0.0 | Last full year dividend |
| `dividend_lfy_ratio` | 0.0 | Last full year yield |

## Meta
| Column | Example (AMD) | Notes |
|--------|--------------|-------|
| `code` | "US.AMD" | Full Futu code |
| `name` | "Advanced Micro Devices" | Company name |
| `update_time` | "2026-04-22 04:53:22" | |
| `listing_date` | "1972-09-01" | IPO date |
| `lot_size` | 1 | Shares per lot |
| `price_spread` | 0.01 | Min tick size |
| `suspension` | false | Trading suspended? |
| `sec_status` | "NORMAL" | Security status |
