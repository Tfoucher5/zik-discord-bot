import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import { Readable } from 'node:stream';

export function joinVoice(channel) {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });

  const player = createAudioPlayer();

  let stuckTimer = null;
  let rejoinCount = 0;

  // Logging vocal concis : messages critiques + transitions réseau + code de fermeture
  connection.on('debug', (msg) => {
    if (/error|close|fail|exception|ws\s|wss:|endpoint/i.test(msg)) console.log('[VoiceDebug]', msg);
  });
  connection.on('error', (err) => console.error('[Connexion Error]', err?.message ?? err));

  const NET_STATE = ['OpeningWs', 'Identifying', 'UdpHandshaking', 'SelectingProtocol', 'Ready', 'Resuming', 'Closed'];
  const instrumented = new WeakSet();
  const instrumentNetworking = (net) => {
    if (!net || instrumented.has(net)) return;
    instrumented.add(net);
    net.on('error', (e) => console.error('[Net Error]', e?.message ?? e));
    net.on('close', (code) => console.log('[Net] WS vocal fermé — code =', code));
    net.on('stateChange', (o, n) => {
      if (o.code !== n.code) console.log(`[Net état] ${NET_STATE[o.code] ?? o.code} => ${NET_STATE[n.code] ?? n.code}`);
    });
  };

  connection.on('stateChange', (oldState, newState) => {
    console.log(`[Connexion] ${oldState.status} => ${newState.status}`);
    try { instrumentNetworking(newState.networking); } catch {}
    clearTimeout(stuckTimer);
    stuckTimer = null;

    if (newState.status === VoiceConnectionStatus.Ready) {
      console.log('[Connexion] Prêt — audio activé');
      rejoinCount = 0;
    }

    // Si bloqué en signalling après une redirection, forcer un rejoin
    if (newState.status === VoiceConnectionStatus.Signalling) {
      stuckTimer = setTimeout(() => {
        if (connection.state.status !== VoiceConnectionStatus.Signalling) return;
        if (rejoinCount >= 5) {
          console.error('[Connexion] Trop de tentatives de rejoin — abandon');
          return;
        }
        rejoinCount++;
        console.log(`[Connexion] Bloqué en signalling — rejoin #${rejoinCount}`);
        connection.rejoin();
      }, 5_000);
    }

    if (newState.status === VoiceConnectionStatus.Destroyed) {
      clearTimeout(stuckTimer);
    }
  });

  player.on('stateChange', (oldState, newState) => {
    if (oldState.status !== newState.status) {
      console.log(`[Player] ${oldState.status} => ${newState.status}`);
    }
  });

  player.on('error', (error) => {
    console.error('[Player Error]:', error.message);
  });

  connection.subscribe(player);
  return { connection, player };
}

export async function playPreview(player, previewUrl) {
  await entersState(player, AudioPlayerStatus.Idle, 5_000).catch(() => {});

  // Télécharger la preview via Node (DNS/TLS fiables) au lieu de laisser FFmpeg faire
  // la requête réseau : ffmpeg-static ne gère pas toujours HTTPS (cas Railway).
  // FFmpeg ne fait alors que décoder le flux local.
  const res = await fetch(previewUrl);
  if (!res.ok || !res.body) throw new Error(`preview HTTP ${res.status}`);
  const resource = createAudioResource(Readable.fromWeb(res.body));
  player.play(resource);

  return new Promise((resolve, reject) => {
    const onIdle = () => {
      player.off('error', onError);
      resolve();
    };
    const onError = (err) => {
      console.error('[Audio] resource error:', err?.message ?? err);
      player.off(AudioPlayerStatus.Idle, onIdle);
      reject(err);
    };
    player.once(AudioPlayerStatus.Idle, onIdle);
    player.once('error', onError);
  });
}

export function stopAudio(player) {
  if (player) player.stop(true);
}

export function leaveVoice(connection) {
  if (!connection) return;
  if (connection.state?.status !== VoiceConnectionStatus.Destroyed) {
    connection.destroy();
  }
}
