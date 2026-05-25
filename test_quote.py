import upstox_client
with open("upstox_token.txt", "r") as f: access_token = f.read().strip()
cfg = upstox_client.Configuration()
cfg.access_token = access_token
api_client = upstox_client.ApiClient(cfg)
quote_api = upstox_client.MarketQuoteApi(api_client)
try:
    response = quote_api.get_market_quote_ohlc("NSE_INDEX|Nifty 50", "1D", api_version='2.0')
    print("Success:", response)
except Exception as e:
    print("Failed:", e)
