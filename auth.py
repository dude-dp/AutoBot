import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
import urllib.parse
import requests
import _thread
import sys

import os
from dotenv import load_dotenv

load_dotenv()

# --- UPSTOX APP CREDENTIALS ---
API_KEY = os.getenv("UPSTOX_API_KEY")
API_SECRET = os.getenv("UPSTOX_API_SECRET")
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:8080/")  # You MUST set this exactly in your Upstox App Dashboard

class AuthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        
        if 'code' in params:
            auth_code = params['code'][0]
            
            # 1. Send success message to the browser
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(b"<html><body><h2>Authentication successful!</h2><p>Token saved. You can close this tab and check your terminal.</p></body></html>")
            
            # 2. Exchange the Auth Code for the Access Token
            print("\nCatching Auth Code and requesting Access Token...")
            url = 'https://api.upstox.com/v2/login/authorization/token'
            headers = {
                'accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
            }
            data = {
                'code': auth_code,
                'client_id': API_KEY,
                'client_secret': API_SECRET,
                'redirect_uri': REDIRECT_URI,
                'grant_type': 'authorization_code',
            }
            
            response = requests.post(url, headers=headers, data=data)
            
            if response.status_code == 200:
                token = response.json().get('access_token')
                # 3. Save to a local file for the main bot to read
                with open("upstox_token.txt", "w") as f:
                    f.write(token)
                print("✅ Access Token saved to upstox_token.txt")
            else:
                print(f"❌ Failed to get token: {response.text}")
            
            # Kill the local server
            _thread.interrupt_main()

def generate_daily_token():
    auth_url = f"https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id={API_KEY}&redirect_uri={REDIRECT_URI}"
    
    print("Opening browser for Upstox login...")
    webbrowser.open(auth_url)
    
    print(f"Starting local server on {REDIRECT_URI} to catch the callback...")
    server = HTTPServer(('localhost', 8080), AuthHandler)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Server shut down. Ready to trade.")

if __name__ == "__main__":
    generate_daily_token()
