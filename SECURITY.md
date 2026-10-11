# Security and privacy

Do not include Cookie values, access tokens, OAuth secrets, QR login payloads,
browser profiles, or user databases in issues, pull requests, screenshots, or Git.
Use only invented credentials in tests. Configure real credentials locally.

`.env.example` is a public template. Actual `.env` files, runtime data, logs,
private keys, tools, and build outputs are ignored by Git. Ignore rules do not
remove files already tracked, so review the staged diff before every push.

Use a GitHub `users.noreply.github.com` address for commit authorship if you do
not intend to publish your private email address.

Before a public release, scan both the current source and all reachable Git
history with a credential scanner, then manually review the findings and images.
Historical WBI signing tests contain public image-name hashes (`img_key` and
`sub_key`); these are signing fixtures, not account credentials. Do not broadly
suppress other key or token findings because of these fixtures.

If a real credential has been committed, revoke or rotate it first. Removing a
file in a new commit does not erase its history. Rewriting branch history also
does not guarantee removal from cached commit pages, forks, or existing clones.
Keep a repository private until sensitive historical data has been handled.
