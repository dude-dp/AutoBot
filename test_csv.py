import pandas as pd
from datetime import date
try:
    csv_url = "https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz"
    df = pd.read_csv(csv_url)
    nifty_options = df[(df['name'] == 'NIFTY') & (df['instrument_type'].isin(['CE', 'PE']))].copy()
    nifty_options['expiry'] = pd.to_datetime(nifty_options['expiry'])
    nearest_expiry = nifty_options[nifty_options['expiry'] >= pd.to_datetime(date.today())]['expiry'].min()
    print("Nearest expiry:", nearest_expiry)
    options_chain = nifty_options[nifty_options['expiry'] == nearest_expiry]
    ce_options = options_chain[(options_chain['strike'] == 23900) & (options_chain['instrument_type'] == 'CE')]
    print("CE Count:", len(ce_options))
    if len(ce_options) > 0:
        print("CE:", ce_options.iloc[0]['instrument_key'])
except Exception as e:
    print("Error:", e)
