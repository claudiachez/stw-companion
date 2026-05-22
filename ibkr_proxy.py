#!/usr/bin/env python3
"""
ibkr_proxy.py — IB Gateway → HTTP bridge for STW Companion dashboard
Connects to IB Gateway (port 4001) and exposes a small REST API
that the browser dashboard can call.

Install deps once:
    pip install flask flask-cors ib_insync pyopenssl

Run:
    python ibkr_proxy.py

Then visit https://localhost:8765/status in your browser,
click Advanced → Proceed to accept the self-signed cert (one-time).
The dashboard will connect automatically after that.
"""

from flask import Flask, jsonify
from flask_cors import CORS
from ib_insync import IB
import asyncio
import logging

# Silence ib_insync INFO spam
logging.getLogger('ib_insync').setLevel(logging.WARNING)

app = Flask(__name__)
CORS(app, origins=[
    "https://claudiachez.github.io",
    "http://localhost:*",
    "http://127.0.0.1:*",
])

IB_HOST   = '127.0.0.1'
IB_PORT   = 4001   # 4001 = live, 4002 = paper
IB_CLIENT = 10     # any unused client ID


def _serialize(item):
    c = item.contract
    return {
        'ticker':        c.symbol,
        'secType':       c.secType,
        'position':      item.position,
        'mktPrice':      item.marketPrice,
        'mktValue':      item.marketValue,
        'unrealizedPnl': item.unrealizedPNL,
        'realizedPnl':   item.realizedPNL,
        'avgCost':       item.averageCost,
        'strike':     c.strike  if c.secType == 'OPT' else None,
        'right':      c.right   if c.secType == 'OPT' else None,
        'expiry':     c.lastTradeDateOrContractMonth if c.secType == 'OPT' else None,
        'multiplier': int(c.multiplier) if c.multiplier else 100,
    }


async def _check_status():
    ib = IB()
    await ib.connectAsync(IB_HOST, IB_PORT, clientId=IB_CLIENT, readonly=True)
    accounts = ib.managedAccounts()
    ib.disconnect()
    return accounts


async def _price_options(specs):
    """
    specs: list of {symbol, strike, right, expiry, entry}
      expiry: 'YYYYMM' (monthly) or 'YYYYMMDD' (weekly/specific)
    Returns same list with price, bid, ask, pnl_pct added.
    """
    from ib_insync import Option

    ib = IB()
    await ib.connectAsync(IB_HOST, IB_PORT, clientId=IB_CLIENT, readonly=True)
    # Use delayed-frozen data so this works outside market hours too
    ib.reqMarketDataType(4)

    results = []
    for spec in specs:
        try:
            contract = Option(
                spec['symbol'],
                str(spec['expiry']),
                float(spec['strike']),
                spec['right'].upper(),
                'SMART',
                currency='USD'
            )
            qualified = await ib.qualifyContractsAsync(contract)
            if not qualified:
                results.append({**spec, 'price': None, 'error': 'contract not found'})
                continue

            [ticker] = await ib.reqTickersAsync(qualified[0])
            # Use last → close → midpoint as fallback chain
            bid   = ticker.bid   if ticker.bid   and ticker.bid   > 0 else None
            ask   = ticker.ask   if ticker.ask   and ticker.ask   > 0 else None
            last  = ticker.last  if ticker.last  and ticker.last  > 0 else None
            close = ticker.close if ticker.close and ticker.close > 0 else None
            mid   = round((bid + ask) / 2, 4) if bid and ask else None
            price = last or mid or close

            entry   = float(spec.get('entry', 0))
            pnl_pct = round((price - entry) / entry * 100, 2) if price and entry else None
            pnl_dol = round(price - entry, 4) if price and entry else None

            results.append({**spec, 'price': price, 'bid': bid, 'ask': ask,
                             'mid': mid, 'pnl_pct': pnl_pct, 'pnl_dol': pnl_dol})
        except Exception as e:
            results.append({**spec, 'price': None, 'error': str(e)})

    ib.disconnect()
    return results


@app.route('/status')
def status():
    try:
        accounts = asyncio.run(_check_status())
        return jsonify({'ok': True, 'accounts': accounts})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 503


@app.route('/option_prices', methods=['POST'])
def option_prices():
    """
    Body: JSON array of {symbol, strike, right, expiry, entry}
    Returns same array with price, bid, ask, mid, pnl_pct, pnl_dol.
    """
    from flask import request
    try:
        specs = request.get_json()
        if not specs:
            return jsonify({'error': 'No specs provided'}), 400
        result = asyncio.run(_price_options(specs))
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 503


if __name__ == '__main__':
    print("=" * 55)
    print("  STW Companion — IBKR Proxy")
    print(f"  Connecting to IB Gateway at {IB_HOST}:{IB_PORT}")
    print()
    print("  First run: visit https://localhost:8765/status")
    print("  in your browser and accept the self-signed cert.")
    print("=" * 55)
    # adhoc = auto-generated self-signed cert (requires pyopenssl)
    # This lets GitHub Pages (HTTPS) call us without mixed-content errors.
    app.run(host='localhost', port=8765, ssl_context='adhoc', debug=False)
