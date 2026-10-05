package io.github.jeremy8776.parkmap;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class UpdateSpecTest {
    @Test
    public void onlyParkMapReleaseAssetsAreAllowed() {
        assertTrue(UpdateSpec.isAllowedUrl("https://github.com/Jeremy8776/parkmap/releases/download/v0.3.0/parkmap-v0.3.0.apk"));
        assertFalse(UpdateSpec.isAllowedUrl("http://github.com/Jeremy8776/parkmap/releases/download/v0.3.0/parkmap-v0.3.0.apk"));
        assertFalse(UpdateSpec.isAllowedUrl("https://github.com.evil.org/Jeremy8776/parkmap/releases/download/v0.3.0/parkmap-v0.3.0.apk"));
        assertFalse(UpdateSpec.isAllowedUrl("https://github.com/Jeremy8776/parkmap/releases/download/v0.3.0/other.apk"));
        assertFalse(UpdateSpec.isAllowedUrl("https://github.com/Jeremy8776/parkmap/releases/download/v0.2.0/parkmap-v0.2.0-debug.apk"));
    }

    @Test
    public void urlVersionMustMatchRequestedCode() {
        String url = "https://github.com/Jeremy8776/parkmap/releases/download/v0.3.1/parkmap-v0.3.1.apk";
        assertTrue(UpdateSpec.isExpectedVersion(url, 3001));
        assertFalse(UpdateSpec.isExpectedVersion(url, 3000));
        assertFalse(UpdateSpec.isExpectedVersion(url, 1));
    }

    @Test
    public void digestMatchesOnlyTheDownloadedBytes() throws Exception {
        byte[] bytes = "ParkMap".getBytes(StandardCharsets.UTF_8);
        assertTrue(UpdateSpec.matchesDigest(new ByteArrayInputStream(bytes),
            "sha256:14c90c8b4c595e6a753e24d43eacdcadaa89bcee7f15627b2e913778937bb747"));
        assertFalse(UpdateSpec.matchesDigest(new ByteArrayInputStream(bytes), "sha256:" + "0".repeat(64)));
        assertFalse(UpdateSpec.matchesDigest(new ByteArrayInputStream(bytes), "invalid"));
    }
}
