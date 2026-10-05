"""Convert vMAJOR.MINOR.PATCH release tags to increasing Android version codes."""
import re
import sys


def version_code(tag):
    match = re.fullmatch(r"v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", tag)
    if not match:
        raise ValueError("Expected a tag like v0.3.0")
    major, minor, patch = map(int, match.groups())
    code = major * 1_000_000 + minor * 1_000 + patch
    if major > 2147 or minor > 999 or patch > 999 or not 0 < code <= 2_147_483_647:
        raise ValueError("Tag is outside the Android version code range")
    return code


if __name__ == "__main__":
    try:
        print(version_code(sys.argv[1]))
    except (IndexError, ValueError) as error:
        sys.exit(str(error))
