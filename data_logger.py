import csv
from datetime import datetime
import os

def log_tick(nifty_spot, ce_ltp, pe_ltp):
    today_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"market_data_{today_str}.csv"
    
    file_exists = os.path.isfile(filename)
    
    with open(filename, mode='a', newline='') as file:
        writer = csv.writer(file)
        if not file_exists:
            writer.writerow(["Timestamp", "Nifty_Spot", "CE_LTP", "PE_LTP"])
            
        writer.writerow([
            datetime.now().strftime("%H:%M:%S.%f"),
            nifty_spot,
            ce_ltp,
            pe_ltp
        ])
