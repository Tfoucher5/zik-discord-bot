import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';

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

  // [DEBUG TEMPORAIRE] tout logger + instrumenter le networking pour localiser l'échec (WS vocal vs UDP)
  connection.on('debug', (msg) => console.log('[VoiceDebug]', msg));
  connection.on('error', (err) => console.error('[Connexion Error]', err?.message ?? err));

  const NET_STATE = ['OpeningWs', 'Identifying', 'UdpHandshaking', 'SelectingProtocol', 'Ready', 'Resuming', 'Closed'];
  const instrumented = new WeakSet();
  const instrumentNetworking = (net) => {
    if (!net || instrumented.has(net)) return;
    instrumented.add(net);
    net.on('debug', (m) => console.log('[Net]', m));
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

  const resource = createAudioResource(previewUrl);
  player.play(resource);

  return new Promise((resolve, reject) => {
    const onIdle = () => { player.off('error', onError); resolve(); };
    const onError = (err) => { player.off(AudioPlayerStatus.Idle, onIdle); reject(err); };
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
