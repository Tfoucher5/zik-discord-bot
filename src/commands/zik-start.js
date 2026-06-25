import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ThreadAutoArchiveDuration,
  ChannelType,
} from 'discord.js';
import supabase from '../lib/supabase.js';
import { joinVoice, playPreview, stopAudio, leaveVoice } from '../lib/audio.js';
import { activeGames, createGame, addPlayer, nextRound, endGame, submitGuess, submitChoice, allPlayersDone } from '../lib/game-engine.js';
import { buildTrack } from '../lib/track.js';
import { makeChoices } from '../lib/scoring.js';

// Map<threadId, { guildId, userId }> — pour router les messages de thread vers la bonne partie
export const threadPlayerMap = new Map();

async function getDeezerPreview(artist, title) {
  try {
    const q = encodeURIComponent(`${artist} ${title}`);
    const res = await fetch(`https://api.deezer.com/search?q=${q}&limit=1`);
    const json = await res.json();
    return json.data?.[0]?.preview ?? null;
  } catch {
    return null;
  }
}

async function fetchPlaylists(search) {
  let q = supabase
    .from('custom_playlists')
    .select('id, name, emoji, track_count, is_official')
    .or('is_official.eq.true,is_public.eq.true')
    .gt('track_count', 0)
    .order('is_official', { ascending: false })
    .order('track_count', { ascending: false })
    .limit(25);
  if (search) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search);
    q = isUuid ? q.eq('id', search) : q.ilike('name', `%${search}%`);
  }
  const { data } = await q;
  return data ?? [];
}

async function fetchTracks(playlistId, totalRounds) {
  const { data } = await supabase
    .from('custom_playlist_tracks')
    .select('id, artist, title, cover_url, preview_url, custom_artist, custom_title, custom_feats, track_answers(value, answer_types(name))')
    .eq('playlist_id', playlistId);
  if (!data?.length) return [];

  const enriched = await Promise.all(data.map(async (row) => {
    let preview_url = row.preview_url;
    if (!preview_url) preview_url = await getDeezerPreview(row.custom_artist ?? row.artist, row.custom_title ?? row.title);
    return { ...row, preview_url };
  }));

  const withPreviews = enriched.filter((t) => t.preview_url);
  if (!withPreviews.length) return [];

  for (let i = withPreviews.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [withPreviews[i], withPreviews[j]] = [withPreviews[j], withPreviews[i]];
  }

  return withPreviews.slice(0, totalRounds).map((t) => buildTrack({
    artist: t.artist,
    title: t.title,
    cover: t.cover_url,
    preview_url: t.preview_url,
    custom_artist: t.custom_artist,
    custom_title: t.custom_title,
    custom_feats: t.custom_feats,
    extraAnswers: (t.track_answers || []).map((a) => ({ label: a.answer_types?.name || 'Bonus', value: a.value })),
  }));
}

function buildScoreLines(state) {
  return [...state.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => `${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} **${p.discordUsername}** — ${p.score} pts`)
    .join('\n') || '–';
}

async function runRound(state, guildId) {
  const roundData = nextRound(state);
  if (!roundData) {
    await finishGame(state, guildId);
    return;
  }

  const { track, roundIndex } = roundData;

  const embed = new EmbedBuilder()
    .setTitle(`🎵 Round ${roundIndex + 1} / ${state.totalRounds}`)
    .setDescription('🎧 Écoute et réponds dans ce fil !\n⏱️ 30 secondes')
    .addFields({ name: 'Scores', value: buildScoreLines(state) })
    .setColor(0x3ecfff);

  for (const player of state.players.values()) {
    player.threadChannel?.send({ embeds: [embed] }).catch(() => {});
  }

  // Lancer l'audio en parallèle — le timer de 30s démarre immédiatement
  if (track.preview_url) {
    playPreview(state.audioPlayer, track.preview_url).catch((e) => {
      console.error('[audio] playPreview error:', e?.message ?? e);
      for (const player of state.players.values()) {
        player.threadChannel?.send('⚠️ Problème audio ce round — devine quand même !').catch(() => {});
      }
    });
  }

  state.roundTimeout = setTimeout(() => revealRound(state, guildId, track), 30_000);
}

async function revealRound(state, guildId, track) {
  clearTimeout(state.roundTimeout);
  stopAudio(state.audioPlayer);

  const titleDisplay = track.custom_title ?? track.title;
  const artistDisplay = track.custom_artist ?? track.artist;

  for (const [, player] of state.players) {
    player.threadChannel?.send(
      `🎵 C'était **${titleDisplay}** — *${artistDisplay}*\n` +
      (player.hasAnswered ? '✅ Bien joué !' : '❌ Pas trouvé cette fois.')
    ).catch(() => {});
  }

  await new Promise(r => setTimeout(r, 4000));
  await runRound(state, guildId);
}

async function finishGame(state, guildId) {
  clearTimeout(state.roundTimeout);
  stopAudio(state.audioPlayer);
  leaveVoice(state.voiceConnection);

  const players = await endGame(state, guildId);

  // Nettoyer la map et supprimer les fils
  for (const [, player] of state.players) {
    if (player.threadChannel) {
      threadPlayerMap.delete(player.threadChannel.id);
      player.threadChannel.delete().catch(() => {
        player.threadChannel.setArchived(true).catch(() => {});
      });
    }
  }

  const resultsLines = players.map((p, i) => {
    const xpGain = Math.max(1, Math.floor(p.score / 10));
    return `${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} **${p.discordUsername}** — ${p.score} pts (+${xpGain} XP)`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🏆 Résultats — Blind Test Discord')
    .setDescription(resultsLines || 'Aucun joueur.')
    .addFields({ name: '​', value: '_XP gagnée uniquement (aucun impact ELO)_' })
    .setColor(0xf1c40f);

  state._mainChannel?.send({ embeds: [embed] }).catch(console.error);
}

// Appelé depuis index.js sur messageCreate (messages dans les fils de jeu)
export async function handleThreadAnswer(msg) {
  const entry = threadPlayerMap.get(msg.channelId);
  if (!entry) return;
  const { guildId, userId } = entry;
  const state = activeGames.get(guildId);
  if (!state) return;

  const result = submitAnswer(state, userId, msg.content);
  if (!result) return;

  if (!result.correct) {
    await msg.react('❌').catch(() => {});
    return;
  }

  await msg.react('✅').catch(() => {});

  const found = [...state.players.values()].filter(p => p.hasAnswered).length;
  const total = state.players.size;

  // Notifier les autres joueurs dans leurs fils respectifs
  for (const [pId, player] of state.players) {
    if (pId !== userId) {
      player.threadChannel?.send(`✅ **${msg.author.username}** a trouvé ! (${found}/${total})`).catch(() => {});
    }
  }

  if (result.allFound) {
    clearTimeout(state.roundTimeout);
    const track = state.tracks[state.currentRound - 1];
    await state.onRoundEnd?.(track);
  }
}

export default {
  name: 'zik-start',
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const { data } = await supabase
      .from('custom_playlists')
      .select('id, name, track_count, is_official')
      .or('is_official.eq.true,is_public.eq.true')
      .gt('track_count', 0)
      .ilike('name', `%${focused}%`)
      .order('is_official', { ascending: false })
      .limit(25);
    await interaction.respond(
      (data ?? []).map(p => ({
        name: `${p.is_official ? '⭐' : '🎵'} ${p.name} (${p.track_count} titres)`,
        value: p.id,
      }))
    );
  },

  async execute(interaction) {
    const guildId = interaction.guildId;

    if (activeGames.has(guildId)) {
      await interaction.reply({ content: 'Une partie est déjà en cours sur ce serveur !', flags: MessageFlags.Ephemeral });
      return;
    }

    const member = interaction.member;
    const voiceChannel = member.voice?.channel;
    if (!voiceChannel) {
      await interaction.reply({ content: '🔇 Tu dois être dans un salon vocal pour lancer une partie !', flags: MessageFlags.Ephemeral });
      return;
    }

    const totalRounds = interaction.options.getInteger('rounds') ?? 10;
    const playlistSearch = interaction.options.getString('playlist');
    const mode = interaction.options.getString('mode') ?? 'classic';
    const roundDuration = interaction.options.getInteger('duree') ?? 30;
    const pauseDuration = interaction.options.getInteger('pause') ?? 5;

    await interaction.deferReply();

    const playlists = await fetchPlaylists(playlistSearch);
    if (!playlists.length) {
      await interaction.editReply({ content: 'Aucune playlist trouvée. Essaie sans argument `playlist`.' });
      return;
    }

    // Autocomplete retourne un UUID → démarrer directement
    if (playlists.length === 1 || (playlistSearch && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(playlistSearch))) {
      await startWithPlaylist(interaction, guildId, voiceChannel, playlists[0], totalRounds, mode, roundDuration, pauseDuration);
      return;
    }

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
        await sel.reply({ content: 'Ce n\'est pas ta commande.', flags: MessageFlags.Ephemeral });
        return;
      }
      const chosen = playlists.find(p => p.id === sel.values[0]);
      await sel.update({ content: `Playlist choisie : **${chosen.name}**`, components: [] });
      await startWithPlaylist(interaction, guildId, voiceChannel, chosen, totalRounds, mode, roundDuration, pauseDuration);
    });
    collector.on('end', (collected) => {
      if (!collected.size) interaction.editReply({ content: 'Sélection annulée.', components: [] }).catch(() => {});
    });
  },
};

async function startWithPlaylist(interaction, guildId, voiceChannel, playlist, totalRounds, mode = 'classic', roundDuration = 30, pauseDuration = 5) {
  const tracks = await fetchTracks(playlist.id, totalRounds);
  if (!tracks.length) {
    await interaction.editReply({ content: `La playlist **${playlist.name}** n'a aucun titre avec aperçu audio (Deezer inclus).` });
    return;
  }

  const actualRounds = Math.min(tracks.length, totalRounds);
  const state = createGame(guildId, interaction.user.id, voiceChannel.id, tracks, actualRounds, mode, roundDuration);
  state.pauseDuration = pauseDuration;
  state._guildId = guildId;
  state._mainChannel = interaction.channel;

  const voiceMembers = [...voiceChannel.members.values()].filter(m => !m.user.bot);

  const lobbyEmbed = new EmbedBuilder()
    .setTitle(`🎮 Blind Test — ${playlist.name}`)
    .setDescription(
      `**${actualRounds} rounds · Mode ${mode === 'qcm' ? 'QCM' : 'Classique'}**\n\n` +
      `Participants :\n${voiceMembers.map(m => `• ${m.user.username}`).join('\n')}\n\n` +
      `⏱️ Démarrage dans 60s ou quand tout le monde est prêt.\n\n` +
      `0/${voiceMembers.length} prêts`
    )
    .setColor(0x3ecfff);

  const readyBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('zik_ready').setLabel('✅ Je suis prêt !').setStyle(ButtonStyle.Success)
  );

  const lobbyMsg = await interaction.editReply({ embeds: [lobbyEmbed], components: [readyBtn] });

  const readySet = new Set();
  const readyIds = new Set(voiceMembers.map(m => m.id));

  let gameStarting = false;
  const startGame = async () => {
    if (gameStarting) return;
    gameStarting = true;
    readyCollector.stop('started');
    await interaction.editReply({ components: [] }).catch(() => {});

    if (voiceMembers.length === 0) {
      await interaction.channel.send('Aucun joueur dans le vocal. Partie annulée.').catch(() => {});
      activeGames.delete(guildId);
      return;
    }

    // Créer un fil privé par joueur et peupler l'état
    for (const member of voiceMembers) {
      try {
        const thread = await interaction.channel.threads.create({
          name: `🎮 ${member.user.username}`,
          type: ChannelType.PrivateThread,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
          invitable: false,
        });
        await thread.members.add(member.id);
        await thread.send(`🎮 La partie **${playlist.name}** commence dans un instant !\nRéponds ici — personne d'autre ne voit tes réponses. 🤫`);

        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('discord_id', member.id)
          .maybeSingle();

        addPlayer(state, member.id, member.user.username, profile?.id ?? null, null);
        state.players.get(member.id).threadChannel = thread;
        threadPlayerMap.set(thread.id, { guildId, userId: member.id });
      } catch (e) {
        console.error(`[zik-start] Fil privé impossible pour ${member.user.username}:`, e.message);
        await interaction.channel.send(
          `⚠️ Impossible de créer un fil privé pour **${member.user.username}**.\n` +
          `Vérifiez que le bot a la permission **Créer des fils privés** dans ce salon.`
        ).catch(() => {});
      }
    }

    if (state.players.size === 0) {
      await interaction.channel.send('Impossible de créer les fils privés. Partie annulée.').catch(() => {});
      activeGames.delete(guildId);
      return;
    }

    state.onRoundEnd = (track) => revealRound(state, guildId, track);

    const { connection, player } = joinVoice(voiceChannel);
    state.voiceConnection = connection;
    state.audioPlayer = player;

    await runRound(state, guildId);
  };

  const readyCollector = lobbyMsg.createMessageComponentCollector({ time: 60_000 });

  readyCollector.on('collect', async (btn) => {
    if (!readyIds.has(btn.user.id)) {
      await btn.reply({ content: 'Tu n\'étais pas dans le vocal au démarrage.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (readySet.has(btn.user.id)) {
      await btn.reply({ content: 'Tu es déjà prêt !', flags: MessageFlags.Ephemeral });
      return;
    }
    readySet.add(btn.user.id);
    await btn.reply({ content: '✅ Prêt !', flags: MessageFlags.Ephemeral });

    const currentDesc = lobbyEmbed.data.description ?? '';
    const updatedDesc = currentDesc.replace(/\d+\/\d+ prêts/, `${readySet.size}/${voiceMembers.length} prêts`);
    lobbyEmbed.setDescription(updatedDesc);
    await interaction.editReply({ embeds: [lobbyEmbed] }).catch(() => {});

    if (readySet.size >= voiceMembers.length) await startGame();
  });

  readyCollector.on('end', async (_, reason) => {
    if (reason !== 'started') await startGame();
  });
}
