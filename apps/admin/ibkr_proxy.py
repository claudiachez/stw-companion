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
    specs: list of {leg_id, symbol, strike, right, expiry, entry}
      expiry: 'YYYYMM' (monthly) or 'YYYYMMDD' (weekly/specific)
    Returns the same list (incl. leg_id, echoed) enriched with price, bid, ask, mid,
    pnl_pct, pnl_dol. This is a pricer only — the caller persists each `price` as the
    leg's mark_price (mark_price_source='IBKR'); the proxy never writes to Supabase.
    """
    ib = IB()
    try:
        await ib.connectAsync(IB_HOST, IB_PORT, clientId=_new_client_id(), readonly=True)
        ib.reqMarketDataType(4)   # delayed-frozen — works outside market hours

        def _make(spec, exp):
            return Option(
                spec['symbol'], str(exp), float(spec['strike']),
                spec['right'].upper(), 'SMART', currency='USD'
            )

        # One entry per spec, carrying resolution state. Everything below operates
        # on the whole batch at once (a single qualify + a single snapshot round-trip)
        # instead of per-leg serial calls — the snapshot wait is what made this slow.
        entries = []
        for spec in specs:
            raw = str(spec['expiry'])
            is_month = len(raw) == 6 and raw.isdigit()
            entries.append({
                'spec': spec, 'raw': raw, 'is_month': is_month,
                'contract': _make(spec, raw), 'resolved': raw,
                'valid': False, 'ticker': None, 'error': None, 'possibles': None,
            })

        # ── Pass 1: qualify every primary candidate in ONE round-trip ──
        # A bare YYYYMM lets IB resolve the monthly itself (works for most names,
        # incl. thin small caps). qualifyContracts mutates each contract in place
        # and only sets conId on an unambiguous match.
        try:
            await ib.qualifyContractsAsync(*[e['contract'] for e in entries])
        except Exception:
            pass  # per-leg state is read from conId below; stragglers fall through
        for e in entries:
            if e['contract'].conId and e['contract'].conId > 0:
                e['valid'] = True

        # ── Pass 2: month-only legs that missed → try the standard 3rd Friday, batched ──
        retry = [e for e in entries if not e['valid'] and e['is_month']]
        for e in retry:
            e['contract'] = _make(e['spec'], _third_friday(e['raw']))
        if retry:
            try:
                await ib.qualifyContractsAsync(*[e['contract'] for e in retry])
            except Exception:
                pass
            for e in retry:
                if e['contract'].conId and e['contract'].conId > 0:
                    e['valid'] = True
                    e['resolved'] = _third_friday(e['raw'])

        # ── Pass 3: still-unresolved stragglers → ask IB what exists (rare; serial) ──
        # For a month-only leg, pick the monthly (3rd-Friday match, else latest listed);
        # otherwise leave it unpriced and report the candidates so the leg's expiry can be fixed.
        for e in entries:
            if e['valid']:
                continue
            try:
                details = await ib.reqContractDetailsAsync(_make(e['spec'], e['raw']))
            except Exception as exc:
                e['error'] = str(exc)
                continue
            contracts = [d.contract for d in details if d.contract.conId and d.contract.conId > 0]
            if e['is_month'] and contracts:
                tf = _third_friday(e['raw'])
                pick = next(
                    (c for c in contracts if c.lastTradeDateOrContractMonth in (tf, e['raw'])),
                    max(contracts, key=lambda c: c.lastTradeDateOrContractMonth),
                )
                e['contract'] = pick
                e['valid'] = True
                e['resolved'] = pick.lastTradeDateOrContractMonth
            else:
                e['error'] = 'ambiguous'
                e['possibles'] = [
                    {'expiry': d.contract.lastTradeDateOrContractMonth,
                     'strike': d.contract.strike,
                     'right':  d.contract.right}
                    for d in details
                ]

        # Pull a usable price out of a ticker. Delayed-frozen data has null bid/ask
        # off-hours, so fall back to last → mid → close.
        def _quote(t):
            if t is None:
                return (None, None, None, None, None, None)
            bid   = t.bid   if t.bid   and t.bid   > 0 else None
            ask   = t.ask   if t.ask   and t.ask   > 0 else None
            last  = t.last  if t.last  and t.last  > 0 else None
            close = t.close if t.close and t.close > 0 else None
            mid   = round((bid + ask) / 2, 4) if bid and ask else None
            return (bid, ask, last, close, mid, last or mid or close)

        # ── Single batched market-data snapshot for all resolved legs ──
        # reqTickers fetches every contract concurrently; chunk to stay under IB's
        # market-data line cap on large portfolios.
        valid_entries = [e for e in entries if e['valid']]
        CHUNK = 50
        for i in range(0, len(valid_entries), CHUNK):
            chunk = valid_entries[i:i + CHUNK]
            try:
                tickers = await ib.reqTickersAsync(*[e['contract'] for e in chunk])
                for e, ticker in zip(chunk, tickers):
                    e['ticker'] = ticker
            except Exception as exc:
                for e in chunk:
                    e['error'] = e['error'] or str(exc)

        # Retry — one contract at a time — any leg the batch returned without a usable
        # price. A concurrent frozen snapshot occasionally drops an illiquid contract
        # (deep-ITM / far-dated) that prices fine when requested on its own.
        for e in valid_entries:
            if _quote(e.get('ticker'))[5] is not None:
                continue
            try:
                [ticker] = await ib.reqTickersAsync(e['contract'])
                e['ticker'] = ticker
            except Exception:
                pass

        # ── Assemble results in original spec order, same shape as before ──
        results = []
        for e in entries:
            if not e['valid']:
                results.append({**e['spec'], 'price': None,
                                'error': e['error'] or 'unresolved',
                                'possibles': e['possibles'] or []})
                continue
            # Echo back the resolved dated expiry so stored legs carry YYYYMMDD.
            spec = {**e['spec'], 'expiry': e['resolved']}
            bid, ask, _last, _close, mid, price = _quote(e['ticker'])

            entry   = float(spec.get('entry', 0))
            pnl_pct = round((price - entry) / entry * 100, 2) if price and entry else None
            pnl_dol = round(price - entry, 4)                  if price and entry else None

            row = {**spec, 'price': price, 'bid': bid, 'ask': ask,
                   'mid': mid, 'pnl_pct': pnl_pct, 'pnl_dol': pnl_dol}
            # Resolved fine but IB returned no quote — flag the reason so the UI can
            # explain it (illiquid / deep-ITM / far-dated) instead of a bare blank.
            if price is None:
                row['error'] = 'no_market_data'
            results.append(row)

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
