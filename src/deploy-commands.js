import { REST, Routes } from 'discord.js';
import 'dotenv/config';

const commands = [
  {
    name: 'link',
    description: 'Génère un lien pour connecter ton compte Discord à ZIK',
  },
  {
    name: 'stats',
    description: 'Affiche les stats ZIK d\'un joueur',
    options: [{
      name: 'joueur',
      description: 'Mentionner un joueur (optionnel, défaut: toi)',
      type: 6, // USER
      required: false,
    }],
  },
  {
    name: 'classement',
    description: 'Affiche le classement ZIK',
    options: [
      {
        name: 'room',
        description: 'Nom d\'une room (optionnel)',
        type: 3, // STRING
        required: false,
        autocomplete: true,
      },
      {
        name: 'mode',
        description: 'Filtrer par mode de jeu',
        type: 3, // STRING
        required: false,
        choices: [
          { name: 'Classique', value: 'classic' },
          { name: 'QCM', value: 'qcm' },
          { name: 'Discord', value: 'discord' },
        ],
      },
    ],
  },
  {
    name: 'rooms',
    description: 'Liste les rooms actives sur ZIK',
    options: [{
      name: 'recherche',
      description: 'Filtrer par nom de room (optionnel)',
      type: 3, // STRING
      required: false,
    }],
  },
  {
    name: 'zik-start',
    description: 'Lance une partie de Blind Test dans ton salon vocal',
    options: [
      {
        name: 'playlist',
        description: 'Nom de la playlist (optionnel)',
        type: 3, // STRING
        required: false,
        autocomplete: true,
      },
      {
        name: 'rounds',
        description: 'Nombre de rounds (1–20, défaut: 10)',
        type: 4, // INTEGER
        required: false,
        min_value: 1,
        max_value: 20,
      },
    ],
  },
  { name: 'zik-stop', description: 'Arrête la partie en cours' },
  { name: 'zik-skip', description: 'Voter pour passer le round actuel' },
];

const rest = new REST().setToken(process.env.DISCORD_TOKEN);
await rest.put(
  Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
  { body: commands },
);
console.log('Slash commands déployées.');
