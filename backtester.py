import pandas as pd
from datetime import datetime
import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(url, key) if url and key else None


# --- BACKTEST PARAMETERS ---
CSV_FILE = "market_data_2026-05-25.csv" # Change to your actual file
TARGET_PTS = 1.5
STOP_LOSS_PTS = 2.0
TRAIL_TRIGGER = 2.5
TRAIL_DIST = 1.0
QUANTITY = 325

def run_backtest():
    print(f"🛠️ Starting Backtest on {CSV_FILE}")
    print(f"📊 Target: {TARGET_PTS} | SL: {STOP_LOSS_PTS} | Trail: {TRAIL_DIST} (after {TRAIL_TRIGGER})")
    print("-" * 60)
    
    try:
        df = pd.read_csv(CSV_FILE)
    except FileNotFoundError:
        print("❌ CSV file not found. Let data_logger.py generate one first.")
        return

    in_position = False
    position_type = None
    buy_price = 0.0
    candle_open_price = 0.0
    current_candle_min = -1
    highest_pnl = 0.0
    
    total_pnl = 0.0
    wins = 0
    losses = 0
    trade_log = []

    for index, row in df.iterrows():
        try:
            # Parse time (assuming format HH:MM:SS.f)
            time_obj = datetime.strptime(row['Timestamp'], "%H:%M:%S.%f").time()
        except ValueError:
            time_obj = datetime.strptime(row['Timestamp'], "%H:%M:%S").time()
            
        nifty = float(row['Nifty_Spot'])
        ce_ltp = float(row['CE_LTP'])
        pe_ltp = float(row['PE_LTP'])

        # 5-Min Candle Logic
        current_5min = time_obj.minute // 5
        if current_5min != current_candle_min:
            current_candle_min = current_5min
            candle_open_price = nifty

        # --- ENTRY LOGIC ---
        if not in_position:
            # Note: We skip OBI/Macro-trend here for a pure price-action backtest, 
            # but you can add them if you log those metrics!
            if nifty < candle_open_price:
                in_position = True; position_type = "CE"; buy_price = ce_ltp
                highest_pnl = 0.0
                trade_log.append(f"[{time_obj}] 🟢 BUY CE @ {buy_price}")
            
            elif nifty > candle_open_price:
                in_position = True; position_type = "PE"; buy_price = pe_ltp
                highest_pnl = 0.0
                trade_log.append(f"[{time_obj}] 🔴 BUY PE @ {buy_price}")

        # --- EXIT LOGIC ---
        else:
            current_premium = ce_ltp if position_type == "CE" else pe_ltp
            pnl_pts = current_premium - buy_price
            
            if pnl_pts > highest_pnl:
                highest_pnl = pnl_pts

            exit_reason = None
            
            # 1. Structural Reversal
            if position_type == "CE" and nifty >= candle_open_price: exit_reason = "Reversal"
            elif position_type == "PE" and nifty <= candle_open_price: exit_reason = "Reversal"
            
            # 2. Dynamic SL
            else:
                if highest_pnl >= TRAIL_TRIGGER:
                    if pnl_pts <= highest_pnl - TRAIL_DIST: exit_reason = "Trailing SL"
                elif highest_pnl >= TARGET_PTS:
                    if pnl_pts <= 0.5: exit_reason = "Risk-Free SL"
                else:
                    if pnl_pts <= -STOP_LOSS_PTS: exit_reason = "Hard SL"

            if exit_reason:
                realized = pnl_pts * QUANTITY
                total_pnl += realized
                if realized > 0: wins += 1
                else: losses += 1
                
                trade_log.append(f"[{time_obj}] 🏁 SELL {position_type} @ {current_premium} ({exit_reason}) | PnL: ₹{realized:.2f}")
                in_position = False

    # --- PRINT REPORT ---
    for log in trade_log: print(log)
    print("-" * 60)
    total_trades = wins + losses
    win_rate = int((wins / total_trades) * 100) if total_trades > 0 else 0
    
    print(f"🏆 Total Trades: {total_trades}")
    print(f"✅ Wins: {wins} | ❌ Losses: {losses}")
    print(f"💰 NET PnL: ₹{total_pnl:.2f}")

    # Push to Supabase
    if supabase:
        try:
            supabase.table('backtest_runs').insert({
                "target": TARGET_PTS,
                "stop_loss": STOP_LOSS_PTS,
                "trail_trigger": TRAIL_TRIGGER,
                "trail_dist": TRAIL_DIST,
                "total_trades": total_trades,
                "win_rate": win_rate,
                "net_pnl": total_pnl
            }).execute()
            print("✅ Backtest results synced to Cloudflare Edge Dashboard.")
        except Exception as e:
            print(f"❌ Failed to sync to cloud: {e}")

if __name__ == "__main__":
    run_backtest()

