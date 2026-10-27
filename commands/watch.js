const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../db');
const watcher = require('../watcher');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('watch')
    .setDescription('Get pinged when an item on a store page is back in stock')
    .addStringOption((option) =>
      option.setName('url').setDescription('Link to the store page for the item').setRequired(true)),
  async execute(interaction) {
    if (!watcher.isConfigured()) {
      return interaction.reply({
        content: 'Item watching is not set up on this bot yet.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let url;
    try {
      url = watcher.normalizeUrl(interaction.options.getString('url')).toString();
    }
    catch (error) {
      if (error instanceof watcher.WatchError) {
        return interaction.editReply(error.message);
      }
      throw error;
    }

    const existing = (await db.getUserWatches(interaction.user.id)).find((watch) => watch.url === url);
    if (existing) {
      return interaction.editReply('You\'re already watching that page.');
    }
    if (await db.countWatches(interaction.user.id) >= watcher.MAX_WATCHES_PER_USER) {
      return interaction.editReply(`You can watch up to ${watcher.MAX_WATCHES_PER_USER} pages. Use /unwatch to free up a slot.`);
    }

    // Check the page now so bad links are rejected and the user gets
    // immediate feedback on whether we can read its stock status.
    let result;
    try {
      result = await watcher.checkUrl(url);
    }
    catch (error) {
      if (error instanceof watcher.WatchError) {
        return interaction.editReply(`I couldn't load that page: ${error.message}`);
      }
      console.error(`Failed to load ${url} for /watch:`, error.message);
      return interaction.editReply('I couldn\'t load that page. Check the link and try again.');
    }

    console.log(`[watch] ${url} -> ${result.status} (via ${result.source}) ${JSON.stringify(result.signals)}`);

    const added = await db.addWatch(interaction.user.id, url, result.title, result.status);
    if (!added) {
      return interaction.editReply('You\'re already watching that page.');
    }

    const name = result.title ? `**${result.title.slice(0, 100)}**` : 'that page';
    const channel = `<#${watcher.getChannelId()}>`;
    if (result.status === 'in_stock') {
      return interaction.editReply(`Now watching ${name}. It's in stock right now! I'll ping you in ${channel} if it sells out and comes back.`);
    }
    if (result.status === 'out_of_stock') {
      return interaction.editReply(`Now watching ${name}. It's out of stock right now, I'll ping you in ${channel} when it's available.`);
    }
    return interaction.editReply(`Now watching ${name}, but I couldn't tell whether it's in stock. Some stores load that info with JavaScript, which I can't read. I'll keep checking, but this page may not work.`);
  },
};
