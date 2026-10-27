// Require the necessary discord.js classes
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, MessageFlags, Partials } = require('discord.js');
const { status } = require('minecraft-server-util');
const db = require('./db');
const watcher = require('./watcher');

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Message,
    Partials.Reaction,
    Partials.Channel,
  ],
});

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

// Listen for adding reactions
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
      await user.fetch();
    }
    catch (error) {
      console.error('Error fetching resources from reaction', error);
      return;
    }
  }

  try {
    const message = await reaction.message.fetch();

    if (!message.guild) return;
    if (message.author.id === user.id) return;

    const xp_gainers = [
      { guild_id: message.guild.id, user_id: message.author.id },
      { guild_id: message.guild.id, user_id: user.id },
    ];
    const amount = Math.floor(Math.random() * 11) + 5;

    for (const xp_user of xp_gainers) {
      const key = `${xp_user.guild_id}:${xp_user.user_id}`;
      try {
        startPendingXp(key);
        const result = await db.addXp(xp_user.user_id, xp_user.guild_id, amount, XP_COOLDOWN_MS);
        if (result && result.leveledUp) {
          console.log(`${xp_user.user_id} leveled up to level ${result.level}!`);
        }
      }
      catch (error) {
        console.error(error);
      }
      finally {
        await finishPendingXp(key);
      }
    }
  }
  catch (error) {console.error('Error fetching message', error);}
});

// Listen for interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const autocompleteCommand = interaction.client.commands.get(interaction.commandName);
    if (!autocompleteCommand || !autocompleteCommand.autocomplete) return;
    try {
      await autocompleteCommand.autocomplete(interaction);
    }
    catch (error) {
      console.error(error);
    }
    return;
  }
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

// Listen for messages
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const key = `${message.guild.id}:${message.author.id}`;
  try {
    const amount = Math.floor(Math.random() * 11) + 15;
    startPendingXp(key);
    const result = await db.addXp(message.author.id, message.guild.id, amount, XP_COOLDOWN_MS);
    if (result && result.leveledUp) {
      console.log(`${message.author} leveled up to level ${result.level}!`);
    }
  }
  catch (error) {
    console.error(error);
  }
  finally {
    await finishPendingXp(key);
  }
});

// Award XP for chatting (with a 60s cooldown per user)
const XP_COOLDOWN_MS = 60000;

// Ordering coordination: the top-user notification can arrive before the
// level-up message is sent, so hold it back while addXp is in flight.
const pendingXp = new Map();
const queuedTopUser = new Map();
const roleID = process.env.LEADER_ROLE_ID;

function startPendingXp(key) {
  pendingXp.set(key, (pendingXp.get(key) || 0) + 1);
}

async function finishPendingXp(key) {
  const remaining = pendingXp.get(key) - 1;
  if (remaining > 0) {
    pendingXp.set(key, remaining);
    return;
  }

  pendingXp.delete(key);
  const queued = queuedTopUser.get(key);
  if (queued) {
    queuedTopUser.delete(key);
    await announceTopUser(queued);
  }
}

async function announceTopUser(payload) {
  try {
    const guild = await client.guilds.fetch(payload.guild_id);
    const channel = guild.systemChannel;
    // Get leaderRole and clear existing users
    if (roleID) {
      try {
        const leaderRole = await guild.roles.fetch(roleID);
        if (!leaderRole) {throw new Error(`Role: ${roleID} did not return a role`);}
        await guild.members.fetch();
        const newLeader = await guild.members.fetch(payload.user_id);
        await Promise.all(
          leaderRole.members
            .filter(m => m.id !== payload.user_id)
            .map(m => m.roles.remove(leaderRole)),
        );
        await newLeader.roles.add(leaderRole);
      }
      catch (error) {
        console.error('Error assigning role', error);
      }

      if (!channel) {
        console.warn(`Guild ${guild.id} has no system channel; skipping top-user message.`);
        return;
      }

      await channel.send(`<@${payload.user_id}> passed <@${payload.prev_user_id}> to become the new yap leader at level ${payload.level}!`);
    }
  }
  catch (error) {
    console.error('Unable to send top user message', error);
  }
}

// When the client is ready, run this code (only once).
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  db.listenForTopUser((payload) => {
    const key = `${payload.guild_id}:${payload.user_id}`;
    if (pendingXp.has(key)) {
      queuedTopUser.set(key, payload);
    }
    else {
      announceTopUser(payload);
    }
  });
  watcher.start(readyClient);
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
