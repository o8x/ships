#!/usr/bin/env python3
"""PTY bridge for the Vessel network-test terminal.

Usage: pty-bridge.py <shell> <cols> <rows>
  stdin  <- raw keystrokes from the renderer's xterm
  stdout -> raw bytes from the PTY (ANSI and all)
  fd 3   <- optional control channel, one "resize <cols> <rows>" per line

Why a bridge at all: a real terminal needs a PTY on the Node side. `node-pty` is a
native module (needs rebuilding for Electron) and macOS `script(1)` refuses to run
when its own stdin is not a TTY, so the PTY is created here with the stdlib.
"""

import os
import select
import signal
import struct
import sys
import fcntl
import pty
import termios
import time


def set_winsize(fd, cols, rows):
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    except OSError:
        pass


def main():
    shell = sys.argv[1] if len(sys.argv) > 1 else (os.environ.get("SHELL") or "/bin/sh")
    cols = int(sys.argv[2]) if len(sys.argv) > 2 else 80
    rows = int(sys.argv[3]) if len(sys.argv) > 3 else 24
    # Optional invisible marker emitted after a foreground command returns to the
    # shell (used to close the SSH file panel when the ssh process exits).
    exit_marker = sys.argv[4].encode("utf-8") if len(sys.argv) > 4 and sys.argv[4] else b""

    pid, master = pty.fork()
    if pid == 0:  # child: the slave side is already our controlling terminal
        os.environ["TERM"] = os.environ.get("TERM") or "xterm-256color"
        try:
            os.execv(shell, [shell, "-l"])
        except OSError:
            os._exit(127)

    set_winsize(master, cols, rows)

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()
    try:
        control = os.fdopen(3, "r", buffering=1)
        control_fd = control.fileno()
    except OSError:
        control = None
        control_fd = None

    def shutdown(_signum=None, _frame=None):
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
        os._exit(0)

    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, shutdown)

    shell_pgid = None
    try:
        shell_pgid = os.getpgid(pid)
    except OSError:
        pass
    last_fg = None
    next_pgrp_check = 0.0

    watched = [master, stdin_fd] + ([control_fd] if control_fd is not None else [])
    while True:
        try:
            # Polling the foreground process group is a cheap ioctl (no child process):
            # when it returns to the shell, any foreground command (e.g. ssh) has ended.
            timeout = 0.15 if exit_marker and shell_pgid else None
            ready, _, _ = select.select(watched, [], [], timeout)
        except InterruptedError:
            continue
        except OSError:
            break

        if master in ready:
            try:
                data = os.read(master, 65536)
            except OSError:
                data = b""
            if not data:
                break
            os.write(stdout_fd, data)

        if stdin_fd in ready:
            data = os.read(stdin_fd, 65536)
            if not data:  # renderer went away: end the session too
                shutdown()
            os.write(master, data)

        if control_fd is not None and control_fd in ready:
            line = control.readline()
            if not line:  # control channel closed
                watched.remove(control_fd)
                control_fd = None
                continue
            parts = line.split()
            if len(parts) == 3 and parts[0] == "resize":
                try:
                    set_winsize(master, int(parts[1]), int(parts[2]))
                except ValueError:
                    pass

        if exit_marker and shell_pgid:
            now = time.monotonic()
            if now >= next_pgrp_check:
                next_pgrp_check = now + 0.15
                try:
                    fg = os.tcgetpgrp(master)
                except OSError:
                    fg = None
                if fg is not None:
                    if last_fg is None:
                        last_fg = fg
                    elif fg != last_fg:
                        if fg == shell_pgid and last_fg != shell_pgid:
                            try:
                                os.write(stdout_fd, exit_marker)
                            except OSError:
                                pass
                        last_fg = fg

    try:
        _, status = os.waitpid(pid, 0)
    except OSError:
        status = 0
    if os.WIFEXITED(status):
        sys.exit(os.WEXITSTATUS(status))
    sys.exit(0)


if __name__ == "__main__":
    main()
