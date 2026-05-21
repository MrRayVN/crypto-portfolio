#!/usr/bin/env python3
"""
Parser for Binance trade history xlsx export ("Lịch sử giao dịch").

Filters to user-specified anchor date + portfolio assets only,
outputs aggregated summary JSON for dashboard validation (NOT raw data).

Usage:
  python parse_trade_history.py [xlsx-file] [--anchor YYYY-MM-DD HH:MM:SS]

Default anchor: 2025-09-27 01:33:08 (user's specified mốc thời gian)
Portfolio assets (whitelist): BTC, WBETH, BNB, LINK, BNSOL, USDC, USDT

Output: trade_history_summary.json — aggregates only, no raw transaction
data. Both xlsx input and JSON output are gitignored for privacy.
"""
import sys
import io
import json
import argparse
import glob
from pathlib import Path
import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PORTFOLIO_ASSETS = {'BTC', 'WBETH', 'BNB', 'LINK', 'BNSOL', 'USDC', 'USDT'}
DEFAULT_ANCHOR = '2025-09-27 01:33:08'

# Category mapping for activity types
CATEGORY_MAP = {
    # Spot trades (real cost basis impact)
    'Transaction Buy': 'spot_buy',
    'Transaction Sold': 'spot_sell',
    'Transaction Spend': 'spot_spend',  # USDT out for buying other asset
    'Transaction Revenue': 'spot_revenue',  # USDT in from selling other asset
    'Transaction Fee': 'spot_fee',
    'Binance Convert': 'convert',
    'Buy Crypto With Fiat': 'fiat_buy',

    # Earn / staking (yield, cost basis = 0)
    'Simple Earn Flexible Interest': 'earn_interest',
    'Simple Earn Flexible Subscription': 'earn_subscribe',
    'Simple Earn Flexible Redemption': 'earn_redeem',
    'Simple Earn Locked Subscription': 'earn_locked_sub',
    'Simple Earn Locked Redemption': 'earn_locked_redeem',
    'Simple Earn Locked Rewards': 'earn_locked_reward',
    'WBETH2.0 - Staking': 'wbeth_staking',
    'SOL Staking - Purchase': 'bnsol_staking',
    'RWUSD - Subscription': 'rwusd_sub',
    'RWUSD - Redemption': 'rwusd_redeem',
    'Dual Savings Purchase': 'dual_sub',
    'Dual Savings Settlement': 'dual_redeem',
    'BFUSD Redemption': 'bfusd_redeem',
    'Campaign Rewards': 'reward_campaign',
    'Cash Voucher': 'reward_voucher',
    'Cashback Voucher': 'reward_cashback',
    'Distribution': 'reward_distribution',

    # Loan
    'Flexible Loan - Lending': 'loan_borrow',
    'Flexible Loan - Repayment': 'loan_repay',
    'Flexible Loan - Asset Transfer': 'loan_transfer',
    'Flexible Loan - Collateral Transfer': 'loan_collateral',

    # Futures
    'Realized Profit and Loss': 'futures_pnl',
    'Funding Fee': 'futures_funding',
    'Fee': 'fee',  # context: account = futures → futures_fee
    'Futures Referral Rebate': 'futures_rebate',
    'Insurance Fund Refund': 'futures_insurance',

    # Transfers (no PnL impact)
    'Transfer Between Main and Funding Wallet': 'transfer_internal',
    'Transfer Between Spot Account and UM Futures Account': 'transfer_internal',
    'Transfer Between UM Futures and Funding Account': 'transfer_internal',
    'Transfer Between Main Account/Futures and Margin Account': 'transfer_internal',
    'Transfer Funds to Funding Wallet': 'transfer_internal',
    'Transfer Funds to Spot': 'transfer_internal',

    # External flows
    'Deposit': 'external_deposit',
    'Withdraw': 'external_withdraw',
    'P2P Trading': 'p2p',
    'Send': 'send',

    # Alpha (treated separately — usually scratch trading)
    'Alpha 2.0 - Asset Freeze': 'alpha',
    'Alpha 2.0 - Asset Unfreeze': 'alpha',
    'Alpha 2.0 - Transaction Revenue': 'alpha',
    'Alpha 2.0 - Refund': 'alpha',
    'Alpha - Instant Order Settlement': 'alpha',
    'Sell Web3 Alpha Tokens': 'alpha',

    # Misc
    'Small Assets Exchange BNB': 'dust_convert',
    'Funds Transfer Request - Vega': 'vega',
    'Merchant Acquiring': 'merchant',
}


def categorize(activity, account):
    cat = CATEGORY_MAP.get(activity, 'other')
    # Disambiguate Fee: futures vs spot
    if cat == 'fee' and 'Futures' in (account or ''):
        return 'futures_fee'
    if cat == 'fee':
        return 'spot_fee'
    return cat


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('xlsx_file', nargs='?', help='Path to trade history xlsx')
    ap.add_argument('--anchor', default=DEFAULT_ANCHOR, help='Anchor datetime (UTC+7)')
    ap.add_argument('--output', default='trade_history_summary.json')
    args = ap.parse_args()

    # Auto-detect file if not specified
    if not args.xlsx_file:
        candidates = sorted(glob.glob('Binance-*giao-dịch*.xlsx'))
        if not candidates:
            print('No trade history xlsx found. Usage: python parse_trade_history.py [file]')
            sys.exit(1)
        args.xlsx_file = candidates[-1]
        print(f'Auto-detected: {args.xlsx_file}')

    anchor_ts = pd.Timestamp(args.anchor)
    print(f'Anchor: {anchor_ts}')

    # Read xlsx (header row = 9)
    df = pd.read_excel(args.xlsx_file, header=9)
    df = df.dropna(axis=1, how='all')
    df.columns = [str(c).strip() for c in df.columns]

    # Map columns
    col_map = {}
    for c in df.columns:
        lc = c.lower()
        if 'thời gian' in lc: col_map['time'] = c
        elif 'tài khoản' in lc: col_map['account'] = c
        elif 'hoạt động' in lc: col_map['activity'] = c
        elif 'tiền mã' in lc: col_map['asset'] = c
        elif 'thay đổi' in lc: col_map['change'] = c

    df['time'] = pd.to_datetime(df[col_map['time']], format='%y-%m-%d %H:%M:%S', errors='coerce')
    df['account'] = df[col_map['account']]
    df['activity'] = df[col_map['activity']]
    df['asset'] = df[col_map['asset']]
    df['change'] = pd.to_numeric(df[col_map['change']], errors='coerce')

    raw_count = len(df)
    df = df[df['time'].notna()].copy()
    df_anchor = df[df['time'] >= anchor_ts].copy()
    df_filt = df_anchor[df_anchor['asset'].isin(PORTFOLIO_ASSETS)].copy()

    df_filt['category'] = df_filt.apply(lambda r: categorize(r['activity'], r['account']), axis=1)

    # === AGGREGATE ===
    earn_rewards_by_asset = {}
    for asset in PORTFOLIO_ASSETS:
        a_df = df_filt[df_filt['asset'] == asset]
        # Earn interest = positive yield
        earn_int = a_df[a_df['category'].isin(['earn_interest', 'earn_locked_reward', 'wbeth_staking', 'reward_campaign', 'reward_voucher', 'reward_cashback', 'reward_distribution'])]
        if len(earn_int) > 0:
            earn_rewards_by_asset[asset] = {
                'count': int(len(earn_int)),
                'total': float(earn_int['change'].sum()),
            }

    spot_trades_by_asset = {}
    for asset in PORTFOLIO_ASSETS:
        a_df = df_filt[df_filt['asset'] == asset]
        buys = a_df[a_df['category'] == 'spot_buy']
        sells = a_df[a_df['category'] == 'spot_sell']
        convert = a_df[a_df['category'] == 'convert']
        spot_trades_by_asset[asset] = {
            'spot_buy_qty': float(buys['change'].sum()) if len(buys) else 0,
            'spot_buy_count': int(len(buys)),
            'spot_sell_qty': float(sells['change'].sum()) if len(sells) else 0,
            'spot_sell_count': int(len(sells)),
            'convert_net_qty': float(convert['change'].sum()) if len(convert) else 0,
            'convert_count': int(len(convert)),
        }

    futures_summary = {
        'realized_pnl_usdt': float(df_filt[df_filt['category'] == 'futures_pnl']['change'].sum()),
        'funding_fee_usdt': float(df_filt[df_filt['category'] == 'futures_funding']['change'].sum()),
        'futures_fee_usdt': float(df_filt[df_filt['category'] == 'futures_fee']['change'].sum()),
        'rebate_usdt': float(df_filt[df_filt['category'] == 'futures_rebate']['change'].sum()),
        'insurance_usdt': float(df_filt[df_filt['category'] == 'futures_insurance']['change'].sum()),
    }
    futures_summary['net_pnl_usdt'] = (
        futures_summary['realized_pnl_usdt']
        + futures_summary['funding_fee_usdt']
        + futures_summary['futures_fee_usdt']
        + futures_summary['rebate_usdt']
        + futures_summary['insurance_usdt']
    )

    loan_summary = {
        'total_borrowed_usdt': float(df_filt[df_filt['category'] == 'loan_borrow']['change'].sum()),
        'total_repaid_usdt': float(df_filt[df_filt['category'] == 'loan_repay']['change'].sum()),
        'borrow_count': int((df_filt['category'] == 'loan_borrow').sum()),
        'repay_count': int((df_filt['category'] == 'loan_repay').sum()),
    }
    loan_summary['net_position_usdt'] = loan_summary['total_borrowed_usdt'] + loan_summary['total_repaid_usdt']

    alpha_summary = {
        'count_total': int((df_filt['category'] == 'alpha').sum()),
        'revenue_usdt': float(df_filt[(df_filt['category'] == 'alpha') & (df_filt['change'] > 0)]['change'].sum()),
        'expense_usdt': float(df_filt[(df_filt['category'] == 'alpha') & (df_filt['change'] < 0)]['change'].sum()),
    }
    alpha_summary['net_usdt'] = alpha_summary['revenue_usdt'] + alpha_summary['expense_usdt']

    # Net flow per asset (sanity check)
    net_flow = {}
    for asset in PORTFOLIO_ASSETS:
        a_df = df_filt[df_filt['asset'] == asset]
        net_flow[asset] = {
            'count': int(len(a_df)),
            'net_qty_change': float(a_df['change'].sum()),
        }

    out = {
        'source': 'binance_trade_history',
        'anchor_ts': str(anchor_ts),
        'period_start': str(df_filt['time'].min()) if len(df_filt) else None,
        'period_end': str(df_filt['time'].max()) if len(df_filt) else None,
        'imported_at_ts_ms': int(pd.Timestamp.now().timestamp() * 1000),
        'raw_rows': raw_count,
        'after_anchor_filter': int(len(df_anchor)),
        'after_portfolio_filter': int(len(df_filt)),
        'portfolio_assets': sorted(PORTFOLIO_ASSETS),
        'earn_rewards_by_asset': earn_rewards_by_asset,
        'spot_trades_by_asset': spot_trades_by_asset,
        'futures_summary': futures_summary,
        'loan_summary': loan_summary,
        'alpha_summary': alpha_summary,
        'net_flow_per_asset': net_flow,
    }

    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    # Print human-readable summary
    print()
    print(f'=== TRADE HISTORY SUMMARY since {anchor_ts} ===')
    print(f'Raw rows: {raw_count}  ·  After anchor: {len(df_anchor)}  ·  After portfolio filter: {len(df_filt)}')
    print()
    print('FUTURES PnL:')
    for k, v in futures_summary.items():
        print(f'  {k:25s}: {v:+12,.4f} USDT')
    print()
    print('LOAN ACTIVITY:')
    for k, v in loan_summary.items():
        print(f'  {k:25s}: {v:+12,.4f}')
    print()
    print('ALPHA ACTIVITY (separate from main strategy):')
    for k, v in alpha_summary.items():
        print(f'  {k:25s}: {v:+12,.4f}')
    print()
    print('SPOT TRADES (real cost basis impact):')
    for asset, d in spot_trades_by_asset.items():
        if d['spot_buy_count'] + d['spot_sell_count'] + d['convert_count'] > 0:
            print(f'  {asset:6s}: buy {d["spot_buy_qty"]:+.6f} ({d["spot_buy_count"]}x) · sell {d["spot_sell_qty"]:+.6f} ({d["spot_sell_count"]}x) · convert_net {d["convert_net_qty"]:+.6f} ({d["convert_count"]}x)')
    print()
    print('EARN REWARDS by asset:')
    for asset, d in earn_rewards_by_asset.items():
        print(f'  {asset:6s}: {d["total"]:+.6f} ({d["count"]} events)')
    print()
    print('NET FLOW (sanity check — should be ~0 if no external):')
    for asset, d in net_flow.items():
        if abs(d['net_qty_change']) > 1e-6:
            print(f'  {asset:6s}: {d["net_qty_change"]:+.6f} ({d["count"]} rows)')
    print()
    print(f'Saved to {args.output}')


if __name__ == '__main__':
    main()
