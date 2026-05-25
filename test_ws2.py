import upstox_client
import time
import sys
with open("upstox_token.txt", "r") as f: access_token = f.read().strip()
cfg = upstox_client.Configuration()
cfg.access_token = access_token
api_client = upstox_client.ApiClient(cfg)
streamer = upstox_client.MarketDataStreamerV3(api_client)

def on_open():
    streamer.subscribe(["NSE_FO|50973"], "full") # NIFTY26JUN27000CE

def on_message(message):
    print("Option Msg:", message)
    sys.stdout.flush()
    
streamer.on("open", on_open)
streamer.on("message", on_message)
streamer.connect()
time.sleep(3)
