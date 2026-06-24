import { EmbedBuilder } from 'discord.js';

export function eloColor(elo) {
  if (elo >= 1500) return 0xf1c40f;
  if (elo >= 1300) return 0x7c3aed;
  if (elo >= 1100) return 0x3498db;
  return 0x95a5a6;
}

const MEDAL = ['🥇', '🥈', '🥉'];
function rankEmoji(i) { return MEDAL[i] ?? `${i + 1}⃣`; }

export function buildStatsEmbed(profile, page) {
  const base = new EmbedBuilder()
    .setColor(eloColor(profile.elo ?? 1000))
    .setFooter({ text: `zik-music.fr/user/${profile.username}` });

  if (page === 0) {
    return base
      .setTitle(`🎵 Stats ZIK de ${profile.username}`)
      .addFields(
        { name: '⚡ ELO',          value: String(profile.elo ?? 1000),             inline: true },
        { name: '🏅 Niveau',       value: `${profile.level} · ${profile.xp} XP`,  inline: true },
        { name: '🎮 Parties',      value: String(profile.games_played ?? 0),       inline: true },
        { name: '🏆 Score total',  value: String(profile.total_score ?? 0),        inline: true },
        { name: '🎮 Parties Discord', value: String(profile.discord_games_played ?? 0), inline: true },
      );
  }

  const mode = page === 1 ? 'Classique' : 'QCM';
  const icon = page === 1 ? '🎮' : '❓';
  const stats = page === 1 ? profile.classicStats : profile.qcmStats;
  return base
    .setTitle(`${icon} Mode ${mode} — ${profile.username}`)
    .addFields(
      { name: 'Parties jouées',  value: String(stats?.games_played ?? 0), inline: true },
      { name: 'Score moyen',     value: String(stats?.avg_score ?? 0),    inline: true },
      { name: 'Meilleur score',  value: String(stats?.best_score ?? 0),   inline: true },
      { name: 'Top rang obtenu', value: stats?.best_rank ? `${rankEmoji(stats.best_rank - 1)} ${stats.best_rank === 1 ? '1er' : `${stats.best_rank}ème`}` : '–', inline: true },
    );
}

export function buildClassementEmbed(rows, label, page, totalPages) {
  const lines = rows.map((r, i) => `${rankEmoji(i)} **${r.username}** — ${(r.total_score ?? r.score ?? 0).toLocaleString('fr')} pts`);
  return new EmbedBuilder()
    .setTitle(`🏆 Classement ZIK${label ? ' — ' + label : ''}`)
    .setDescription(lines.join('\n') || 'Aucun résultat.')
    .setColor(0x3ecfff)
    .setFooter({ text: `Page ${page + 1}/${totalPages} · Mis à jour le ${new Date().toLocaleDateString('fr')}` });
}

export function buildRoomsEmbed(rooms, page, totalPages) {
  const lines = rooms.map(r =>
    `${r.emoji ?? '🎵'} **${r.name}** · ${r.game_mode === 'qcm' ? 'QCM' : 'Classique'}\n` +
    `CODE: \`${r.code}\` — [Rejoindre →](${process.env.ZIK_BASE_URL}/game?room=${r.code})`
  );
  return new EmbedBuilder()
    .setTitle('🎮 Rooms actives sur ZIK')
    .setDescription(lines.join('\n\n') || 'Aucune room active en ce moment.')
    .setColor(0x3ecfff)
    .setFooter({ text: `Page ${page + 1}/${totalPages}` });
}
