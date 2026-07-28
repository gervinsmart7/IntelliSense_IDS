import os
import requests
import subprocess
import platform
import sys
import getpass
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

def _get_python_executable():
    """
    The venv's own interpreter — setup.py is expected to be run
    from inside the activated venv, so sys.executable already
    points at the right python3 to use in the service definition.
    """
    return sys.executable


def _get_agent_dir():
    """
    Absolute path to wherever this agent was actually installed —
    never assume a fixed location, since different orgs will
    clone/extract it into different folders.
    """
    return os.path.dirname(os.path.abspath(__file__))


def install_supervisor_linux(python_exe, agent_dir, username):
    """
    Registers supervisor.py as a systemd service: starts at boot,
    restarts automatically if it ever crashes, runs independent of
    any logged-in user session.
    """
    if subprocess.run(['which', 'systemctl'], capture_output=True).returncode != 0:
        print("systemctl not found — this system doesn't use systemd.")
        print("Supervisor auto-install is not supported here yet.")
        return False

    service_content = f"""[Unit]
Description=IntelliSense IDS Supervisor
After=network.target

[Service]
Type=simple
User={username}
WorkingDirectory={agent_dir}
ExecStart={python_exe} {agent_dir}/supervisor.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"""

    print("\nInstalling supervisor as a systemd service.")
    print("This requires administrator (sudo) privileges — you may")
    print("be prompted for your password.\n")

    try:
        write_proc = subprocess.run(
            ['sudo', 'tee', '/etc/systemd/system/intellisense-supervisor.service'],
            input=service_content,
            text=True,
            capture_output=True
        )
        if write_proc.returncode != 0:
            print(f"Failed to write service file: {write_proc.stderr}")
            return False

        subprocess.run(['sudo', 'systemctl', 'daemon-reload'], check=True)
        subprocess.run(['sudo', 'systemctl', 'enable', 'intellisense-supervisor'], check=True)
        subprocess.run(['sudo', 'systemctl', 'restart', 'intellisense-supervisor'], check=True)

        check = subprocess.run(
            ['systemctl', 'is-active', 'intellisense-supervisor'],
            capture_output=True, text=True
        )
        if check.stdout.strip() == 'active':
            print("Supervisor service installed and running.")
            return True
        else:
            print(f"Supervisor service installed but not active: {check.stdout.strip()}")
            return False

    except subprocess.CalledProcessError as e:
        print(f"Supervisor install error: {e}")
        return False
    except Exception as e:
        print(f"Supervisor install error: {e}")
        return False


def install_supervisor_macos(python_exe, agent_dir, username):
    """
    Registers supervisor.py as a launchd daemon: starts at boot,
    restarts automatically if it ever crashes (KeepAlive), runs
    independent of any logged-in user session.
    """
    plist_path = '/Library/LaunchDaemons/com.intellisense.supervisor.plist'

    plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.intellisense.supervisor</string>
    <key>ProgramArguments</key>
    <array>
        <string>{python_exe}</string>
        <string>{agent_dir}/supervisor.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>{agent_dir}</string>
    <key>StandardOutPath</key>
    <string>{agent_dir}/supervisor.log</string>
    <key>StandardErrorPath</key>
    <string>{agent_dir}/supervisor_error.log</string>
</dict>
</plist>
"""

    print("\nInstalling supervisor as a launchd daemon.")
    print("This requires administrator (sudo) privileges — you may")
    print("be prompted for your password.\n")

    try:
        write_proc = subprocess.run(
            ['sudo', 'tee', plist_path],
            input=plist_content,
            text=True,
            capture_output=True
        )
        if write_proc.returncode != 0:
            print(f"Failed to write plist file: {write_proc.stderr}")
            return False

        # launchd is strict: the plist must be owned by root:wheel, 644
        subprocess.run(['sudo', 'chown', 'root:wheel', plist_path], check=True)
        subprocess.run(['sudo', 'chmod', '644', plist_path], check=True)

        # Unload first in case it's already loaded from a previous run
        subprocess.run(['sudo', 'launchctl', 'unload', plist_path], capture_output=True)
        subprocess.run(['sudo', 'launchctl', 'load', '-w', plist_path], check=True)

        check = subprocess.run(
            ['launchctl', 'list'],
            capture_output=True, text=True
        )
        if 'com.intellisense.supervisor' in check.stdout:
            print("Supervisor daemon installed and running.")
            return True
        else:
            print("Supervisor daemon installed but not confirmed running.")
            return False

    except subprocess.CalledProcessError as e:
        print(f"Supervisor install error: {e}")
        return False
    except Exception as e:
        print(f"Supervisor install error: {e}")
        return False


def install_supervisor_windows(python_exe, agent_dir):
    """
    Registers supervisor.py as a Scheduled Task running as SYSTEM:
    starts at boot, restarts automatically if it ever crashes,
    runs independent of any logged-in user session.
    """
    supervisor_script = os.path.join(agent_dir, 'supervisor.py')

    ps_script = f"""
$action = New-ScheduledTaskAction -Execute '{python_exe}' -Argument '{supervisor_script}'
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName "IntelliSenseSupervisor" -Action $action -Trigger $trigger -Settings $settings -User "SYSTEM" -RunLevel Highest -Force
Start-ScheduledTask -TaskName "IntelliSenseSupervisor"
"""

    print("\nInstalling supervisor as a Scheduled Task.")
    print("This requires Administrator privileges — if this fails,")
    print("close this window and re-run setup.py from a PowerShell")
    print("window opened with 'Run as Administrator'.\n")

    try:
        result = subprocess.run(
            ['powershell', '-NoProfile', '-Command', ps_script],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(f"Failed to register scheduled task: {result.stderr}")
            return False

        check = subprocess.run(
            ['powershell', '-NoProfile', '-Command',
             'Get-ScheduledTask -TaskName "IntelliSenseSupervisor" | Select-Object -ExpandProperty State'],
            capture_output=True, text=True
        )
        if 'Running' in check.stdout or 'Ready' in check.stdout:
            print("Supervisor scheduled task installed and running.")
            return True
        else:
            print(f"Scheduled task installed but state unclear: {check.stdout.strip()}")
            return False

    except FileNotFoundError:
        print("PowerShell not found — cannot install scheduled task.")
        return False
    except Exception as e:
        print(f"Supervisor install error: {e}")
        return False


def install_supervisor_service():
    """
    Detects the current OS and installs supervisor.py as an
    always-on, auto-restarting, boot-persistent background service,
    using the right native mechanism for that platform.
    """
    print("\n" + "=" * 50)
    print("Installing Remote Start/Stop Supervisor")
    print("=" * 50)

    system = platform.system()
    python_exe = _get_python_executable()
    agent_dir = _get_agent_dir()

    if system == 'Linux':
        username = getpass.getuser()
        return install_supervisor_linux(python_exe, agent_dir, username)
    elif system == 'Darwin':
        username = getpass.getuser()
        return install_supervisor_macos(python_exe, agent_dir, username)
    elif system == 'Windows':
        return install_supervisor_windows(python_exe, agent_dir)
    else:
        print(f"Unsupported OS for supervisor auto-install: {system}")
        print("Remote start/stop from the dashboard will not be available")
        print("until this is set up manually.")
        return False

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
    # Step 6 — Install the supervisor so the agent can be remotely
    # started/stopped from the dashboard, and survives reboots
    supervisor_installed = install_supervisor_service()
    if not supervisor_installed:
        print("\nNote: the agent itself is fully configured and will")
        print("work correctly, but remote start/stop from the dashboard")
        print("won't be available until the supervisor is set up.")

    return True


if __name__ == "__main__":
    setup_wizard()