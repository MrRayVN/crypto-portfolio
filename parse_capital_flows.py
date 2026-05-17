#!/usr/bin/env python3
"""
Unified parser for Binance capital flow xlsx exports:
  - C2C history (P2P trades): BUY USDT = deposit, SELL USDT = withdrawal
  - Fiat purchase history (VietQR/Card): all = deposits

Usage:
  python parse_capital_flows.py [xlsx-files...]
    Auto-detects file type by inspecting headers.
    Aggregates all into single capital_flows.json.

Default anchor date: 2025-08-01
"""
import sys
import json
import glob
import argparse
from datetime import datetime
import pandas as pd


def detect_file_type(xlsx_path):
    """Detect xlsx type by inspecting first 12 rows for keywords."""
    raw = pd.read_excel(xlsx_path, header=None, nrows=12)
    text = ' '.join(str(v) for row in raw.values for v in row if pd.notna(v))
    if 'Lịch sử lệnh C2C' in text or 'C2C' in text or 'Loại tiền pháp định' in text:
        return 'c2c'
    if 'mua tiền pháp định' in text or 'Phương thức' in text or 'Số tiền chi tiêu' in text:
        return 'fiat'
    return 'unknown'


def parse_c2c(xlsx_path, anchor_ts):
    df = pd.read_excel(xlsx_path, skiprows=8)
    df.columns = ['_a','_b','order_id','side','asset','fiat','total_fiat','price','quantity','rate','create_fee','exec_fee','counterparty','status','time']
    df = df[df['order_id'].notna() & (df['status'] == 'Completed')].copy()
    df['time'] = pd.to_datetime(df['time'], format='%y-%m-%d %H:%M:%S')
    df['quantity'] = pd.to_numeric(df['quantity'], errors='coerce')
    df['total_fiat'] = pd.to_numeric(df['total_fiat'], errors='coerce')
    df['price'] = pd.to_numeric(df['price'], errors='coerce')
    df = df[df['time'] >= anchor_ts].sort_values('time').reset_index(drop=True)
    orders = []
    for _, row in df.iterrows():
        orders.append({
            'ts_ms': int(row['time'].timestamp() * 1000),
            'date': row['time'].strftime('%Y-%m-%d %H:%M:%S'),
            'side': row['side'],  # Buy = deposit, Sell = withdrawal
            'source_type': 'c2c',
            'usdt_amount': round(float(row['quantity']), 2),
            'vnd_amount': round(float(row['total_fiat']), 0),
            'price_vnd_per_usdt': round(float(row['price']), 0) if pd.notna(row['price']) else None,
        })
    return orders


def parse_fiat(xlsx_path, anchor_ts):
    df = pd.read_excel(xlsx_path, skiprows=8)
    df.columns = ['_a','_b','time','_c','method','_d','spent','_e','received','_f','fee','_g','rate','_h','status','_i','txid']
    df = df[df['time'].notna() & (df['time'] != 'Thời gian') & (df['status'] == 'Successful')].copy()
    df['time'] = pd.to_datetime(df['time'], format='%y-%m-%d %H:%M:%S')
    df = df[df['time'] >= anchor_ts].sort_values('time').reset_index(drop=True)
    orders = []
    for _, row in df.iterrows():
        usdt = float(str(row['received']).replace(' USDT', '').strip())
        vnd = float(str(row['spent']).replace(' VND', '').strip())
        rate_str = str(row['rate']).replace(' USDT/VND', '').strip() if pd.notna(row['rate']) else None
        rate = float(rate_str) if rate_str else None
        orders.append({
            'ts_ms': int(row['time'].timestamp() * 1000),
            'date': row['time'].strftime('%Y-%m-%d %H:%M:%S'),
            'side': 'Buy',  # All fiat purchases are deposits
            'source_type': 'fiat',
            'method': row['method'],
            'usdt_amount': round(usdt, 2),
            'vnd_amount': round(vnd, 0),
            'price_vnd_per_usdt': round(rate, 0) if rate else None,
        })
    return orders


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('xlsx_files', nargs='*', help='Paths to xlsx files (auto-detect type)')
    ap.add_argument('--anchor', default='2025-08-01', help='Anchor date YYYY-MM-DD')
    ap.add_argument('--output', default='capital_flows.json')
    args = ap.parse_args()

    # If no args, glob all C2C and Fiat xlsx in current dir
    if not args.xlsx_files:
        args.xlsx_files = sorted(glob.glob('Binance-*C2C*.xlsx') + glob.glob('Binance-*mua-tiền-pháp-định*.xlsx'))
    if not args.xlsx_files:
        print('No xlsx files found. Usage: python parse_capital_flows.py [files...]')
        sys.exit(1)

    anchor_ts = pd.Timestamp(args.anchor)
    all_orders = []
    sources_info = []

    for xlsx in args.xlsx_files:
        ftype = detect_file_type(xlsx)
        print(f'  {xlsx}: type={ftype}')
        if ftype == 'c2c':
            orders = parse_c2c(xlsx, anchor_ts)
        elif ftype == 'fiat':
            orders = parse_fiat(xlsx, anchor_ts)
        else:
            print(f'    SKIP (unknown type)')
            continue
        sources_info.append({
            'file': xlsx.split('\\')[-1].split('/')[-1],
            'type': ftype,
            'order_count': len(orders),
            'buy_count': sum(1 for o in orders if o['side'] == 'Buy'),
            'sell_count': sum(1 for o in orders if o['side'] == 'Sell'),
            'buy_usdt': round(sum(o['usdt_amount'] for o in orders if o['side'] == 'Buy'), 2),
            'sell_usdt': round(sum(o['usdt_amount'] for o in orders if o['side'] == 'Sell'), 2),
        })
        all_orders.extend(orders)

    # Sort all orders chronologically
    all_orders.sort(key=lambda o: o['ts_ms'])

    # Aggregate totals
    buy = [o for o in all_orders if o['side'] == 'Buy']
    sell = [o for o in all_orders if o['side'] == 'Sell']
    total_dep = round(sum(o['usdt_amount'] for o in buy), 2)
    total_with = round(sum(o['usdt_amount'] for o in sell), 2)

    out = {
        'source': 'binance_capital_flows_combined',
        'period_start_ts_ms': int(anchor_ts.timestamp() * 1000),
        'period_start': args.anchor,
        'period_end': max((o['date'][:10] for o in all_orders), default=args.anchor),
        'imported_at_ts_ms': int(pd.Timestamp.now().timestamp() * 1000),
        'sources': sources_info,
        'total_deposits_usd': total_dep,
        'total_withdrawals_usd': total_with,
        'net_deposit_usd': round(total_dep - total_with, 2),
        'deposit_count': len(buy),
        'withdraw_count': len(sell),
        'orders': all_orders,
    }

    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    print()
    print(f'=== AGGREGATED CAPITAL FLOWS since {args.anchor} ===')
    print(f'Sources: {len(sources_info)} files')
    for s in sources_info:
        print(f'  · {s["type"].upper():5s} ({s["file"]}): {s["order_count"]} orders, '
              f'BUY ${s["buy_usdt"]:>10,.2f} ({s["buy_count"]}), SELL ${s["sell_usdt"]:>10,.2f} ({s["sell_count"]})')
    print()
    print(f'  Total DEPOSITS:    ${total_dep:>12,.2f}  ({len(buy)} orders)')
    print(f'  Total WITHDRAWALS: ${total_with:>12,.2f}  ({len(sell)} orders)')
    print(f'  Net flow:          ${total_dep - total_with:>+12,.2f}')
    print()
    print(f'  Saved to {args.output}')


if __name__ == '__main__':
    main()
