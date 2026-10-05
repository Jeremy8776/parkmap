package io.github.jeremy8776.parkmap;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Limits the installer to versioned APKs from this repository's releases. */
final class UpdateSpec {
    private static final Pattern URL = Pattern.compile(
        "https://github\\.com/Jeremy8776/parkmap/releases/download/" +
        "(v\\d+\\.\\d+\\.\\d+)/parkmap-\\1\\.apk"
    );

    private UpdateSpec() {}

    static boolean isAllowedUrl(String url) {
        return url != null && URL.matcher(url).matches();
    }

    static boolean isExpectedVersion(String url, long code) {
        if (url == null) return false;
        Matcher match = URL.matcher(url);
        if (!match.matches()) return false;
        String[] parts = match.group(1).substring(1).split("\\.");
        try {
            long major = Long.parseLong(parts[0]), minor = Long.parseLong(parts[1]), patch = Long.parseLong(parts[2]);
            return major <= 2147 && minor <= 999 && patch <= 999 &&
                code > 0 && code <= Integer.MAX_VALUE && code == major * 1000000 + minor * 1000 + patch;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    static boolean matchesDigest(InputStream input, String expected) throws IOException {
        if (expected == null || !expected.matches("sha256:[a-fA-F0-9]{64}")) return false;
        try {
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int n;
            while ((n = input.read(buffer)) != -1) hash.update(buffer, 0, n);
            byte[] actual = hash.digest();
            byte[] wanted = new byte[32];
            for (int i = 0; i < wanted.length; i++) {
                wanted[i] = (byte) Integer.parseInt(expected.substring(7 + i * 2, 9 + i * 2), 16);
            }
            return MessageDigest.isEqual(actual, wanted);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
