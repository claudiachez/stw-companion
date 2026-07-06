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
from ib_insync import IB, Option, Stock, Order
from datetime import date, timedelta
import asyncio
import logging
import os
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
# 4001 = live, 4002 = paper. Override via `IB_PORT=4002 python3 ibkr_proxy.py` so
# testing /place_order in paper mode never requires editing this file (and
# forgetting to switch it back before running live).
IB_PORT = int(os.environ.get('IB_PORT', 4001))


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


# ── Place order (admin-only, real money) ────────────────────
# Scope guardrail: this proxy is local-only and never deployed (see the module
# docstring). This endpoint places a REAL order against whatever account IB
# Gateway is logged into — it is not, and must never become, reachable for
# arbitrary subscribers. The admin UI gates the button behind the
# `ibkr_live_trading_enabled` app_config flag (migration 052); this endpoint
# itself has no additional gate, so treat that UI gate as the only safety
# check and keep this proxy off the public internet.
#
# NOT YET VERIFIED against a live/paper Gateway — test in paper mode
# (IB_PORT = 4002) before ever pointing this at port 4001 (live).
async def _place_order(spec):
    """
    spec: { symbol, instrument: 'SHARES'|'OPTION', side: 'BUY'|'SELL', quantity,
            order_type: 'MKT'|'LMT', limit_price?, strike?, right?, expiry? }
    Returns { status, order_id, perm_id, avg_fill_price?, filled_quantity?, error? }.
    Resolves the contract with the same qualify → 3rd-Friday fallback → ask-IB
    passes /option_prices uses (so a leg's expiry string resolves identically
    whether it's being priced or traded), places the order, then polls the
    live connection briefly for a fill. IBKR fills are asynchronous — a still-
    working order comes back `Submitted` with an order_id for /order_status.
    """
    ib = IB()
    try:
        await ib.connectAsync(IB_HOST, IB_PORT, clientId=_new_client_id(), readonly=False)

        if spec['instrument'] == 'SHARES':
            contract = Stock(spec['symbol'], 'SMART', currency='USD')
            try:
                await ib.qualifyContractsAsync(contract)
            except Exception as exc:
                return {'error': str(exc)}
            if not (contract.conId and contract.conId > 0):
                return {'error': 'unresolved'}
        else:
            raw = str(spec['expiry'])
            is_month = len(raw) == 6 and raw.isdigit()

            def _opt(exp):
                return Option(spec['symbol'], str(exp), float(spec['strike']), spec['right'].upper(), 'SMART', currency='USD')

            contract = _opt(raw)
            try:
                await ib.qualifyContractsAsync(contract)
            except Exception:
                pass

            if not (contract.conId and contract.conId > 0) and is_month:
                contract = _opt(_third_friday(raw))
                try:
                    await ib.qualifyContractsAsync(contract)
                except Exception:
                    pass

            if not (contract.conId and contract.conId > 0):
                try:
                    details = await ib.reqContractDetailsAsync(_opt(raw))
                except Exception as exc:
                    return {'error': str(exc)}
                contracts = [d.contract for d in details if d.contract.conId and d.contract.conId > 0]
                if not contracts:
                    return {
                        'error': 'ambiguous',
                        'possibles': [
                            {'expiry': d.contract.lastTradeDateOrContractMonth,
                             'strike': d.contract.strike, 'right': d.contract.right}
                            for d in details
                        ],
                    }
                if is_month:
                    tf = _third_friday(raw)
                    contract = next(
                        (c for c in contracts if c.lastTradeDateOrContractMonth in (tf, raw)),
                        max(contracts, key=lambda c: c.lastTradeDateOrContractMonth),
                    )
                else:
                    contract = contracts[0]

        order_type = spec.get('order_type', 'MKT')
        order = Order(action=spec['side'].upper(), totalQuantity=float(spec['quantity']), orderType=order_type)
        if order_type == 'LMT':
            order.lmtPrice = float(spec['limit_price'])

        trade = ib.placeOrder(contract, order)

        # Fills are async — poll this same live connection for a bounded window
        # rather than blocking indefinitely on a partial/rejected fill.
        for _ in range(15):
            await ib.sleep(1)
            if trade.orderStatus.status in ('Filled', 'Cancelled', 'ApiCancelled', 'Rejected', 'Inactive'):
                break

        status = trade.orderStatus.status
        result = {'status': status, 'order_id': trade.order.orderId, 'perm_id': trade.order.permId}
        if status == 'Filled':
            result['avg_fill_price'] = trade.orderStatus.avgFillPrice
            result['filled_quantity'] = trade.orderStatus.filled
        elif status in ('Cancelled', 'ApiCancelled', 'Rejected', 'Inactive'):
            result['error'] = '; '.join(str(e) for e in trade.log[-3:]) or status
        return result
    finally:
        if ib.isConnected():
            ib.disconnect()


@app.route('/place_order', methods=['POST'])
def place_order():
    try:
        spec = request.get_json()
        if not spec:
            return jsonify({'error': 'empty request body'}), 400
        result = asyncio.run(_place_order(spec))
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 503


# ── Order status (poll a still-working order from /place_order) ──
# A fresh connection's ib.trades() starts empty — request open + completed
# orders to hydrate it before searching, since the placing session may have
# already disconnected by the time the UI polls again.
async def _order_status(order_id):
    ib = IB()
    try:
        await ib.connectAsync(IB_HOST, IB_PORT, clientId=_new_client_id(), readonly=True)
        ib.reqAllOpenOrders()
        ib.reqCompletedOrders(apiOnly=False)
        await ib.sleep(1.5)
        for trade in ib.trades():
            if trade.order.orderId == order_id:
                result = {'status': trade.orderStatus.status, 'order_id': order_id}
                if trade.orderStatus.status == 'Filled':
                    result['avg_fill_price'] = trade.orderStatus.avgFillPrice
                    result['filled_quantity'] = trade.orderStatus.filled
                return result
        return {'error': 'order not found in this session'}
    finally:
        if ib.isConnected():
            ib.disconnect()


@app.route('/order_status/<int:order_id>')
def order_status(order_id):
    try:
        result = asyncio.run(_order_status(order_id))
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
