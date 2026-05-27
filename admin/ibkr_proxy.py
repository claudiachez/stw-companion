#!/usr/bin/env python3
"""
ibkr_proxy.py — IB Gateway → HTTP bridge for STW Companion dashboard

Install deps once:
    pip3 install flask flask-cors ib_insync pyopenssl

Run:
    python3 ibkr_proxy.py

First run: visit https://localhost:8765/status in your browser and
click Advanced → Proceed to accept the self-signed cert (one-time only).
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from ib_insync import IB, Option
import asyncio
import logging
import random

logging.getLogger('ib_insync').setLevel(logging.WARNING)

app = Flask(__name__)
# Local proxy only — allow all origins so GitHub Pages can POST to localhost
CORS(app, resources={r"/*": {"origins": "*"}},
     allow_headers=["Content-Type"], methods=["GET", "POST", "OPTIONS"])

IB_HOST = '127.0.0.1'
IB_PORT = 4001   # 4001 = live, 4002 = paper


def _new_client_id():
    """Random clientId so concurrent requests never collide."""
    return random.randint(20, 200)


# ── Status ───────────────────────────────────────────────
async def _check_status():
    ib = IB()
    try:
        await ib.connectAsync(IB_HOST, IB_PORT, clientId=_new_client_id(), readonly=True)
        return ib.managedAccounts()
    finally:
        if ib.isConnected():
            ib.disconnect()


@app.route('/status')
def status():
    try:
        accounts = asyncio.run(_check_status())
        return jsonify({'ok': True, 'accounts': accounts})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 503


# ── Option prices ────────────────────────────────────────
async def _price_options(specs):
    """
    specs: list of {symbol, strike, right, expiry, entry}
      expiry: 'YYYYMM' (monthly) or 'YYYYMMDD' (weekly/specific)
    Returns same list enriched with price, bid, ask, mid, pnl_pct, pnl_dol.
    """
    ib = IB()
    try:
        await ib.connectAsync(IB_HOST, IB_PORT, clientId=_new_client_id(), readonly=True)
        ib.reqMarketDataType(4)   # delayed-frozen — works outside market hours

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
                valid = [c for c in qualified if c.conId and c.conId > 0]
                if not valid:
                    # Ambiguous — fetch all possible contracts and return them for the user to fix
                    details = await ib.reqContractDetailsAsync(contract)
                    possibles = [
                        {'expiry': d.contract.lastTradeDateOrContractMonth,
                         'strike': d.contract.strike,
                         'right':  d.contract.right}
                        for d in details
                    ]
                    results.append({**spec, 'price': None,
                                    'error': 'ambiguous',
                                    'possibles': possibles})
                    continue

                [ticker] = await ib.reqTickersAsync(valid[0])
                bid   = ticker.bid   if ticker.bid   and ticker.bid   > 0 else None
                ask   = ticker.ask   if ticker.ask   and ticker.ask   > 0 else None
                last  = ticker.last  if ticker.last  and ticker.last  > 0 else None
                close = ticker.close if ticker.close and ticker.close > 0 else None
                mid   = round((bid + ask) / 2, 4) if bid and ask else None
                # Priority: mid (current fair value) → close (official day close) → last (most recent trade)
                # "last" is intentionally last: it reflects an actual trade that may be hours old,
                # while mid/close better represent the current mark. After market hours, IBKR's
                # delayed-frozen data often returns null bid/ask but a valid close.
                price = mid or close or last

                entry   = float(spec.get('entry', 0))
                pnl_pct = round((price - entry) / entry * 100, 2) if price and entry else None
                pnl_dol = round(price - entry, 4)                  if price and entry else None

                results.append({**spec, 'price': price, 'bid': bid, 'ask': ask,
                                 'mid': mid, 'pnl_pct': pnl_pct, 'pnl_dol': pnl_dol})
            except Exception as e:
                results.append({**spec, 'price': None, 'error': str(e)})

        return results

    finally:
        if ib.isConnected():
            ib.disconnect()


@app.route('/option_prices', methods=['POST'])
def option_prices():
    try:
        specs = request.get_json()
        if not specs:
            return jsonify({'error': 'empty request body'}), 400
        result = asyncio.run(_price_options(specs))
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 503


# ── SSL cert (persistent) ────────────────────────────────
def _get_ssl_context():
    from pathlib import Path
    cert_file = Path('ibkr_cert.pem')
    key_file  = Path('ibkr_key.pem')

    if not cert_file.exists() or not key_file.exists():
        from OpenSSL import crypto
        k = crypto.PKey()
        k.generate_key(crypto.TYPE_RSA, 2048)
        c = crypto.X509()
        c.get_subject().CN = 'localhost'
        c.set_serial_number(1)
        c.gmtime_adj_notBefore(0)
        c.gmtime_adj_notAfter(5 * 365 * 24 * 60 * 60)
        c.set_issuer(c.get_subject())
        c.set_pubkey(k)
        c.sign(k, 'sha256')
        cert_file.write_bytes(crypto.dump_certificate(crypto.FILETYPE_PEM, c))
        key_file.write_bytes(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))
        print("  New cert generated — visit https://localhost:8765/status")
        print("  and click Advanced → Proceed (one-time only).")
    else:
        print("  Reusing existing SSL cert.")

    return (str(cert_file), str(key_file))


if __name__ == '__main__':
    print("=" * 55)
    print("  STW Companion — IBKR Proxy")
    print(f"  IB Gateway: {IB_HOST}:{IB_PORT}")
    print("=" * 55)
    ssl_ctx = _get_ssl_context()
    app.run(host='localhost', port=8765, ssl_context=ssl_ctx, debug=False)
