// Déploiement MANUEL des slash-commands en GLOBAL (tous les serveurs).
// Usage : `npm run deploy`. Note : le bot resynchronise aussi automatiquement
// les commandes globales à chaque démarrage (voir src/index.js) — ce script
// sert surtout à forcer un déploiement immédiat sans redémarrer le bot.
import { REST, Routes } from 'discord.js';
import 'dotenv/config';
import { commands } from './commands-list.js';

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// Déploiement global → propagé sur tous les serveurs où le bot est présent.
await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });
console.log(`Slash commands déployées globalement (${commands.length}).`);

// Purge des éventuelles commandes "guild" héritées (sinon doublons sur le serveur de test).
if (process.env.DISCORD_GUILD_ID) {
  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
    { body: [] },
  );
  console.log('Commandes guild héritées purgées.');
}
