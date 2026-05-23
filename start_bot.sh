#!/bin/bash
# Navigate to your bot folder
cd /home/dudedp/AutoBot

# Activate your virtual environment (adjust path if needed)
if [ -d "env" ]; then
    source env/bin/activate
elif [ -d "venv" ]; then
    source venv/bin/activate
fi

# Run Auth (Assuming you use the TOTP automation or manual approval)
# If auth requires manual PIN/TOTP, you will still need to click through the browser.
# But you can auto-start the UI server:
nohup python app.py > bot_output.log 2>&1 &
echo "Bot started in background. UI available at http://localhost:8000"
