// Définition des slash-commands — partagée entre le déploiement manuel (deploy-commands.js)
// et l'auto-déploiement global au démarrage du bot (index.js).
export const commands = [
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
      { name: 'playlist', description: 'Nom de la playlist (optionnel)', type: 3, required: false, autocomplete: true },
      { name: 'rounds', description: 'Nombre de rounds (1–20, défaut: 10)', type: 4, required: false, min_value: 1, max_value: 20 },
      { name: 'mode', description: 'Mode de jeu (défaut: Classique)', type: 3, required: false, choices: [
        { name: 'Classique (saisie)', value: 'classic' },
        { name: 'QCM (choix multiple)', value: 'qcm' },
      ] },
      { name: 'duree', description: 'Durée d\'un round (défaut: 30s)', type: 4, required: false, choices: [
        { name: '15s', value: 15 }, { name: '30s', value: 30 }, { name: '45s', value: 45 },
      ] },
      { name: 'pause', description: 'Pause entre rounds en s (défaut: 5)', type: 4, required: false, min_value: 3, max_value: 15 },
    ],
  },
  { name: 'zik-stop', description: 'Arrête la partie en cours' },
  { name: 'zik-skip', description: 'Voter pour passer le round actuel' },
];
