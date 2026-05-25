from dotenv import load_dotenv
import os
from supabase import create_client

load_dotenv()
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
print(supabase.table('telemetry').select('*').eq('id', 1).execute())
print(supabase.table('bot_control').select('*').eq('id', 1).execute())
