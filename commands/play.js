const { spawn } = require('node:child_process');
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  StreamType,
  AudioPlayerStatus,
  VoiceConnectionStatus,
} = require('@discordjs/voice');

const YT_REGEX = /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;

// One player/process per guild
const sessions = new Map();

function stopSession(guildId) {
  const session = sessions.get(guildId);
  if (!session) return;
  sessions.delete(guildId);
  session.player.removeAllListeners();
  session.player.stop(true);
  session.proc.kill('SIGKILL');
  session.connection.destroy();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play audio from a YouTube link in your voice channel')
    .addStringOption((option) =>
      option.setName('url').setDescription('YouTube link').setRequired(true)),
  async execute(interaction) {
    const url = interaction.options.getString('url');
    if (!YT_REGEX.test(url)) {
      return interaction.reply({ content: 'Please provide a valid YouTube link.', flags: MessageFlags.Ephemeral });
    }
    const channel = interaction.member?.voice?.channel;
    if (!channel) {
      return interaction.reply({ content: 'You need to be in a voice channel first.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();
    const guildId = interaction.guildId;
    stopSession(guildId);

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 15000);
    }
    catch {
      connection.destroy();
      return interaction.editReply('Could not join the voice channel.');
    }

    // yt-dlp writes best audio to stdout; ffmpeg (via prism) decodes it
    const proc = spawn('yt-dlp', ['-f', 'bestaudio/best', '--no-playlist', '-q', '-o', '-', '--', url], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stderr.on('data', (d) => console.error(`[yt-dlp] ${d}`));
    proc.on('error', (err) => console.error('Failed to start yt-dlp:', err));

    const player = createAudioPlayer();
    const session = { connection, player, proc };
    sessions.set(guildId, session);

    const cleanup = () => {
      if (sessions.get(guildId) === session) stopSession(guildId);
    };
    player.on(AudioPlayerStatus.Idle, cleanup);
    player.on('error', (err) => {
      console.error(err);
      cleanup();
    });
    connection.on(VoiceConnectionStatus.Disconnected, cleanup);

    player.play(createAudioResource(proc.stdout, { inputType: StreamType.Arbitrary }));
    connection.subscribe(player);

    return interaction.editReply(`Now playing in ${channel}: ${url}`);
  },
};
