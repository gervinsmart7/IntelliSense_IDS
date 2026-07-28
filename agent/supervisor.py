import subprocess
import time
import os
import psutil
from dotenv import load_dotenv
import sys
from cloud.api import get_desired_state, report_process_status

load_dotenv()

POLL_INTERVAL = 20  # seconds
PID_FILE = '.agent.pid'
AGENT_SCRIPT = 'main.py'


def get_agent_dir():
    return os.path.dirname(os.path.abspath(__file__))


def read_pid_file():
    if os.path.exists(PID_FILE):
        try:
            with open(PID_FILE) as f:
                return int(f.read().strip())
        except (ValueError, OSError):
            return None
    return None


def write_pid_file(pid):
    with open(PID_FILE, 'w') as f:
        f.write(str(pid))


def clear_pid_file():
    if os.path.exists(PID_FILE):
        os.remove(PID_FILE)


def is_agent_running():
    pid = read_pid_file()
    if pid is None:
        return None

    try:
        proc = psutil.Process(pid)
        if not proc.is_running():
            return None
        cmdline = ' '.join(proc.cmdline())
        if AGENT_SCRIPT not in cmdline:
            return None  # pid was reused by an unrelated process
        return pid
    except psutil.NoSuchProcess:
        return None


def start_agent():
    print("Supervisor: starting main.py...")
    proc = subprocess.Popen(
        [sys.executable, AGENT_SCRIPT],
        cwd=get_agent_dir()
    )
    write_pid_file(proc.pid)
    print(f"Supervisor: main.py started (pid {proc.pid})")
    return proc.pid


def stop_agent(pid):
    print(f"Supervisor: stopping main.py (pid {pid})...")
    try:
        proc = psutil.Process(pid)
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except psutil.TimeoutExpired:
            print("Supervisor: main.py did not exit gracefully, forcing kill")
            proc.kill()
    except psutil.NoSuchProcess:
        pass
    clear_pid_file()
    print("Supervisor: main.py stopped")


def run():
    print("=" * 50)
    print("  IntelliSense IDS Supervisor")
    print("=" * 50)

    while True:
        try:
            desired = get_desired_state()
            current_pid = is_agent_running()

            if desired == 'running' and current_pid is None:
                current_pid = start_agent()
            elif desired == 'stopped' and current_pid is not None:
                stop_agent(current_pid)
                current_pid = None

            actual_state = 'online' if current_pid is not None else 'offline'
            report_process_status(actual_state, current_pid)

        except Exception as e:
            print(f"Supervisor error: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    run()