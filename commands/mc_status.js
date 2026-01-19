const { SlashCommandBuilder, MessageFlags } = require('discord.js')
const { status } = require('minecraft-server-util');

module.exports = {
  data: new SlashCommandBuilder().setName('mc_status').setDescription('Gets Minecraft Server Status'),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
      const response = await status(process.env.MC_SERVER, 25565);
      await interaction.editReply({
        content: `✅ Server is online!\n` +
                 `Players: ${response.players.online}/${response.players.max}\n` +
                 `Version: ${response.version.name}`
      });
    } catch (error) {
      await interaction.editReply('❌ Server is offline or unreachable');
    }
  }
}
