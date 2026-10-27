const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../db');
const watcher = require('../watcher');

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unwatch')
    .setDescription('Stop watching a store page')
    .addStringOption((option) =>
      option.setName('url')
        .setDescription('The page to stop watching')
        .setRequired(true)
        .setAutocomplete(true)),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const watches = await db.getUserWatches(interaction.user.id);
    const choices = watches
      .filter((watch) => `${watch.title || ''} ${watch.url}`.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((watch) => ({
        name: truncate(watch.title ? `${watch.title} (${watch.url})` : watch.url, 100),
        value: String(watch.id),
      }));
    await interaction.respond(choices);
  },
  async execute(interaction) {
    const input = interaction.options.getString('url').trim();

    // Autocomplete submits the watch id; a pasted URL is matched as well.
    let identifier = input;
    if (!/^\d{1,9}$/.test(input)) {
      try {
        identifier = watcher.normalizeUrl(input).toString();
      }
      catch {
        // fall through with the raw text; it just won't match anything
      }
    }

    const removed = await db.removeWatch(interaction.user.id, identifier);
    if (!removed) {
      return interaction.reply({
        content: 'You aren\'t watching that page.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const name = removed.title ? `**${removed.title.slice(0, 100)}**` : removed.url;
    return interaction.reply({
      content: `Stopped watching ${name}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
