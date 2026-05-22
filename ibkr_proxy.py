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
# Allow all origins — this is a local-only proxy, nothing sensitive is exposed
CORS(app, resources={r"/*": {"origins": "*"}},
     allow_headers=["Content-Type"], methods=["GET", "POST", "OPTIONS"])

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


def _get_ssl_context():
    """
    Generate a self-signed cert once and reuse it on every restart.
    This avoids the browser blocking the request after each restart
    because the cert fingerprint changed.
    """
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
        c.gmtime_adj_notAfter(5 * 365 * 24 * 60 * 60)   # 5 years
        c.set_issuer(c.get_subject())
        c.set_pubkey(k)
        c.sign(k, 'sha256')
        cert_file.write_bytes(crypto.dump_certificate(crypto.FILETYPE_PEM, c))
        key_file.write_bytes(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))
        print("  Generated new SSL cert — visit https://localhost:8765/status")
        print("  once in your browser and click Advanced → Proceed.")
    else:
        print("  Reusing existing SSL cert (no re-acceptance needed).")

    return (str(cert_file), str(key_file))


if __name__ == '__main__':
    print("=" * 55)
    print("  STW Companion — IBKR Proxy")
    print(f"  Connecting to IB Gateway at {IB_HOST}:{IB_PORT}")
    print("=" * 55)
    ssl_ctx = _get_ssl_context()
    app.run(host='localhost', port=8765, ssl_context=ssl_ctx, debug=False)
