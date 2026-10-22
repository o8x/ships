#!/usr/bin/env python3
"""Print the current macOS Space signature (uuid per display, sorted, joined by '|').

`defaults export com.apple.spaces` is served from cfprefsd and can stay stale for a
while after switching Spaces, which makes "did the user switch desktop?" checks
unreliable. This bridge asks WindowServer directly via the private SkyLight API
(`CGSCopyManagedDisplaySpaces`), the same data Mission Control uses, so it reflects
the switch immediately.

Python stdlib only (ctypes); no extra dependency. Falls back to the active Space id
if the per-display list cannot be read. Exits non-zero on failure so the caller can
fall back to parsing `com.apple.spaces`.
"""

import ctypes
import sys

SKYLIGHT = '/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight'
COREFOUNDATION = '/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation'
UTF8 = 0x08000100


def main():
    sky = ctypes.CDLL(SKYLIGHT)
    cf = ctypes.CDLL(COREFOUNDATION)

    sky.CGSMainConnectionID.restype = ctypes.c_int
    sky.CGSCopyManagedDisplaySpaces.restype = ctypes.c_void_p
    sky.CGSCopyManagedDisplaySpaces.argtypes = [ctypes.c_int]
    sky.CGSGetActiveSpace.restype = ctypes.c_uint64
    sky.CGSGetActiveSpace.argtypes = [ctypes.c_int]

    cf.CFArrayGetCount.restype = ctypes.c_long
    cf.CFArrayGetCount.argtypes = [ctypes.c_void_p]
    cf.CFArrayGetValueAtIndex.restype = ctypes.c_void_p
    cf.CFArrayGetValueAtIndex.argtypes = [ctypes.c_void_p, ctypes.c_long]
    cf.CFDictionaryGetValue.restype = ctypes.c_void_p
    cf.CFDictionaryGetValue.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    cf.CFStringCreateWithCString.restype = ctypes.c_void_p
    cf.CFStringCreateWithCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_uint32]
    cf.CFStringGetCString.restype = ctypes.c_bool
    cf.CFStringGetCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_long, ctypes.c_uint32]
    cf.CFRelease.argtypes = [ctypes.c_void_p]

    conn = sky.CGSMainConnectionID()
    current_key = cf.CFStringCreateWithCString(None, b'Current Space', UTF8)
    uuid_key = cf.CFStringCreateWithCString(None, b'uuid', UTF8)
    displays = sky.CGSCopyManagedDisplaySpaces(conn)
    if not displays:
        _print_active_space(sky, conn)
        return 0

    uuids = []
    try:
        for index in range(cf.CFArrayGetCount(displays)):
            display = cf.CFArrayGetValueAtIndex(displays, index)
            current = cf.CFDictionaryGetValue(display, current_key) if display else None
            uuid = cf.CFDictionaryGetValue(current, uuid_key) if current else None
            buffer = ctypes.create_string_buffer(128)
            if uuid and cf.CFStringGetCString(uuid, buffer, len(buffer), UTF8):
                value = buffer.value.decode('utf-8', 'replace')
                if value:
                    uuids.append(value)
    finally:
        cf.CFRelease(current_key)
        cf.CFRelease(uuid_key)
        cf.CFRelease(displays)

    if not uuids:
        _print_active_space(sky, conn)
        return 0

    uuids.sort()
    print('|'.join(uuids))
    return 0


def _print_active_space(sky, conn):
    space_id = sky.CGSGetActiveSpace(conn)
    if not space_id:
        raise RuntimeError('no active space')
    print('active:%d' % space_id)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as err:  # pragma: no cover - diagnostic path
        sys.stderr.write('%s\n' % err)
        sys.exit(1)
