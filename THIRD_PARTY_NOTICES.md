# Third-party notices

The original code in BiliMonitor Desktop is licensed under the [MIT License](LICENSE).
This does not replace the licenses of third-party code, runtimes, or dependencies.
Keep their accompanying copyright and license notices when redistributing them.

## BiliMonitor business migration

Source: <https://github.com/YFBY-Java/BiliMonitor>

This desktop application migrates business workflows from BiliMonitor. The source
project's ISC notice is retained for any adapted portions:

```text
ISC License

Copyright (c) 2026 BiliMonitor contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## electron-builder / app-builder-lib

Source: <https://github.com/electron-userland/electron-builder>

`patches/app-builder-lib@26.15.3.patch` adapts the upstream NSIS templates:
it adds installer-cache and early-uninstaller hooks, and runs the existing
`preInit` hook before the first `SetOutPath`. The upstream MIT notice applies to
the included template material:

```text
The MIT License (MIT)

Copyright (c) 2015 Loopline Systems

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Packaged dependencies

Dependency versions are recorded in `pnpm-lock.yaml` and the Python requirements.
Electron, Chromium, Python, Playwright, and other bundled components retain their
own licenses. A source-repository MIT license is not a blanket license for a
binary distribution; retain the notices shipped with those components.
