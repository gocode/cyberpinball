// Réseau du casque : Link sans fil (Air Link) sur un PC lui-même en Wi-Fi, et bilan de Link chiffré.
//
// Diagnostic du 11 novembre 2026 sur la borne (2080 Ti) : VPX tenait 68 à 72 images/s pour 72 Hz, le rendu
// PC 4 ms par image, mais Link perdait 7 à 37 % des images, en Air Link (transport TCP), débit dynamique
// tombé à 15-33 Mbit/s, aller-retour réseau jusqu'à 1,9 s au 99e centile : le PC était relié au routeur en
// Wi-Fi (signal 49 %), son port Ethernet débranché. La vidéo faisait deux sauts sans fil, le plus faible
// côté PC. Ce module le reconnaît (journal de performance d'Oculus, carte réseau de la route par défaut),
// et tranche après chaque partie : réseau en cause, ou rendu.

/** Comment Link transporte l'image : sans fil (Air Link) ou par le câble USB. */
export type LinkTransport = 'air' | 'cable';

/**
 * Le transport de la dernière minute relevée par Oculus (oculus_pc_xrs_stats_event du PerfLog) : Air Link
 * relève le Wi-Fi du casque (wifi_rssi, wifi_tx_link_speed…), le câble non. undefined sans relevé.
 */
/**
 * Le transport d'un relevé d'Oculus : son champ « transmission_type » d'abord (« USB » : câble ; TCP, UDP : Air
 * Link), une seule vérité pour toute l'application ; sans lui, la présence du Wi-Fi du casque (wifi_rssi…), qui peut
 * aussi paraître en câble, le Wi-Fi du Quest restant allumé.
 */
export function blockTransport(block: string): LinkTransport {
  const type = /"transmission_type":\s*"([^"]*)"/.exec(block)?.[1]?.trim().toUpperCase();
  if (type) return type === 'USB' ? 'cable' : 'air';
  return /"wifi_(rssi|tx_link_speed_mbps)_p50"/.test(block) ? 'air' : 'cable';
}

export function linkTransport(perfLogText: string, since?: number): LinkTransport | undefined {
  return linkTransportSince(perfLogText, since)?.transport;
}

/**
 * Le transport de la dernière minute relevée depuis `since` (secondes depuis 1970), et son heure : un relevé d'une
 * connexion passée ne dit rien de celle en cours (essai réel du 13 novembre 2026 : « Link par câble USB » puis « Air
 * Link sur un PC en Wi-Fi » dans la même séance). Sans `since`, la dernière du journal. undefined sans relevé.
 */
export function linkTransportSince(perfLogText: string, since = -Infinity): { transport: LinkTransport; at: number | undefined } | undefined {
  const blocks = perfLogText.match(/\{[^{}]*"event":\s*"oculus_pc_xrs_stats_event"[^{}]*\}/g) ?? [];
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]!;
    const m = /"timestamp_epoch":\s*"?(-?[\d.]+)"?/.exec(block);
    const at = m ? Number(m[1]) : undefined;
    if (since !== -Infinity && (at === undefined || !(at >= since))) return undefined;
    return { transport: blockTransport(block), at };
  }
  return undefined;
}

/** La carte réseau qui porte la route par défaut du PC (vers le routeur). */
export interface PcNetwork {
  adapter: string;
  wireless: boolean;
}

/**
 * Commande PowerShell (sans fenêtre, sans droit administrateur) : la carte de la route par défaut, son
 * nom, sa description et son support physique, en JSON. Toute marque de carte Wi-Fi est reconnue par son
 * support (« Native 802.11 », NdisPhysicalMedium 1 ou 9), pas par son nom.
 */
export const PC_NETWORK_COMMAND =
  "$r = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1; " +
  'if ($r) { Get-NetAdapter -InterfaceIndex $r.InterfaceIndex -ErrorAction SilentlyContinue | Select-Object Name,InterfaceDescription,PhysicalMediaType,NdisPhysicalMedium | ConvertTo-Json -Compress }';

/** Lit la sortie de PC_NETWORK_COMMAND ; undefined si elle est vide ou illisible. */
export function parsePcNetwork(json: string): PcNetwork | undefined {
  try {
    const a = JSON.parse(json.trim()) as { Name?: string; InterfaceDescription?: string; PhysicalMediaType?: string; NdisPhysicalMedium?: number };
    const adapter = a.InterfaceDescription || a.Name;
    if (!adapter) return undefined;
    const wireless = /802\.11|wireless|wi-?fi/i.test(a.PhysicalMediaType ?? '') || a.NdisPhysicalMedium === 1 || a.NdisPhysicalMedium === 9;
    return { adapter, wireless };
  } catch {
    return undefined;
  }
}

/** Air Link alors que le PC est lui-même en Wi-Fi : deux sauts sans fil, la cause des images perdues. */
export function airLinkOverWifi(transport: LinkTransport | undefined, net: PcNetwork | undefined): boolean {
  return transport === 'air' && Boolean(net?.wireless);
}

// ---------- Bilan de Link ----------

/** Une minute de Link, enrichie (journal de performance d'Oculus). */
export interface LinkMinute {
  at: number;
  presented: number;
  lost: number;
  /** Coupures de l'image (num_glitches). */
  glitches: number;
  /** Débit d'encodage dynamique, médiane (Mbit/s). */
  bitrate?: number;
  /** Débit vidéo réellement passé (Mbit/s). */
  goodput?: number;
  /** Aller-retour réseau au 99e centile (ms). */
  rttP99?: number;
  /** Fréquence du casque (Hz). */
  hz?: number;
  transport: LinkTransport;
}

export function linkMinutesBetween(text: string, from: number, to: number): LinkMinute[] {
  const out: LinkMinute[] = [];
  for (const block of text.match(/\{[^{}]*"event":\s*"oculus_pc_xrs_stats_event"[^{}]*\}/g) ?? []) {
    const num = (key: string) => {
      const m = new RegExp(`"${key}":\\s*"?(-?[\\d.]+)"?`).exec(block);
      return m ? Number(m[1]) : undefined;
    };
    const at = num('timestamp_epoch');
    const presented = num('num_pc_presented_frames');
    if (at === undefined || presented === undefined || at < from || at > to + 60) continue;
    const opt = (key: string) => {
      const v = num(key);
      return v !== undefined && Number.isFinite(v) ? v : undefined;
    };
    out.push({
      at,
      presented,
      lost: num('lost_pc_presented_frames') ?? 0,
      glitches: num('num_glitches') ?? 0,
      ...(opt('dynamic_bitrate_mbps_p50') !== undefined && { bitrate: opt('dynamic_bitrate_mbps_p50') }),
      ...(opt('total_network_video_goodput_Mbps') !== undefined && { goodput: opt('total_network_video_goodput_Mbps') }),
      ...(opt('network_rtt_ms_p99') !== undefined && { rttP99: opt('network_rtt_ms_p99') }),
      ...(opt('fps') !== undefined && { hz: opt('fps') }),
      transport: blockTransport(block),
    });
  }
  return out;
}

export interface LinkNetworkSummary {
  minutes: number;
  /** Images perdues sur l'ensemble, en part des images présentées (0 à 1). */
  lostShare: number;
  glitchesPerMinute: number;
  bitrate?: number;
  goodput?: number;
  /** Pire aller-retour au 99e centile sur la partie (ms). */
  worstRttP99?: number;
  hz?: number;
  transport: LinkTransport;
}

export function linkNetworkSummary(rows: readonly LinkMinute[]): LinkNetworkSummary | undefined {
  if (!rows.length) return undefined;
  const presented = rows.reduce((s, r) => s + r.presented, 0);
  const lost = rows.reduce((s, r) => s + r.lost, 0);
  const mean = (pick: (r: LinkMinute) => number | undefined) => {
    const v = rows.map(pick).filter((x): x is number => x !== undefined);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
  };
  const rtts = rows.map((r) => r.rttP99).filter((x): x is number => x !== undefined);
  const hz = mean((r) => r.hz);
  const bitrate = mean((r) => r.bitrate);
  const goodput = mean((r) => r.goodput);
  return {
    minutes: rows.length,
    lostShare: presented ? lost / presented : 0,
    glitchesPerMinute: rows.reduce((s, r) => s + r.glitches, 0) / rows.length,
    ...(bitrate !== undefined && { bitrate }),
    ...(goodput !== undefined && { goodput }),
    ...(rtts.length && { worstRttP99: Math.max(...rtts) }),
    ...(hz !== undefined && { hz }),
    transport: rows.some((r) => r.transport === 'air') ? 'air' : 'cable',
  };
}

/** Au-delà de 3 % d'images perdues, la fluidité se voit dans le casque. */
export const LINK_LOSS_NETWORK = 0.03;
/** VPX « tient sa cadence » à 90 % de la fréquence du casque. */
export const VPX_CADENCE_SHARE = 0.9;

export type FluidityVerdict = 'network' | 'render' | 'both' | 'ok';

/**
 * Le verdict d'une partie dans le casque : réseau en cause quand Link perd des images alors que VPX tient
 * sa cadence ; rendu en cause quand VPX ne la tient pas sans pertes réseau ; les deux, ou rien.
 */
export function fluidityVerdict(link: LinkNetworkSummary | undefined, vpxFps: number | undefined): FluidityVerdict | undefined {
  if (!link || vpxFps === undefined) return undefined;
  const hz = link.hz ?? 72;
  const network = link.lostShare > LINK_LOSS_NETWORK;
  const render = vpxFps < hz * VPX_CADENCE_SHARE;
  return network && render ? 'both' : network ? 'network' : render ? 'render' : 'ok';
}
