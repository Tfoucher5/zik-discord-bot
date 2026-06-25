// Test de connectivité UDP sortante — même mécanisme que la découverte d'IP de Discord Voice.
// Envoie une requête STUN Binding et attend la réponse. Si une réponse arrive,
// l'UDP sortant + retour fonctionne depuis cet environnement.
// Usage : node udp-check.mjs
import dgram from 'node:dgram';

const SERVERS = [
  ['stun.l.google.com', 19302],
  ['stun1.l.google.com', 19302],
  ['global.stun.twilio.com', 3478],
];
const TIMEOUT_MS = 4000;

function buildBindingRequest() {
  const buf = Buffer.alloc(20);
  buf.writeUInt16BE(0x0001, 0); // type: Binding Request
  buf.writeUInt16BE(0x0000, 2); // length: 0
  buf.writeUInt32BE(0x2112a442, 4); // magic cookie
  for (let i = 8; i < 20; i++) buf[i] = Math.floor(Math.random() * 256); // transaction id
  return buf;
}

function parseXorMappedAddress(msg) {
  // Parcourt les attributs STUN pour trouver XOR-MAPPED-ADDRESS (0x0020)
  let off = 20;
  while (off + 4 <= msg.length) {
    const type = msg.readUInt16BE(off);
    const len = msg.readUInt16BE(off + 2);
    const val = msg.subarray(off + 4, off + 4 + len);
    if (type === 0x0020 && len >= 8) {
      const port = val.readUInt16BE(2) ^ 0x2112;
      const ip = [
        val[4] ^ 0x21, val[5] ^ 0x12, val[6] ^ 0xa4, val[7] ^ 0x42,
      ].join('.');
      return `${ip}:${port}`;
    }
    off += 4 + len + ((4 - (len % 4)) % 4);
  }
  return '(adresse non lisible, mais réponse reçue)';
}

function testServer(host, port) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    const t0 = Date.now();
    const timer = setTimeout(() => {
      sock.close();
      resolve({ host, port, ok: false, reason: 'timeout (aucune réponse)' });
    }, TIMEOUT_MS);

    sock.on('message', (msg) => {
      clearTimeout(timer);
      const rtt = Date.now() - t0;
      const pub = parseXorMappedAddress(msg);
      sock.close();
      resolve({ host, port, ok: true, rtt, pub });
    });
    sock.on('error', (err) => {
      clearTimeout(timer);
      sock.close();
      resolve({ host, port, ok: false, reason: err.message });
    });
    sock.send(buildBindingRequest(), port, host, (err) => {
      if (err) {
        clearTimeout(timer);
        sock.close();
        resolve({ host, port, ok: false, reason: `envoi échoué: ${err.message}` });
      }
    });
  });
}

console.log('=== Test UDP sortant (STUN) ===\n');
let anyOk = false;
for (const [host, port] of SERVERS) {
  const r = await testServer(host, port);
  if (r.ok) {
    anyOk = true;
    console.log(`  ✓ ${host}:${port} — réponse en ${r.rtt}ms — IP publique vue: ${r.pub}`);
  } else {
    console.log(`  ✗ ${host}:${port} — ${r.reason}`);
  }
}
console.log('\n=== Verdict ===');
if (anyOk) {
  console.log('UDP sortant FONCTIONNE depuis cet environnement.');
  console.log('=> Le "pas de son" n\'est donc PAS un blocage UDP réseau ici.');
} else {
  console.log('AUCUNE réponse UDP reçue (toutes les tentatives ont échoué).');
  console.log('=> UDP sortant probablement BLOQUÉ (firewall/AV/VPN/NAT) — cohérent avec l\'hypothèse Discord Voice.');
}
