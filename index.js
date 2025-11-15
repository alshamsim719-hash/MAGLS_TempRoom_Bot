const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const config = require("./config.json");

const CONTROL_PANEL_CHANNEL_ID = "1439244974842449960"; // ⭐ روم لوحة التحكم الثابتة

// ===== Client Setup =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

console.log("🚀 Starting MAGLS Temp Room Bot...");

// Temp Room Maps
const roomsByOwner = new Map();
const roomsByVoiceId = new Map();

client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ===== Create Temp Room =====
async function createTempRoom(member, lobbyChannel) {
  const guild = member.guild;

  if (roomsByOwner.has(member.id)) {
    const info = roomsByOwner.get(member.id);
    const existing = guild.channels.cache.get(info.voiceChannelId);
    if (existing) {
      await member.voice.setChannel(existing).catch(() => {});
      return info;
    }
  }

  const parentId =
    config.categoryId && config.categoryId !== "null"
      ? config.categoryId
      : lobbyChannel.parentId;

  const displayName = member.displayName || member.user.username;

  // ===== Create Temp Voice Channel =====
  const voiceChannel = await guild.channels.create({
    name: `👑・MAGLS — ${displayName}`,
    type: ChannelType.GuildVoice,
    parent: parentId || null,
    permissionOverwrites: [
      {
        id: guild.roles.everyone,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak,
        ],
      },
      {
        id: member.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak,
          PermissionsBitField.Flags.MuteMembers,
          PermissionsBitField.Flags.DeafenMembers,
          PermissionsBitField.Flags.MoveMembers,
          PermissionsBitField.Flags.ManageChannels,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak,
          PermissionsBitField.Flags.MuteMembers,
          PermissionsBitField.Flags.DeafenMembers,
          PermissionsBitField.Flags.MoveMembers,
          PermissionsBitField.Flags.ManageChannels,
        ],
      },
    ],
  });

  const info = {
    guildId: guild.id,
    ownerId: member.id,
    voiceChannelId: voiceChannel.id,
  };

  roomsByOwner.set(member.id, info);
  roomsByVoiceId.set(voiceChannel.id, info);

  await member.voice.setChannel(voiceChannel).catch(() => {});

  // Send panel into fixed control panel room
  setTimeout(() => {
    sendControlPanel(member, voiceChannel);
  }, 1000);

  return info;
}

// ===== Send Control Panel to Fixed Channel =====
async function sendControlPanel(owner, voiceChannel) {
  const channel = await owner.guild.channels.fetch(CONTROL_PANEL_CHANNEL_ID).catch(() => null);

  if (!channel)
    return console.error("❌ Cannot find control panel channel.");

  const embed = new EmbedBuilder()
    .setTitle("👑 لوحة تحكم الروم المؤقت")
    .setDescription(
      [
        `الروم الخاص بـ **${owner.displayName}**`,
        `🎤 رومك الصوتي: <#${voiceChannel.id}>`,
        "",
        "🔇 **Mute All**",
        "🔊 **Unmute All**",
        "🔒 **Lock Room**",
        "🔓 **Unlock Room**",
        "👁 **Hide Room**",
        "💬 **Show Room**",
        "🚫 **Kick All**",
        "❌ **Close Room**",
      ].join("\n")
    )
    .setColor(0xf1c40f);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mute_${voiceChannel.id}`)
      .setLabel("Mute All")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔇"),

    new ButtonBuilder()
      .setCustomId(`unmute_${voiceChannel.id}`)
      .setLabel("Unmute All")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🔊")
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lock_${voiceChannel.id}`)
      .setLabel("Lock")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔒"),

    new ButtonBuilder()
      .setCustomId(`unlock_${voiceChannel.id}`)
      .setLabel("Unlock")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔓")
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hide_${voiceChannel.id}`)
      .setLabel("Hide")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("👁"),

    new ButtonBuilder()
      .setCustomId(`show_${voiceChannel.id}`)
      .setLabel("Show Room")
      .setStyle(ButtonStyle.Secondary)
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`kick_${voiceChannel.id}`)
      .setLabel("Kick All")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🚫"),

    new ButtonBuilder()
      .setCustomId(`close_${voiceChannel.id}`)
      .setLabel("Close Room")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌")
  );

  await channel.send({
    content: `👑 **${owner}** تحكم برومك الصوتي: <#${voiceChannel.id}>`,
    embeds: [embed],
    components: [row1, row2, row3, row4],
  });
}

// ===== Delete Temp Room =====
async function deleteTempRoom(info) {
  try {
    const guild = client.guilds.cache.get(info.guildId);
    if (!guild) return;

    const voiceChannel = guild.channels.cache.get(info.voiceChannelId);

    if (voiceChannel) await voiceChannel.delete().catch(() => {});

    roomsByOwner.delete(info.ownerId);
    roomsByVoiceId.delete(info.voiceChannelId);

    console.log(`🗑️ Temp room deleted for owner ${info.ownerId}`);
  } catch {}
}

// ===== Voice State =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    const guild = newState.guild || oldState.guild;
    if (!guild || guild.id !== config.guildId) return;

    const lobbyId = config.lobbyVoiceChannelId;

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    if (newChannelId === lobbyId && oldChannelId !== lobbyId) {
      const member = newState.member;
      if (!member || member.user.bot) return;
      await createTempRoom(member, newState.channel);
      return;
    }

    if (oldChannelId && roomsByVoiceId.has(oldChannelId)) {
      const info = roomsByVoiceId.get(oldChannelId);
      if (!oldState.channel) return;

      const nonBotMembers = oldState.channel.members.filter(
        (m) => !m.user.bot
      );

      if (nonBotMembers.size === 0) {
        await deleteTempRoom(info);
      }
    }
  } catch (err) {
    console.error("Error in voiceStateUpdate:", err);
  }
});

// ===== Interaction Handler =====
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const id = interaction.customId.split("_");
  const action = id[0];
  const voiceId = id[1];

  const voiceChannel = interaction.guild.channels.cache.get(voiceId);
  if (!voiceChannel)
    return interaction.reply({ content: "❌ الروم غير موجود.", ephemeral: true });

  const member = interaction.guild.members.cache.get(interaction.user.id);
  const info = roomsByOwner.get(member.id);

  if (!info || info.voiceChannelId !== voiceChannel.id) {
    return interaction.reply({
      content: "❌ لا يمكنك التحكم بهذا الروم، لأنه ليس رومك.",
      ephemeral: true,
    });
  }

  const everyone = interaction.guild.roles.everyone;

  switch (action) {
    case "mute":
      voiceChannel.members.forEach((m) => {
        if (m.id !== info.ownerId && !m.user.bot)
          m.voice.setMute(true).catch(() => {});
      });
      return interaction.reply({ content: "🔇 تم كتم الجميع.", ephemeral: true });

    case "unmute":
      voiceChannel.members.forEach((m) => {
        if (!m.user.bot) m.voice.setMute(false).catch(() => {});
      });
      return interaction.reply({ content: "🔊 تم فك الكتم.", ephemeral: true });

    case "lock":
      await voiceChannel.permissionOverwrites.edit(everyone, { Connect: false });
      return interaction.reply({ content: "🔒 تم قفل الروم.", ephemeral: true });

    case "unlock":
      await voiceChannel.permissionOverwrites.edit(everyone, { Connect: true });
      return interaction.reply({ content: "🔓 تم فتح الروم.", ephemeral: true });

    case "hide":
      await voiceChannel.permissionOverwrites.edit(everyone, { ViewChannel: false });
      return interaction.reply({ content: "👁 تم إخفاء الروم.", ephemeral: true });

    case "show":
      await voiceChannel.permissionOverwrites.edit(everyone, { ViewChannel: true });
      return interaction.reply({ content: "💬 تم إظهار الروم.", ephemeral: true });

    case "kick":
      voiceChannel.members.forEach((m) => {
        if (m.id !== info.ownerId && !m.user.bot)
          m.voice.disconnect().catch(() => {});
      });
      return interaction.reply({ content: "🚫 تم طرد الجميع.", ephemeral: true });

    case "close":
      await interaction.reply({ content: "❌ تم حذف الروم.", ephemeral: true });
      await deleteTempRoom(info);
      return;
  }
});

// ===== Login =====
client.login(config.token);
