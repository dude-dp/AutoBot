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

from supabase import create_client, Client
url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(url, key) if url and key else None

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
    if not supabase: return JSONResponse({"data": []})
    thirty_days_ago = (date.today() - timedelta(days=30)).isoformat()
    res = supabase.table('trade_log').select('*').gte('trade_date', thirty_days_ago).execute()
    agg = {}
    for t in res.data:
        d = t['trade_date']
        if d not in agg: agg[d] = {"date": d, "pnl": 0.0, "trades": 0, "wins": 0}
        agg[d]["pnl"] += t.get('pnl', 0)
        agg[d]["trades"] += 1
        if t.get('pnl', 0) > 0: agg[d]["wins"] += 1
    data = list(agg.values())
    for d in data: d["pnl"] = round(d["pnl"], 2)
    data.sort(key=lambda x: x["date"])
    return JSONResponse({"data": data})

@app.get("/api/history/trades")
async def get_recent_trades():
    if not supabase: return JSONResponse({"data": []})
    res = supabase.table('trade_log').select('*').order('id', desc=True).limit(50).execute()
    data = []
    for t in res.data:
        data.append({"id": t['id'], "date": t['trade_date'], "time": t['time'], "type": t['position_type'], "buy": t['buy_price'], "sell": t['sell_price'], "pnl": t['pnl']})
    return JSONResponse({"data": data})

@app.get("/api/stats")
async def get_stats():
    if not supabase: return JSONResponse({})
    res = supabase.table('trade_log').select('pnl').execute()
    trades = res.data
    total_trades = len(trades)
    total_pnl = sum(t.get('pnl', 0) for t in trades)
    total_wins = sum(1 for t in trades if t.get('pnl', 0) > 0)
    win_rate = round((total_wins / total_trades * 100) if total_trades else 0, 1)
    return JSONResponse({"total_trades": total_trades, "total_pnl": round(total_pnl, 2), "win_rate": win_rate})

# ==========================================
# 3. DATABASE & RISK LOGIC
# ==========================================
def check_daily_drawdown():
    if state["daily_pnl"] <= MAX_DAILY_LOSS:
        send_telegram_alert("🚨 MAX DAILY DRAWDOWN HIT. BOT HALTED.")
        return True
    return False

def load_todays_stats():
    if not supabase: return
    try:
        res = supabase.table('trade_log').select('*').eq('trade_date', date.today().isoformat()).execute()
        trades = res.data
        state["daily_pnl"] = round(sum(t.get('pnl', 0) for t in trades), 2)
        state["daily_trades"] = len(trades)
        state["daily_wins"] = sum(1 for t in trades if t.get('pnl', 0) > 0)
    except Exception as e:
        logging.error(f"Failed to load today's stats from Supabase: {e}")

def trigger_edge_ai_tagger(trade_id):
    def run():
        try:
            worker_url = os.getenv("WORKER_URL", "https://autobot-edge.upstox-autobot.workers.dev")
            auth_creds = (os.getenv("ADMIN_USER", "admin"), os.getenv("ADMIN_PASS", "supersecret"))
            res = requests.post(
                f"{worker_url}/api/tag-trade",
                json={"id": trade_id},
                auth=auth_creds,
                timeout=10
            )
            logging.info(f"AI Tagger requested for trade {trade_id}. Response: {res.status_code}")
        except Exception as e:
            logging.error(f"Background AI Tagger failed: {e}")
            
    threading.Thread(target=run, daemon=True).start()

def log_trade(position_type, buy_price, sell_price, quantity):
    pnl = round((sell_price - buy_price) * quantity, 2)
    today = date.today().isoformat()
    now_time = datetime.now().strftime("%H:%M:%S")
    
    # Push the trade directly to the cloud
    if supabase:
        try:
            res = supabase.table('trade_log').insert({
                "trade_date": today,
                "time": now_time,
                "position_type": position_type,
                "buy_price": buy_price,
                "sell_price": sell_price,
                "pnl": pnl
            }).execute()
            if res.data and len(res.data) > 0:
                trade_id = res.data[0]['id']
                trigger_edge_ai_tagger(trade_id)
        except Exception as e:
            logging.error(f"Failed to sync trade to Supabase: {e}")

    state["daily_pnl"] = round(state["daily_pnl"] + pnl, 2)
    state["daily_trades"] += 1
    
    if pnl > 0:
        state["daily_wins"] += 1
        state["consecutive_losses"] = 0
    else:
        state["consecutive_losses"] += 1
        
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
                        log_trade(state["position_type"], state["buy_price"], avg_price, state["quantity"])
                        if check_daily_drawdown(): state["bot_active"] = False
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

def get_breakeven_points(buy_price, quantity):
    """Calculates the exact points movement required to cover Upstox Brokerage + Taxes"""
    if quantity == 0: return 0.0
    
    # Approximate round-trip turnover
    turnover = (buy_price * 2) * quantity  
    
    brokerage = 40.0  # ₹20 Buy + ₹20 Sell
    txn_charge = turnover * 0.0005        # ~0.05% NSE Options Txn Charge
    gst = (brokerage + txn_charge) * 0.18 # 18% GST on Brokerage + Txn
    stt = (buy_price * quantity) * 0.001  # STT 0.1% on Sell Side Premium
    stamp_duty = (buy_price * quantity) * 0.00003 # Stamp duty on Buy Side
    sebi = turnover * 0.000001            # SEBI Turnover charge
    
    total_charges = brokerage + txn_charge + gst + stt + stamp_duty + sebi
    return round(total_charges / quantity, 2)

last_telemetry_push = 0

def on_message(message):
    global last_telemetry_push
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

    # ==========================================
    # 📡 THE TELEMETRY HEARTBEAT
    # ==========================================
    if time.time() - last_telemetry_push >= 3.0:
        last_telemetry_push = time.time()
        
        def push_telemetry(ce_b, ce_a, ce_s, pe_b, pe_a, pe_s, trend):
            if not supabase: return
            try:
                supabase.table('telemetry').update({
                    "ce_bids": ce_b, "ce_asks": ce_a, "ce_spread": ce_s,
                    "pe_bids": pe_b, "pe_asks": pe_a, "pe_spread": pe_s,
                    "macro_trend": trend,
                    "updated_at": datetime.now().isoformat()
                }).eq('id', 1).execute()
            except Exception: pass
            
        threading.Thread(
            target=push_telemetry, 
            args=(ce_bids, ce_asks, ce_spread, pe_bids, pe_asks, pe_spread, state.get("macro_trend", "SCANNING")), 
            daemon=True
        ).start()

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
    # EXIT LOGIC (Dynamic 1% Trailing & Break-Even)
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
        elif state["entry_time"] and (now - datetime.fromisoformat(state["entry_time"])).total_seconds() > 900:
            exit_signal, exit_reason = True, "Time Stop (15m elapsed)"
        else:
            # 1. Calculate Exact Break-Even Points for this specific lot size
            breakeven_pts = get_breakeven_points(state["buy_price"], state["quantity"])
            
            # 2. Define 1% Target of the capital deployed on this premium
            one_percent_pts = state["buy_price"] * 0.01
            
            # 3. Secure Target: Must be 1% OR Break-even + buffer (whichever is higher)
            target_pts = max(one_percent_pts, breakeven_pts + 0.25)
            
            # 4. Step-Trailing Gap
            trail_gap = 0.20
            
            if state["highest_unrealized_pnl"] >= target_pts:
                # Trail exactly 0.20 pts behind the highest achieved point
                trailing_sl = state["highest_unrealized_pnl"] - trail_gap
                
                # Absolute Floor: Guarantee a risk-free exit (scratch trade) if it drops rapidly from target
                trailing_sl = max(trailing_sl, breakeven_pts + 0.05)
                
                if pnl_pts <= trailing_sl:
                    exit_signal, exit_reason = True, f"Dynamic 1% Trail Hit (+{pnl_pts:.2f} pts)"
            else:
                # Pre-Target: Standard Hard Stop Loss
                if pnl_pts <= -STOP_LOSS_POINTS:
                    exit_signal, exit_reason = True, "Hard SL"

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
    global api_client, CE_TOKEN, PE_TOKEN, TOKENS, streamer
    try:
        with open("upstox_token.txt", "r") as f: access_token = f.read().strip()
    except: return

    cfg = upstox_client.Configuration()
    cfg.access_token = access_token
    api_client = upstox_client.ApiClient(cfg)

    sync_broker_state()
    fetch_available_capital() # Grab live capital on boot

    load_todays_stats()

    if check_daily_drawdown():
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

def poll_supabase_commands():
    """Background thread that checks Supabase for remote mobile commands."""
    logging.info("☁️ Cloud Command Polling Activated.")
    while True:
        try:
            response = supabase.table('bot_control').select('command').eq('id', 1).execute()
            if response.data and len(response.data) > 0:
                current_command = response.data[0]['command']
                
                if current_command == 'PANIC':
                    logging.critical("🚨 CLOUD PANIC SIGNAL RECEIVED!")
                    
                    # 1. Reset the cloud state immediately so we don't loop
                    supabase.table('bot_control').update({
                        'command': 'NONE', 
                        'updated_at': datetime.now().isoformat()
                    }).eq('id', 1).execute()
                    
                    # 2. Execute the Panic Sequence locally
                    state["bot_active"] = False
                    if state["in_position"]:
                        token_to_sell = CE_TOKEN if state["position_type"] == "CE" else PE_TOKEN
                        logging.critical(f"🚨 CLOUD PANIC SELL: Flattening {state['position_type']}.")
                        fire_market_order_async(token_to_sell, "SELL")
                        state["in_position"] = False
                        state["pending_order"] = False
                        
                    send_telegram_alert("⚠️ CLOUD PANIC SELL INITIATED VIA MOBILE EDGE!")
                    
        except Exception as e:
            pass # Fail silently on network blips and try again next loop
            
        time.sleep(2) # Poll every 2 seconds

# ==========================================
# 6. SERVER STARTUP & LOGGING
# ==========================================
import logging.handlers

if __name__ == "__main__":
    # Setup dual logging (Console + Rotating File)
    log_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(log_formatter)
    
    # Keeps the latest 5MB of logs, backed up across 3 files max
    file_handler = logging.handlers.RotatingFileHandler('autobot.log', maxBytes=5*1024*1024, backupCount=3)
    file_handler.setFormatter(log_formatter)
    
    logging.basicConfig(level=logging.INFO, handlers=[console_handler, file_handler])

    # Seed a startup log before the bot thread runs so UI has something to show
    state["activity_log"].append({"time": datetime.now().strftime("%H:%M:%S"), "msg": "AutoBot Control Center starting...", "level": "info"})

    bot_thread = threading.Thread(target=start_trading_bot, daemon=True)
    bot_thread.start()

    # Start the cloud polling thread
    threading.Thread(target=poll_supabase_commands, daemon=True).start()

    logging.info("Starting Control Center UI at http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
