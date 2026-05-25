import upstox_client
with open("upstox_token.txt", "r") as f: access_token = f.read().strip()
cfg = upstox_client.Configuration()
cfg.access_token = access_token
api_client = upstox_client.ApiClient(cfg)
quote_api = upstox_client.MarketQuoteApi(api_client)
try:
    response = quote_api.get_market_quote_ohlc("NSE_INDEX|Nifty 50", "1day", api_version='2.0')
    print("Success 1day:", response)
except Exception as e:
    print("Failed 1day:", e)

try:
    response = quote_api.get_market_quote_ohlc("NSE_INDEX|Nifty 50", "1d", api_version='2.0')
    print("Success 1d:", response)
except Exception as e:
    print("Failed 1d:", e)

try:
    response = quote_api.get_market_quote_ohlc("NSE_INDEX|Nifty 50", "I1", api_version='2.0')
    print("Success I1:", response)
except Exception as e:
    print("Failed I1:", e)
