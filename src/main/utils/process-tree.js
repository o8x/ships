'use strict';

// Pure helpers for finding the `ssh` process a terminal session is running.
//
// pty-bridge.py forks the login shell, so a manually typed `ssh …` (or one injected by
// the SSH dropdown / directory browser) ends up as a descendant of the session's root
// process. Callers snapshot the process table once with `ps`, build a parent→children
// index and look up the ssh target per session. No business logic here.

// Commands that mean "an ssh connection is open". sshpass/autossh are wrappers that
// still spawn a real `ssh` child, so matching `ssh` alone covers them.
const SSH_COMMANDS = new Set(['ssh']);

// ssh options that consume the following argument; needed to skip over them when
// finding the destination token (`-p 22`, `-i key`, `-o StrictHostKeyChecking=no`, …).
const ARG_TAKING_OPTIONS = new Set([
  '-b', '-c', '-D', '-e', '-F', '-I', '-i', '-J', '-L', '-l', '-m', '-O', '-o',
  '-p', '-Q', '-R', '-S', '-W', '-w',
]);

function basename(command) {
  const first = String(command || '').trim().split(/\s+/)[0] || '';
  const slash = first.lastIndexOf('/');
  return slash >= 0 ? first.slice(slash + 1) : first;
}

/* Build a map of parent pid → [{ pid, ppid, pgid, tpgid, command }] from
   `ps -A -o pid=,ppid=,pgid=,tpgid=,command=`. */
function buildTree(psOutput) {
  const byParent = new Map();
  for (const line of String(psOutput || '').split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    const pgid = Number(match[3]);
    const tpgid = Number(match[4]);
    const command = match[5];
    if (!byParent.has(ppid)) byParent.set(ppid, []);
    byParent.get(ppid).push({ pid, ppid, pgid, tpgid, command });
  }
  return byParent;
}

/* First positional token of an ssh command line = the destination (alias, host or
   user@host). Options and their arguments are skipped; a remote command after the
   destination is ignored. */
function sshDestination(command) {
  const tokens = String(command || '').trim().split(/\s+/);
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === '--') {
      i += 1;
      break;
    }
    if (!token.startsWith('-')) break;
    i += ARG_TAKING_OPTIONS.has(token) ? 2 : 1;
  }
  return tokens[i] || '';
}

/* Breadth-first search of the subtree rooted at `rootPid` for the closest ssh process;
   returns its destination token (e.g. `deploy@web-1`) or '' when none. */
function sshTargetUnder(tree, rootPid) {
  const root = Number(rootPid);
  if (!tree || !Number.isFinite(root)) return '';
  const queue = [root];
  const seen = new Set();
  while (queue.length) {
    const pid = queue.shift();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const children = tree.get(pid) || [];
    for (const child of children) {
      if (SSH_COMMANDS.has(basename(child.command))) return sshDestination(child.command);
      queue.push(child.pid);
    }
  }
  return '';
}

/* Whether the session is running a foreground command. The shell is the root's
   direct child; when a command runs, the terminal foreground process group (tpgid)
   differs from the shell's own process group. Background jobs alone don't count. */
function terminalBusyUnder(tree, rootPid) {
  const root = Number(rootPid);
  if (!tree || !Number.isFinite(root)) return false;
  const shell = (tree.get(root) || [])[0];
  if (!shell) return false;
  if (shell.tpgid > 0 && shell.pgid > 0) return shell.tpgid !== shell.pgid;
  // No controlling-terminal info: fall back to "has a running child".
  return (tree.get(shell.pid) || []).length > 0;
}

module.exports = { buildTree, terminalBusyUnder, sshDestination, sshTargetUnder, _basename: basename };
