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
import logging

# Silence ib_insync INFO spam
logging.getLogger('ib_insync').setLevel(logging.WARNING)

app = Flask(__name__)
CORS(app, origins=[
    "https://claudiachez.github.io",
    "http://localhost:*",
    "http://127.0.0.1:*",
])

IB_HOST    = '127.0.0.1'
IB_PORT    = 4001   # 4001 = live, 4002 = paper
IB_CLIENT  = 10     # any unused client ID


def _connect():
    ib = IB()
    ib.connect(IB_HOST, IB_PORT, clientId=IB_CLIENT,
               readonly=True, timeout=8)
    return ib


@app.route('/status')
def status():
    """Health-check — also used to trigger cert acceptance in the browser."""
    try:
        ib = _connect()
        accounts = ib.managedAccounts()
        ib.disconnect()
        return jsonify({'ok': True, 'accounts': accounts})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 503


@app.route('/positions')
def positions():
    """
    Returns all portfolio positions with market data and P&L.
    Each item:
      ticker, secType, position, mktPrice, mktValue,
      unrealizedPnl, realizedPnl, avgCost,
      strike, right, expiry  (options only)
    """
    try:
        ib = _connect()
        portfolio = ib.portfolio()
        ib.disconnect()

        result = []
        for item in portfolio:
            c = item.contract
            entry = {
                'ticker':        c.symbol,
                'secType':       c.secType,          # STK, OPT, etc.
                'position':      item.position,
                'mktPrice':      item.marketPrice,
                'mktValue':      item.marketValue,
                'unrealizedPnl': item.unrealizedPNL,
                'realizedPnl':   item.realizedPNL,
                'avgCost':       item.averageCost,
                # options-only fields
                'strike':  c.strike  if c.secType == 'OPT' else None,
                'right':   c.right   if c.secType == 'OPT' else None,
                'expiry':  c.lastTradeDateOrContractMonth if c.secType == 'OPT' else None,
                'multiplier': int(c.multiplier) if c.multiplier else 100,
            }
            result.append(entry)

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
