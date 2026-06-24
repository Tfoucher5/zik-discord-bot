import { Client, GatewayIntentBits, Collection } from 'discord.js';
import 'dotenv/config';
import linkCmd from './commands/link.js';
import statsCmd from './commands/stats.js';
import classementCmd from './commands/classement.js';
import roomsCmd from './commands/rooms.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
for (const cmd of [linkCmd, statsCmd, classementCmd, roomsCmd]) {
  client.commands.set(cmd.name, cmd);
}

client.on('ready', () => console.log(`Bot en ligne : ${client.user.tag}`));

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error(err);
    const msg = { content: 'Une erreur est survenue.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
    else await interaction.reply(msg);
  }
});

client.login(process.env.DISCORD_TOKEN);
