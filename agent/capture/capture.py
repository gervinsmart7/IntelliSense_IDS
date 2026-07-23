import asyncio
import asyncio

# --- Compatibility shim for Python 3.14+ ---
# asyncio's old child-watcher API (set_child_watcher / get_child_watcher /
# SafeChildWatcher) was removed in Python 3.14. pyshark's internal
# Capture._setup_eventloop() still calls these directly, so we restore
# harmless no-op stand-ins before pyshark ever touches them. Modern asyncio
# manages subprocess cleanup internally and no longer needs this system —
# these stand-ins just stop pyshark's old code path from crashing.
class _NoOpChildWatcher:
    def attach_loop(self, loop):
        pass
    def close(self):
        pass

if not hasattr(asyncio, "SafeChildWatcher"):
    asyncio.SafeChildWatcher = _NoOpChildWatcher

if not hasattr(asyncio, "set_child_watcher"):
    def _set_child_watcher(watcher):
        asyncio._patched_child_watcher = watcher
    asyncio.set_child_watcher = _set_child_watcher

if not hasattr(asyncio, "get_child_watcher"):
    def _get_child_watcher():
        return getattr(asyncio, "_patched_child_watcher", _NoOpChildWatcher())
    asyncio.get_child_watcher = _get_child_watcher
# --- end compatibility shim ---

import pyshark
import threading
import subprocess
import os
from datetime import datetime
from config.settings import (
    NETWORK_INTERFACE,
    CAPTURE_INTERVAL,
    CAPTURE_DIR
)

class PacketCapture:
    def __init__(self):
        self.interface = self.resolve_interface()
        self.capture_interval = CAPTURE_INTERVAL
        self.is_running = False
        self.packets_captured = 0

    def get_available_interfaces(self):
        """
        Returns list of all available
        network interfaces on the machine
        excluding loopback
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
                    # Exclude loopback
                    if iface != 'lo':
                        interfaces.append(iface)

            return interfaces

        except Exception as e:
            print(f"Network Interface detection error: {e}")
            return ['eth0']

    def get_active_interface(self):
        """
        Returns the interface that currently
        has an IP address assigned
        Most likely the one carrying traffic
        """
        try:
            result = subprocess.run(
                ['ip', '-o', '-4', 'addr', 'show'],
                capture_output=True,
                text=True
            )

            for line in result.stdout.strip().split('\n'):
                if not line:
                    continue
                parts = line.split()
                if len(parts) >= 2:
                    iface = parts[1]
                    # Skip loopback
                    if iface != 'lo':
                        return iface

            return None

        except Exception as e:
            print(f"Active Network Interface detection error: {e}")
            return None

    def resolve_interface(self):
        """
        Resolves the best interface to use
        Priority:
        1. Interface set in .env file
        2. Auto-detected active interface
        3. First available non-loopback interface
        4. eth0 as last resort
        """
        # Check if interface is set in config
        configured = NETWORK_INTERFACE

        if configured and configured != 'eth0':
            # User explicitly set an interface
            # verify it exists
            available = self.get_available_interfaces()
            if configured in available:
                print(f"Using configured Network Interface: {configured}")
                return configured
            else:
                print(f"Configured Network Interface {configured} not found")
                print(f"Available: {available}")

        # Auto detect active interface
        active = self.get_active_interface()
        if active:
            print(f"Detected active Network Interface(s): {active}")
            return active

        # Fall back to first available
        available = self.get_available_interfaces()
        if available:
            print(f"Using first available Network Interface: {available[0]}")
            return available[0]

        # Last resort
        print("No Network InterfaceS found, defaulting to eth0")
        return 'eth0'

    def capture_live(self, duration, output_file):
        """
        Captures live packets for specified duration
        """
        try:
            try:
                asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

            print(f"Capturing on {self.interface} for {duration}s...")

            capture = pyshark.LiveCapture(
                interface=self.interface,
                output_file=output_file
            )

            capture.sniff(timeout=duration)
            self.packets_captured = len(capture)

            print(f"Captured {self.packets_captured} packets")
            return output_file

        except Exception as e:
            print(f"Capture error: {e}")
            return None

    def start_continuous_capture(self, callback):
        """
        Continuously captures traffic in intervals
        """
        self.is_running = True

        def capture_loop():
            while self.is_running:
                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                output_file = os.path.join(
                    CAPTURE_DIR,
                    f"capture_{timestamp}.pcap"
                )

                pcap_file = self.capture_live(
                    self.capture_interval,
                    output_file
                )

                if pcap_file and os.path.exists(pcap_file):
                    callback(pcap_file)

        capture_thread = threading.Thread(
            target=capture_loop,
            daemon=True
        )
        capture_thread.start()
        print(f"Continuous capture started on {self.interface}")

    def stop(self):
        self.is_running = False
        print("Capture stopped")