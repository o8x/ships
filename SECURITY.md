# Security Policy

## Supported Versions

Only the latest release is supported with security fixes.

## Reporting a Vulnerability

Please do **not** open a public issue for security problems. Instead, use
GitHub's private vulnerability reporting:

1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability**.
3. Describe the issue, the impact and, if possible, steps to reproduce.

You can expect an initial response within a few days. Once a fix is ready we
will publish a patched release and credit you (unless you prefer to stay
anonymous).

## Scope

Ships runs entirely on your machine and never uploads your data. SSH keys,
`~/.ssh/config` and clipboard content are read locally and are never sent
anywhere. Reports about the local HTTP API, the PTY bridge script, or how the
app handles credentials are especially welcome.
