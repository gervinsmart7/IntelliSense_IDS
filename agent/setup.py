import os
import requests
import subprocess
from datetime import datetime, timezone
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


def sample_interface_traffic(iface, duration=2):
    """
    Briefly listens on an interface and counts packets seen,
    so the admin can tell which interface is actually carrying
    traffic instead of guessing from the name alone.
    Requires tshark capture permissions to already be set up.
    """
    try:
        result = subprocess.run(
            ['tshark', '-i', iface, '-a', f'duration:{duration}'],
            capture_output=True,
            text=True,
            timeout=duration + 10
        )
        lines = [l for l in result.stdout.strip().split('\n') if l]
        return len(lines)
    except Exception:
        return 0


def confirm_capture_consent():
    """
    One-time explicit consent step. The org_admin running setup
    must acknowledge that this agent will capture live network
    traffic, and confirm they are authorized to do so on this
    network, before setup proceeds any further.
    """
    print("=" * 50)
    print("  Live Network Capture — Authorization Required")
    print("=" * 50)
    print()
    print("This agent will capture live network traffic on the")
    print("interface you select in this setup, in order to detect")
    print("intrusions. Only proceed if you are the network")
    print("administrator, or have explicit authorization from the")
    print("network owner, to monitor traffic on this network.")
    print()

    response = input(
        "Type YES to confirm you are authorized to enable live "
        "traffic capture on this network: "
    ).strip().upper()

    if response != "YES":
        print("\nSetup cancelled. Live capture was not authorized.")
        return False

    set_key(ENV_FILE, 'CAPTURE_CONSENT_ACCEPTED', 'true')
    set_key(
        ENV_FILE,
        'CAPTURE_CONSENT_DATE',
        datetime.now(timezone.utc).isoformat()
    )
    print("Authorization recorded.\n")
    return True


def setup_wizard():
    print("=" * 50)
    print("  IntelliSense IDS Agent Setup")
    print("=" * 50)
    print()

    # Step 1 — Live capture consent (must happen before anything else)
    if not confirm_capture_consent():
        return False

    # Step 2 — API Key
    api_key = input("Enter your API Key: ").strip()

    # Step 3 — Verify API Key with backend
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

    # Step 4 — Network Interface (explicit admin choice, traffic-sampled)
    print("\n" + "=" * 50)
    print("Network Interface Selection")
    print("=" * 50)

    active_interfaces = get_available_interfaces()

    if not active_interfaces:
        print("\nNo interfaces with an IP address were detected.")
        interface = input("Enter interface name manually: ").strip() or 'eth0'
    else:
        print("\nSampling each interface for a few seconds to check")
        print("for live traffic — please wait...\n")

        sampled = []
        for iface in active_interfaces:
            count = sample_interface_traffic(iface['name'], duration=2)
            sampled.append({**iface, 'packets': count})

        print(f"{'#':<4}{'Interface':<15}{'IP':<18}{'Packets seen (2s)':<20}")
        for i, iface in enumerate(sampled, start=1):
            print(f"{i:<4}{iface['name']:<15}{iface['ip']:<18}{iface['packets']:<20}")

        # Recommend the busiest interface, but require explicit selection
        busiest = max(sampled, key=lambda x: x['packets'])
        print(f"\nMost active interface: {busiest['name']} "
              f"({busiest['packets']} packets seen)")

        choice = input(
            f"\nSelect interface number to use for capture [1-{len(sampled)}]: "
        ).strip()

        try:
            idx = int(choice) - 1
            if idx < 0 or idx >= len(sampled):
                raise ValueError
            interface = sampled[idx]['name']
        except ValueError:
            print("Invalid selection, setup cancelled.")
            return False

    print(f"\nInterface selected: {interface}")

    # Step 5 — Save to .env
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