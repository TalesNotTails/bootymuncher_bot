const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Show your level and XP')
    .addUserOption((option) => option.setName('user').setDescription('User to check')),
  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const { xp, level } = await db.getUser(target.id, interaction.guild.id);
    const nextLevelXp = db.xpForLevel(level + 1);
    await interaction.reply(`${target.username} is level ${level} with ${xp} XP (${nextLevelXp} XP to next level).`);
  },
};
