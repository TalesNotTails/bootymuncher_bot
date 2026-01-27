// Require the necessary discord.js classes
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, MessageFlags, ActivityType } = require('discord.js');
const { status } = require('minecraft-server-util');

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection()

// Import slash commands
const commandPath = path.join(__dirname, 'commands')
const commandFiles = fs.readdirSync(commandPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
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
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				content: 'There was an error while executing this command!',
				flags: MessageFlags.Ephemeral,
			});
		} else {
			await interaction.reply({
				content: 'There was an error while executing this command!',
				flags: MessageFlags.Ephemeral,
			});
		}
	}
});

// When the client is ready, run this code (only once).
client.once(Events.ClientReady, async (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);

// Rotate status every 10 seconds
setInterval(async () => {
  try {
    const response = await status(process.env.MC_HOSTNAME, 25565);
    client.user.setPresence({
      activities: [{ 
        name: 'mc_status',
        type: 4,
        state: '✅ Minecraft is online!'
      }],
      status: 'online'
    });
  }
  catch (error) {
    client.user.setPresence({
      activities: [{
        name: 'mc_status',
        type: 4,
        state: '❌ Minecraft is offline!'
      }],
      status: 'online'
    });
  }
}, 60000); // 10000ms = 60 seconds
