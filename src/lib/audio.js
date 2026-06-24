import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
} from '@discordjs/voice';

export function joinVoice(channel) {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });
  const player = createAudioPlayer();
  connection.subscribe(player);
  return { connection, player };
}

export async function playPreview(player, previewUrl) {
  await entersState(player, AudioPlayerStatus.Idle, 5_000).catch(() => {});
  const resource = createAudioResource(previewUrl, { inputType: StreamType.Arbitrary });
  player.play(resource);
  return new Promise((resolve, reject) => {
    player.once(AudioPlayerStatus.Idle, resolve);
    player.once('error', reject);
  });
}

export function stopAudio(player) {
  if (player) player.stop(true);
}

export function leaveVoice(connection) {
  if (connection?.state?.status !== VoiceConnectionStatus.Destroyed) {
    connection.destroy();
  }
}
