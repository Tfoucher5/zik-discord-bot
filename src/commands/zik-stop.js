import { activeGames, endGame } from '../lib/game-engine.js';
import { stopAudio, leaveVoice } from '../lib/audio.js';
import { dmPlayerMap } from './zik-start.js';

export default {
  name: 'zik-stop',
  async execute(interaction) {
    const guildId = interaction.guildId;
    const state = activeGames.get(guildId);

    if (!state) {
      await interaction.reply({ content: 'Aucune partie en cours sur ce serveur.', ephemeral: true });
      return;
    }

    if (interaction.user.id !== state.hostId) {
      await interaction.reply({ content: 'Seul l\'hôte peut arrêter la partie.', ephemeral: true });
      return;
    }

    await interaction.deferReply();

    clearTimeout(state.roundTimeout);
    clearTimeout(state.globalTimeout);
    stopAudio(state.audioPlayer);
    leaveVoice(state.voiceConnection);

    // Nettoyer la dmPlayerMap
    for (const [userId] of state.players) {
      dmPlayerMap.delete(userId);
    }

    await endGame(state, guildId);

    await interaction.editReply({ content: '🛑 Partie arrêtée par l\'hôte.' });
  },
};
