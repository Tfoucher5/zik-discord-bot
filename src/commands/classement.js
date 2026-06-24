import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import supabase from '../lib/supabase.js';
import { buildClassementEmbed } from '../lib/embeds.js';

const PAGE_SIZE = 10;

async function fetchLeaderboard(roomCode, mode) {
  if (roomCode) {
    const { data: room } = await supabase.from('rooms').select('id').eq('code', roomCode.toUpperCase()).maybeSingle();
    if (!room) return null;
    // Classement de la room : meilleurs scores de game_players filtrés sur cette room
    let q = supabase
      .from('game_players')
      .select('username, score, games!inner(room_id, mode)')
      .eq('games.room_id', room.id)
      .order('score', { ascending: false })
      .limit(50);
    if (mode) q = q.eq('games.mode', mode);
    const { data } = await q;
    return data ?? [];
  }

  // Classement global hebdo via RPC
  try {
    const { data } = await supabase.rpc('weekly_leaderboard');
    let rows = data ?? [];
    if (mode === 'discord') {
      rows = rows.filter(r => r.source === 'discord');
    } else if (mode) {
      rows = rows.filter(r => r.mode === mode);
    }
    return rows;
  } catch {
    // Fallback : top 50 all-time par total_score
    let q = supabase.from('profiles').select('username, total_score').order('total_score', { ascending: false }).limit(50);
    const { data } = await q;
    return (data ?? []).map(r => ({ username: r.username, total_score: r.total_score }));
  }
}

function buildRow(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cl_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('cl_page').setLabel(`Page ${page + 1}/${totalPages}`).setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('cl_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
  );
}

export default {
  name: 'classement',
  async execute(interaction) {
    const roomCode = interaction.options.getString('room');
    const mode = interaction.options.getString('mode');

    const allRows = await fetchLeaderboard(roomCode, mode);
    if (allRows === null) {
      await interaction.reply({ content: `Room \`${roomCode}\` introuvable.`, ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
    let page = 0;

    const modeLabel = mode ? { classic: 'Classique', qcm: 'QCM', discord: 'Discord' }[mode] : null;
    const label = [roomCode, modeLabel].filter(Boolean).join(' · ');

    const getEmbed = (p) => buildClassementEmbed(allRows.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE), label, p, totalPages);

    const msg = await interaction.editReply({
      embeds: [getEmbed(page)],
      components: totalPages > 1 ? [buildRow(page, totalPages)] : [],
    });

    if (totalPages <= 1) return;

    const collector = msg.createMessageComponentCollector({ time: 120_000 });
    collector.on('collect', async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: 'Ce n\'est pas ta commande.', ephemeral: true });
        return;
      }
      if (btn.customId === 'cl_prev' && page > 0) page--;
      if (btn.customId === 'cl_next' && page < totalPages - 1) page++;
      await btn.update({ embeds: [getEmbed(page)], components: [buildRow(page, totalPages)] });
    });
    collector.on('end', () => interaction.editReply({ components: [] }).catch(() => {}));
  },
};
