const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { EC2Client, DescribeInstancesCommand, StartInstancesCommand } = require('@aws-sdk/client-ec2');

module.exports = {
	data: new SlashCommandBuilder().setName('start_server').setDescription('Starts MC server specified in env vars'),
	async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const config = {};
      const ec2Client = new EC2Client(config);
      let input = {
        Filters: [
          {
            Name: 'tag:name',
            Values: [process.env.MC_INSTANCE_NAME]
          }
        ]
      };
      let command = new DescribeInstancesCommand(input);
      let response = await ec2Client.send(command);
      
      const allInstances = response.Reservations.flatMap(item => item.Instances);
      const uniqueInstances = [...new Set(allInstances)];

      if (uniqueInstances.length !== 1) {
        throw new Error(`Expected exactly 1 instance. Got ${uniqueInstances.length}`)
      } 

      const mcInstance = uniqueInstances[0]
      const startStates = ['stopping', 'stopped'];

      if (mcInstance.State.Name === 'running') {
        await interaction.editReply({
          content: 'Server already running!'
        });
      } else if (startStates.includes(mcInstance.State.Name)) {
        let input = {
          InstanceIds: [mcInstance.InstanceId]
        }
        let command = new StartInstancesCommand(input);
        let response = await ec2Client.send(command);

        console.log(mcInstance);

        await interaction.editReply({
          content: 'Server will be up in just a minute!'
        });
      }
    }
    catch (error) {
      console.error(error.message);
      throw error;
    }
	},
};
