/* Android APK releases only. Web/PWA visitors never see the updater. */
function releaseCode(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag || '');
  if (!match) return null;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (!Number.isSafeInteger(major) || major > 2147 || minor > 999 || patch > 999) return null;
  const code = major * 1000000 + minor * 1000 + patch;
  return code > 0 && code <= 2147483647 ? code : null;
}
function selectUpdate(releases, installedCode) {
  if (!Array.isArray(releases) || !Number.isSafeInteger(installedCode)) return null;
  return releases.filter(r => {
    const code = releaseCode(r.tag_name), name = `parkmap-${r.tag_name}.apk`;
    const asset = r.assets?.find(a => a.name === name);
    const expected = `https://github.com/Jeremy8776/parkmap/releases/download/${r.tag_name}/${name}`;
    return !r.draft && code > installedCode && asset?.browser_download_url === expected &&
      /^sha256:[a-f0-9]{64}$/i.test(asset.digest || '') && asset.size >= 1000000 && asset.size <= 80000000;
  }).sort((a, b) => releaseCode(b.tag_name) - releaseCode(a.tag_name))[0] || null;
}

(function () {
  const cap = window.Capacitor;
  if (!cap || cap.getPlatform?.() !== 'android' || !cap.nativePromise) return;
  const native = (method, options = {}) => cap.nativePromise('ParkMapUpdate', method, options);
  async function check() {
    try {
      const [{ versionCode }, response] = await Promise.all([
        native('getVersion'), fetch('https://api.github.com/repos/Jeremy8776/parkmap/releases?per_page=30', {
          headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store'
        })
      ]);
      if (!response.ok) return;
      const update = selectUpdate(await response.json(), versionCode);
      if (!update) return;
      const asset = update.assets.find(a => a.name === `parkmap-${update.tag_name}.apk`);
      const bar = document.createElement('div');
      bar.id = 'updateBar'; bar.className = 'glass';
      bar.setAttribute('role', 'status');
      bar.innerHTML = `<span><b>ParkMap ${update.tag_name} is available</b><small>Download and install the update</small></span><button type="button" class="updateNow">Update</button><button type="button" class="updateLater" aria-label="Dismiss update">Later</button>`;
      document.getElementById('mapwrap').appendChild(bar);
      const button = bar.querySelector('.updateNow');
      bar.querySelector('.updateLater').onclick = () => bar.remove();
      button.onclick = async () => {
        button.disabled = true; button.textContent = 'Downloading…';
        try {
          const result = await native('installUpdate', {
            url: asset.browser_download_url, digest: asset.digest, versionCode: releaseCode(update.tag_name)
          });
          if (result.permissionRequired) {
            button.textContent = 'Try again';
            bar.querySelector('small').textContent = 'Allow installs for ParkMap in Settings, then tap Try again.';
          } else {
            button.textContent = 'Installing…';
            bar.querySelector('small').textContent = 'Confirm the installation in Android.';
          }
        } catch (error) {
          button.textContent = 'Retry';
          bar.querySelector('small').textContent = 'Update failed. Check your connection and try again.';
        } finally { button.disabled = false; }
      };
    } catch (error) { /* Offline or the release API is unavailable; the map still works. */ }
  }
  setTimeout(check, 1200);
})();
