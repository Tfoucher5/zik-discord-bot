import { MessageFlags } from 'discord.js';
import { activeGames } from '../lib/game-engine.js';

export default {
  name: 'zik-skip',
  async execute(interaction) {
    const guildId = interaction.guildId;
    const state = activeGames.get(guildId);

    if (!state) {
      await interaction.reply({ content: 'Aucune partie en cours sur ce serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (!state.players.has(interaction.user.id)) {
      await interaction.reply({ content: 'Tu ne participes pas à cette partie.', flags: MessageFlags.Ephemeral });
      return;
    }

    state.skipVotes.add(interaction.user.id);
    const votes = state.skipVotes.size;
    const needed = Math.ceil(state.players.size / 2);

    await interaction.reply({ content: `⏭️ Vote skip : ${votes}/${needed} votes nécessaires.` });

    if (votes >= needed && state.onRoundEnd) {
      clearTimeout(state.roundTimeout);
      const track = state.tracks[state.currentRound - 1];
      await state.onRoundEnd(track);
    }
  },
};
