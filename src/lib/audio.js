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
  });

  const player = createAudioPlayer();

  connection.on('stateChange', (oldState, newState) => {
    console.log(`[Connexion] ${oldState.status} => ${newState.status}`);
    if (newState.status === VoiceConnectionStatus.Ready) {
      console.log('[Connexion] Ready — audio activé');
    }
    if (newState.status === VoiceConnectionStatus.Destroyed) {
      console.log('[Connexion] Détruite');
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

  // Tenter la reconnexion automatique si le signal se perd
  connection.on('stateChange', async (_, newState) => {
    if (newState.status === VoiceConnectionStatus.Disconnected) {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Discord redirige — laisser @discordjs/voice gérer
      } catch {
        connection.destroy();
      }
    }
  });

  return { connection, player };
}

export async function playPreview(player, previewUrl) {
  // Attendre que le player soit libre (round précédent)
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
