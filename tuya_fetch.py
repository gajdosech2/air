import os
import json
import tinytuya
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()  # reads .env file in the current directory and loads it into os.environ

# --- Local Tuya device config ---
DEVICE_ID = os.environ["TUYA_LOCAL_DEVICE_ID"]
LOCAL_KEY = os.environ["TUYA_LOCAL_KEY"]
DEVICE_VERSION = 3.4

IP_CACHE_FILE = ".device_ip_cache.json"

# --- Supabase config ---
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
SUPABASE_TABLE = "readings"

# DP index -> label mapping, from the device's cloud specification.
# Double-check scale/unit for each of these against the /specifications
# output before trusting raw values (e.g. temperature may need /10).
DP_LABELS = {
    "2": "pm25",
    "12": "temp",
    "13": "humidity",
    "14": "tvoc",
    "15": "eco2",
    "21": "air_quality",
    "27": "ch2o_value",
}


def load_cached_ip():
    if os.path.exists(IP_CACHE_FILE):
        try:
            with open(IP_CACHE_FILE) as f:
                return json.load(f).get(DEVICE_ID)
        except Exception:
            return None
    return None


def save_cached_ip(ip):
    cache = {}
    if os.path.exists(IP_CACHE_FILE):
        try:
            with open(IP_CACHE_FILE) as f:
                cache = json.load(f)
        except Exception:
            cache = {}
    cache[DEVICE_ID] = ip
    with open(IP_CACHE_FILE, "w") as f:
        json.dump(cache, f)


def discover_device_ip():
    """Scans the local network for this device by its Device ID."""
    print("Scanning local network for device (this can take ~18s)...")
    found = tinytuya.deviceScan(verbose=False)
    for ip, info in found.items():
        if info.get("gwId") == DEVICE_ID or info.get("id") == DEVICE_ID:
            return ip
    raise Exception(
        f"Device {DEVICE_ID} not found on the local network. "
        "Make sure it's powered on and connected to the same network."
    )


def get_device_ip():
    """Try the cached IP first (fast path), fall back to a full scan if it fails."""
    cached_ip = load_cached_ip()
    if cached_ip:
        try:
            d = tinytuya.OutletDevice(DEVICE_ID, cached_ip, LOCAL_KEY)
            d.set_version(DEVICE_VERSION)
            status = d.status()
            if "dps" in status:
                return cached_ip
        except Exception:
            pass  # fall through to rescan

    ip = discover_device_ip()
    save_cached_ip(ip)
    return ip


def fetch_local_reading(ip):
    d = tinytuya.OutletDevice(DEVICE_ID, ip, LOCAL_KEY)
    d.set_version(DEVICE_VERSION)
    status = d.status()
    if "dps" not in status:
        raise Exception(f"Unexpected response from device: {status}")
    raw = status["dps"]
    labeled = {DP_LABELS.get(k, k): v for k, v in raw.items()}
    return labeled


def push_to_supabase(device_id, reading):
    url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    payload = {
        "device_id": device_id,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "data": reading,
    }
    res = requests.post(url, headers=headers, json=payload)
    if res.status_code not in (200, 201):
        raise Exception(f"Supabase insert failed: {res.status_code} {res.text}")


if __name__ == "__main__":
    ip = get_device_ip()
    print(f"Using device IP: {ip}")

    print("Fetching local reading...")
    reading = fetch_local_reading(ip)

    print("\nReadings:")
    for label, value in reading.items():
        print(f"  {label:<25} = {value}")

    print("\nPushing to Supabase...")
    push_to_supabase(DEVICE_ID, reading)
    print("Done.")