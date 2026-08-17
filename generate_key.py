# generate_key.py - SEOSiri Per-User API Key Generator
import hmac
import hashlib
import time
import sys
import os

# Master Secret Key (Matches env.MASTER_SECRET in Cloudflare)
MASTER_SECRET = os.getenv("MASTER_SECRET", "seosiri_master_mcp_secret_key_2026_x99")

def generate_user_key(user_id: str, tier: str = "PRO", country: str = "US", duration_days: int = 365) -> str:
    # Replace underscores in user_id to prevent string split corruption
    user_id = user_id.replace("_", "-").strip()
    tier = tier.upper()
    country = country.upper()
    expires_at = int(time.time()) + (duration_days * 86400)
    
    payload = f"{tier}_{country}_{user_id}_{expires_at}"
    
    signature = hmac.new(
        MASTER_SECRET.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()[:8]
    
    return f"{payload}_{signature}"

if __name__ == "__main__":
    user = sys.argv[1] if len(sys.argv) > 1 else "client_usr01"
    tier = sys.argv[2] if len(sys.argv) > 2 else "PRO"
    country = sys.argv[3] if len(sys.argv) > 3 else "US"
    days = int(sys.argv[4]) if len(sys.argv) > 4 else 365

    key = generate_user_key(user, tier, country, days)
    
    print("\n==================================================")
    print("      SEOSIRI PRO/ENTERPRISE API KEY GENERATED    ")
    print("==================================================")
    print(f" User / Client ID : {user}")
    print(f" Tier Level      : {tier}")
    print(f" Target Country  : {country}")
    print(f" Valid Days      : {days} days")
    print(f" Generated Key   : {key}")
    print("==================================================\n")
