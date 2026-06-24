import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import supabase from '../lib/supabase.js';
import { buildRoomsEmbed } from '../lib/embeds.js';

const PAGE_SIZE = 5;

async function fetchRooms(search) {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  let q = supabase
    .from('rooms')
    .select('code, name, emoji, game_mode')
    .eq('is_public', true)
    .gte('last_active_at', since)
    .order('last_active_at', { ascending: false })
    .limit(50);
  if (search) q = q.ilike('name', `%${search}%`);
  const { data } = await q;
  return data ?? [];
}

function buildRow(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rooms_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('rooms_page').setLabel(`Page ${page + 1}/${totalPages}`).setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('rooms_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
  );
}

export default {
  name: 'rooms',
  async execute(interaction) {
    await interaction.deferReply();

    const search = interaction.options.getString('recherche');
    const allRooms = await fetchRooms(search);

    if (!allRooms.length) {
      const msg = search ? `Aucune room active avec le nom "${search}".` : 'Aucune room active en ce moment.';
      await interaction.editReply({ content: msg });
      return;
    }

    const totalPages = Math.max(1, Math.ceil(allRooms.length / PAGE_SIZE));
    let page = 0;

    const getEmbed = (p) => buildRoomsEmbed(allRooms.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE), p, totalPages);

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
      if (btn.customId === 'rooms_prev' && page > 0) page--;
      if (btn.customId === 'rooms_next' && page < totalPages - 1) page++;
      await btn.update({ embeds: [getEmbed(page)], components: [buildRow(page, totalPages)] });
    });
    collector.on('end', () => interaction.editReply({ components: [] }).catch(() => {}));
  },
};
