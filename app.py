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
import os
import requests
import time
from dotenv import load_dotenv

warnings.filterwarnings('ignore')

from fastapi import FastAPI, WebSocket, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
import uvicorn
from pydantic import BaseModel

load_dotenv()

# ==========================================
# 1. CONFIGURATION & STATE
# ==========================================
state = {
    "bot_active": True,
    "auto_quantity": False,
    "capital_usage_percent": 100.0,
    "available_capital": float(os.getenv("CAPITAL_LIMIT", 40000)),
    "quantity": 25,
    "nifty_ltp": 0.0,
    "ce_ltp": 0.0,
    "pe_ltp": 0.0,
    "candle_open_price": 0.0,
    "day_open_price": 0.0,
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
    "macro_trend": "SCANNING",
    "activity_log": [],
    "pending_order": False,
    "last_traded_candle": -1,
    "highest_unrealized_pnl": 0.0,
    "consecutive_losses": 0,
    "timeout_until": None
}

MAX_PREMIUM = 100
TARGET_POINTS = 1.5
STOP_LOSS_POINTS = 2.0
MAX_DAILY_LOSS = float(os.getenv("MAX_DAILY_LOSS", -1500))

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

def send_telegram_alert(message):
    if not TELEGRAM_TOKEN or not CHAT_ID: return
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {"chat_id": CHAT_ID, "text": f"🤖 Options Scalper Alert:\n\n{message}"}
    try: requests.post(url, json=payload, timeout=5)
    except: pass

NIFTY_SPOT_TOKEN = "NSE_INDEX|Nifty 50"
CE_TOKEN = ""
PE_TOKEN = ""
TOKENS = []

api_client = None
db_connection = None
streamer = None
intraday_pnl_series = []

app = FastAPI(title="AutoBot Control Center")
templates = Jinja2Templates(directory="templates")

class ConfigUpdate(BaseModel):
    key: str
    value: float | bool

def add_activity(msg: str, level: str = "info"):
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
            if state["in_position"]:
                current = state["ce_ltp"] if state["position_type"] == "CE" else state["pe_ltp"]
                state["unrealized_pnl"] = round((current - state["buy_price"]) * state["quantity"], 2)
            else:
                state["unrealized_pnl"] = 0.0
                
            # Determine Macro Trend for UI
            if state["nifty_ltp"] > 0 and state["day_open_price"] > 0:
                state["macro_trend"] = "BULLISH" if state["nifty_ltp"] > state["day_open_price"] else "BEARISH"

            payload = {k: v for k, v in state.items() if k != "activity_log"}
            payload["activity_log"] = state["activity_log"]
            payload["intraday_pnl_series"] = intraday_pnl_series[-120:]
            
            # Format timeout for UI
            if state["timeout_until"]:
                try:
                    dt = datetime.fromisoformat(state["timeout_until"])
                    if datetime.now() >= dt:
                        state["timeout_until"] = None
                    else:
                        payload["timeout_str"] = dt.strftime("%H:%M:%S")
                except: pass

            await websocket.send_json(payload)
            await asyncio.sleep(0.5)
    except Exception: pass

@app.post("/api/toggle")
async def toggle_bot():
    state["bot_active"] = not state["bot_active"]
    msg = "Bot RESUMED by user." if state["bot_active"] else "Bot PAUSED by user."
    add_activity(msg, "warn")
    state["bot_status_message"] = msg
    return {"status": "success"}

@app.post("/api/config")
async def update_config(data: ConfigUpdate):
    if data.key == "quantity":
        if not state["auto_quantity"]:
            state["quantity"] = int(data.value)
            add_activity(f"Manual Quantity set to {int(data.value)} lots.", "info")
    elif data.key == "auto_quantity":
        state["auto_quantity"] = bool(data.value)
        add_activity(f"Auto Quantity {'ENABLED' if data.value else 'DISABLED'}.", "info")
    elif data.key == "capital_usage_percent":
        state["capital_usage_percent"] = float(data.value)
        add_activity(f"Capital Usage set to {data.value}%.", "info")
    elif data.key == "target":
        global TARGET_POINTS
        TARGET_POINTS = float(data.value)
    elif data.key == "stoploss":
        global STOP_LOSS_POINTS
        STOP_LOSS_POINTS = float(data.value)
    return {"status": "success"}

@app.post("/api/panic")
async def panic_sell():
    state["bot_active"] = False
    if state["in_position"]:
        token_to_sell = CE_TOKEN if state["position_type"] == "CE" else PE_TOKEN
        logging.critical(f"🚨 PANIC SELL INITIATED FOR {state['position_type']} 🚨")
        fire_market_order_async(token_to_sell, "SELL")
        state["in_position"] = False
        state["pending_order"] = False
    send_telegram_alert("⚠️ PANIC SELL INITIATED VIA UI!")
    return {"status": "panic_executed"}

# (Keeping your existing history & stats endpoints here, unmodified)
@app.get("/api/history/daily")
async def get_daily_pnl_history():
    if not db_connection: return JSONResponse({"data": []})
    cursor = db_connection.cursor()
    thirty_days_ago = (date.today() - timedelta(days=30)).isoformat()
    cursor.execute("""SELECT trade_date, SUM(pnl), COUNT(*), SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) FROM trade_log WHERE trade_date >= ? GROUP BY trade_date ORDER BY trade_date""", (thirty_days_ago,))
    rows = cursor.fetchall()
    return JSONResponse({"data": [{"date": r[0], "pnl": round(r[1], 2), "trades": r[2], "wins": r[3]} for r in rows]})

@app.get("/api/history/trades")
async def get_recent_trades():
    if not db_connection: return JSONResponse({"data": []})
    cursor = db_connection.cursor()
    cursor.execute("SELECT id, trade_date, time, position_type, buy_price, sell_price, pnl FROM trade_log ORDER BY id DESC LIMIT 50")
    cols = ["id", "date", "time", "type", "buy", "sell", "pnl"]
    return JSONResponse({"data": [dict(zip(cols, r)) for r in cursor.fetchall()]})

@app.get("/api/stats")
async def get_stats():
    if not db_connection: return JSONResponse({})
    cursor = db_connection.cursor()
    cursor.execute("SELECT COUNT(*), SUM(pnl), SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) FROM trade_log")
    total_trades, total_pnl, total_wins = cursor.fetchone()
    total_trades = total_trades or 0
    total_pnl = round(total_pnl or 0, 2)
    win_rate = round((total_wins / total_trades * 100) if total_trades else 0, 1)
    return JSONResponse({"total_trades": total_trades, "total_pnl": total_pnl, "win_rate": win_rate})

# ==========================================
# 3. DATABASE & RISK LOGIC
# ==========================================
def setup_database():
    conn = sqlite3.connect('trades.db', check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS trade_log (id INTEGER PRIMARY KEY AUTOINCREMENT, trade_date TEXT, time TEXT, position_type TEXT, buy_price REAL, sell_price REAL, pnl REAL)''')
    try: cursor.execute("ALTER TABLE trade_log ADD COLUMN time TEXT")
    except: pass
    conn.commit()
    return conn

def check_daily_drawdown(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT SUM(pnl) FROM trade_log WHERE trade_date = ?", (date.today().isoformat(),))
    daily_pnl = cursor.fetchone()[0] or 0.0
    state["daily_pnl"] = round(daily_pnl, 2)
    if daily_pnl <= MAX_DAILY_LOSS:
        send_telegram_alert("🚨 MAX DAILY DRAWDOWN HIT. BOT HALTED.")
        return True
    return False

def load_todays_stats(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT SUM(pnl), COUNT(*), SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) FROM trade_log WHERE trade_date=?", (date.today().isoformat(),))
    row = cursor.fetchone()
    state["daily_pnl"] = round(row[0] or 0.0, 2)
    state["daily_trades"] = row[1] or 0
    state["daily_wins"] = row[2] or 0

def log_trade(conn, position_type, buy_price, sell_price, quantity):
    pnl = round((sell_price - buy_price) * quantity, 2)
    now_time = datetime.now().strftime("%H:%M:%S")
    conn.cursor().execute("INSERT INTO trade_log (trade_date, time, position_type, buy_price, sell_price, pnl) VALUES (?,?,?,?,?,?)", (date.today().isoformat(), now_time, position_type, buy_price, sell_price, pnl))
    conn.commit()

    state["daily_pnl"] = round(state["daily_pnl"] + pnl, 2)
    state["daily_trades"] += 1
    
    if pnl > 0:
        state["daily_wins"] += 1
        state["consecutive_losses"] = 0 # Reset Tilt Breaker
    else:
        state["consecutive_losses"] += 1
        
    # Tilt Breaker Check
    if state["consecutive_losses"] >= 3:
        timeout = datetime.now() + timedelta(minutes=30)
        state["timeout_until"] = timeout.isoformat()
        msg = f"📉 3 Consecutive Losses. Timeout until {timeout.strftime('%H:%M:%S')}."
        add_activity(msg, "error")
        send_telegram_alert(msg)

    intraday_pnl_series.append({"time": now_time, "pnl": state["daily_pnl"]})
    add_activity(f"{'✅ WIN' if pnl > 0 else '❌ LOSS'} {position_type} | PnL ₹{pnl:+.0f}", "info" if pnl > 0 else "error")
    return pnl

# ==========================================
# 4. CAPITAL & TOKEN MANAGEMENT
# ==========================================
def fetch_available_capital():
    """Queries Upstox for live margin available for trading."""
    try:
        user_api = upstox_client.UserApi(api_client)
        resp = user_api.get_user_fund_margin(segment='SEC', api_version='2.0')
        # Upstox V2 object structure for funds
        available = resp.data.equity.available_margin
        state["available_capital"] = float(available)
        return float(available)
    except Exception as e:
        logging.error(f"Failed to fetch live capital: {e}")
        return state["available_capital"] # fallback to previous/env

def calculate_dynamic_quantity(premium):
    """Calculates max lots based on live capital and usage config."""
    if not state["auto_quantity"]:
        return state["quantity"]
        
    cap = fetch_available_capital()
    allocated = cap * (state["capital_usage_percent"] / 100.0)
    lots = int(allocated // (premium * 25))
    calc_qty = max(lots * 25, 0)
    
    if calc_qty > 0:
        state["quantity"] = calc_qty # Lock it in state
        add_activity(f"Auto-Sized: {lots} Lots (₹{allocated:.0f} allocated)", "info")
    return calc_qty

def get_dynamic_tokens():
    add_activity("Fetching Macro Trend and Spot...", "info")
    quote_api = upstox_client.MarketQuoteApi(api_client)
    spot_price = 0.0

    try:
        response = quote_api.get_market_quote_ohlc(NIFTY_SPOT_TOKEN, "1D", api_version='2.0')
        spot_price = response.data[NIFTY_SPOT_TOKEN].ohlc.close
        state["day_open_price"] = response.data[NIFTY_SPOT_TOKEN].ohlc.open
        add_activity(f"Day Open Locked: {state['day_open_price']}", "info")
    except Exception:
        spot_price = 23700.0
        state["day_open_price"] = 23700.0

    # DELTA MATH: Force Slightly In-The-Money (ITM) Strikes
    ce_strike = (int(spot_price) // 50) * 50
    pe_strike = ce_strike + 50
    state["atm_strike"] = ce_strike
    
    add_activity(f"ITM Strikes Locked → CE: {ce_strike} | PE: {pe_strike}", "info")

    csv_url = "https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz"
    df = pd.read_csv(csv_url)
    nifty_options = df[(df['name'] == 'NIFTY') & (df['instrument_type'].isin(['CE', 'PE']))].copy()
    nifty_options['expiry'] = pd.to_datetime(nifty_options['expiry'])
    nearest_expiry = nifty_options[nifty_options['expiry'] >= pd.to_datetime(date.today())]['expiry'].min()

    try:
        options_chain = nifty_options[nifty_options['expiry'] == nearest_expiry]
        ce = options_chain[(options_chain['strike'] == ce_strike) & (options_chain['instrument_type'] == 'CE')].iloc[0]['instrument_key']
        pe = options_chain[(options_chain['strike'] == pe_strike) & (options_chain['instrument_type'] == 'PE')].iloc[0]['instrument_key']
        return ce, pe
    except IndexError:
        add_activity("Could not find ITM contracts in CSV!", "error")
        return None, None

# ==========================================
# 5. EXECUTION & WEBSOCKET ENGINE
# ==========================================
def fire_market_order_async(instrument_token, transaction_type):
    def execute():
        order_api = upstox_client.OrderApi(api_client)
        body = upstox_client.PlaceOrderRequest(
            quantity=state["quantity"], product="I", validity="DAY", price=0.0,
            instrument_token=instrument_token, order_type="MARKET",
            transaction_type=transaction_type, disclosed_quantity=0, trigger_price=0.0, is_amo=False
        )
        try: order_api.place_order(body, api_version='2.0')
        except: pass
    threading.Thread(target=execute).start()

def place_and_monitor_limit_order(instrument_token, transaction_type, limit_price):
    order_api = upstox_client.OrderApi(api_client)
    body = upstox_client.PlaceOrderRequest(
        quantity=state["quantity"], product="I", validity="DAY", price=float(limit_price),
        instrument_token=instrument_token, order_type="LIMIT",
        transaction_type=transaction_type, disclosed_quantity=0, trigger_price=0.0, is_amo=False
    )
    
    try:
        response = order_api.place_order(body, api_version='2.0')
        order_id = response.data.order_id
        start_time, start_candle = time.time(), state["current_candle_minute"]
        
        while state["bot_active"]:
            try:
                hist = order_api.get_order_details(api_version='2.0', order_id=order_id)
                latest_status = hist.data[0].status
                
                if latest_status == "complete":
                    avg_price = hist.data[0].average_price or limit_price
                    if transaction_type == "BUY":
                        state["in_position"] = True
                        state["position_type"] = "CE" if instrument_token == CE_TOKEN else "PE"
                        state["buy_price"] = avg_price
                        state["entry_time"] = datetime.now().isoformat()
                        send_telegram_alert(f"🟢 ENTRY: {state['position_type']} filled at ₹{avg_price} ({state['quantity']} qty)")
                    else:
                        log_trade(db_connection, state["position_type"], state["buy_price"], avg_price, state["quantity"])
                        if check_daily_drawdown(db_connection): state["bot_active"] = False
                        state["in_position"] = False
                    return
                elif latest_status in ["cancelled", "rejected"]: return
            except ApiException: pass
            
            # --- Safegaurds ---
            current_ltp = state["ce_ltp"] if instrument_token == CE_TOKEN else state["pe_ltp"]
            cancel_reason = None
            
            if abs(current_ltp - limit_price) >= 1.0: cancel_reason = "Price drifted"
            if transaction_type == "BUY" and time.time() - start_time > 60: cancel_reason = "Momentum died"
            elif transaction_type == "BUY" and state["current_candle_minute"] != start_candle: cancel_reason = "Candle closed"
            
            # Stop Loss override during exit limit order
            elif transaction_type == "SELL":
                if (current_ltp - state["buy_price"]) <= -STOP_LOSS_POINTS:
                    try: order_api.cancel_order(order_id=order_id, api_version='2.0')
                    except: pass
                    fire_market_order_async(instrument_token, "SELL")
                    send_telegram_alert(f"🛑 STOP LOSS HIT ON {state['position_type']}!")
                    return
                    
            if cancel_reason:
                try: order_api.cancel_order(order_id=order_id, api_version='2.0')
                except: pass

            time.sleep(1)
            
        if state.get("pending_order"):
            try: order_api.cancel_order(order_id=order_id, api_version='2.0')
            except: pass
            
    except Exception as e:
        logging.error(f"Order failed: {e}")
    finally:
        state["pending_order"] = False

def fire_limit_order_async(instrument_token, transaction_type, limit_price):
    state["pending_order"] = True
    threading.Thread(target=place_and_monitor_limit_order, args=(instrument_token, transaction_type, limit_price)).start()

def on_message(message):
    now = datetime.now()
    feeds = message.get("feeds", {})
    
    if NIFTY_SPOT_TOKEN in feeds:
        try: state["nifty_ltp"] = feeds[NIFTY_SPOT_TOKEN]["ff"]["marketFF"]["ltpc"]["ltp"]
        except: pass
    if CE_TOKEN in feeds:
        try: state["ce_ltp"] = feeds[CE_TOKEN]["ff"]["marketFF"]["ltpc"]["ltp"]
        except: pass
    if PE_TOKEN in feeds:
        try: state["pe_ltp"] = feeds[PE_TOKEN]["ff"]["marketFF"]["ltpc"]["ltp"]
        except: pass

    if state["nifty_ltp"] == 0.0 or not state["bot_active"]: return

    # Tilt Breaker Check
    if state["timeout_until"]: return

    current_5min_block = now.minute // 5
    if current_5min_block != state["current_candle_minute"]:
        state["current_candle_minute"] = current_5min_block
        state["candle_open_price"] = state["nifty_ltp"]

    # --- OBI & Spread Calculation ---
    ce_bids, ce_asks, ce_spread = 0, 0, 0.0
    pe_bids, pe_asks, pe_spread = 0, 0, 0.0
    
    try:
        if CE_TOKEN in feeds and "bidAskQuote" in feeds[CE_TOKEN]["ff"]["marketFF"]["marketLevel"]:
            depth = feeds[CE_TOKEN]["ff"]["marketFF"]["marketLevel"]["bidAskQuote"]
            ce_bids, ce_asks = sum(l['bq'] for l in depth), sum(l['aq'] for l in depth)
            if depth[0]['aq'] > 0: ce_spread = depth[0]['ap'] - depth[0]['bp']
            
        if PE_TOKEN in feeds and "bidAskQuote" in feeds[PE_TOKEN]["ff"]["marketFF"]["marketLevel"]:
            depth = feeds[PE_TOKEN]["ff"]["marketFF"]["marketLevel"]["bidAskQuote"]
            pe_bids, pe_asks = sum(l['bq'] for l in depth), sum(l['aq'] for l in depth)
            if depth[0]['aq'] > 0: pe_spread = depth[0]['ap'] - depth[0]['bp']
    except: pass

    if state.get("pending_order"): return
    if not state["in_position"] and state["last_traded_candle"] == state["current_candle_minute"]: return

    # ==========================================
    # ENTRY LOGIC (Macro Trend + OBI + Auto Qty)
    # ==========================================
    if not state["in_position"]:
        state["highest_unrealized_pnl"] = 0.0 
        
        # BUY CE (Bullish Macro Trend + Price crosses below open + Bullish Order Book)
        if state["nifty_ltp"] > state["day_open_price"] and state["nifty_ltp"] < state["candle_open_price"] and state["ce_ltp"] <= MAX_PREMIUM:
            if ce_asks > 0 and (ce_bids / ce_asks) >= 1.20 and ce_spread <= 1.5:
                calc_qty = calculate_dynamic_quantity(state["ce_ltp"])
                if calc_qty >= 25:
                    fire_limit_order_async(CE_TOKEN, "BUY", round(state["ce_ltp"] + 0.10, 1))
            elif ce_spread > 1.5:
                logging.info(f"CE Spread too wide (₹{ce_spread:.1f}). Skipping entry.")
            
        # BUY PE (Bearish Macro Trend + Price crosses above open + Bearish Order Book)
        elif state["nifty_ltp"] < state["day_open_price"] and state["nifty_ltp"] > state["candle_open_price"] and state["pe_ltp"] <= MAX_PREMIUM:
            if pe_asks > 0 and (pe_bids / pe_asks) >= 1.20 and pe_spread <= 1.5:
                calc_qty = calculate_dynamic_quantity(state["pe_ltp"])
                if calc_qty >= 25:
                    fire_limit_order_async(PE_TOKEN, "BUY", round(state["pe_ltp"] + 0.10, 1))
            elif pe_spread > 1.5:
                logging.info(f"PE Spread too wide (₹{pe_spread:.1f}). Skipping entry.")

    # ==========================================
    # EXIT LOGIC (Trailing Stop Loss)
    # ==========================================
    else:
        current_premium = state["ce_ltp"] if state["position_type"] == "CE" else state["pe_ltp"]
        pnl_pts = current_premium - state["buy_price"]
        
        if pnl_pts > state["highest_unrealized_pnl"]:
            state["highest_unrealized_pnl"] = pnl_pts

        exit_signal, exit_reason = False, ""

        if state["position_type"] == "CE" and state["nifty_ltp"] >= state["candle_open_price"]:
            exit_signal, exit_reason = True, "Reversal"
        elif state["position_type"] == "PE" and state["nifty_ltp"] <= state["candle_open_price"]:
            exit_signal, exit_reason = True, "Reversal"
        else:
            if state["highest_unrealized_pnl"] >= 2.5: # Trail deep profits
                if pnl_pts <= state["highest_unrealized_pnl"] - 1.0:
                    exit_signal, exit_reason = True, "Trailing SL"
            elif state["highest_unrealized_pnl"] >= TARGET_POINTS: # Risk Free Trade
                if pnl_pts <= 0.5:
                    exit_signal, exit_reason = True, "Risk-Free SL"
            else: # Hard Stop Loss
                if pnl_pts <= -STOP_LOSS_POINTS:
                    exit_signal, exit_reason = True, "Hard SL"

        # CONDITION 3: The Time Stop (Theta Protection)
        if state["entry_time"]:
            entry_dt = datetime.fromisoformat(state["entry_time"])
            if (now - entry_dt).total_seconds() > 900: # 900 seconds = 15 minutes
                exit_signal, exit_reason = True, "Time Stop (Momentum Died)"

        if exit_signal:
            state["last_traded_candle"] = state["current_candle_minute"]
            token = CE_TOKEN if state["position_type"] == "CE" else PE_TOKEN
            fire_limit_order_async(token, "SELL", current_premium)

def sync_broker_state():
    portfolio_api = upstox_client.PortfolioApi(api_client)
    try:
        for pos in portfolio_api.get_positions(api_version='2.0').data:
            if pos.quantity != 0 and pos.product == "I":
                state["in_position"] = True
                state["buy_price"] = pos.average_price
                state["position_type"] = "CE" if "CE" in pos.trading_symbol else "PE"
                global CE_TOKEN, PE_TOKEN
                if state["position_type"] == "CE": CE_TOKEN = pos.instrument_token
                else: PE_TOKEN = pos.instrument_token
                return
    except: pass

def on_open():
    add_activity("✅ WebSocket connected. System Armed.", "info")
    state["bot_status_message"] = "Live — scanning order book"
    streamer.subscribe(TOKENS, "full")

def on_error(error):
    logging.error(f"⚠️ WebSocket Error: {error}")

def on_close(code, reason):
    add_activity(f"⚠️ WebSocket Disconnected: {reason}. Reconnecting...", "error")
    time.sleep(5) # Wait 5 seconds to avoid spamming the broker API
    
    # Restart the WebSocket stream in a new thread
    threading.Thread(target=start_trading_bot, daemon=True).start()

def start_trading_bot():
    global api_client, db_connection, CE_TOKEN, PE_TOKEN, TOKENS, streamer
    try:
        with open("upstox_token.txt", "r") as f: access_token = f.read().strip()
    except: return

    cfg = upstox_client.Configuration()
    cfg.access_token = access_token
    api_client = upstox_client.ApiClient(cfg)

    sync_broker_state()
    fetch_available_capital() # Grab live capital on boot

    db_connection = setup_database()
    load_todays_stats(db_connection)

    if check_daily_drawdown(db_connection):
        state["bot_active"] = False
        return

    CE_TOKEN, PE_TOKEN = get_dynamic_tokens()
    if not CE_TOKEN or not PE_TOKEN: return

    TOKENS = [NIFTY_SPOT_TOKEN, CE_TOKEN, PE_TOKEN]
    streamer = upstox_client.MarketDataStreamerV3(api_client)
    streamer.on("open", on_open)
    streamer.on("message", on_message)
    streamer.on("error", on_error)
    streamer.on("close", on_close)
    streamer.connect()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    threading.Thread(target=start_trading_bot, daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=8000)
