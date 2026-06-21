import os
import requests
import subprocess
from dotenv import set_key, load_dotenv

ENV_FILE = '.env'

# Load existing env to get hardcoded backend URL
load_dotenv()
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:8000')

def get_available_interfaces():
    """
    Gets all available network interfaces
    with their IP addresses
    """
    try:
        result = subprocess.run(
            ['ip', '-o', '-4', 'addr', 'show'],
            capture_output=True,
            text=True
        )

        interfaces = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            parts = line.split()
            if len(parts) >= 4:
                iface = parts[1]
                ip = parts[3].split('/')[0]
                if iface != 'lo':
                    interfaces.append({
                        'name': iface,
                        'ip': ip
                    })

        return interfaces

    except Exception as e:
        print(f"Interface detection error: {e}")
        return []

def get_all_interfaces():
    """
    Gets all interfaces including
    those without IP addresses
    """
    try:
        result = subprocess.run(
            ['ip', '-o', 'link', 'show'],
            capture_output=True,
            text=True
        )

        interfaces = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            parts = line.split(': ')
            if len(parts) >= 2:
                iface = parts[1].split('@')[0].strip()
                if iface != 'lo':
                    interfaces.append(iface)

        return interfaces

    except Exception as e:
        return ['eth0']

def setup_wizard():
    print("=" * 50)
    print("  IntelliSense IDS Agent Setup")
    print("=" * 50)
    print()

    # Step 1 — API Key only
    # Organisation only needs to enter this
    api_key = input("Enter your API Key: ").strip()

    # Step 2 — Verify API Key with backend
    # Backend URL is hardcoded — user never sees it
    print("\nVerifying API key...")

    try:
        response = requests.post(
            f"{BACKEND_URL}/api/agent/authenticate",
            json={"api_key": api_key},
            timeout=30
        )

        if response.status_code != 200:
            print(f"Authentication failed: {response.json().get('detail')}")
            return False

        data = response.json()['data']
        org_id = data['org_id']
        org_name = data['org_name']
        org_code = data['org_code']

        print(f"Authenticated as: {org_name} ({org_code})")

    except Exception as e:
        print(f"Connection error: {e}")
        print("Make sure you are connected to the internet")
        return False

    # Step 3 — Network Interface
    # Automatic detection — user just confirms
    print("\n" + "=" * 50)
    print("Network Interface Detection")
    print("=" * 50)

    active_interfaces = get_available_interfaces()
    all_interfaces = get_all_interfaces()

    if active_interfaces:
        print("\nDetected active interfaces:")
        for iface in active_interfaces:
            print(f"  {iface['name']:<15} IP: {iface['ip']}")

    # Auto suggest best interface
    suggested = None
    if active_interfaces:
        suggested = active_interfaces[0]['name']

    print(f"\nRecommended interface: {suggested}")

    confirm = input(
        f"Use {suggested}? (Press Enter to confirm "
        f"or type another interface name): "
    ).strip()

    interface = confirm if confirm else suggested

    if not interface:
        interface = 'eth0'

    print(f"Interface selected: {interface}")

    # Step 4 — Save to .env
    # Only API_KEY, ORG_ID and INTERFACE are saved
    # Backend URL stays hardcoded
    set_key(ENV_FILE, 'API_KEY', api_key)
    set_key(ENV_FILE, 'ORG_ID', org_id)
    set_key(ENV_FILE, 'NETWORK_INTERFACE', interface)

    print("\n" + "=" * 50)
    print("Setup Complete")
    print("=" * 50)
    print(f"Organisation: {org_name} ({org_code})")
    print(f"Interface:    {interface}")
    print("=" * 50)
    return True

if __name__ == "__main__":
    setup_wizard()
