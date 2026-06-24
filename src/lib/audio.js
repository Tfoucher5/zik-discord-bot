import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';

// Async : attend que la connexion soit Ready avant de retourner
export async function joinVoice(channel) {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });

  const player = createAudioPlayer();

  connection.on('stateChange', (oldState, newState) => {
    console.log(`[Connexion] ${oldState.status} => ${newState.status}`);
  });

  player.on('stateChange', (oldState, newState) => {
    console.log(`[Player] ${oldState.status} => ${newState.status}`);
  });

  player.on('error', (error) => {
    console.error('[Player Error]:', error.message);
  });

  connection.subscribe(player);

  // 30s pour laisser le temps à Discord de rediriger vers un autre serveur vocal
  await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
  console.log('[Connexion] Ready');

  return { connection, player };
}

// La connexion est déjà Ready quand cette fonction est appelée
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
