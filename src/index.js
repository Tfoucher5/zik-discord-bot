import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { Client, GatewayIntentBits, Collection, MessageFlags } from 'discord.js';
import 'dotenv/config';
import linkCmd from './commands/link.js';
import statsCmd from './commands/stats.js';
import classementCmd from './commands/classement.js';
import roomsCmd from './commands/rooms.js';
import zikStartCmd, { handleThreadAnswer, threadPlayerMap } from './commands/zik-start.js';
import zikStopCmd from './commands/zik-stop.js';
import zikSkipCmd from './commands/zik-skip.js';
import { stopAudio, leaveVoice } from './lib/audio.js';
import { activeGames, endGame } from './lib/game-engine.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // intent privilégié — à activer dans le portail Discord
  ],
});

client.commands = new Collection();
for (const cmd of [linkCmd, statsCmd, classementCmd, roomsCmd, zikStartCmd, zikStopCmd, zikSkipCmd]) {
  client.commands.set(cmd.name, cmd);
}

client.once('clientReady', () => {
  console.log(`Bot en ligne : ${client.user.tag}`);
  // Log chaque message vocal brut reçu de Discord
  client.ws.on('VOICE_SERVER_UPDATE', (d) =>
    console.log(`[VSU] guild=${d.guild_id} endpoint=${d.endpoint ?? 'NULL'} token=${d.token ? 'ok' : 'MISSING'}`)
  );
  client.ws.on('VOICE_STATE_UPDATE', (d) => {
    if (d.user_id === client.user.id)
      console.log(`[VSUP] session=${d.session_id} channel=${d.channel_id}`);
  });
});

client.on('error', (err) => console.error('[Client Error]:', err.message));

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (msg.channel?.isThread?.()) {
    await handleThreadAnswer(msg).catch(console.error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isAutocomplete()) {
    const cmd = client.commands.get(interaction.commandName);
    if (cmd?.autocomplete) await cmd.autocomplete(interaction).catch(console.error);
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error(err);
    const msg = { content: 'Une erreur est survenue.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
    else await interaction.reply(msg);
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  if (!oldState.channelId || newState.channelId) return; // quelqu'un a quitté
  const guildId = oldState.guild.id;
  const state = activeGames.get(guildId);
  if (!state) return;
  if (oldState.channelId !== state.voiceChannelId) return;
  if (!state.players.has(oldState.member.id)) return;

  const voiceChannel = oldState.channel;
  const remainingPlayers = [...voiceChannel.members.values()].filter(m =>
    !m.user.bot && state.players.has(m.id)
  ).length;

  if (remainingPlayers === 0) {
    clearTimeout(state._emptyTimeout);
    state._emptyTimeout = setTimeout(async () => {
      await state._mainChannel?.send('👋 Tous les joueurs ont quitté le vocal. Partie arrêtée.').catch(() => {});
      stopAudio(state.audioPlayer);
      leaveVoice(state.voiceConnection);
      for (const [, player] of state.players) {
        if (player.threadChannel) {
          threadPlayerMap.delete(player.threadChannel.id);
          player.threadChannel.delete().catch(() => {
            player.threadChannel.setArchived(true).catch(() => {});
          });
        }
      }
      await endGame(state, guildId);
    }, 60_000);
  }
});

client.login(process.env.DISCORD_TOKEN);
