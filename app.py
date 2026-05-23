import upstox_client
from upstox_client.rest import ApiException
import pandas as pd
import sqlite3
import threading
import asyncio
from datetime import datetime, date, timedelta
import logging
import sys
import warnings
import json

warnings.filterwarnings('ignore')

from fastapi import FastAPI, WebSocket, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
import uvicorn
from pydantic import BaseModel

# ==========================================
# 1. CONFIGURATION & STATE
# ==========================================
state = {
    "bot_active": True,
    "quantity": 25,
    "nifty_ltp": 0.0,
    "ce_ltp": 0.0,
    "pe_ltp": 0.0,
    "candle_open_price": 0.0,
    "current_candle_minute": -1,
    "in_position": False,
    "position_type": None,
    "buy_price": 0.0,
    "entry_time": None,
    "daily_pnl": 0.0,
    "daily_trades": 0,
    "daily_wins": 0,
    "unrealized_pnl": 0.0,
    "atm_strike": 0,
    "bot_status_message": "Initializing...",
    "activity_log": [],  # ring buffer of last 50 events
}

import os
from dotenv import load_dotenv

load_dotenv()

CAPITAL_LIMIT = float(os.getenv("CAPITAL_LIMIT", 40000))
MAX_PREMIUM = 100
TARGET_POINTS = 1.5
STOP_LOSS_POINTS = 2.0
MAX_DAILY_LOSS = float(os.getenv("MAX_DAILY_LOSS", -1500))

NIFTY_SPOT_TOKEN = "NSE_INDEX|Nifty 50"
CE_TOKEN = ""
PE_TOKEN = ""
TOKENS = []

api_client = None
db_connection = None
streamer = None

# In-memory chart series: cumulative PnL snapshots throughout the day
intraday_pnl_series = []   # [{time, pnl}]

app = FastAPI(title="AutoBot Control Center")
templates = Jinja2Templates(directory="templates")

class ConfigUpdate(BaseModel):
    key: str
    value: float

def add_activity(msg: str, level: str = "info"):
    """Append a timestamped event to the ring buffer (max 50 entries)."""
    entry = {"time": datetime.now().strftime("%H:%M:%S"), "msg": msg, "level": level}
    state["activity_log"].insert(0, entry)
    state["activity_log"] = state["activity_log"][:50]
    logging.info(msg)

# ==========================================
# 2. FASTAPI ENDPOINTS
# ==========================================
@app.get("/", response_class=HTMLResponse)
async def serve_ui(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Compute unrealized PnL live
            if state["in_position"]:
                current = state["ce_ltp"] if state["position_type"] == "CE" else state["pe_ltp"]
                state["unrealized_pnl"] = round((current - state["buy_price"]) * state["quantity"], 2)
            else:
                state["unrealized_pnl"] = 0.0

            payload = {k: v for k, v in state.items() if k != "activity_log"}
            payload["activity_log"] = state["activity_log"]
            payload["intraday_pnl_series"] = intraday_pnl_series[-120:]  # last 120 snapshots
            await websocket.send_json(payload)
            await asyncio.sleep(0.5)
    except Exception:
        pass

@app.post("/api/toggle")
async def toggle_bot():
    state["bot_active"] = not state["bot_active"]
    msg = "Bot RESUMED by user." if state["bot_active"] else "Bot PAUSED by user."
    add_activity(msg, "warn")
    state["bot_status_message"] = msg
    return {"status": "success", "bot_active": state["bot_active"]}

@app.post("/api/config")
async def update_config(data: ConfigUpdate):
    if data.key == "quantity":
        state["quantity"] = int(data.value)
        add_activity(f"Quantity updated to {int(data.value)} lots.", "info")
    elif data.key == "target":
        global TARGET_POINTS
        TARGET_POINTS = float(data.value)
        add_activity(f"Target updated to {data.value} pts.", "info")
    elif data.key == "stoploss":
        global STOP_LOSS_POINTS
        STOP_LOSS_POINTS = float(data.value)
        add_activity(f"Stop-Loss updated to {data.value} pts.", "info")
    elif data.key == "max_premium":
        global MAX_PREMIUM
        MAX_PREMIUM = float(data.value)
        add_activity(f"Max Premium updated to ₹{data.value}.", "info")
    return {"status": "success"}

@app.post("/api/panic")
async def panic_sell():
    state["bot_active"] = False
    state["bot_status_message"] = "🚨 PANIC SELL EXECUTED — BOT HALTED"
    if state["in_position"]:
        token_to_sell = CE_TOKEN if state["position_type"] == "CE" else PE_TOKEN
        add_activity(f"🚨 PANIC SELL: {state['position_type']} position flattened!", "error")
        fire_order_async(token_to_sell, "SELL")
        state["in_position"] = False
    else:
        add_activity("🚨 PANIC triggered — no open position to close.", "warn")
    return {"status": "panic_executed"}

@app.get("/api/history/daily")
async def get_daily_pnl_history():
    """Returns per-day aggregate PnL for the last 30 days — for the historical chart."""
    if not db_connection:
        return JSONResponse({"data": []})
    cursor = db_connection.cursor()
    thirty_days_ago = (date.today() - timedelta(days=30)).isoformat()
    cursor.execute(
        """SELECT trade_date, SUM(pnl), COUNT(*),
                  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)
           FROM trade_log WHERE trade_date >= ? GROUP BY trade_date ORDER BY trade_date""",
        (thirty_days_ago,)
    )
    rows = cursor.fetchall()
    data = [{"date": r[0], "pnl": round(r[1], 2), "trades": r[2], "wins": r[3]} for r in rows]
    return JSONResponse({"data": data})

@app.get("/api/history/trades")
async def get_recent_trades():
    """Returns the last 50 individual trades."""
    if not db_connection:
        return JSONResponse({"data": []})
    cursor = db_connection.cursor()
    cursor.execute(
        "SELECT id, trade_date, time, position_type, buy_price, sell_price, pnl FROM trade_log ORDER BY id DESC LIMIT 50"
    )
    rows = cursor.fetchall()
    cols = ["id", "date", "time", "type", "buy", "sell", "pnl"]
    data = [dict(zip(cols, r)) for r in rows]
    return JSONResponse({"data": data})

@app.get("/api/stats")
async def get_stats():
    """Returns aggregated stats: win rate, avg pnl, best/worst day."""
    if not db_connection:
        return JSONResponse({})
    cursor = db_connection.cursor()
    cursor.execute("SELECT COUNT(*), SUM(pnl), SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) FROM trade_log")
    total_trades, total_pnl, total_wins = cursor.fetchone()
    total_trades = total_trades or 0
    total_pnl = round(total_pnl or 0, 2)
    total_wins = total_wins or 0
    win_rate = round((total_wins / total_trades * 100) if total_trades else 0, 1)

    cursor.execute("SELECT trade_date, SUM(pnl) FROM trade_log GROUP BY trade_date ORDER BY SUM(pnl) DESC LIMIT 1")
    best = cursor.fetchone()
    cursor.execute("SELECT trade_date, SUM(pnl) FROM trade_log GROUP BY trade_date ORDER BY SUM(pnl) ASC LIMIT 1")
    worst = cursor.fetchone()

    return JSONResponse({
        "total_trades": total_trades,
        "total_pnl": total_pnl,
        "win_rate": win_rate,
        "best_day": {"date": best[0], "pnl": round(best[1], 2)} if best else None,
        "worst_day": {"date": worst[0], "pnl": round(worst[1], 2)} if worst else None,
    })

# ==========================================
# 3. DATABASE LOGIC
# ==========================================
def setup_database():
    conn = sqlite3.connect('trades.db', check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS trade_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_date TEXT,
            time TEXT,
            position_type TEXT,
            buy_price REAL,
            sell_price REAL,
            pnl REAL
        )
    ''')
    # Add time column if upgrading from old schema
    try:
        cursor.execute("ALTER TABLE trade_log ADD COLUMN time TEXT")
    except Exception:
        pass
    conn.commit()
    return conn

def check_daily_drawdown(conn):
    cursor = conn.cursor()
    today = date.today().isoformat()
    cursor.execute("SELECT SUM(pnl) FROM trade_log WHERE trade_date = ?", (today,))
    result = cursor.fetchone()[0]
    daily_pnl = result if result else 0.0
    state["daily_pnl"] = round(daily_pnl, 2)
    if daily_pnl <= MAX_DAILY_LOSS:
        return True
    return False

def load_todays_stats(conn):
    """Populate state with today's existing DB data on boot."""
    cursor = conn.cursor()
    today = date.today().isoformat()
    cursor.execute(
        "SELECT SUM(pnl), COUNT(*), SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) FROM trade_log WHERE trade_date=?",
        (today,)
    )
    row = cursor.fetchone()
    state["daily_pnl"] = round(row[0] or 0.0, 2)
    state["daily_trades"] = row[1] or 0
    state["daily_wins"] = row[2] or 0

def log_trade(conn, position_type, buy_price, sell_price, quantity):
    pnl = round((sell_price - buy_price) * quantity, 2)
    today = date.today().isoformat()
    now_time = datetime.now().strftime("%H:%M:%S")
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO trade_log (trade_date, time, position_type, buy_price, sell_price, pnl) VALUES (?,?,?,?,?,?)",
        (today, now_time, position_type, buy_price, sell_price, pnl)
    )
    conn.commit()

    state["daily_pnl"] = round(state["daily_pnl"] + pnl, 2)
    state["daily_trades"] += 1
    if pnl > 0:
        state["daily_wins"] += 1

    # Push snapshot to intraday series
    intraday_pnl_series.append({
        "time": now_time,
        "pnl": state["daily_pnl"]
    })

    outcome = "✅ WIN" if pnl > 0 else "❌ LOSS"
    add_activity(f"{outcome} {position_type} | Buy ₹{buy_price:.1f} → Sell ₹{sell_price:.1f} | PnL ₹{pnl:+.0f}", "info" if pnl > 0 else "error")
    return pnl

# ==========================================
# 4. WEEKEND-PROOF TOKEN MATCHER
# ==========================================
def get_dynamic_tokens():
    add_activity("Fetching Nifty 50 Spot Price...", "info")
    quote_api = upstox_client.MarketQuoteApi(api_client)
    spot_price = 0.0

    try:
        response = quote_api.get_full_market_quote(NIFTY_SPOT_TOKEN, api_version='2.0')
        if response.data and NIFTY_SPOT_TOKEN in response.data:
            spot_price = response.data[NIFTY_SPOT_TOKEN].last_price
        else:
            raise KeyError("Token missing from live quote response.")
    except Exception:
        add_activity("Live quote empty. Trying OHLC fallback...", "warn")
        try:
            response = quote_api.get_market_quote_ohlc(NIFTY_SPOT_TOKEN, "1d", api_version='2.0')
            spot_price = response.data[NIFTY_SPOT_TOKEN].ohlc.close
            add_activity(f"Weekend OHLC Close: {spot_price}", "warn")
        except Exception:
            add_activity("OHLC failed. Using mock spot price 23700.", "error")
            spot_price = 23700.0

    atm_strike = round(spot_price / 50) * 50
    state["atm_strike"] = atm_strike
    add_activity(f"ATM Strike: {atm_strike}", "info")

    add_activity("Downloading Upstox Master CSV...", "info")
    csv_url = "https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz"
    df = pd.read_csv(csv_url)

    nifty_options = df[(df['name'] == 'NIFTY') & (df['instrument_type'].isin(['CE', 'PE']))].copy()
    nifty_options['expiry'] = pd.to_datetime(nifty_options['expiry'])

    today = pd.to_datetime(date.today())
    future_options = nifty_options[nifty_options['expiry'] >= today]
    nearest_expiry = future_options['expiry'].min()

    atm_contracts = future_options[
        (future_options['expiry'] == nearest_expiry) &
        (future_options['strike'] == atm_strike)
    ]

    try:
        ce = atm_contracts[atm_contracts['instrument_type'] == 'CE'].iloc[0]['instrument_key']
        pe = atm_contracts[atm_contracts['instrument_type'] == 'PE'].iloc[0]['instrument_key']
        add_activity(f"Tokens locked → CE: {ce.split('|')[1]} | PE: {pe.split('|')[1]}", "info")
        return ce, pe
    except IndexError:
        add_activity("Could not find ATM contracts in CSV!", "error")
        return None, None

# ==========================================
# 5. ORDER EXECUTION & WEBSOCKET
# ==========================================
def place_order(instrument_token, transaction_type):
    order_api = upstox_client.OrderApi(api_client)
    body = upstox_client.PlaceOrderRequest(
        quantity=state["quantity"],
        product="I", validity="DAY", price=0.0,
        instrument_token=instrument_token, order_type="MARKET",
        transaction_type=transaction_type, disclosed_quantity=0,
        trigger_price=0.0, is_amo=False
    )
    try:
        response = order_api.place_order(body, api_version='2.0')
        add_activity(f"Order OK [{transaction_type}] ID: {response.data.order_id}", "info")
    except ApiException as e:
        add_activity(f"❌ Order FAILED: {e.body}", "error")

def fire_order_async(instrument_token, transaction_type):
    thread = threading.Thread(target=place_order, args=(instrument_token, transaction_type))
    thread.start()

def on_message(message):
    now = datetime.now()
    feeds = message.get("feeds", {})

    if NIFTY_SPOT_TOKEN in feeds:
        try: state["nifty_ltp"] = feeds[NIFTY_SPOT_TOKEN]["ff"]["marketFF"]["ltpc"]["ltp"]
        except KeyError: pass
    if CE_TOKEN in feeds:
        try: state["ce_ltp"] = feeds[CE_TOKEN]["ff"]["marketFF"]["ltpc"]["ltp"]
        except KeyError: pass
    if PE_TOKEN in feeds:
        try: state["pe_ltp"] = feeds[PE_TOKEN]["ff"]["marketFF"]["ltpc"]["ltp"]
        except KeyError: pass

    if state["nifty_ltp"] == 0.0:
        return

    current_5min_block = now.minute // 5
    if current_5min_block != state["current_candle_minute"]:
        state["current_candle_minute"] = current_5min_block
        state["candle_open_price"] = state["nifty_ltp"]

    if not state["bot_active"]:
        return

    # Entry Logic
    if not state["in_position"]:
        if state["nifty_ltp"] < state["candle_open_price"] and state["ce_ltp"] <= MAX_PREMIUM:
            fire_order_async(CE_TOKEN, "BUY")
            state["in_position"] = True
            state["position_type"] = "CE"
            state["buy_price"] = state["ce_ltp"]
            state["entry_time"] = now.strftime("%H:%M:%S")
            state["bot_status_message"] = f"In CE position @ ₹{state['ce_ltp']:.1f}"
            add_activity(f"📈 BUY CE @ ₹{state['ce_ltp']:.1f} | Nifty fell below {state['candle_open_price']:.1f}", "info")

        elif state["nifty_ltp"] > state["candle_open_price"] and state["pe_ltp"] <= MAX_PREMIUM:
            fire_order_async(PE_TOKEN, "BUY")
            state["in_position"] = True
            state["position_type"] = "PE"
            state["buy_price"] = state["pe_ltp"]
            state["entry_time"] = now.strftime("%H:%M:%S")
            state["bot_status_message"] = f"In PE position @ ₹{state['pe_ltp']:.1f}"
            add_activity(f"📉 BUY PE @ ₹{state['pe_ltp']:.1f} | Nifty rose above {state['candle_open_price']:.1f}", "info")

    # Exit Logic
    else:
        if state["position_type"] == "CE":
            pnl_pts = state["ce_ltp"] - state["buy_price"]
            if state["nifty_ltp"] >= state["candle_open_price"] or pnl_pts >= TARGET_POINTS or pnl_pts <= -STOP_LOSS_POINTS:
                reason = "TARGET" if pnl_pts >= TARGET_POINTS else ("STOP-LOSS" if pnl_pts <= -STOP_LOSS_POINTS else "REVERSAL")
                fire_order_async(CE_TOKEN, "SELL")
                log_trade(db_connection, "CE", state["buy_price"], state["ce_ltp"], state["quantity"])
                if check_daily_drawdown(db_connection):
                    state["bot_active"] = False
                    state["bot_status_message"] = "🚫 Daily loss limit hit — halted"
                    add_activity("🚫 Max daily loss reached. Bot halted.", "error")
                else:
                    state["bot_status_message"] = f"Waiting for next setup ({reason})"
                state["in_position"] = False
                state["entry_time"] = None

        elif state["position_type"] == "PE":
            pnl_pts = state["pe_ltp"] - state["buy_price"]
            if state["nifty_ltp"] <= state["candle_open_price"] or pnl_pts >= TARGET_POINTS or pnl_pts <= -STOP_LOSS_POINTS:
                reason = "TARGET" if pnl_pts >= TARGET_POINTS else ("STOP-LOSS" if pnl_pts <= -STOP_LOSS_POINTS else "REVERSAL")
                fire_order_async(PE_TOKEN, "SELL")
                log_trade(db_connection, "PE", state["buy_price"], state["pe_ltp"], state["quantity"])
                if check_daily_drawdown(db_connection):
                    state["bot_active"] = False
                    state["bot_status_message"] = "🚫 Daily loss limit hit — halted"
                    add_activity("🚫 Max daily loss reached. Bot halted.", "error")
                else:
                    state["bot_status_message"] = f"Waiting for next setup ({reason})"
                state["in_position"] = False
                state["entry_time"] = None

def on_open():
    add_activity("✅ WebSocket connected. Subscribing to market feed...", "info")
    state["bot_status_message"] = "Live — awaiting 5m candle setup"
    streamer.subscribe(TOKENS, "full")

def start_trading_bot():
    global api_client, db_connection, CE_TOKEN, PE_TOKEN, TOKENS, streamer

    try:
        with open("upstox_token.txt", "r") as f:
            access_token = f.read().strip()
    except FileNotFoundError:
        add_activity("upstox_token.txt not found. Run auth.py first!", "error")
        state["bot_status_message"] = "❌ Token file missing — run auth.py"
        return

    configuration = upstox_client.Configuration()
    configuration.access_token = access_token
    api_client = upstox_client.ApiClient(configuration)

    db_connection = setup_database()
    load_todays_stats(db_connection)

    if check_daily_drawdown(db_connection):
        add_activity("Max daily loss already hit. Bot halted on boot.", "error")
        state["bot_active"] = False
        state["bot_status_message"] = "🚫 Daily limit already reached"
        return

    CE_TOKEN, PE_TOKEN = get_dynamic_tokens()
    if not CE_TOKEN or not PE_TOKEN:
        state["bot_status_message"] = "⚠️ Token fetch failed — weekend mode"
        add_activity("Dynamic token fetch failed. Halting bot thread (UI stays alive).", "error")
        return

    TOKENS = [NIFTY_SPOT_TOKEN, CE_TOKEN, PE_TOKEN]
    streamer = upstox_client.MarketDataStreamerV3(api_client)
    streamer.on("open", on_open)
    streamer.on("message", on_message)
    streamer.connect()

# ==========================================
# 6. SERVER STARTUP
# ==========================================
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

    # Seed a startup log before the bot thread runs so UI has something to show
    state["activity_log"].append({"time": datetime.now().strftime("%H:%M:%S"), "msg": "AutoBot Control Center starting...", "level": "info"})

    bot_thread = threading.Thread(target=start_trading_bot, daemon=True)
    bot_thread.start()

    logging.info("Starting Control Center UI at http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
