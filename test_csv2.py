import pandas as pd
csv_url = "https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz"
df = pd.read_csv(csv_url)
nifty_options = df[(df['name'] == 'NIFTY') & (df['instrument_type'].isin(['CE', 'PE']))].copy()
nifty_options['expiry'] = pd.to_datetime(nifty_options['expiry'])
print("Max expiry in CSV:", nifty_options['expiry'].max())
