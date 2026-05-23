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
    "pending_order": False   # <--- ADD THIS LINE
}

import os
from dotenv import load_dotenv
import requests

load_dotenv()

CAPITAL_LIMIT = float(os.getenv("CAPITAL_LIMIT", 40000))
MAX_PREMIUM = 100
TARGET_POINTS = 1.5
STOP_LOSS_POINTS = 2.0
MAX_DAILY_LOSS = float(os.getenv("MAX_DAILY_LOSS", -1500))

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

def send_telegram_alert(message):
    """Fires a push notification to your phone."""
    if not TELEGRAM_TOKEN or not CHAT_ID:
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": CHAT_ID,
        "text": f"🤖 Options Scalper Alert:\n\n{message}"
    }
    try:
        requests.post(url, json=payload, timeout=5)
    except Exception as e:
        logging.error(f"Failed to send Telegram alert: {e}")

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
    if state["in_position"]:
        token_to_sell = CE_TOKEN if state["position_type"] == "CE" else PE_TOKEN
        logging.critical(f"🚨 PANIC SELL INITIATED FOR {state['position_type']} 🚨")
        fire_market_order_async(token_to_sell, "SELL")
        state["in_position"] = False
        state["pending_order"] = False # Release any limit order locks
    send_telegram_alert("⚠️ PANIC SELL INITIATED VIA UI!")
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
        send_telegram_alert("🚨 MAX DAILY DRAWDOWN HIT. BOT HALTED.")
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
import time

def fire_market_order_async(instrument_token, transaction_type):
    """Used strictly for the Panic Sell Button to flatten instantly."""
    def execute():
        order_api = upstox_client.OrderApi(api_client)
        body = upstox_client.PlaceOrderRequest(
            quantity=state["quantity"], product="I", validity="DAY", price=0.0,
            instrument_token=instrument_token, order_type="MARKET",
            transaction_type=transaction_type, disclosed_quantity=0,
            trigger_price=0.0, is_amo=False
        )
        try:
            order_api.place_order(body, api_version='2.0')
        except Exception as e:
            logging.error(f"Panic Order Failed: {e}")
            
    threading.Thread(target=execute).start()


def place_and_monitor_limit_order(instrument_token, transaction_type, limit_price):
    """Places a limit order with advanced consolidation and momentum safeguards."""
    order_api = upstox_client.OrderApi(api_client)
    body = upstox_client.PlaceOrderRequest(
        quantity=state["quantity"],
        product="I", validity="DAY", price=float(limit_price),
        instrument_token=instrument_token, order_type="LIMIT",
        transaction_type=transaction_type, disclosed_quantity=0,
        trigger_price=0.0, is_amo=False
    )
    
    try:
        response = order_api.place_order(body, api_version='2.0')
        order_id = response.data.order_id
        logging.info(f"✅ [{transaction_type}] LIMIT Placed at ₹{limit_price}. ID: {order_id}")
        
        start_time = time.time()
        start_candle = state["current_candle_minute"]
        
        while state["bot_active"]:
            try:
                hist = order_api.get_order_details(api_version='2.0', order_id=order_id)
                order_info = hist.data[0]
                latest_status = order_info.status
                
                # --- CASE A: ORDER FILLED ---
                if latest_status == "complete":
                    avg_price = order_info.average_price or limit_price
                    logging.info(f"✅ Order {order_id} FILLED at ₹{avg_price}")
                    
                    if transaction_type == "BUY":
                        state["in_position"] = True
                        state["position_type"] = "CE" if instrument_token == CE_TOKEN else "PE"
                        state["buy_price"] = avg_price
                    else:
                        log_trade(db_connection, state["position_type"], state["buy_price"], avg_price, state["quantity"])
                        if check_daily_drawdown(db_connection): state["bot_active"] = False
                        state["in_position"] = False
                        
                    return
                    
                # --- CASE B: EXTERNALLY CANCELLED ---
                elif latest_status in ["cancelled", "rejected"]:
                    logging.warning(f"⚠️ Order {order_id} was {latest_status}.")
                    return
                    
            except ApiException:
                pass # Ignore API hiccups during polling
            
            # ==========================================
            # CONSOLIDATION & SAFEGUARD LOGIC
            # ==========================================
            current_ltp = state["ce_ltp"] if instrument_token == CE_TOKEN else state["pe_ltp"]
            elapsed_time = time.time() - start_time
            cancel_reason = None
            
            # RULE 1: The 1-Point Drift (Applies to Buy & Sell)
            if abs(current_ltp - limit_price) >= 1.0:
                cancel_reason = "Price drifted 1pt away"

            if transaction_type == "BUY":
                # RULE 2: Momentum Death (Consolidating too long on Entry)
                if elapsed_time > 60: 
                    cancel_reason = "Momentum died (>60s in consolidation)"
                
                # RULE 3: Setup Invalidation (New candle opened before fill)
                elif state["current_candle_minute"] != start_candle:
                    cancel_reason = "5m Candle closed. Setup invalidated"

            elif transaction_type == "SELL":
                # RULE 4: THE STOP-LOSS OVERRIDE (Critical for Exits)
                # If we are resting a limit to take profit, but the price tanks to our Stop Loss
                pnl_pts = current_ltp - state["buy_price"]
                
                # Check Stop Loss (-2.0 pts) OR Index reversal
                if pnl_pts <= -STOP_LOSS_POINTS or (
                    (state["position_type"] == "CE" and state["nifty_ltp"] <= state["candle_open_price"]) or 
                    (state["position_type"] == "PE" and state["nifty_ltp"] >= state["candle_open_price"])
                ):
                    logging.critical(f"🚨 STOP LOSS BREACHED DURING CONSOLIDATION! Cancelling Limit & Firing Market Order.")
                    send_telegram_alert(f"🛑 STOP LOSS HIT ON {state['position_type']}! Position closed.")
                    try:
                        order_api.cancel_order(order_id=order_id, api_version='2.0')
                    except Exception: pass
                    
                    # Fire emergency market exit
                    fire_market_order_async(instrument_token, "SELL")
                    return # Exit the thread immediately

            # Execute Cancellation if a reason was triggered
            if cancel_reason:
                logging.info(f"⏱️ Cancelling Limit Order {order_id}. Reason: {cancel_reason}")
                try:
                    order_api.cancel_order(order_id=order_id, api_version='2.0')
                except ApiException as e:
                    logging.error(f"Cancel failed: {e.body}")
                # We do NOT set pending_order = False here. We let the next loop iteration 
                # catch the "cancelled" status to ensure the API actually killed it cleanly.

            time.sleep(1) # Poll every 1 second
            
        # If UI Panic Button is pressed, kill pending orders
        if state.get("pending_order"):
            try: order_api.cancel_order(order_id=order_id, api_version='2.0')
            except Exception: pass
            
    except Exception as e:
        logging.critical(f"FATAL ERROR inside order thread: {e}")
        
    finally:
        state["pending_order"] = False
        logging.info("Order lock safely released.")


def fire_limit_order_async(instrument_token, transaction_type, limit_price):
    state["pending_order"] = True
    thread = threading.Thread(target=place_and_monitor_limit_order, args=(instrument_token, transaction_type, limit_price))
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

    if state["nifty_ltp"] == 0.0: return

    current_5min_block = now.minute // 5
    if current_5min_block != state["current_candle_minute"]:
        state["current_candle_minute"] = current_5min_block
        state["candle_open_price"] = state["nifty_ltp"]

    if not state["bot_active"]: return
    
    # ⚠️ GUARD: Do not process signals if we are waiting for an order to fill/cancel
    if state.get("pending_order", False): return

    # Entry Logic
    if not state["in_position"]:
        if state["nifty_ltp"] < state["candle_open_price"] and state["ce_ltp"] <= MAX_PREMIUM:
            logging.info(f"Entry Signal. Placing CE LIMIT Buy at ₹{state['ce_ltp']}")
            fire_limit_order_async(CE_TOKEN, "BUY", state["ce_ltp"])
            
        elif state["nifty_ltp"] > state["candle_open_price"] and state["pe_ltp"] <= MAX_PREMIUM:
            logging.info(f"Entry Signal. Placing PE LIMIT Buy at ₹{state['pe_ltp']}")
            fire_limit_order_async(PE_TOKEN, "BUY", state["pe_ltp"])

    # Exit Logic
    else:
        if state["position_type"] == "CE":
            pnl_pts = state["ce_ltp"] - state["buy_price"]
            if state["nifty_ltp"] >= state["candle_open_price"] or pnl_pts >= TARGET_POINTS or pnl_pts <= -STOP_LOSS_POINTS:
                logging.info(f"Exit Signal. Placing CE LIMIT Sell at ₹{state['ce_ltp']}")
                fire_limit_order_async(CE_TOKEN, "SELL", state["ce_ltp"])
                
        elif state["position_type"] == "PE":
            pnl_pts = state["pe_ltp"] - state["buy_price"]
            if state["nifty_ltp"] <= state["candle_open_price"] or pnl_pts >= TARGET_POINTS or pnl_pts <= -STOP_LOSS_POINTS:
                logging.info(f"Exit Signal. Placing PE LIMIT Sell at ₹{state['pe_ltp']}")
                fire_limit_order_async(PE_TOKEN, "SELL", state["pe_ltp"])

def sync_broker_state():
    """Queries Upstox on startup to recover any open positions."""
    logging.info("Synchronizing state with broker...")
    portfolio_api = upstox_client.PortfolioApi(api_client)
    
    try:
        response = portfolio_api.get_positions(api_version='2.0')
        positions = response.data
        
        for pos in positions:
            # Look for an open intraday (day) position with a quantity > 0
            if pos.quantity != 0 and pos.product == "I":
                logging.warning(f"⚠️ RECOVERED OPEN POSITION: {pos.quantity}x {pos.trading_symbol}")
                
                state["in_position"] = True
                state["buy_price"] = pos.average_price
                
                # Figure out if it's CE or PE based on the symbol
                if "CE" in pos.trading_symbol:
                    state["position_type"] = "CE"
                    # Hard-update the token if we lost it in a crash
                    global CE_TOKEN
                    CE_TOKEN = pos.instrument_token 
                else:
                    state["position_type"] = "PE"
                    global PE_TOKEN
                    PE_TOKEN = pos.instrument_token
                    
                logging.info(f"State successfully synced. Resuming Stop-Loss monitoring.")
                return # Only handle one position at a time
                
        logging.info("No open positions found. State is clean.")
        
    except ApiException as e:
        logging.error(f"Failed to sync broker state: {e.body}")

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

    sync_broker_state()

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
