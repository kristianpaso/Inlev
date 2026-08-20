import { ACCOUNT_KEY, SESSION_KEY, readJson } from "./storage.js";

export function accounts() {
  return readJson(ACCOUNT_KEY, []);
}

function createMemberCode() {
  const digits = String(Math.floor(10000 + Math.random() * 90000));
  const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  return `#${digits}-${letters}`;
}

export function ensureMemberCode(account) {
  if (!account) return "";
  if (account.memberCode) return account.memberCode;
  const cacheKey = `bigplus_member_code:${account.id}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    account.memberCode = cached;
    return cached;
  }
  const code = createMemberCode();
  localStorage.setItem(cacheKey, code);
  account.memberCode = code;
  return code;
}

export function ensureDemoAccount() {
  const list = accounts();
  if (list.some((account) => account.email === "admin")) return;
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify([...list, {
    id: "demo-admin",
    email: "admin",
    password: "Admin",
    name: "Admin Paso"
  }]));
}

export function currentAccount() {
  const id = localStorage.getItem(SESSION_KEY) || localStorage.getItem("inlev_user");
  return accounts().find((account) => account.id === id) || null;
}
