const profileMount = document.getElementById("profileViewMount");
const profileUrl = "/bigplus/profile-view.html?v=20260903-profile-partial-1";

try {
  const response = await fetch(profileUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Profile partial failed: ${response.status}`);
  const markup = await response.text();
  if (profileMount) profileMount.outerHTML = markup;
} catch (error) {
  console.error("Could not load Profile view", error);
}

await import("./app-shell.js?v=20260903-profile-partial-1");
