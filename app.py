import upstox_client
from upstox_client.rest import ApiException
import pandas as pd
import sqlite3
import threading
import asyncio
from datetime import datetime, date
import logging
import sys
import warnings

# Suppress pandas warnings for cleaner terminal output
warnings.filterwarnings('ignore')

from fastapi import FastAPI, WebSocket, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
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
    "buy_price": 0.0
}

CAPITAL_LIMIT = 40000
MAX_PREMIUM = 100
TARGET_POINTS = 1.5
STOP_LOSS_POINTS = 2.0
MAX_DAILY_LOSS = -1500

NIFTY_SPOT_TOKEN = "NSE_INDEX|Nifty 50"
CE_TOKEN = ""
PE_TOKEN = ""
TOKENS = []

api_client = None
db_connection = None
streamer = None

app = FastAPI()
templates = Jinja2Templates(directory="templates")

class ConfigUpdate(BaseModel):
    key: str
    value: float

# ==========================================
# 2. FASTAPI ENDPOINTS (THE UI)
# ==========================================
@app.get("/", response_class=HTMLResponse)
async def serve_ui(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(state)
            await asyncio.sleep(0.5)
    except Exception:
        pass

@app.post("/api/toggle")
async def toggle_bot():
    state["bot_active"] = not state["bot_active"]
    logging.info(f"Bot Active State changed to: {state['bot_active']}")
    return {"status": "success", "bot_active": state["bot_active"]}

@app.post("/api/config")
async def update_config(data: ConfigUpdate):
    if data.key == "quantity":
        state["quantity"] = int(data.value)
        logging.info(f"Quantity updated to: {state['quantity']}")
    return {"status": "success"}

@app.post("/api/panic")
async def panic_sell():
    state["bot_active"] = False
    if state["in_position"]:
        token_to_sell = CE_TOKEN if state["position_type"] == "CE" else PE_TOKEN
        logging.critical(f"🚨 PANIC SELL INITIATED FOR {state['position_type']} 🚨")
        fire_order_async(token_to_sell, "SELL")
        state["in_position"] = False
    return {"status": "panic_executed"}

# ==========================================
# 3. DATABASE LOGIC
# ==========================================
def setup_database():
    # check_same_thread=False is required because FastAPI and the Bot run on different threads
    conn = sqlite3.connect('trades.db', check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS trade_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_date TEXT,
            position_type TEXT,
            buy_price REAL,
            sell_price REAL,
            pnl REAL
        )
    ''')
    conn.commit()
    return conn

def check_daily_drawdown(conn):
    cursor = conn.cursor()
    today = date.today().isoformat()
    cursor.execute("SELECT SUM(pnl) FROM trade_log WHERE trade_date = ?", (today,))
    result = cursor.fetchone()[0]
    daily_pnl = result if result else 0.0
    
    if daily_pnl <= MAX_DAILY_LOSS:
        return True 
    return False

def log_trade(conn, position_type, buy_price, sell_price, quantity):
    pnl = (sell_price - buy_price) * quantity
    today = date.today().isoformat()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO trade_log (trade_date, position_type, buy_price, sell_price, pnl) VALUES (?, ?, ?, ?, ?)",
        (today, position_type, buy_price, sell_price, pnl)
    )
    conn.commit()
    return pnl

# ==========================================
# 4. WEEKEND-PROOF TOKEN MATCHER
# ==========================================
def get_dynamic_tokens():
    logging.info("Fetching Nifty 50 Spot Price to calculate ATM...")
    quote_api = upstox_client.MarketQuoteApi(api_client)
    spot_price = 0.0
    
    try:
        # 1. Try Live Quote (Will throw KeyError on weekends)
        response = quote_api.get_full_market_quote(NIFTY_SPOT_TOKEN, api_version='2.0')
        if response.data and NIFTY_SPOT_TOKEN in response.data:
            spot_price = response.data[NIFTY_SPOT_TOKEN].last_price
        else:
            raise KeyError("Token missing from live quote response.")
    except Exception as e:
        logging.warning("Live quote empty (normal on weekends). Attempting OHLC fallback...")
        try:
            # 2. Fallback to Friday's Close
            response = quote_api.get_market_quote_ohlc(NIFTY_SPOT_TOKEN, "1d", api_version='2.0')
            spot_price = response.data[NIFTY_SPOT_TOKEN].ohlc.close
            logging.info(f"Retrieved Weekend OHLC Close: {spot_price}")
        except Exception as e2:
            # 3. Last Resort
            logging.error("OHLC also failed. Using mock spot price.")
            spot_price = 23700.0 

    atm_strike = round(spot_price / 50) * 50
    logging.info(f"Calculated ATM Strike: {atm_strike}")

    logging.info("Downloading Upstox Master Contract CSV...")
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
        logging.info(f"Target Tokens -> CE: {ce} | PE: {pe}")
        return ce, pe
    except IndexError:
        logging.error("Could not find matching ATM contracts.")
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
        logging.info(f"✅ [{transaction_type}] MARKET Order Executed. ID: {response.data.order_id}")
    except ApiException as e:
        logging.critical(f"❌ Order Execution Failed: {e.body}")

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

    if state["nifty_ltp"] == 0.0: return

    current_5min_block = now.minute // 5
    if current_5min_block != state["current_candle_minute"]:
        state["current_candle_minute"] = current_5min_block
        state["candle_open_price"] = state["nifty_ltp"]

    if not state["bot_active"]: return

    # Entry Logic
    if not state["in_position"]:
        if state["nifty_ltp"] < state["candle_open_price"] and state["ce_ltp"] <= MAX_PREMIUM:
            fire_order_async(CE_TOKEN, "BUY")
            state["in_position"] = True
            state["position_type"] = "CE"
            state["buy_price"] = state["ce_ltp"]
            
        elif state["nifty_ltp"] > state["candle_open_price"] and state["pe_ltp"] <= MAX_PREMIUM:
            fire_order_async(PE_TOKEN, "BUY")
            state["in_position"] = True
            state["position_type"] = "PE"
            state["buy_price"] = state["pe_ltp"]

    # Exit Logic
    else:
        if state["position_type"] == "CE":
            pnl_pts = state["ce_ltp"] - state["buy_price"]
            if state["nifty_ltp"] >= state["candle_open_price"] or pnl_pts >= TARGET_POINTS or pnl_pts <= -STOP_LOSS_POINTS:
                fire_order_async(CE_TOKEN, "SELL")
                log_trade(db_connection, "CE", state["buy_price"], state["ce_ltp"], state["quantity"])
                if check_daily_drawdown(db_connection): state["bot_active"] = False
                state["in_position"] = False
                
        elif state["position_type"] == "PE":
            pnl_pts = state["pe_ltp"] - state["buy_price"]
            if state["nifty_ltp"] <= state["candle_open_price"] or pnl_pts >= TARGET_POINTS or pnl_pts <= -STOP_LOSS_POINTS:
                fire_order_async(PE_TOKEN, "SELL")
                log_trade(db_connection, "PE", state["buy_price"], state["pe_ltp"], state["quantity"])
                if check_daily_drawdown(db_connection): state["bot_active"] = False
                state["in_position"] = False

def on_open():
    logging.info("WebSocket Connected. Subscribing to Tokens...")
    streamer.subscribe(TOKENS, "full")

def start_trading_bot():
    global api_client, db_connection, CE_TOKEN, PE_TOKEN, TOKENS, streamer

    try:
        with open("upstox_token.txt", "r") as f:
            access_token = f.read().strip()
    except FileNotFoundError:
        logging.critical("upstox_token.txt not found. Run auth.py first!")
        return

    configuration = upstox_client.Configuration()
    configuration.access_token = access_token
    api_client = upstox_client.ApiClient(configuration)

    # Database Initialization 
    db_connection = setup_database()
    if check_daily_drawdown(db_connection):
        logging.critical("Max Daily Loss Reached. Trading Halted.")
        state["bot_active"] = False

    CE_TOKEN, PE_TOKEN = get_dynamic_tokens()
    if not CE_TOKEN or not PE_TOKEN:
        logging.critical("Failed to fetch dynamic tokens. Check terminal logs.")
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
    
    # 1. Start the trading bot in the background
    bot_thread = threading.Thread(target=start_trading_bot, daemon=True)
    bot_thread.start()

    # 2. Start the web dashboard on the main thread
    logging.info("Starting Control Center UI at http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
