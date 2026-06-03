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
from datetime import date, timedelta
import asyncio
import logging
import random

logging.getLogger('ib_insync').setLevel(logging.WARNING)

app = Flask(__name__)
# Local proxy only — allow all origins so the deployed admin can POST to localhost
CORS(app, resources={r"/*": {"origins": "*"}},
     allow_headers=["Content-Type"], methods=["GET", "POST", "OPTIONS"])


@app.after_request
def _allow_private_network(resp):
    # Chrome Private Network Access: a public/HTTPS origin (the deployed admin on
    # *.netlify.app) is blocked from calling this localhost proxy unless the
    # preflight response opts in. Harmless for a local (localhost) origin.
    resp.headers['Access-Control-Allow-Private-Network'] = 'true'
    return resp

IB_HOST = '127.0.0.1'
IB_PORT = 4001   # 4001 = live, 4002 = paper


def _new_client_id():
    """Random clientId so concurrent requests never collide."""
    return random.randint(20, 200)


def _third_friday(yyyymm: str) -> str:
    """Standard monthly equity-option expiration: the 3rd Friday of the month.

    IB stores monthly options as the dated 3rd-Friday contract (YYYYMMDD), so a
    bare YYYYMM ('Oct 26' with no day) usually fails to qualify. Resolving it to
    the 3rd Friday lets us price legs whose detail string omits the expiry day.
    Returns 'YYYYMMDD'.
    """
    y, m = int(yyyymm[:4]), int(yyyymm[4:6])
    first = date(y, m, 1)
    # weekday(): Mon=0 .. Fri=4 — offset from the 1st to the first Friday.
    first_friday = first + timedelta(days=(4 - first.weekday()) % 7)
    return (first_friday + timedelta(days=14)).strftime('%Y%m%d')


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
                raw_expiry = str(spec['expiry'])
                is_month_only = len(raw_expiry) == 6 and raw_expiry.isdigit()

                def _make(exp):
                    return Option(
                        spec['symbol'], str(exp), float(spec['strike']),
                        spec['right'].upper(), 'SMART', currency='USD'
                    )

                # Resolve the contract, most-compatible form first:
                #   1) the expiry exactly as given — a bare YYYYMM lets IB resolve the
                #      monthly itself, which works for most names (incl. thin small caps);
                #   2) only if that fails for a month-only expiry, the standard monthly
                #      (3rd Friday) to pin a single contract when YYYYMM was ambiguous.
                candidates = [raw_expiry]
                if is_month_only:
                    candidates.append(_third_friday(raw_expiry))

                valid = []
                resolved_expiry = raw_expiry
                for cand in candidates:
                    qualified = await ib.qualifyContractsAsync(_make(cand))
                    valid = [c for c in qualified if c.conId and c.conId > 0]
                    if valid:
                        resolved_expiry = cand
                        break

                # Still unresolved → ask IB what actually exists for this strike+month
                # and take the monthly (3rd-Friday match, else the latest listed).
                if not valid and is_month_only:
                    details = await ib.reqContractDetailsAsync(_make(raw_expiry))
                    contracts = [d.contract for d in details if d.contract.conId and d.contract.conId > 0]
                    if contracts:
                        tf = _third_friday(raw_expiry)
                        pick = next(
                            (c for c in contracts if c.lastTradeDateOrContractMonth in (tf, raw_expiry)),
                            max(contracts, key=lambda c: c.lastTradeDateOrContractMonth),
                        )
                        valid = [pick]
                        resolved_expiry = pick.lastTradeDateOrContractMonth

                if not valid:
                    # IB has no matching contract (e.g. an unlisted deep-ITM strike).
                    # Report whatever exists for this strike/month so position_detail can
                    # be fixed; leave the leg unpriced rather than blocking the others.
                    details = await ib.reqContractDetailsAsync(_make(raw_expiry))
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

                # Echo back the resolved dated expiry so stored legs carry YYYYMMDD.
                spec = {**spec, 'expiry': resolved_expiry}

                [ticker] = await ib.reqTickersAsync(valid[0])
                bid   = ticker.bid   if ticker.bid   and ticker.bid   > 0 else None
                ask   = ticker.ask   if ticker.ask   and ticker.ask   > 0 else None
                last  = ticker.last  if ticker.last  and ticker.last  > 0 else None
                close = ticker.close if ticker.close and ticker.close > 0 else None
                mid   = round((bid + ask) / 2, 4) if bid and ask else None
                price = last or mid or close

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
