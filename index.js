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
const roomsByTextId = new Map();

client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ===== Safe Sender With Retry =====
async function safeSend(textChannel, data, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      if (!textChannel) throw new Error("Channel not ready");

      const perms = textChannel.permissionsFor(
        textChannel.guild.members.me
      );
      if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages))
        throw new Error("Bot has no send permission");

      return await textChannel.send(data);
    } catch (err) {
      console.log(
        `⚠️ Control panel send retry ${i + 1} failed: ${err.message}`
      );

      if (i === tries - 1) {
        console.error("❌ Failed to send control panel after retries.");
        return null;
      }

      await new Promise((res) => setTimeout(res, 800));
    }
  }
}

// ===== Create Temp Room =====
async function createTempRoom(member, lobbyChannel) {
  const guild = member.guild;

  // if already has temp room
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

  // ===== Create Voice Channel =====
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
          PermissionsBitField.Flags.UseApplicationCommands,
        ],
      },
    ],
  });

  // ===== Create Text Channel =====
  const textChannel = await guild.channels.create({
    name: `💬・MAGLS — ${displayName}`,
    type: ChannelType.GuildText,
    parent: parentId || null,
    permissionOverwrites: [
      {
        id: guild.roles.everyone,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: member.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.EmbedLinks,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.UseApplicationCommands,
        ],
      },
    ],
  });

  const info = {
    guildId: guild.id,
    ownerId: member.id,
    voiceChannelId: voiceChannel.id,
    textChannelId: textChannel.id,
  };

  roomsByOwner.set(member.id, info);
  roomsByVoiceId.set(voiceChannel.id, info);
  roomsByTextId.set(textChannel.id, info);

  await member.voice.setChannel(voiceChannel).catch(() => {});

  // ===== Delay Before Sending Control Panel =====
  setTimeout(async () => {
    if (!textChannel) return;

    const perms = textChannel.permissionsFor(
      textChannel.guild.members.me
    );
    if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages)) {
      console.error("❌ Bot cannot send in text channel!");
      return;
    }

    await sendControlPanel(textChannel, member, voiceChannel);
  }, 2000);

  return info;
}

// ===== Control Panel =====
async function sendControlPanel(textChannel, owner, voiceChannel) {
  const embed = new EmbedBuilder()
    .setTitle("👑 لوحة تحكم الروم المؤقت")
    .setDescription(
      [
        `الروم الخاص بـ **${owner.displayName}**`,
        "",
        "🔇 **Mute All** — كتم الجميع",
        "🔊 **Unmute All** — فك الكتم",
        "🔒 **Lock Room** — قفل الروم",
        "🔓 **Unlock Room** — فتح الروم",
        "👁️ **Hide Room** — إخفاء الروم",
        "💬 **Show Room** — إظهار الروم",
        "🚫 **Kick All** — طرد الجميع",
        "❌ **Close Room** — حذف الروم",
      ].join("\n")
    )
    .setColor(0xf1c40f);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("room_mute_all")
      .setLabel("Mute All")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔇"),
    new ButtonBuilder()
      .setCustomId("room_unmute_all")
      .setLabel("Unmute All")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🔊")
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("room_lock")
      .setLabel("Lock Room")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔒"),
    new ButtonBuilder()
      .setCustomId("room_unlock")
      .setLabel("Unlock Room")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔓")
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("room_hide")
      .setLabel("Hide Room")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("👁️"),
    new ButtonBuilder()
      .setCustomId("room_show")
      .setLabel("Show Room")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("💬")
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("room_kick_all")
      .setLabel("Kick All")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🚫"),
    new ButtonBuilder()
      .setCustomId("room_close")
      .setLabel("Close Room")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌")
  );

  await safeSend(textChannel, {
    content: `👑 **${owner}** هذه لوحة التحكم الخاصة برومك الصوتي: <#${voiceChannel.id}>`,
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
    const textChannel = guild.channels.cache.get(info.textChannelId);

    if (voiceChannel) await voiceChannel.delete().catch(() => {});
    if (textChannel) await textChannel.delete().catch(() => {});

    roomsByOwner.delete(info.ownerId);
    roomsByVoiceId.delete(info.voiceChannelId);
    roomsByTextId.delete(info.textChannelId);

    console.log(`🗑️ Temp room deleted for owner ${info.ownerId}`);
  } catch {}
}

// ===== Voice State Handler =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    const guild = newState.guild || oldState.guild;
    if (!guild || guild.id !== config.guildId) return;

    const lobbyId = config.lobbyVoiceChannelId;

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    // Member entered lobby
    if (newChannelId === lobbyId && oldChannelId !== lobbyId) {
      const member = newState.member;
      if (!member || member.user.bot) return;
      const lobbyChannel = newState.channel;
      await createTempRoom(member, lobbyChannel);
      return;
    }

    // Member left temp room
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

// ===== Button Interactions =====
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isButton()) return;

    const info = roomsByTextId.get(interaction.channelId);
    if (!info) return;

    if (interaction.user.id !== info.ownerId) {
      return interaction.reply({
        content: "❌ هذه اللوحة خاصة بصاحب الروم فقط.",
        ephemeral: true,
      });
    }

    const guild = interaction.guild;
    const voiceChannel = guild.channels.cache.get(info.voiceChannelId);

    if (!voiceChannel) {
      return interaction.reply({
        content: "❌ الروم الصوتي غير موجود.",
        ephemeral: true,
      });
    }

    const everyone = guild.roles.everyone;

    switch (interaction.customId) {
      case "room_mute_all":
        voiceChannel.members.forEach((m) => {
          if (m.id !== info.ownerId && !m.user.bot)
            m.voice.setMute(true).catch(() => {});
        });
        return interaction.reply({
          content: "🔇 تم كتم الجميع.",
          ephemeral: true,
        });

      case "room_unmute_all":
        voiceChannel.members.forEach((m) => {
          if (!m.user.bot) m.voice.setMute(false).catch(() => {});
        });
        return interaction.reply({
          content: "🔊 تم فك الكتم.",
          ephemeral: true,
        });

      case "room_lock":
        await voiceChannel.permissionOverwrites.edit(everyone, {
          Connect: false,
        });
        return interaction.reply({
          content: "🔒 تم قفل الروم.",
          ephemeral: true,
        });

      case "room_unlock":
        await voiceChannel.permissionOverwrites.edit(everyone, {
          Connect: true,
        });
        return interaction.reply({
          content: "🔓 تم فتح الروم.",
          ephemeral: true,
        });

      case "room_hide":
        await voiceChannel.permissionOverwrites.edit(everyone, {
          ViewChannel: false,
        });
        return interaction.reply({
          content: "👁️ تم إخفاء الروم.",
          ephemeral: true,
        });

      case "room_show":
        await voiceChannel.permissionOverwrites.edit(everyone, {
          ViewChannel: true,
        });
        return interaction.reply({
          content: "💬 تم إظهار الروم.",
          ephemeral: true,
        });

      case "room_kick_all":
        voiceChannel.members.forEach((m) => {
          if (m.id !== info.ownerId && !m.user.bot)
            m.voice.disconnect().catch(() => {});
        });
        return interaction.reply({
          content: "🚫 تم طرد الجميع.",
          ephemeral: true,
        });

      case "room_close":
        await interaction.reply({
          content: "❌ تم حذف الروم بالكامل.",
          ephemeral: true,
        });
        await deleteTempRoom(info);
        return;
    }
  } catch (err) {
    console.error("Error in interactionCreate:", err);
  }
});

// ===== Login =====
client.login(config.token);
