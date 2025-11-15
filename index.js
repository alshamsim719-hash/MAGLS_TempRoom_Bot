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

// ✅ إنشاء العميل
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

// ✅ تخزين بيانات الرومات المؤقتة
// ownerId -> info
const roomsByOwner = new Map();
// voiceChannelId -> info
const roomsByVoiceId = new Map();
// textChannelId -> info
const roomsByTextId = new Map();

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ✅ دالة إرسال آمن مع إعادة المحاولة
async function safeSend(textChannel, data, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      if (!textChannel) throw new Error("No textChannel");
      const perms = textChannel.permissionsFor(textChannel.guild.members.me);
      if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages)) {
        throw new Error("Missing SendMessages permission");
      }
      return await textChannel.send(data);
    } catch (err) {
      console.log(`⚠️ Control panel send retry ${i + 1} failed: ${err.message}`);
      if (i === tries - 1) {
        console.error("❌ Failed to send control panel after retries.");
        return null;
      }
      await new Promise((res) => setTimeout(res, 700));
    }
  }
}

// ✅ إنشاء روم مؤقت + روم تحكم
async function createTempRoom(member, lobbyChannel) {
  const guild = member.guild;

  // لو عنده روم جاهز مسبقاً → نرجّعه لنفس الروم
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

  // ✅ إنشاء الروم الصوتي 👑・MAGLS — {name}
  const voiceChannel = await guild.channels.create({
    name: `👑・MAGLS — ${displayName}`,
    type: ChannelType.GuildVoice,
    parent: parentId || null,
    permissionOverwrites: [
      // الكل يستطيع يشوف ويدخل ويتكلم (صاحب الروم يسيطر من اللوحة)
      {
        id: guild.roles.everyone,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak,
        ],
      },
      // صاحب الروم يحصل صلاحيات عالية داخل هذا الروم فقط
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
      // البوت صلاحيات كاملة داخل الروم
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

  // ✅ إنشاء روم كتابي ملاصق 💬・MAGLS — {name}
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

  // ✅ نقل العضو للروم الجديد
  await member.voice.setChannel(voiceChannel).catch(() => {});

  // ✅ إرسال لوحة التحكم بعد تأخير بسيط (إصلاح مشاكل Replit / Discord)
  setTimeout(async () => {
    try {
      await sendControlPanel(textChannel, member, voiceChannel);
    } catch (err) {
      console.error("Error sending control panel:", err);
    }
  }, 1200);

  return info;
}

// ✅ لوحة التحكم
async function sendControlPanel(textChannel, owner, voiceChannel) {
  if (!textChannel) return;

  const embed = new EmbedBuilder()
    .setTitle("👑 لوحة تحكم الروم المؤقت")
    .setDescription(
      [
        `الروم الخاص بـ **${owner.displayName || owner.user.username}**`,
        "",
        "🔇 **Mute All** — كتم جميع الموجودين (عدا صاحب الروم).",
        "🔊 **Unmute All** — فك الكتم عن الجميع.",
        "🔒 **Lock Room** — قفل الروم ومنع دخول أعضاء جدد.",
        "🔓 **Unlock Room** — فتح الروم والسماح بالدخول.",
        "👁️ **Hide Room** — إخفاء الروم عن الجميع.",
        "👁️‍🗨️ **Show Room** — إظهار الروم للجميع.",
        "🚫 **Kick All** — طرد كل الموجودين من الروم (عدا صاحب الروم).",
        "❌ **Close Room** — حذف الروم الصوتي والكتابي بالكامل.",
      ].join("\n")
    )
    .setColor(0xf1c40f)
    .setFooter({ text: "MAGLS Temporary Rooms System" });

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

  await safeSend(textChannel, {
    content: `👑 **${owner}** هذه لوحة التحكم الخاصة برومك الصوتي: <#${voiceChannel.id}>`,
    embeds: [embed],
    components: [row1, row2, row3, row4],
  });
}

// ✅ حذف روم مؤقت
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
  } catch (err) {
    console.error("Error deleting temp room:", err);
  }
}

// ✅ دخول / خروج الصوت
client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    const guild = newState.guild || oldState.guild;
    if (!guild || guild.id !== config.guildId) return;

    const lobbyId = config.lobbyVoiceChannelId;

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    // عضو دخل اللوبي من أي مكان
    if (newChannelId === lobbyId && oldChannelId !== lobbyId) {
      const member = newState.member;
      if (!member || member.user.bot) return;
      const lobbyChannel = newState.channel;
      await createTempRoom(member, lobbyChannel);
      return;
    }

    // عضو خرج من روم مؤقت → نحذف لو صار فاضي
    if (oldChannelId && roomsByVoiceId.has(oldChannelId) && oldState.channel) {
      const info = roomsByVoiceId.get(oldChannelId);
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

// ✅ أزرار لوحة التحكم
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isButton()) return;

    const info = roomsByTextId.get(interaction.channelId);
    if (!info) return;

    // 💎 حماية قوية: فقط صاحب الروم يقدر يستخدم اللوحة
    if (interaction.user.id !== info.ownerId) {
      return interaction.reply({
        content: "❌ هذه اللوحة خاصة بصاحب الروم فقط.",
        ephemeral: true,
      });
    }

    const guild = interaction.guild;
    if (!guild) return;

    const voiceChannel = guild.channels.cache.get(info.voiceChannelId);
    if (!voiceChannel) {
      return interaction.reply({
        content: "⚠️ الروم الصوتي غير موجود، ربما تم حذفه.",
        ephemeral: true,
      });
    }

    const everyone = guild.roles.everyone;

    switch (interaction.customId) {
      case "room_mute_all":
        voiceChannel.members.forEach((m) => {
          if (m.id === info.ownerId) return;
          if (m.user.bot) return;
          m.voice.setMute(true, "Owner used Mute All").catch(() => {});
        });
        await interaction.reply({
          content: "🔇 تم كتم جميع من في الروم (عدا صاحب الروم).",
          ephemeral: true,
        });
        break;

      case "room_unmute_all":
        voiceChannel.members.forEach((m) => {
          if (m.user.bot) return;
          m.voice.setMute(false, "Owner used Unmute All").catch(() => {});
        });
        await interaction.reply({
          content: "🔊 تم فك الكتم عن الجميع.",
          ephemeral: true,
        });
        break;

      case "room_lock":
        await voiceChannel.permissionOverwrites.edit(everyone, {
          Connect: false,
        });
        await interaction.reply({
          content: "🔒 تم قفل الروم ومنع دخول أعضاء جدد.",
          ephemeral: true,
        });
        break;

      case "room_unlock":
        await voiceChannel.permissionOverwrites.edit(everyone, {
          Connect: true,
        });
        await interaction.reply({
          content: "🔓 تم فتح الروم والسماح بالدخول.",
          ephemeral: true,
        });
        break;

      case "room_hide":
        await voiceChannel.permissionOverwrites.edit(everyone, {
          ViewChannel: false,
        });
        await interaction.reply({
          content: "👁️ تم إخفاء الروم عن الجميع.",
          ephemeral: true,
        });
        break;

      case "room_show":
        await voiceChannel.permissionOverwrites.edit(everyone, {
          ViewChannel: true,
        });
        await interaction.reply({
          content: "👁️‍🗨️ تم إظهار الروم للجميع.",
          ephemeral: true,
        });
        break;

      case "room_kick_all":
        voiceChannel.members.forEach((m) => {
          if (m.id === info.ownerId) return;
          if (m.user.bot) return;
          m.voice.disconnect("Owner used Kick All").catch(() => {});
        });
        await interaction.reply({
          content: "🚫 تم طرد كل الموجودين من الروم (عدا صاحب الروم).",
          ephemeral: true,
        });
        break;

      case "room_close":
        await interaction.reply({
          content: "❌ تم إغلاق الروم وحذفه بالكامل.",
          ephemeral: true,
        });
        await deleteTempRoom(info);
        break;
    }
  } catch (err) {
    console.error("Error in interactionCreate:", err);
    if (interaction.isRepliable()) {
      interaction
        .reply({
          content: "حدث خطأ أثناء تنفيذ العملية.",
          ephemeral: true,
        })
        .catch(() => {});
    }
  }
});

// ✅ تسجيل الدخول
client.login(config.token);
