#!/usr/bin/env python3
"""
Parse Binance C2C order history xlsx → capital_flows_c2c.json
Usage: python parse_c2c.py <path-to-xlsx> [anchor_date_YYYY-MM-DD]
Default anchor date: 2025-08-01

After update:
  git add capital_flows_c2c.json
  git commit -m "Update C2C capital flows"
  git push
"""
import sys
import json
import argparse
from datetime import datetime
import pandas as pd

def parse(xlsx_path, anchor_date='2025-08-01'):
    df = pd.read_excel(xlsx_path, skiprows=8)
    df.columns = ['_a','_b','order_id','side','asset','fiat','total_fiat','price','quantity','rate','create_fee','exec_fee','counterparty','status','time']
    df = df[df['order_id'].notna()].copy()
    df = df[df['status'] == 'Completed'].copy()
    df['time'] = pd.to_datetime(df['time'], format='%y-%m-%d %H:%M:%S')
    df['quantity'] = pd.to_numeric(df['quantity'], errors='coerce')
    df['total_fiat'] = pd.to_numeric(df['total_fiat'], errors='coerce')
    df['price'] = pd.to_numeric(df['price'], errors='coerce')

    anchor_ts = pd.Timestamp(anchor_date)
    df = df[df['time'] >= anchor_ts].copy()
    df = df.sort_values('time').reset_index(drop=True)

    buy = df[df['side'] == 'Buy']
    sell = df[df['side'] == 'Sell']

    out = {
        'source': 'binance_c2c_xlsx',
        'period_start_ts_ms': int(anchor_ts.timestamp() * 1000),
        'period_start': anchor_date,
        'period_end': df['time'].max().strftime('%Y-%m-%d') if len(df) else anchor_date,
        'imported_at_ts_ms': int(pd.Timestamp.now().timestamp() * 1000),
        'imported_from': xlsx_path.split('\\')[-1].split('/')[-1],
        'total_deposits_usd': round(float(buy['quantity'].sum()), 2),
        'total_withdrawals_usd': round(float(sell['quantity'].sum()), 2),
        'net_deposit_usd': round(float(buy['quantity'].sum() - sell['quantity'].sum()), 2),
        'deposit_count': len(buy),
        'withdraw_count': len(sell),
        'orders': [
            {
                'ts_ms': int(row['time'].timestamp() * 1000),
                'date': row['time'].strftime('%Y-%m-%d %H:%M:%S'),
                'side': row['side'],
                'usdt_amount': round(float(row['quantity']), 2),
                'vnd_amount': round(float(row['total_fiat']), 0),
                'price_vnd_per_usdt': round(float(row['price']), 0) if pd.notna(row['price']) else None,
            }
            for _, row in df.iterrows()
        ],
    }
    return out

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('xlsx', help='Path to Binance C2C history xlsx')
    ap.add_argument('--anchor', default='2025-08-01', help='Anchor date YYYY-MM-DD')
    ap.add_argument('--output', default='capital_flows_c2c.json')
    args = ap.parse_args()

    data = parse(args.xlsx, args.anchor)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f'OK · {len(data["orders"])} orders since {data["period_start"]}')
    print(f'  Deposits (BUY):     ${data["total_deposits_usd"]:>12,.2f}  ({data["deposit_count"]} orders)')
    print(f'  Withdrawals (SELL): ${data["total_withdrawals_usd"]:>12,.2f}  ({data["withdraw_count"]} orders)')
    print(f'  Net flow:           ${data["net_deposit_usd"]:>+12,.2f}')
    print(f'  Saved to {args.output}')
