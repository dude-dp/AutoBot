import upstox_client
with open("upstox_token.txt", "r") as f: access_token = f.read().strip()
cfg = upstox_client.Configuration()
cfg.access_token = access_token
api_client = upstox_client.ApiClient(cfg)
api = upstox_client.UserApi(api_client)
try:
    resp = api.get_profile(api_version="2.0")
    print("Success:", resp)
except Exception as e:
    print("Failed:", e)
