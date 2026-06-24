import { EmbedBuilder, MessageFlags } from 'discord.js';
import { activeGames, endGame } from '../lib/game-engine.js';
import { stopAudio, leaveVoice } from '../lib/audio.js';
import { threadPlayerMap } from './zik-start.js';

export default {
  name: 'zik-stop',
  async execute(interaction) {
    const guildId = interaction.guildId;
    const state = activeGames.get(guildId);

    if (!state) {
      await interaction.reply({ content: 'Aucune partie en cours sur ce serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    const isHost = interaction.user.id === state.hostId;
    const isAdmin = interaction.member.permissions.has('Administrator');
    if (!isHost && !isAdmin) {
      await interaction.reply({ content: 'Seul l\'hôte ou un administrateur peut arrêter la partie.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Répondre immédiatement en éphémère — le résumé va au salon principal
    await interaction.reply({ content: '🛑 Arrêt de la partie...', flags: MessageFlags.Ephemeral });

    clearTimeout(state.roundTimeout);
    clearTimeout(state.globalTimeout);
    stopAudio(state.audioPlayer);
    leaveVoice(state.voiceConnection);

    const players = await endGame(state, guildId);

    const lines = players.length
      ? players.map((p, i) => `${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} **${p.discordUsername}** — ${p.score} pts`).join('\n')
      : 'Aucun score enregistré.';

    const embed = new EmbedBuilder()
      .setTitle('🛑 Partie arrêtée')
      .setDescription(lines)
      .setColor(0xff5555);

    // Résultats dans le salon principal (pas dans le fil privé)
    state._mainChannel?.send({ embeds: [embed] }).catch(console.error);

    // Supprimer les fils après avoir envoyé les résultats
    for (const [, player] of state.players) {
      if (player.threadChannel) {
        threadPlayerMap.delete(player.threadChannel.id);
        player.threadChannel.delete().catch(() => {
          player.threadChannel.setArchived(true).catch(() => {});
        });
      }
    }
  },
};
