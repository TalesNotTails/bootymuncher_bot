const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top 10 users by XP'),
  async execute(interaction) {
    const rows = await db.getLeaderboard(interaction.guild.id);
    if (rows.length === 0) {
      await interaction.reply('No one has earned XP yet!');
      return;
    }
    const lines = await Promise.all(rows.map(async (row, i) => {
      let name = row.user_id;
      try {
        const user = await interaction.client.users.fetch(row.user_id);
        name = user.username;
      }
      catch {
        // keep the raw user id as the display name
      }
      return `${i + 1}. ${name} — level ${row.level}, ${row.xp} XP`;
    }));
    await interaction.reply(lines.join('\n'));
  },
};
