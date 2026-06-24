import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import supabase from '../lib/supabase.js';
import { buildStatsEmbed } from '../lib/embeds.js';

const PAGE_LABELS = ['1/3 Général', '2/3 Classique', '3/3 QCM'];

async function fetchProfile(discordId) {
  const { data } = await supabase
    .from('profiles')
    .select('id, username, elo, level, xp, games_played, total_score, discord_games_played')
    .eq('discord_id', discordId)
    .maybeSingle();
  return data;
}

async function fetchModeStats(userId, mode) {
  const { data } = await supabase
    .from('game_players')
    .select('score, rank, games!inner(mode)')
    .eq('user_id', userId)
    .eq('games.mode', mode)
    .not('rank', 'is', null);

  if (!data?.length) return { games_played: 0, avg_score: 0, best_score: 0, best_rank: null };
  return {
    games_played: data.length,
    avg_score: Math.round(data.reduce((s, r) => s + r.score, 0) / data.length),
    best_score: Math.max(...data.map(r => r.score)),
    best_rank: Math.min(...data.map(r => r.rank)),
  };
}

function buildRow(page) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('stats_prev').setLabel('◀ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('stats_page').setLabel(PAGE_LABELS[page]).setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('stats_next').setLabel('Suivant ▶').setStyle(ButtonStyle.Secondary).setDisabled(page === 2),
  );
}

export default {
  name: 'stats',
  async execute(interaction) {
    const targetUser = interaction.options.getUser('joueur') ?? interaction.user;
    const profile = await fetchProfile(targetUser.id);

    if (!profile) {
      const who = targetUser.id === interaction.user.id ? 'Ton compte Discord' : 'Ce compte Discord';
      await interaction.reply({ content: `${who} n'est pas lié à ZIK. Tape \`/link\` pour lier le tien !`, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();

    profile.classicStats = await fetchModeStats(profile.id, 'classic');
    profile.qcmStats = await fetchModeStats(profile.id, 'qcm');

    let page = 0;
    const msg = await interaction.editReply({ embeds: [buildStatsEmbed(profile, page)], components: [buildRow(page)] });

    const collector = msg.createMessageComponentCollector({ time: 120_000 });
    collector.on('collect', async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: 'Ce n\'est pas ta commande.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (btn.customId === 'stats_prev' && page > 0) page--;
      if (btn.customId === 'stats_next' && page < 2) page++;
      await btn.update({ embeds: [buildStatsEmbed(profile, page)], components: [buildRow(page)] });
    });
    collector.on('end', () => interaction.editReply({ components: [] }).catch(() => {}));
  },
};
