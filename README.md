# AutoBot - Institutional-Grade Options Scalping Engine

AutoBot is an advanced, high-frequency, completely automated options scalping engine built on the Upstox API. It is designed to run locally on an Ubuntu server, completely independent of cloud services. 

It transitions a basic options buying prototype into a resilient, state-aware, crash-proof institutional execution engine.

---

## 🏗️ Core Features & Upgrades

### 1. Advanced Execution Engine
* **Smart Limit Orders**: Never uses raw Market Orders to avoid massive slippage. Uses a `Limit Price + 0.10` offset to cross the Bid-Ask spread for immediate execution while protecting capital from liquidity gaps.
* **Order Monitoring Loop**: Places limits and monitors them in a background thread.
* **Consolidation Safeguards**: 
  * **60-Second Momentum Rule**: If an entry order sits for > 60 seconds without a fill, the breakout failed. Order is cancelled.
  * **Setup Invalidation**: If the 5-minute candle closes before the order fills, the order is cancelled.
* **Stop-Loss Override**: Actively monitors LTP against your Stop-Loss even while waiting in the limit order book. If a crash occurs, it yanks the limit order and Market Sells to protect capital.

### 2. Alpha Generation (Trading Edge)
* **The Whipsaw Lock**: After a trade exits, the bot locks itself out of trading for the remainder of the current 5-minute candle. This prevents "revenge trading" chop.
* **Risk-Free Trailing Stops**: 
  * Phase 1: Hard -2.0 point stop loss.
  * Phase 2: Once profit crosses +1.5 points, stop moves to +0.5 (Risk-Free).
  * Phase 3: If profit crosses +2.5 points, trailing stop locks in 1.0 point behind the peak.
* **Order Book Imbalance (OBI) Filter**: Parses Level 2 Market Depth. Only takes breakout trades if Bids outnumber Asks by > 20% (Ratio >= 1.20). Prevents spoofing and fakeouts.
* **Chop Zone Filter**: Completely disables trading during the European lunch hour (12:00 PM - 1:30 PM) to avoid sideways Theta decay.

### 3. Disaster Recovery & State Awareness
* **State Synchronization**: On startup, the bot asks the Upstox Portfolio API if there are any open trades. If the script crashed mid-trade, it instantly recovers the open positions and resumes tracking stop losses.
* **Deadlock Prevention**: All threading locks use `try...except...finally` blocks so a crash never leaves the bot in a zombie state.

### 4. Zero-Touch Operations
* **OS-Level Automation**: `start_bot.sh` script built to activate the environment and run the server silently via `nohup`.
* **Cron Integration**: Designed to wake up and trade fully autonomously via Ubuntu `crontab`.
* **Proprietary Data Harvesting**: Logs every single millisecond tick of Nifty Spot, CE, and PE into daily CSV files (`data_logger.py`).
* **Telegram Alerts**: Pushes mobile notifications for Panic Sells, Stop Loss hits, and Max Drawdown events.

---

## 📂 Repository Structure

* `app.py`: The core engine. Contains the FastAPI web server, WebSocket logic, order execution threads, and all mathematical trading logic.
* `auth.py`: Script to generate the Upstox API Token (`upstox_token.txt`).
* `data_logger.py`: Harvests and writes the live Upstox tick data into daily CSVs (`market_data_YYYY-MM-DD.csv`).
* `start_bot.sh`: The automated bash script for Cron to launch the bot silently.
* `templates/index.html`: The beautiful, Neo-Brutalist, dark-mode real-time dashboard powered by Tailwind and Chart.js.
* `.env`: Your secure configuration file.
* `trades.db`: The local SQLite database holding historical PnL, trades, and drawdowns.

---

## ⚙️ Configuration (`.env`)

You must have a `.env` file in the root folder with the following keys:

```ini
UPSTOX_API_KEY=your_api_key
UPSTOX_API_SECRET=your_api_secret
REDIRECT_URI=http://localhost:8080/
MAX_DAILY_LOSS=-1500
CAPITAL_LIMIT=40000
TELEGRAM_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
```

---

## 💻 Essential Commands Reference

### 1. Environment & Setup
**Activate Virtual Environment:**
```bash
source env/bin/activate
```
**Install Dependencies:**
```bash
pip install fastapi uvicorn upstox-python-sdk pandas python-dotenv requests
```
n
### 2. Daily Operations
**1. Run Authentication (Required Daily):**
```bash
python auth.py
```
*(You must click the Upstox login link, log in, and paste the resulting URL back into the terminal).*

**2. Start the Bot Manually (With live terminal output):**
```bash
python app.py
```
*(Dashboard will be available at `http://localhost:8000`)*

**3. Start the Bot in the Background (Zero-Touch):**
```bash
./start_bot.sh
```

### 3. Monitoring & Cron
**View Background Bot Logs:**
```bash
tail -f bot_output.log
```

**Edit Automation Schedule:**
```bash
crontab -e
```
*(The current configured schedule is: `10 9 * * 1-5 /home/dudedp/AutoBot/start_bot.sh` which runs Monday-Friday at 9:10 AM)*

---

## 📊 Next Steps & Future Alpha
* **The Backtester**: Since `data_logger.py` is actively saving CSV tick data, your next major project will be building `backtester.py`. This will feed the historical CSV data back into `app.py`'s exact logic so you can run mathematically flawless simulations of new entry/exit rules.
* **Multi-Target Scaling**: Implementing dynamic lot-sizing exits (e.g. Sell 8 lots at target, trail 5 lots as runners).
