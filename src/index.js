import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import 'dotenv/config';
import linkCmd from './commands/link.js';
import statsCmd from './commands/stats.js';
import classementCmd from './commands/classement.js';
import roomsCmd from './commands/rooms.js';
import zikStartCmd, { handleDmAnswer } from './commands/zik-start.js';
import zikStopCmd from './commands/zik-stop.js';
import zikSkipCmd from './commands/zik-skip.js';
import { stopAudio, leaveVoice } from './lib/audio.js';
import { activeGames, endGame } from './lib/game-engine.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel], // nécessaire pour recevoir les DMs
});

client.commands = new Collection();
for (const cmd of [linkCmd, statsCmd, classementCmd, roomsCmd, zikStartCmd, zikStopCmd, zikSkipCmd]) {
  client.commands.set(cmd.name, cmd);
}

client.on('ready', () => console.log(`Bot en ligne : ${client.user.tag}`));

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || msg.guild) return; // DMs uniquement
  await handleDmAnswer(msg);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error(err);
    const msg = { content: 'Une erreur est survenue.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
    else await interaction.reply(msg);
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  if (!oldState.channelId || newState.channelId) return; // quelqu'un a quitté
  const guildId = oldState.guild.id;
  const state = activeGames.get(guildId);
  if (!state || !state.players.has(oldState.member.id)) return;

  const voiceChannel = oldState.channel;
  const remainingPlayers = [...voiceChannel.members.values()].filter(m =>
    !m.user.bot && state.players.has(m.id)
  ).length;

  if (remainingPlayers === 0) {
    // Plus personne dans le vocal → arrêt après 60s
    clearTimeout(state._emptyTimeout);
    state._emptyTimeout = setTimeout(async () => {
      const thread = await oldState.client.channels.fetch(state.threadId).catch(() => null);
      await thread?.send('👋 Tous les joueurs ont quitté le vocal. Partie arrêtée.').catch(() => {});
      stopAudio(state.audioPlayer);
      leaveVoice(state.voiceConnection);
      const { dmPlayerMap } = await import('./commands/zik-start.js');
      for (const [userId] of state.players) dmPlayerMap.delete(userId);
      await endGame(state, guildId);
    }, 60_000);
  }
});

client.login(process.env.DISCORD_TOKEN);
