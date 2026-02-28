// src/lib/api.js
// Tauri IPC wrapper – all backend communication goes through here

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";

// ================= CORE WRAPPERS =================

// IMPORTANT:
// Always return the real Promise.
// Do NOT wrap in try/catch that returns null.
// Let the caller handle .catch().

function invoke(cmd, args = {}) {
  return tauriInvoke(cmd, args);
}

function listen(event, handler) {
  return tauriListen(event, (e) => handler(e.payload));
}

// ================= INITIALIZATION =================
export const initApp = () => invoke("init_app");

// ================= USER =================
export const createUser = (username, avatarPath = null, bio = null, designation = null) =>
  invoke("create_user", {
    input: { username, avatar_path: avatarPath, bio, designation },
  });

export const getUser = (id) => invoke("get_user", { id });
export const getAllUsers = () => invoke("get_all_users");
export const getLocalUser = () => invoke("get_local_user");
export const saveAvatar = (imageData) => invoke("save_avatar", { imageData });
export const deleteUser = (userId) => invoke("delete_user", { userId });

// ================= MESSAGES =================
export const sendMessage = (receiverId, content, messageType = "text", filePath = null) =>
  invoke("send_message", {
    input: {
      receiver_id: receiverId,
      content,
      message_type: messageType,
      file_path: filePath,
    },
  });

export const getMessages = (peerId, limit = 100) =>
  invoke("get_messages", { peerId, limit });

export const getMessagesPaginated = (peerId, before = null, limit = 50) =>
  invoke("get_messages_paginated", { peerId, before, limit });

export const getNewMessagesSince = (peerId, since) =>
  invoke("get_new_messages_since", { peerId, since });

export const markMessageRead = (messageId) =>
  invoke("mark_message_read", { messageId });

export const markMessagesReadFromPeer = (peerId) =>
  invoke("mark_messages_read_from_peer", { peerId });

export const getUnreadCount = () => invoke("get_unread_count");

export const getUnreadCountFromPeer = (peerId) =>
  invoke("get_unread_count_from_peer", { peerId });

export const getLastMessages = () => invoke("get_last_messages");

export const getSharedMedia = (peerId, mediaType = null) =>
  invoke("get_shared_media", { peerId, mediaType });

export const getUsersWithMessages = () =>
  invoke("get_users_with_messages");

export const deleteMessage = (messageId) =>
  invoke("delete_message", { messageId });

export const deleteAllMessagesWithPeer = (peerId) =>
  invoke("delete_all_messages_with_peer", { peerId });

// ================= CHAT RELAY =================
export const relayChatMessage = (
  peerId,
  messageId,
  content,
  messageType = "text",
  senderName = ""
) =>
  invoke("relay_chat_message", {
    peerId,
    messageId,
    content,
    messageType,
    senderName,
  });

export const markMessageDelivered = (messageId) =>
  invoke("mark_message_delivered", { messageId });

export const getUndeliveredMessagesForPeer = (peerId) =>
  invoke("get_undelivered_messages_for_peer", { peerId });

// ================= DISCOVERY =================
export const startDiscovery = (username, port) =>
  invoke("start_discovery", { username, port });

export const stopDiscovery = () => invoke("stop_discovery");
export const getPeers = () => invoke("get_peers");
export const getOnlinePeers = () => invoke("get_online_peers");

export const restartDiscovery = (username, port) =>
  invoke("restart_discovery", { username, port });

// ================= SIGNALING =================
export const startSignaling = (port = 45678) =>
  invoke("start_signaling", { port });

export const registerPeer = (peerId, ip, port) =>
  invoke("register_peer", { peerId, ip, port });

export const sendSignalingMessage = (peerId, message) =>
  invoke("send_signaling_message", { peerId, message });

// ================= ENCRYPTION =================
export const establishSession = (peerId, peerPublicKey) =>
  invoke("establish_session", { peerId, peerPublicKey });

export const encryptMessage = (peerId, message) =>
  invoke("encrypt_message", { peerId, message });

export const decryptMessage = (peerId, envelope) =>
  invoke("decrypt_message", { peerId, envelope });

export const getPublicKey = () => invoke("get_public_key");

// ================= FILE SERVER =================
export const storeSharedFile = (fileId, dataUrl, fileName) =>
  invoke("store_shared_file", { fileId, dataUrl, fileName });

export const getFileServerPort = () =>
  invoke("get_file_server_port");

export const readFileAsDataUrl = (fileId) =>
  invoke("read_file_as_data_url", { fileId, file_id: fileId });

// ================= FILE DOWNLOAD =================
export const autoDownloadFile = (
  url,
  senderName,
  fileName,
  fileType,
  messageId = null
) =>
  invoke("auto_download_file", {
    url,
    senderName,
    fileName,
    fileType,
    messageId,
  });

export const openFileLocation = (path) =>
  invoke("open_file_location", { path });

export const saveFileWithDialog = (url, defaultName) =>
  invoke("save_file_with_dialog", { url, defaultName });

export const renameUserDownloadFolder = (oldName, newName) =>
  invoke("rename_user_download_folder", { oldName, newName });

export const getDingoDownloadsBase = () =>
  invoke("get_dingo_downloads_base");

export const checkFileDownloaded = (
  senderName,
  fileName,
  fileType
) =>
  invoke("check_file_downloaded", {
    senderName,
    fileName,
    fileType,
  });

export const getLocalFileUrl = (fileId) =>
  invoke("get_local_file_url", { fileId });

export const getSharedFilePath = (fileId) =>
  invoke("get_shared_file_path", {
    fileId,
    file_id: fileId,
  });

// ================= SETTINGS =================
export const setSetting = (key, value) =>
  invoke("set_setting", { key, value });

export const getSetting = (key) =>
  invoke("get_setting", { key });

export const getAllSettings = () =>
  invoke("get_all_settings");

// ================= NOTIFICATIONS =================
export const toggleNotificationsMute = () =>
  invoke("toggle_notifications_mute");

export const isNotificationsMuted = () =>
  invoke("is_notifications_muted");

// ================= WINDOW =================
export const minimizeToTray = () =>
  invoke("minimize_to_tray");

export const showWindow = () =>
  invoke("show_window");

export const isWindowVisible = () =>
  invoke("is_window_visible");

// ================= UTILITY =================
export const getDeviceId = () =>
  invoke("get_device_id");

export const generateUuid = () =>
  invoke("generate_uuid");

export const getTimestamp = () =>
  invoke("get_timestamp");

// Disabled safely (backend command missing)
export const appendDevLog = () => Promise.resolve();

export const getDownloadsDir = () =>
  invoke("get_downloads_dir");

export const getStorageStats = () =>
  invoke("get_storage_stats");

export const upsertPeerUser = (
  deviceId,
  username,
  publicKey = null
) =>
  invoke("upsert_peer_user", {
    deviceId,
    username,
    publicKey,
  });

// ================= EVENTS =================
export const onPeerDiscovered = (handler) =>
  listen("peer-discovered", handler);

export const onPeerUpdated = (handler) =>
  listen("peer-updated", handler);

export const onPeerLost = (handler) =>
  listen("peer-lost", handler);

export const onSignalingMessage = (handler) =>
  listen("signaling-message", handler);

export const onChatMessageReceived = (handler) =>
  listen("chat-message-received", handler);

export const onUserDeleted = (handler) =>
  listen("user-deleted", handler);

export const onGroupCreated = (handler) =>
  listen("group-created", handler);

export const onGroupMessageReceived = (handler) =>
  listen("group-message-received", handler);

export const onMeetingChatReceived = (handler) =>
  listen("meeting-chat-received", handler);

export const onGroupMemberAdded = (handler) =>
  listen("group-member-added", handler);

export const onGroupMemberRemoved = (handler) =>
  listen("group-member-removed", handler);

export const onFileDownloadProgress = (handler) =>
  listen("file-download-progress", handler);

// ================= SCREEN CAPTURE =================
export const captureScreenPrimary = () =>
  invoke("capture_screen_primary");

export const captureScreen = (displayIndex = 0) =>
  invoke("capture_screen", { display_index: displayIndex });

export const listDisplays = () =>
  invoke("list_displays");