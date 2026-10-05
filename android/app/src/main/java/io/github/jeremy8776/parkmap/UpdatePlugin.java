package io.github.jeremy8776.parkmap;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Downloads a verified release APK and asks Android to install it; never installs silently. */
@CapacitorPlugin(name = "ParkMapUpdate")
public class UpdatePlugin extends Plugin {
    private static final long MAX_BYTES = 80000000;

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            PackageInfo installed = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("versionCode", versionCode(installed));
            result.put("versionName", installed.versionName);
            call.resolve(result);
        } catch (Exception e) { call.reject("Cannot read installed version", e); }
    }

    private long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    private long installedCode() throws Exception {
        return versionCode(getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0));
    }

    @PluginMethod
    public void installUpdate(PluginCall call) {
        String url = call.getString("url"), digest = call.getString("digest");
        Integer code = call.getInt("versionCode");
        try {
            if (code == null || code <= installedCode() || !UpdateSpec.isExpectedVersion(url, code)
                || digest == null || !digest.matches("sha256:[a-fA-F0-9]{64}")) {
                call.reject("Invalid update release");
                return;
            }
        } catch (Exception e) { call.reject("Cannot read installed version", e); return; }
        Activity activity = getActivity();
        if (activity == null) { call.reject("Android activity unavailable"); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName()));
                activity.startActivity(settings);
                JSObject result = new JSObject(); result.put("permissionRequired", true);
                call.resolve(result);
            } catch (Exception e) { call.reject("Could not open install settings", e); }
            return;
        }
        new Thread(() -> {
            File dir = new File(getContext().getCacheDir(), "updates");
            File apk = new File(dir, "parkmap-update.apk"), tmp = new File(dir, "parkmap-update.part");
            try {
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Cannot create update cache");
                if (!apk.exists() || !validApk(apk, digest, code)) {
                    if (apk.exists() && !apk.delete()) throw new Exception("Cannot remove old update");
                    download(url, tmp);
                    if (!validApk(tmp, digest, code)) throw new Exception("Update verification failed");
                    if (!tmp.renameTo(apk)) throw new Exception("Cannot save update");
                }
                Activity current = getActivity();
                if (current == null) throw new Exception("Android activity unavailable");
                current.runOnUiThread(() -> {
                    try {
                        Uri uri = FileProvider.getUriForFile(current, current.getPackageName() + ".fileprovider", apk);
                        Intent install = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                        install.setDataAndType(uri, "application/vnd.android.package-archive");
                        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        current.startActivity(install);
                        JSObject result = new JSObject(); result.put("permissionRequired", false);
                        call.resolve(result);
                    } catch (Exception e) { call.reject("Could not open Android installer", e); }
                });
            } catch (Exception e) {
                tmp.delete();
                call.reject("Update download or verification failed", e);
            }
        }, "parkmap-update").start();
    }

    private boolean validApk(File file, String digest, long expectedCode) throws Exception {
        if (file.length() < 1000000 || file.length() > MAX_BYTES) return false;
        try (InputStream input = new FileInputStream(file)) {
            if (!UpdateSpec.matchesDigest(input, digest)) return false;
        }
        PackageInfo info = getContext().getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(), 0);
        if (info == null || !getContext().getPackageName().equals(info.packageName)) return false;
        long version = versionCode(info);
        return version == expectedCode && version > installedCode();
    }

    private void download(String source, File dest) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(source).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setRequestProperty("User-Agent", "ParkMap-Android-Updater");
        try {
            if (connection.getResponseCode() != 200 || !"https".equals(connection.getURL().getProtocol()))
                throw new Exception("Release download unavailable");
            if (connection.getContentLengthLong() > MAX_BYTES) throw new Exception("Update too large");
            long total = 0;
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(dest)) {
                byte[] buffer = new byte[8192];
                int n;
                while ((n = input.read(buffer)) != -1) {
                    total += n;
                    if (total > MAX_BYTES) throw new Exception("Update too large");
                    output.write(buffer, 0, n);
                }
            }
            if (total < 1000000) throw new Exception("Incomplete update download");
        } finally { connection.disconnect(); }
    }
}
