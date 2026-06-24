import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

export default {
  name: 'link',
  async execute(interaction) {
    const url = `${process.env.ZIK_BASE_URL}/settings?discord=link`;
    const embed = new EmbedBuilder()
      .setTitle('🔗 Lie ton compte Discord à ZIK !')
      .setDescription(
        'Une fois lié, `/stats` et `/classement` afficheront tes vraies stats ' +
        'et tu pourras gagner de l\'XP en jouant via le bot.'
      )
      .setColor(0x5865f2);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Lier mon compte ZIK →')
        .setStyle(ButtonStyle.Link)
        .setURL(url)
    );
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
};
