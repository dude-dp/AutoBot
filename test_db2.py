from dotenv import load_dotenv
import os
from supabase import create_client

load_dotenv()
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
try:
    res = supabase.table('telemetry').update({'capital': 41000}).eq('id', 1).execute()
    print("Success:", res)
except Exception as e:
    print("Error:", e)
