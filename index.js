// Require the necessary discord.js classes
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const { status } = require('minecraft-server-util');
const db = require('./db');

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
client.commands = new Collection();

// Import slash commands
const commandPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  }
  else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// Listen for interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  // console.log(interaction);
  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  }
  catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'There was an error while executing this command!',
        flags: MessageFlags.Ephemeral,
      });
    }
    else {
      await interaction.reply({
        content: 'There was an error while executing this command!',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

// Award XP for chatting (with a 60s cooldown per user)
const XP_COOLDOWN_MS = 60000;
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  try {
    const lastXpAt = await db.getLastXpAt(message.author.id, message.guild.id);
    if (lastXpAt && Date.now() - new Date(lastXpAt).getTime() < XP_COOLDOWN_MS) return;

    const amount = Math.floor(Math.random() * 11) + 15;
    const result = await db.addXp(message.author.id, message.guild.id, amount);
    if (result.leveledUp) {
      await message.channel.send(`${message.author} leveled up to level ${result.level}!`);
    }
  }
  catch (error) {
    console.error(error);
  }
});

// When the client is ready, run this code (only once).
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

// Log in to Discord with your client's token
db.init()
  .then(() => client.login(process.env.DISCORD_TOKEN))
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });

// Rotate status every 10 seconds
setInterval(async () => {
  try {
    const response = await status(process.env.MC_HOSTNAME, 25565); // eslint-disable-line no-unused-vars
    client.user.setPresence({
      activities: [{
        name: 'mc_status',
        type: 4,
        state: '✅ Minecraft is online!',
      }],
      status: 'online',
    });
  }
  catch (error) {
    console.log(error);
    client.user.setPresence({
      activities: [{
        name: 'mc_status',
        type: 4,
        state: '❌ Minecraft is offline!',
      }],
      status: 'online',
    });
  }
},
// 10000ms = 60 seconds
60000);
