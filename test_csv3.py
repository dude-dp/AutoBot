import pandas as pd
csv_url = "https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz"
df = pd.read_csv(csv_url)
print("Columns:", df.columns.tolist())
print(df[df['name'] == 'NIFTY'].head(2).T)
