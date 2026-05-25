import upstox_client
import time
import sys

with open("upstox_token.txt", "r") as f: access_token = f.read().strip()
cfg = upstox_client.Configuration()
cfg.access_token = access_token
api_client = upstox_client.ApiClient(cfg)

def on_open():
    print("WS opened")
    streamer.subscribe(["NSE_INDEX|Nifty 50"], "full")

def on_message(message):
    print("Raw Message:", message)
    sys.stdout.flush()

streamer = upstox_client.MarketDataStreamerV3(api_client)
streamer.on("open", on_open)
streamer.on("message", on_message)
streamer.connect()
time.sleep(5)
