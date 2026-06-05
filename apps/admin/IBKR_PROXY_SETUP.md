# IBKR Pricing Proxy — local setup

`ibkr_proxy.py` is a **local** Flask bridge (`https://localhost:8765`) between the admin
dashboard's IBKR button and IB Gateway (`127.0.0.1:4001`). It prices STW's option legs
and writes `last_pnl_*` / `ibkr_legs` to Supabase. **It is never deployed** — it runs on
your machine. (One-time dependency install is documented at the top of `ibkr_proxy.py`.)

The dashboard's IBKR button **cannot start the proxy** — a browser can't launch local
processes. The launcher and LaunchAgent below are how you start it; the button just needs
it already running (and IB Gateway logged in).

## Option A — manual launcher (one double-click)

Double-click **`ibkr-proxy.command`** in Finder (or run it from a shell). It starts the
proxy if it isn't already running, then opens the status page. Idempotent. Keep a copy on
your Desktop/Dock if you like (it's self-locating, so it still finds the repo).

## Option B — auto-start at login (LaunchAgent)

Always-on: the proxy comes up at every login.

```bash
cd apps/admin
PY=$(command -v python3); ADMIN="$(pwd)"
sed -e "s|__PYTHON__|$PY|" -e "s|__ADMIN_DIR__|$ADMIN|" -e "s|__HOME__|$HOME|" \
  com.stw.ibkr-proxy.plist.template > ~/Library/LaunchAgents/com.stw.ibkr-proxy.plist

launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.stw.ibkr-proxy.plist
```

Verify (expect a PID and exit code `0`, then a JSON status):

```bash
launchctl list | grep ibkr
curl -sk https://localhost:8765/status
```

`{"ok": true, ...}` = proxy + IB Gateway both up. `Errno 61 ... 4001` = proxy is fine but
IB Gateway isn't running/logged in.

Stop / unload:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.stw.ibkr-proxy.plist
```

## Notes

- **Logs:** `~/Library/Logs/stw-ibkr-proxy.log`
- **Cert:** the self-signed `ibkr_cert.pem` / `ibkr_key.pem` (gitignored) are generated on
  first run and reused. Accept it once in the browser at `https://localhost:8765/status`.
- Using both options together is fine — the launcher won't start a second copy if the
  LaunchAgent already has one running.
