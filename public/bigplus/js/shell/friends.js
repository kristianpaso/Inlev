import { FRIENDS_KEY, FRIEND_REQUESTS_KEY, readJson } from "./storage.js";
import { currentAccount } from "./account.js";

export function friendIds(accountId = currentAccount()?.id) {
  return accountId ? readJson(`${FRIENDS_KEY}:${accountId}`, []) : [];
}

export function setFriendIds(accountId, ids) {
  if (!accountId) return;
  localStorage.setItem(`${FRIENDS_KEY}:${accountId}`, JSON.stringify([...new Set(ids)]));
}

export function friendRequests(accountId = currentAccount()?.id) {
  return accountId
    ? readJson(`${FRIEND_REQUESTS_KEY}:${accountId}`, [])
      .filter((request) => request && request.toId === accountId && request.fromId && request.fromId !== accountId)
    : [];
}

export function setFriendRequests(accountId, requests) {
  if (!accountId) return;
  localStorage.setItem(`${FRIEND_REQUESTS_KEY}:${accountId}`, JSON.stringify(requests));
}

export function pendingFriendRequest(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return false;
  return friendRequests(toId).some((request) => request.fromId === fromId && request.status === "pending");
}
