from robocorp.tasks import task
import upstox_client
from upstox_client.rest import ApiException
import pandas as pd
import sqlite3
import threading
from datetime import datetime, date
import logging
import sys

# --- CONFIGURATION ---
CAPITAL_LIMIT = 40000
MAX_PREMIUM = 100
QUANTITY = 25
TARGET_POINTS = 1.5
STOP_LOSS_POINTS = 2.0
MAX_DAILY_LOSS = -1000

# Global State
state = {
    "nifty_ltp": 0.0,
    "ce_ltp": 0.0,
    "pe_ltp": 0.0,
    "candle_open_price": 0.0,
    "current_candle_minute": -1,
    "in_position": False,
    "position_type": None,
    "buy_price": 0.0
}

# Tokens will be populated dynamically
NIFTY_SPOT_TOKEN = "NSE_INDEX|Nifty 50"
CE_TOKEN = ""
PE_TOKEN = ""
TOKENS = []

api_client = None
db_connection = None

# ==========================================
# 1. DATABASE & RISK MANAGEMENT
# ==========================================
def setup_database():
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
    
    logging.info(f"Current Daily PnL: ₹{daily_pnl}")
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
# 2. DYNAMIC TOKEN MATCHER
# ==========================================
def get_dynamic_tokens():
    logging.info("Fetching Nifty 50 Spot Price to calculate ATM...")
    quote_api = upstox_client.MarketQuoteApi(api_client)
    
    try:
        response = quote_api.get_full_market_quote(NIFTY_SPOT_TOKEN, api_version='2.0')
        spot_price = response.data[NIFTY_SPOT_TOKEN].last_price
        atm_strike = round(spot_price / 50) * 50
        logging.info(f"Nifty Spot: {spot_price} | ATM Strike: {atm_strike}")
    except Exception as e:
        logging.error(f"Error fetching spot price: {e}")
        return None, None

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
# 3. ORDER EXECUTION
# ==========================================
def place_order(instrument_token, transaction_type):
    order_api = upstox_client.OrderApi(api_client)
    body = upstox_client.PlaceOrderRequest(
        quantity=QUANTITY, product="I", validity="DAY", price=0.0,
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

# ==========================================
# 4. WEBSOCKET EVENT LOOP
# ==========================================
def on_message(message):
    now = datetime.now()
    feeds = message.get("feeds", {})
    
    # Extract Latest Prices
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

    # Lock 5-Minute Candle Open
    current_5min_block = now.minute // 5
    if current_5min_block != state["current_candle_minute"]:
        state["current_candle_minute"] = current_5min_block
        state["candle_open_price"] = state["nifty_ltp"]
        logging.info(f"--- New 5m Candle Opened at: {state['candle_open_price']} ---")

    # Entry Logic
    if not state["in_position"]:
        if state["nifty_ltp"] < state["candle_open_price"] and state["ce_ltp"] <= MAX_PREMIUM:
            logging.info(f"Entry: Nifty crossed below Open. Buying CE at ~{state['ce_ltp']}")
            fire_order_async(CE_TOKEN, "BUY")
            state["in_position"] = True
            state["position_type"] = "CE"
            state["buy_price"] = state["ce_ltp"]
            
        elif state["nifty_ltp"] > state["candle_open_price"] and state["pe_ltp"] <= MAX_PREMIUM:
            logging.info(f"Entry: Nifty crossed above Open. Buying PE at ~{state['pe_ltp']}")
            fire_order_async(PE_TOKEN, "BUY")
            state["in_position"] = True
            state["position_type"] = "PE"
            state["buy_price"] = state["pe_ltp"]

    # Exit Logic
    else:
        if state["position_type"] == "CE":
            pnl_pts = state["ce_ltp"] - state["buy_price"]
            if state["nifty_ltp"] >= state["candle_open_price"] or pnl_pts >= TARGET_POINTS or pnl_pts <= -STOP_LOSS_POINTS:
                logging.info(f"Exit CE Triggered. Selling...")
                fire_order_async(CE_TOKEN, "SELL")
                
                realized_pnl = log_trade(db_connection, "CE", state["buy_price"], state["ce_ltp"], QUANTITY)
                logging.info(f"Trade Closed. PnL: ₹{realized_pnl}")
                
                if check_daily_drawdown(db_connection):
                    logging.critical("MAX DRAWDOWN HIT. SHUTTING DOWN.")
                    sys.exit(0)
                state["in_position"] = False
                
        elif state["position_type"] == "PE":
            pnl_pts = state["pe_ltp"] - state["buy_price"]
            if state["nifty_ltp"] <= state["candle_open_price"] or pnl_pts >= TARGET_POINTS or pnl_pts <= -STOP_LOSS_POINTS:
                logging.info(f"Exit PE Triggered. Selling...")
                fire_order_async(PE_TOKEN, "SELL")
                
                realized_pnl = log_trade(db_connection, "PE", state["buy_price"], state["pe_ltp"], QUANTITY)
                logging.info(f"Trade Closed. PnL: ₹{realized_pnl}")
                
                if check_daily_drawdown(db_connection):
                    logging.critical("MAX DRAWDOWN HIT. SHUTTING DOWN.")
                    sys.exit(0)
                state["in_position"] = False

def on_open():
    logging.info("WebSocket connected. Subscribing to tokens...")
    streamer.subscribe(TOKENS, "full")

# ==========================================
# 5. MAIN ROBOCORP TASK
# ==========================================
@task
def upstox_options_scalper():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    logging.info("Initializing Upstox Scalper...")

    global api_client, db_connection, CE_TOKEN, PE_TOKEN, TOKENS, streamer

    # 1. Read the token saved by auth.py
    try:
        with open("upstox_token.txt", "r") as f:
            access_token = f.read().strip()
    except FileNotFoundError:
        logging.critical("upstox_token.txt not found. Run auth.py first!")
        sys.exit(1)

    # 2. Initialize REST API
    configuration = upstox_client.Configuration()
    configuration.access_token = access_token
    api_client = upstox_client.ApiClient(configuration)

    # 3. Setup SQLite Database
    db_connection = setup_database()
    if check_daily_drawdown(db_connection):
        logging.critical("You have already hit your daily loss limit. Trading halted.")
        sys.exit(0)

    # 4. Fetch Daily Tokens
    CE_TOKEN, PE_TOKEN = get_dynamic_tokens()
    if not CE_TOKEN or not PE_TOKEN:
        logging.critical("Failed to fetch dynamic tokens. Exiting.")
        sys.exit(1)
        
    TOKENS = [NIFTY_SPOT_TOKEN, CE_TOKEN, PE_TOKEN]

    # 5. Start WebSocket
    streamer = upstox_client.MarketDataStreamerV3(api_client)
    streamer.on("open", on_open)
    streamer.on("message", on_message)

    try:
        streamer.connect()
    except KeyboardInterrupt:
        logging.info("Bot manually stopped. Disconnecting...")
        sys.exit(0)
