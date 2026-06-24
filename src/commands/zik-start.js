import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ThreadAutoArchiveDuration,
} from 'discord.js';
import supabase from '../lib/supabase.js';
import { joinVoice, playPreview, stopAudio, leaveVoice } from '../lib/audio.js';
import { activeGames, createGame, addPlayer, nextRound, endGame } from '../lib/game-engine.js';

// Map<discordUserId, guildId> — pour router les DMs vers la bonne partie
export const dmPlayerMap = new Map();

async function fetchPlaylists(search) {
  let q = supabase
    .from('custom_playlists')
    .select('id, name, emoji, track_count, is_official')
    .or('is_official.eq.true,is_public.eq.true')
    .gt('track_count', 0)
    .order('is_official', { ascending: false })
    .order('track_count', { ascending: false })
    .limit(25);
  if (search) q = q.ilike('name', `%${search}%`);
  const { data } = await q;
  return data ?? [];
}

async function fetchTracks(playlistId, totalRounds) {
  const { data } = await supabase
    .from('custom_playlist_tracks')
    .select('id, artist, title, preview_url, custom_artist, custom_title')
    .eq('playlist_id', playlistId)
    .not('preview_url', 'is', null);
  if (!data?.length) return [];
  // Mélange Fisher-Yates
  const shuffled = [...data];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, totalRounds);
}

async function runRound(state, guildId, thread) {
  const roundData = nextRound(state);
  if (!roundData) {
    await finishGame(state, guildId, thread);
    return;
  }

  const { track, roundIndex } = roundData;
  const scores = [...state.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => `${['🥇','🥈','🥉'][i] ?? `${i+1}.`} ${p.discordUsername} — **${p.score} pts**`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`🎵 Round ${roundIndex + 1} / ${state.totalRounds}`)
    .setDescription('🎧 Écoute et envoie ta réponse en DM au bot !\n⏱️ 30 secondes')
    .addFields({ name: 'Scores', value: scores || '–' })
    .setColor(0x3ecfff);

  await thread.send({ embeds: [embed] });

  // DM chaque joueur avec le round actuel
  for (const player of state.players.values()) {
    player.dmChannel?.send(`🎵 Round ${roundIndex + 1} — envoie ta réponse ici !`).catch(() => {});
  }

  // Stream audio
  if (track.preview_url) {
    try {
      await playPreview(state.audioPlayer, track.preview_url);
    } catch {
      await thread.send('⚠️ Audio indisponible pour ce round, il sera ignoré.');
    }
  } else {
    await thread.send('⚠️ Pas d\'aperçu audio pour ce titre, round ignoré.');
  }

  // Timeout 30s
  state.roundTimeout = setTimeout(() => revealRound(state, guildId, thread, track), 30_000);
}

async function revealRound(state, guildId, thread, track) {
  clearTimeout(state.roundTimeout);
  stopAudio(state.audioPlayer);

  const titleDisplay = track.custom_title ?? track.title;
  const artistDisplay = track.custom_artist ?? track.artist;

  const results = [...state.players.values()]
    .map(p => p.hasAnswered
      ? `✅ **${p.discordUsername}** a trouvé ! (+points)`
      : `❌ ${p.discordUsername} n'a pas trouvé`
    )
    .join('\n');

  await thread.send(`🎵 C'était **${titleDisplay}** — ${artistDisplay} !\n${results}`);

  // Pause 4s puis round suivant
  await new Promise(r => setTimeout(r, 4000));
  await runRound(state, guildId, thread);
}

async function finishGame(state, guildId, thread) {
  clearTimeout(state.roundTimeout);
  stopAudio(state.audioPlayer);
  leaveVoice(state.voiceConnection);

  const players = await endGame(state, guildId);

  // Nettoyer la dmPlayerMap
  for (const [userId] of state.players) {
    dmPlayerMap.delete(userId);
  }

  const resultsLines = players.map((p, i) => {
    const xpGain = Math.max(1, Math.floor(p.score / 10));
    return `${['🥇','🥈','🥉'][i] ?? `${i+1}.`} **${p.discordUsername}** — ${p.score} pts (+${xpGain} XP)`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🏆 Résultats — Blind Test Discord')
    .setDescription(resultsLines || 'Aucun joueur.')
    .addFields({ name: '', value: '_XP gagnée uniquement (aucun impact ELO)_' })
    .setColor(0xf1c40f);

  await thread.send({ embeds: [embed] });
}

// Appelé depuis index.js sur messageCreate (DMs)
export async function handleDmAnswer(msg) {
  const guildId = dmPlayerMap.get(msg.author.id);
  if (!guildId) return;
  const state = activeGames.get(guildId);
  if (!state) return;

  const { submitAnswer } = await import('../lib/game-engine.js');
  const result = submitAnswer(state, msg.author.id, msg.content);
  if (!result) return;

  if (!result.correct) {
    await msg.react('❌').catch(() => {});
    return;
  }

  await msg.react('✅').catch(() => {});
  const thread = await msg.client.channels.fetch(state.threadId).catch(() => null);

  const found = [...state.players.values()].filter(p => p.hasAnswered).length;
  const total = state.players.size;
  await thread?.send(`✅ **${msg.author.username}** a trouvé ! ${found}/${total} joueurs ✅`).catch(() => {});

  if (result.allFound) {
    clearTimeout(state.roundTimeout);
    const track = state.tracks[state.currentRound - 1];
    await revealRound(state, guildId, thread, track);
  }
}

export default {
  name: 'zik-start',
  async execute(interaction) {
    const guildId = interaction.guildId;

    if (activeGames.has(guildId)) {
      await interaction.reply({ content: 'Une partie est déjà en cours sur ce serveur !', ephemeral: true });
      return;
    }

    const member = interaction.member;
    const voiceChannel = member.voice?.channel;
    if (!voiceChannel) {
      await interaction.reply({ content: '🔇 Tu dois être dans un salon vocal pour lancer une partie !', ephemeral: true });
      return;
    }

    const totalRounds = interaction.options.getInteger('rounds') ?? 10;
    const playlistSearch = interaction.options.getString('playlist');

    await interaction.deferReply();

    const playlists = await fetchPlaylists(playlistSearch);
    if (!playlists.length) {
      await interaction.editReply({ content: 'Aucune playlist trouvée. Essaie sans argument `playlist`.', ephemeral: true });
      return;
    }

    // Si une seule playlist ou recherche exacte → démarrer directement
    if (playlists.length === 1 || (playlistSearch && playlists[0].name.toLowerCase() === playlistSearch.toLowerCase())) {
      await startWithPlaylist(interaction, guildId, voiceChannel, playlists[0], totalRounds);
      return;
    }

    // Sinon → Select Menu
    const options = playlists.slice(0, 25).map(p => ({
      label: `${p.is_official ? '⭐ ' : '🎵 '}${p.name} (${p.track_count} titres)`,
      value: p.id,
    }));

    const select = new StringSelectMenuBuilder()
      .setCustomId(`playlist_select_${guildId}`)
      .setPlaceholder('Choisis ta playlist')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(select);
    const msg = await interaction.editReply({ content: '🎵 Choisis ta playlist :', components: [row] });

    const collector = msg.createMessageComponentCollector({ time: 60_000, max: 1 });
    collector.on('collect', async (sel) => {
      if (sel.user.id !== interaction.user.id) {
        await sel.reply({ content: 'Ce n\'est pas ta commande.', ephemeral: true });
        return;
      }
      const chosen = playlists.find(p => p.id === sel.values[0]);
      await sel.update({ content: `Playlist choisie : **${chosen.name}**`, components: [] });
      await startWithPlaylist(interaction, guildId, voiceChannel, chosen, totalRounds);
    });
    collector.on('end', (collected) => {
      if (!collected.size) interaction.editReply({ content: 'Sélection annulée.', components: [] }).catch(() => {});
    });
  },
};

async function startWithPlaylist(interaction, guildId, voiceChannel, playlist, totalRounds) {
  const tracks = await fetchTracks(playlist.id, totalRounds);
  if (!tracks.length) {
    await interaction.editReply({ content: `La playlist **${playlist.name}** n'a pas de titres avec aperçu audio.` });
    return;
  }

  const state = createGame(guildId, interaction.user.id, null, voiceChannel.id, tracks, Math.min(tracks.length, totalRounds));
  state._guildId = guildId;

  // Corriger le globalTimeout pour avoir accès au guildId
  clearTimeout(state.globalTimeout);
  state.globalTimeout = setTimeout(() => endGame(state, guildId), 90 * 60 * 1000);

  // Exposer revealRound via onRoundEnd pour zik-skip (évite import circulaire)
  state.onRoundEnd = (track) => revealRound(state, guildId, thread, track);

  // Créer le thread
  const thread = await interaction.channel.threads.create({
    name: `🎮 Blind Test — ${playlist.name}`,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
  });
  state.threadId = thread.id;

  // Réassigner onRoundEnd après que thread soit défini
  state.onRoundEnd = (track) => revealRound(state, guildId, thread, track);

  // Détecter les membres dans le vocal
  const voiceMembers = [...voiceChannel.members.values()].filter(m => !m.user.bot);

  const readySet = new Set();
  const dmFailures = [];
  const dmSuccesses = new Map(); // userId → dmChannel

  // DM check
  await Promise.all(voiceMembers.map(async (member) => {
    try {
      const dm = await member.user.createDM();
      await dm.send(
        `🎮 Partie de Blind Test en cours sur **${interaction.guild.name}** ! ` +
        `Réponds ici pendant la partie pour que personne ne voie ta réponse.`
      );
      dmSuccesses.set(member.id, dm);
    } catch {
      dmFailures.push(member);
    }
  }));

  if (dmFailures.length) {
    await thread.send(
      dmFailures.map(m => `⚠️ <@${m.id}> — Je ne peux pas t'envoyer de DM. Active les DMs du serveur pour participer !`).join('\n')
    );
  }

  for (const [userId, dmChannel] of dmSuccesses) {
    const member = voiceChannel.members.get(userId);
    // Récupérer le zikUserId si le compte est lié
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('discord_id', userId)
      .maybeSingle();
    addPlayer(state, userId, member.user.username, profile?.id ?? null, dmChannel);
    dmPlayerMap.set(userId, guildId);
  }

  if (state.players.size === 0) {
    await thread.send('Aucun joueur n\'a pu être contacté en DM. Partie annulée.');
    activeGames.delete(guildId);
    return;
  }

  const playerMentions = [...state.players.entries()].map(([id]) => `<@${id}>`).join(' ');

  const lobbyEmbed = new EmbedBuilder()
    .setTitle(`🎮 Blind Test — ${playlist.name}`)
    .setDescription(
      `**${state.totalRounds} rounds · Mode Classique**\n\n` +
      `Participants détectés dans le vocal :\n${playerMentions}\n\n` +
      `⚠️ Réponds aux questions en DM au bot !\n` +
      `⏱️ Démarrage dans 60s ou quand tous sont prêts.\n\n` +
      `0/${state.players.size} prêts`
    )
    .setColor(0x3ecfff);

  const readyBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('zik_ready').setLabel('✅ Je suis prêt !').setStyle(ButtonStyle.Success)
  );

  const lobbyMsg = await thread.send({ embeds: [lobbyEmbed], components: [readyBtn] });

  const readyCollector = lobbyMsg.createMessageComponentCollector({ time: 60_000 });

  const startGame = async () => {
    readyCollector.stop();
    await lobbyMsg.edit({ components: [] });

    if (state.players.size === 0) {
      await thread.send('Plus aucun joueur. Partie annulée.');
      activeGames.delete(guildId);
      return;
    }

    const { connection, player } = joinVoice(voiceChannel);
    state.voiceConnection = connection;
    state.audioPlayer = player;

    await thread.send('🎮 La partie commence !');
    await runRound(state, guildId, thread);
  };

  readyCollector.on('collect', async (btn) => {
    if (!state.players.has(btn.user.id)) {
      await btn.reply({ content: 'Tu n\'es pas inscrit à cette partie.', ephemeral: true });
      return;
    }
    readySet.add(btn.user.id);
    await btn.reply({ content: '✅ Tu es prêt !', ephemeral: true });

    const currentDesc = lobbyEmbed.data.description ?? '';
    const updatedDesc = currentDesc.replace(
      /\d+\/\d+ prêts/,
      `${readySet.size}/${state.players.size} prêts`
    );
    const updatedEmbed = EmbedBuilder.from(lobbyEmbed).setDescription(updatedDesc);
    lobbyEmbed.setDescription(updatedDesc); // met à jour pour le prochain clic
    await lobbyMsg.edit({ embeds: [updatedEmbed] });

    if (readySet.size >= state.players.size) await startGame();
  });

  readyCollector.on('end', async (_, reason) => {
    if (reason !== 'user') await startGame();
  });
}
