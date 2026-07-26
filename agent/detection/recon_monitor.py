from scapy.all import PcapReader, IP, ARP, ICMP, TCP, UDP
from scapy.layers.dhcp import DHCP, BOOTP
from collections import defaultdict
from datetime import datetime, timezone
import time


PROTOCOL_PORTS = {
    'DNS':  {'proto': 'udp', 'port': 53},
    'SMTP': {'proto': 'tcp', 'port': 25},
    'FTP':  {'proto': 'tcp', 'port': 21},
    'SSH':  {'proto': 'tcp', 'port': 22},
    'SNMP': {'proto': 'udp', 'port': 161},
    'SMB':  {'proto': 'tcp', 'port': 445},
    'LDAP': {'proto': 'tcp', 'port': 389},
}


class ReconMonitor:
    """
    Detects reconnaissance and pre-attack patterns across protocols that
    flow-based ML classification isn't built for: sweeps (one source
    touching many destinations), brute-force/enumeration (one source
    hammering one destination), and protocol-specific abuse (ARP
    spoofing, DHCP starvation, rogue DHCP servers).

    Runs on raw packets from each captured pcap, independent of the
    CICFlowMeter/model path, which continues to handle TCP/UDP flow
    classification separately.
    """

    def __init__(self, sweep_threshold=15, hammer_threshold=50,
                 icmp_flood_threshold=100, dhcp_starvation_threshold=30,
                 window_seconds=60):
        self.sweep_threshold = sweep_threshold
        self.hammer_threshold = hammer_threshold
        self.icmp_flood_threshold = icmp_flood_threshold
        self.dhcp_starvation_threshold = dhcp_starvation_threshold
        self.window_seconds = window_seconds

        # Named protocols (DNS/SMTP/FTP/SSH/SNMP/SMB/LDAP):
        # protocol -> src_ip -> {dst_ips, dst_counts, timestamps}
        self.activity = defaultdict(lambda: defaultdict(
            lambda: {'dst_ips': set(), 'dst_counts': defaultdict(int), 'timestamps': []}
        ))

        # ICMP: src_ip -> {dst_ips, timestamps}
        self.icmp_activity = defaultdict(lambda: {'dst_ips': set(), 'timestamps': []})

        # ARP: src_mac -> {targets, timestamps}
        self.arp_activity = defaultdict(lambda: {'targets': set(), 'timestamps': []})
        self.arp_ip_to_macs = defaultdict(set)

        # DHCP: src_mac -> {discover_count, timestamps}
        self.dhcp_client_activity = defaultdict(lambda: {'discover_count': 0, 'timestamps': []})
        # IPs seen acting as a DHCP server (sending OFFER/ACK) — persists
        # for the agent's lifetime, not windowed, since "is there more
        # than one DHCP server on this network" is a standing fact.
        self.dhcp_server_ips = set()

    # ---------- packet identification ----------

    def _identify_protocol(self, packet):
        if not packet.haslayer(IP):
            return None
        for proto_name, spec in PROTOCOL_PORTS.items():
            layer = TCP if spec['proto'] == 'tcp' else UDP
            if packet.haslayer(layer):
                l4 = packet[layer]
                if l4.dport == spec['port'] or l4.sport == spec['port']:
                    return proto_name
        return None

    # ---------- recording ----------

    def _record(self, proto_name, src_ip, dst_ip, pkt_time):
        entry = self.activity[proto_name][src_ip]
        entry['dst_ips'].add(dst_ip)
        entry['dst_counts'][dst_ip] += 1
        entry['timestamps'].append(pkt_time)

    def _record_icmp(self, packet, pkt_time):
        src_ip = packet[IP].src
        dst_ip = packet[IP].dst
        entry = self.icmp_activity[src_ip]
        entry['dst_ips'].add(dst_ip)
        entry['timestamps'].append(pkt_time)

    def _record_arp(self, packet, pkt_time):
        if packet[ARP].op != 1:  # only ARP requests ("who-has")
            return
        src_mac = packet[ARP].hwsrc
        target_ip = packet[ARP].pdst

        entry = self.arp_activity[src_mac]
        entry['targets'].add(target_ip)
        entry['timestamps'].append(pkt_time)

        claimed_ip = packet[ARP].psrc
        if claimed_ip != '0.0.0.0':
            self.arp_ip_to_macs[claimed_ip].add(packet[ARP].hwsrc)

    def _record_dhcp(self, packet, pkt_time):
        if not packet.haslayer(DHCP):
            return

        dhcp_options = dict(
            opt for opt in packet[DHCP].options if isinstance(opt, tuple)
        )
        msg_type = dhcp_options.get('message-type')

        # message-type 1 = DISCOVER (client requesting a lease)
        if msg_type == 1:
            src_mac = packet[BOOTP].chaddr.hex() if packet.haslayer(BOOTP) else 'unknown'
            entry = self.dhcp_client_activity[src_mac]
            entry['discover_count'] += 1
            entry['timestamps'].append(pkt_time)

        # message-type 2 = OFFER, 5 = ACK (only real DHCP servers send these)
        elif msg_type in (2, 5) and packet.haslayer(IP):
            self.dhcp_server_ips.add(packet[IP].src)

    # ---------- main entry point ----------

    def analyze_pcap(self, pcap_file):
        alerts = []

        try:
            with PcapReader(pcap_file) as reader:
                for packet in reader:
                    pkt_time = float(packet.time)

                    if packet.haslayer(ARP):
                        self._record_arp(packet, pkt_time)
                        continue

                    if packet.haslayer(DHCP):
                        self._record_dhcp(packet, pkt_time)
                        continue

                    if packet.haslayer(IP) and packet.haslayer(ICMP):
                        self._record_icmp(packet, pkt_time)
                        continue

                    proto_name = self._identify_protocol(packet)
                    if proto_name and packet.haslayer(IP):
                        self._record(
                            proto_name,
                            packet[IP].src,
                            packet[IP].dst,
                            pkt_time
                        )

            now = time.time()
            alerts.extend(self._check_protocol_alerts(now))
            alerts.extend(self._check_icmp_alerts(now))
            alerts.extend(self._check_arp_alerts(now))
            alerts.extend(self._check_dhcp_alerts(now))

        except Exception as e:
            print(f"Recon monitor error: {e}")

        return alerts

    # ---------- checks ----------

    def _check_protocol_alerts(self, now):
        alerts = []
        for proto_name, sources in self.activity.items():
            for src_ip, entry in list(sources.items()):
                entry['timestamps'] = [
                    t for t in entry['timestamps'] if now - t <= self.window_seconds
                ]
                if not entry['timestamps']:
                    del sources[src_ip]
                    continue

                distinct_targets = len(entry['dst_ips'])
                if distinct_targets >= self.sweep_threshold:
                    alerts.append(self._alert(
                        f'{proto_name}_SWEEP', src_ip, 'high',
                        f"{src_ip} probed {distinct_targets} distinct hosts "
                        f"on {proto_name} within {self.window_seconds}s — "
                        f"likely {proto_name} reconnaissance sweep",
                        distinct_targets=distinct_targets
                    ))

                for dst_ip, count in entry['dst_counts'].items():
                    if count >= self.hammer_threshold:
                        alerts.append(self._alert(
                            f'{proto_name}_BRUTE_FORCE', src_ip, 'high',
                            f"{src_ip} sent {count} {proto_name} packets to "
                            f"{dst_ip} within {self.window_seconds}s — "
                            f"possible brute force / enumeration",
                            target_ip=dst_ip, packet_count=count
                        ))
        return alerts

    def _check_icmp_alerts(self, now):
        alerts = []
        for src_ip, entry in list(self.icmp_activity.items()):
            entry['timestamps'] = [
                t for t in entry['timestamps'] if now - t <= self.window_seconds
            ]
            if not entry['timestamps']:
                del self.icmp_activity[src_ip]
                continue

            distinct_targets = len(entry['dst_ips'])
            packet_count = len(entry['timestamps'])

            if distinct_targets >= self.sweep_threshold:
                alerts.append(self._alert(
                    'ICMP_PING_SWEEP', src_ip, 'high',
                    f"{src_ip} pinged {distinct_targets} distinct hosts "
                    f"within {self.window_seconds}s — likely network "
                    f"reconnaissance",
                    distinct_targets=distinct_targets
                ))

            if packet_count >= self.icmp_flood_threshold:
                alerts.append(self._alert(
                    'ICMP_FLOOD', src_ip, 'medium',
                    f"{src_ip} sent {packet_count} ICMP packets within "
                    f"{self.window_seconds}s — possible ping flood",
                    packet_count=packet_count
                ))
        return alerts

    def _check_arp_alerts(self, now):
        alerts = []
        for src_mac, entry in list(self.arp_activity.items()):
            entry['timestamps'] = [
                t for t in entry['timestamps'] if now - t <= self.window_seconds
            ]
            if not entry['timestamps']:
                del self.arp_activity[src_mac]
                continue

            if len(entry['targets']) >= self.sweep_threshold:
                alerts.append(self._alert(
                    'ARP_SWEEP', src_mac, 'high',
                    f"{src_mac} sent ARP requests for {len(entry['targets'])} "
                    f"distinct IPs within {self.window_seconds}s — "
                    f"likely network/host discovery scan"
                ))

        for claimed_ip, macs in self.arp_ip_to_macs.items():
            if len(macs) > 1:
                alerts.append(self._alert(
                    'ARP_SPOOFING_SUSPECTED', claimed_ip, 'critical',
                    f"IP {claimed_ip} has been claimed by {len(macs)} "
                    f"different MAC addresses — possible ARP spoofing"
                ))

        return alerts

    def _check_dhcp_alerts(self, now):
        alerts = []

        for src_mac, entry in list(self.dhcp_client_activity.items()):
            entry['timestamps'] = [
                t for t in entry['timestamps'] if now - t <= self.window_seconds
            ]
            if not entry['timestamps']:
                del self.dhcp_client_activity[src_mac]
                continue

            if len(entry['timestamps']) >= self.dhcp_starvation_threshold:
                alerts.append(self._alert(
                    'DHCP_STARVATION_SUSPECTED', src_mac, 'critical',
                    f"{src_mac} sent {len(entry['timestamps'])} DHCP DISCOVER "
                    f"requests within {self.window_seconds}s — possible DHCP "
                    f"pool exhaustion attack",
                    discover_count=len(entry['timestamps'])
                ))

        if len(self.dhcp_server_ips) > 1:
            alerts.append(self._alert(
                'ROGUE_DHCP_SERVER_SUSPECTED',
                ', '.join(self.dhcp_server_ips), 'critical',
                f"Multiple hosts ({', '.join(self.dhcp_server_ips)}) are "
                f"responding as DHCP servers — possible rogue DHCP server "
                f"or man-in-the-middle setup"
            ))

        return alerts

    # ---------- helper ----------

    def _alert(self, alert_type, source, severity, description, **extra):
        return {
            'type': alert_type,
            'source': source,
            'severity': severity,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'description': description,
            **extra
        }