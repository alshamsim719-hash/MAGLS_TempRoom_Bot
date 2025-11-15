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

// تخزين بيانات كل الرومات المؤقتة
const roomsByOwner = new Map();
const roomsByVoiceId = new Map();
const roomsByTextId = new Map();

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// إنشاء روم مؤقت + روم تحكم
async function createTempRoom(member, lobbyChannel) {
  const guild = member.guild;

  // لو عنده روم جاهز
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

  // إنشاء الروم الصوتي
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
        allow: [PermissionsBitField.Flags.Administrator],
      },
    ],
  });

  // إنشاء روم كتابي ملاصق
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
          PermissionsBitField.Flags.ManageMessages,
        ],
      },
      {
        id: client.user.id,
        allow: [PermissionsBitField.Flags.Administrator],
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

  await sendControlPanel(textChannel, member, voiceChannel);

  return info;
}

// لوحة التحكم
async function sendControlPanel(textChannel, owner, voiceChannel) {
  const embed = new EmbedBuilder()
    .setTitle("👑 لوحة تحكم الروم")
    .setDescription(
      [
        `الروم الخاص بـ **${owner.displayName}**`,
        "",
        "🔇 Mute All — كتم جميع الموجودين",
        "🔊 Unmute All — فك الكتم للجميع",
        "🔒 Lock — قفل الروم",
        "🔓 Unlock — فتح الروم",
        "👁️ Hide — إخفاء الروم",
        "👁️‍🗨️ Show — إظهار الروم",
        "🚫 Kick All — طرد الجميع",
        "❌ Close — إغلاق و حذف الروم",
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
      .setEmoji("👁️‍🗨️")
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

  await textChannel.send({
    content: `👑 **${owner}** هذه لوحة التحكم الخاصة برومك: <#${voiceChannel.id}>`,
    embeds: [embed],
    components: [row1, row2, row3, row4],
  });
}

// حذف روم مؤقت
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
  } catch (err) {
    console.error("Error deleting temp room:", err);
  }
}

// دخول / خروج الصوت
client.on("voiceStateUpdate", async (oldState, newState) => {
  const guild = newState.guild;

  if (!guild || guild.id !== config.guildId) return;

  const lobbyId = config.lobbyVoiceChannelId;

  // عضو دخل اللوبي
  if (!oldState.channelId && newState.channelId === lobbyId) {
    const member = newState.member;
    if (!member || member.user.bot) return;

    const lobbyChannel = newState.channel;
    await createTempRoom(member, lobbyChannel);
    return;
  }

  // خرج من روم مؤقت → احذفه إذا صار فاضي
  if (
    oldState.channelId &&
    roomsByVoiceId.has(oldState.channelId) &&
    oldState.channel
  ) {
    const info = roomsByVoiceId.get(oldState.channelId);

    const nonBotMembers = oldState.channel.members.filter(
      (m) => !m.user.bot
    );

    if (nonBotMembers.size === 0) {
      await deleteTempRoom(info);
    }
  }
});

// أزرار التحكم
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const info = roomsByTextId.get(interaction.channelId);
  if (!info) return;

  if (interaction.user.id !== info.ownerId) {
    return interaction.reply({
      content: "❌ هذي اللوحة خاصة بصاحب الروم فقط.",
      ephemeral: true,
    });
  }

  const guild = interaction.guild;
  const voiceChannel = guild.channels.cache.get(info.voiceChannelId);

  if (!voiceChannel) {
    return interaction.reply({
      content: "⚠️ الروم الصوتي غير موجود.",
      ephemeral: true,
    });
  }

  const everyone = guild.roles.everyone;

  switch (interaction.customId) {
    case "room_mute_all":
      voiceChannel.members.forEach((m) => {
        if (m.id === info.ownerId) return;
        if (!m.user.bot) m.voice.setMute(true).catch(() => {});
      });
      interaction.reply({ content: "🔇 تم كتم الجميع.", ephemeral: true });
      break;

    case "room_unmute_all":
      voiceChannel.members.forEach((m) => {
        if (!m.user.bot) m.voice.setMute(false).catch(() => {});
      });
      interaction.reply({ content: "🔊 تم فك الكتم.", ephemeral: true });
      break;

    case "room_lock":
      voiceChannel.permissionOverwrites.edit(everyone, {
        Connect: false,
      });
      interaction.reply({
        content: "🔒 تم قفل الروم.",
        ephemeral: true,
      });
      break;

    case "room_unlock":
      voiceChannel.permissionOverwrites.edit(everyone, {
        Connect: true,
      });
      interaction.reply({
        content: "🔓 تم فتح الروم.",
        ephemeral: true,
      });
      break;

    case "room_hide":
      voiceChannel.permissionOverwrites.edit(everyone, {
        ViewChannel: false,
      });
      interaction.reply({
        content: "👁️ تم إخفاء الروم.",
        ephemeral: true,
      });
      break;

    case "room_show":
      voiceChannel.permissionOverwrites.edit(everyone, {
        ViewChannel: true,
      });
      interaction.reply({
        content: "👁️‍🗨️ تم إظهار الروم.",
        ephemeral: true,
      });
      break;

    case "room_kick_all":
      voiceChannel.members.forEach((m) => {
        if (m.id !== info.ownerId && !m.user.bot)
          m.voice.disconnect().catch(() => {});
      });
      interaction.reply({
        content: "🚫 تم طرد الجميع.",
        ephemeral: true,
      });
      break;

    case "room_close":
      interaction.reply({
        content: "❌ تم إغلاق الروم وحذفه.",
        ephemeral: true,
      });
      deleteTempRoom(info);
      break;
  }
});

client.login(config.token);
